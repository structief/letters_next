import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/messages/[messageId]
 * Fetch a single message by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const { messageId } = resolvedParams

    // Fetch message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
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

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify user has permission (sender or receiver)
    if (message.senderId !== session.user.id && message.receiverId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error fetching message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/messages/[messageId]
 * Update message transcription
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const { messageId } = resolvedParams

    const body = await request.json()
    const { transcription, transcriptionSummaryLong } = body

    if (typeof transcription !== 'string' && transcription !== null) {
      return NextResponse.json(
        { error: 'transcription must be a string or null' },
        { status: 400 }
      )
    }
    if (transcriptionSummaryLong !== undefined && typeof transcriptionSummaryLong !== 'string' && transcriptionSummaryLong !== null) {
      return NextResponse.json(
        { error: 'transcriptionSummaryLong must be a string or null' },
        { status: 400 }
      )
    }

    // Verify the message exists and user has permission
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify user has permission (sender or receiver)
    if (message.senderId !== session.user.id && message.receiverId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateData: { transcription?: string | null; transcriptionSummaryLong?: string | null } = {}
    if (transcription !== undefined) updateData.transcription = transcription ? transcription.trim() : null
    if (transcriptionSummaryLong !== undefined) updateData.transcriptionSummaryLong = transcriptionSummaryLong ? transcriptionSummaryLong.trim() : null

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
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

    return NextResponse.json({ message: updatedMessage })
  } catch (error) {
    console.error('Error updating message transcription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
