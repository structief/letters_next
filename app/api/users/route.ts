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
    const search = searchParams.get('search')

    // Get list of friend IDs (accepted friends)
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

    // Get list of user IDs with pending requests (sent or received)
    const pendingRequests = await prisma.friend.findMany({
      where: {
        OR: [
          { userId: session.user.id, status: 'pending' },
          { friendId: session.user.id, status: 'pending' }
        ]
      },
      select: {
        userId: true,
        friendId: true
      }
    })
    const pendingUserIds = new Set<string>()
    pendingRequests.forEach(r => {
      if (r.userId === session.user.id) {
        pendingUserIds.add(r.friendId)
      } else {
        pendingUserIds.add(r.userId)
      }
    })

    const users = await prisma.user.findMany({
      where: {
        id: {
          not: session.user.id,
          notIn: [...friendIds, ...Array.from(pendingUserIds)] // Exclude users who are already friends or have pending requests
        },
        ...(search && {
          OR: [
            {
              username: {
                contains: search,
                mode: 'insensitive'
              }
            },
            {
              email: {
                contains: search,
                mode: 'insensitive'
              }
            }
          ]
        })
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
      take: 20
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
