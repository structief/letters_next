import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

    const { audioUrl, duration, waveform, transcription, conversationId, receiverId } = await request.json()

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
        // Create new conversation
        const newConversation = await prisma.conversation.create({
          data: {
            participants: {
              create: [
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
        transcription: transcription ? transcription.trim() : null,
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

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
