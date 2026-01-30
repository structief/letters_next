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

    // Get pending friend requests count (incoming requests)
    const pendingRequestsCount = await prisma.friend.count({
      where: {
        friendId: session.user.id,
        status: 'pending'
      }
    })

    // Get total unread messages count from friends
    // First, get all accepted friends
    const friends = await prisma.friend.findMany({
      where: {
        userId: session.user.id,
        status: 'accepted'
      },
      select: {
        friendId: true
      }
    })

    const friendIds = friends.map(f => f.friendId)

    // Count unread messages from friends plus memos (self)
    const unreadMessagesCount = await prisma.message.count({
      where: {
        receiverId: session.user.id,
        isRead: false,
        OR: [
          { senderId: { in: friendIds } },
          { senderId: session.user.id }
        ]
      }
    })

    return NextResponse.json({
      pendingRequests: pendingRequestsCount,
      unreadMessages: unreadMessagesCount
    })
  } catch (error) {
    console.error('Error fetching notification counts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
