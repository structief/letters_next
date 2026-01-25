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

    // Get all conversations for the user
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id
          }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    // Format conversations with unread count and last message
    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherParticipant = conv.participants.find(
          p => p.userId !== session.user.id
        )?.user

        if (!otherParticipant) return null

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            receiverId: session.user.id,
            senderId: otherParticipant.id,
            isRead: false,
          }
        })

        const totalMessageCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            receiverId: session.user.id,
            senderId: otherParticipant.id,
          }
        })

        // Calculate total duration of unread messages
        const unreadMessages = await prisma.message.findMany({
          where: {
            conversationId: conv.id,
            receiverId: session.user.id,
            senderId: otherParticipant.id,
            isRead: false,
          },
          select: {
            duration: true,
          }
        })
        const totalUnreadDuration = unreadMessages.reduce((sum, msg) => sum + msg.duration, 0)

        return {
          id: conv.id,
          otherUser: otherParticipant,
          lastMessage: conv.messages[0] || null,
          unreadCount,
          totalMessageCount,
          totalUnreadDuration,
          updatedAt: conv.updatedAt,
        }
      })
    )

    // Filter out null values
    const filteredConversations = formattedConversations.filter((conv): conv is NonNullable<typeof conv> => conv !== null)
    
    // Get all accepted friends
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
          }
        }
      }
    })

    // Get friend IDs that already have conversations
    const friendIdsWithConversations = new Set(
      filteredConversations.map(conv => conv.otherUser.id)
    )

    // Create placeholder conversations for friends without message history
    const friendsWithoutConversations = friends
      .filter(f => !friendIdsWithConversations.has(f.friend.id))
      .map(f => ({
        id: null as string | null, // No conversation ID yet
        otherUser: f.friend,
        lastMessage: null,
        unreadCount: 0,
        totalMessageCount: 0,
        totalUnreadDuration: 0,
        updatedAt: f.createdAt, // Use friend added date for sorting
      }))

    // Combine conversations and friends without conversations
    const allConversations = [...filteredConversations, ...friendsWithoutConversations]

    // Sort: conversations with messages first (by message date), then friends without messages (by friend added date)
    const sortedConversations = allConversations.sort((a, b) => {
      // If conversation has a last message, sort by message createdAt
      // Otherwise, sort by conversation updatedAt
      const aTime = a.lastMessage?.createdAt 
        ? new Date(a.lastMessage.createdAt).getTime()
        : new Date(a.updatedAt).getTime()
      const bTime = b.lastMessage?.createdAt 
        ? new Date(b.lastMessage.createdAt).getTime()
        : new Date(b.updatedAt).getTime()
      
      return bTime - aTime // Descending order (newest first)
    })

    return NextResponse.json({
      conversations: sortedConversations
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
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

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot create conversation with yourself' },
        { status: 400 }
      )
    }

    // Check if conversation already exists
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: {
            userId: {
              in: [session.user.id, userId]
            }
          }
        }
      },
      include: {
        participants: true
      }
    })

    if (existingConversation) {
      return NextResponse.json({ conversation: existingConversation })
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [
            { userId: session.user.id },
            { userId }
          ]
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      }
    })

    return NextResponse.json({ conversation }, { status: 201 })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
