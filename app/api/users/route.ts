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

    // Get list of friend IDs
    const friends = await prisma.friend.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        friendId: true
      }
    })
    const friendIds = friends.map(f => f.friendId)

    const users = await prisma.user.findMany({
      where: {
        id: {
          not: session.user.id,
          notIn: friendIds // Exclude users who are already friends
        },
        ...(search && {
          username: {
            contains: search
          }
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
