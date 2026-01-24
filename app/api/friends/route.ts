import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - List all friends
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const friends = await prisma.friend.findMany({
      where: {
        userId: session.user.id
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

    if (!friendId) {
      return NextResponse.json(
        { error: 'friendId is required' },
        { status: 400 }
      )
    }

    if (friendId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot add yourself as a friend' },
        { status: 400 }
      )
    }

    // Check if user exists
    const friendUser = await prisma.user.findUnique({
      where: { id: friendId }
    })

    if (!friendUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if already friends
    const existingFriend = await prisma.friend.findUnique({
      where: {
        userId_friendId: {
          userId: session.user.id,
          friendId: friendId
        }
      }
    })

    if (existingFriend) {
      return NextResponse.json(
        { error: 'Already friends with this user' },
        { status: 409 }
      )
    }

    // Add friend
    const friend = await prisma.friend.create({
      data: {
        userId: session.user.id,
        friendId: friendId,
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

    await prisma.friend.deleteMany({
      where: {
        userId: session.user.id,
        friendId: friendId
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
