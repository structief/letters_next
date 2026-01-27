import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendFriendRequestNotification } from '@/lib/push-notifications'

// GET - List all friends and pending requests
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get accepted friends (where current user is the requester)
    const friends = await prisma.friend.findMany({
      where: {
        userId: session.user.id,
        status: 'accepted'
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Get pending requests (where current user is the recipient)
    const pendingRequests = await prisma.friend.findMany({
      where: {
        friendId: session.user.id,
        status: 'pending'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Get sent requests (where current user is the requester)
    const sentRequests = await prisma.friend.findMany({
      where: {
        userId: session.user.id,
        status: 'pending'
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      friends: friends.map(f => ({
        id: f.friend.id,
        username: f.friend.username,
        email: f.friend.email,
        addedAt: f.createdAt,
        status: f.status,
      })),
      pendingRequests: pendingRequests.map(r => ({
        id: r.id,
        userId: r.user.id,
        username: r.user.username,
        email: r.user.email,
        requestedAt: r.createdAt,
        status: r.status,
      })),
      sentRequests: sentRequests.map(r => ({
        id: r.friend.id,
        username: r.friend.username,
        email: r.friend.email,
        requestedAt: r.createdAt,
        status: r.status,
      }))
    })
  } catch (error) {
    console.error('Error fetching friends:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Add a friend
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { friendId } = await request.json()

    if (!friendId || typeof friendId !== 'string') {
      return NextResponse.json(
        { error: 'friendId is required and must be a string' },
        { status: 400 }
      )
    }

    if (friendId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot add yourself as a friend' },
        { status: 400 }
      )
    }

    // Verify current user exists in database
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Current user not found' },
        { status: 404 }
      )
    }

    // Check if friend user exists
    const friendUser = await prisma.user.findUnique({
      where: { id: friendId }
    })

    if (!friendUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if already friends or request exists
    const existingFriend = await prisma.friend.findUnique({
      where: {
        userId_friendId: {
          userId: session.user.id,
          friendId: friendId
        }
      }
    })

    if (existingFriend) {
      if (existingFriend.status === 'accepted') {
        return NextResponse.json(
          { error: 'Already friends with this user' },
          { status: 409 }
        )
      } else if (existingFriend.status === 'pending') {
        return NextResponse.json(
          { error: 'Friend request already sent' },
          { status: 409 }
        )
      }
    }

    // Check if there's a pending request from the other user
    const incomingRequest = await prisma.friend.findUnique({
      where: {
        userId_friendId: {
          userId: friendId,
          friendId: session.user.id
        }
      }
    })

    if (incomingRequest && incomingRequest.status === 'pending') {
      // Auto-accept if there's a pending request from the other user
      await prisma.friend.update({
        where: {
          userId_friendId: {
            userId: friendId,
            friendId: session.user.id
          }
        },
        data: {
          status: 'accepted'
        }
      })

      // Create or update the reverse relationship
      const friend = await prisma.friend.upsert({
        where: {
          userId_friendId: {
            userId: session.user.id,
            friendId: friendId
          }
        },
        update: {
          status: 'accepted'
        },
        create: {
          userId: session.user.id,
          friendId: friendId,
          status: 'accepted',
        },
        include: {
          friend: {
            select: {
              id: true,
              username: true,
              email: true,
            }
          }
        }
      })

      return NextResponse.json({
        friend: {
          id: friend.friend.id,
          username: friend.friend.username,
          email: friend.friend.email,
          addedAt: friend.createdAt,
          status: friend.status,
        }
      }, { status: 201 })
    }

    // Create friend request
    const friend = await prisma.friend.create({
      data: {
        userId: session.user.id,
        friendId: friendId,
        status: 'pending',
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        },
        user: {
          select: {
            username: true
          }
        }
      }
    })

    // Send push notification to receiver (fire-and-forget)
    sendFriendRequestNotification(friendId, friend.user.username).catch((error) => {
      console.error('Error sending push notification:', error)
    })

    return NextResponse.json({
      friend: {
        id: friend.friend.id,
        username: friend.friend.username,
        email: friend.friend.email,
        addedAt: friend.createdAt,
        status: friend.status,
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error adding friend:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Remove a friend
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const friendId = searchParams.get('friendId')

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    // Delete both directions of the friendship
    await prisma.friend.deleteMany({
      where: {
        OR: [
          { userId: session.user.id, friendId: friendId },
          { userId: friendId, friendId: session.user.id }
        ]
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing friend:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
