import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH - Accept or decline a friend request
export async function PATCH(
  request: Request,
  { params }: { params: { requestId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = await request.json() // "accept" or "decline"

    if (!['accept', 'decline'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be "accept" or "decline"' },
        { status: 400 }
      )
    }

    // Find the request - it should be where friendId is the current user (recipient)
    const friendRequest = await prisma.friend.findUnique({
      where: {
        id: params.requestId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          }
        }
      }
    })

    if (!friendRequest) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 }
      )
    }

    // Verify the request is for the current user
    if (friendRequest.friendId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Verify the request is pending
    if (friendRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'Friend request is not pending' },
        { status: 400 }
      )
    }

    if (action === 'accept') {
      // Update the request to accepted
      await prisma.friend.update({
        where: {
          id: params.requestId
        },
        data: {
          status: 'accepted'
        }
      })

      // Create the reverse relationship (so both users see each other as friends)
      const existingReverse = await prisma.friend.findUnique({
        where: {
          userId_friendId: {
            userId: session.user.id,
            friendId: friendRequest.userId
          }
        }
      })

      if (!existingReverse) {
        await prisma.friend.create({
          data: {
            userId: session.user.id,
            friendId: friendRequest.userId,
            status: 'accepted',
          }
        })
      } else if (existingReverse.status !== 'accepted') {
        await prisma.friend.update({
          where: {
            userId_friendId: {
              userId: session.user.id,
              friendId: friendRequest.userId
            }
          },
          data: {
            status: 'accepted'
          }
        })
      }

      return NextResponse.json({
        success: true,
        friend: {
          id: friendRequest.user.id,
          username: friendRequest.user.username,
          email: friendRequest.user.email,
        }
      })
    } else {
      // Decline - just delete the request
      await prisma.friend.delete({
        where: {
          id: params.requestId
        }
      })

      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error('Error processing friend request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
