import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { transcribeAudio, summarizeTranscription } from '@/lib/transcription'
import { sendMessageNotification } from '@/lib/push-notifications'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Get last 6 messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { senderId: session.user.id },
          { receiverId: session.user.id }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 6
    })

    // Reverse to get chronological order (oldest first)
    const chronologicalMessages = messages.reverse()

    // Find first unread message ID for the current user
    const firstUnreadMessage = chronologicalMessages.find(
      msg => msg.receiverId === session.user.id && !msg.isRead
    )

    return NextResponse.json({ 
      messages: chronologicalMessages,
      firstUnreadMessageId: firstUnreadMessage?.id || null
    })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { audioUrl, duration, waveform, conversationId, receiverId } = await request.json()

    if (!audioUrl || duration == null || !receiverId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // If no conversationId provided, create or find existing conversation
    let finalConversationId = conversationId
    if (!finalConversationId) {
      // Check if conversation already exists
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          participants: {
            every: {
              userId: {
                in: [session.user.id, receiverId]
              }
            }
          }
        }
      })

      if (existingConversation) {
        finalConversationId = existingConversation.id
      } else {
        // Create new conversation (single participant for self/memos)
        const isSelf = receiverId === session.user.id
        const newConversation = await prisma.conversation.create({
          data: {
            participants: {
              create: isSelf
                ? [{ userId: session.user.id }]
                : [
                    { userId: session.user.id },
                    { userId: receiverId }
                  ]
            }
          }
        })
        finalConversationId = newConversation.id
      }
    }

    const message = await prisma.message.create({
      data: {
        audioUrl,
        duration,
        waveform: waveform ? waveform : null,
        transcription: null, // Will be set asynchronously
        senderId: session.user.id,
        receiverId,
        conversationId: finalConversationId,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
          }
        }
      }
    })

    // Trigger async transcription and summarization (fire-and-forget)
    // Don't await - let it process in the background
    processTranscriptionAsync(message.id, audioUrl).catch((error) => {
      // Log errors but don't fail the request
      console.error('Error processing transcription asynchronously:', error)
    })

    // Send push notification to receiver (skip for self/memos)
    if (receiverId !== session.user.id) {
      sendMessageNotification(receiverId, message.sender.username).catch((error) => {
        console.error('Error sending push notification:', error)
      })
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Process transcription and summarization asynchronously
 * This function runs in the background and updates the message when complete
 */
async function processTranscriptionAsync(messageId: string, audioUrl: string): Promise<void> {
  try {
    // Step 1: Transcribe audio
    const fullTranscription = await transcribeAudio(audioUrl)
    
    if (!fullTranscription || fullTranscription.trim().length === 0) {
      console.warn(`No transcription generated for message ${messageId}`)
      return
    }

    // Step 2: Summarize transcription (short for list, long for playback)
    const { shortSummary, longSummary } = await summarizeTranscription(fullTranscription)

    // Step 3: Update message with both summaries
    await prisma.message.update({
      where: { id: messageId },
      data: {
        transcription: shortSummary || fullTranscription.slice(0, 150),
        transcriptionSummaryLong: longSummary || fullTranscription.slice(0, 800) || null,
      }
    })

    console.log(`Successfully processed transcription for message ${messageId}`)
  } catch (error) {
    console.error(`Error processing transcription for message ${messageId}:`, error)
    // Don't throw - this is background processing
  }
}
