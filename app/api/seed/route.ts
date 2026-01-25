import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Create fake users if they don't exist
    const fakeUsers = [
      { email: 'elias@example.com', username: 'Elias Thorne' },
      { email: 'sola@example.com', username: 'Sola Kim' },
      { email: 'marcus@example.com', username: 'Marcus V.' },
      { email: 'clara@example.com', username: 'Clara' },
      { email: 'alex@example.com', username: 'Alex Rivera' },
      { email: 'jordan@example.com', username: 'Jordan Chen' },
      { email: 'maya@example.com', username: 'Maya Patel' },
      { email: 'sam@example.com', username: 'Sam Taylor' },
      { email: 'riley@example.com', username: 'Riley Kim' },
      { email: 'noah@example.com', username: 'Noah Williams' },
      { email: 'zoe@example.com', username: 'Zoe Martinez' },
      { email: 'luca@example.com', username: 'Luca Anderson' },
      { email: 'avery@example.com', username: 'Avery Johnson' },
      { email: 'quinn@example.com', username: 'Quinn Brown' },
    ]

    const createdUsers = []
    for (const userData of fakeUsers) {
      let user = await prisma.user.findUnique({
        where: { email: userData.email }
      })
      
      if (!user) {
        // Create user with a random password (they won't be able to login, but that's fine)
        const bcrypt = require('bcryptjs')
        const hashedPassword = await bcrypt.hash(Math.random().toString(), 10)
        user = await prisma.user.create({
          data: {
            ...userData,
            password: hashedPassword,
          }
        })
      }
      if (user.id !== userId) {
        createdUsers.push(user)
      }
    }

    // Add friends for current user
    const friendsToAdd = createdUsers.slice(0, 8) // Add first 8 as friends
    for (const friend of friendsToAdd) {
      const existing = await prisma.friend.findUnique({
        where: {
          userId_friendId: {
            userId: userId,
            friendId: friend.id,
          }
        }
      })
      
      if (!existing) {
        await prisma.friend.create({
          data: {
            userId: userId,
            friendId: friend.id,
            status: 'accepted',
          }
        })
        // Create reverse relationship
        await prisma.friend.create({
          data: {
            userId: friend.id,
            friendId: userId,
            status: 'accepted',
          }
        })
      }
    }

    // Create conversations and messages
    const sampleMessages = [
      "Hey, just wanted to check in about the project timeline. Can we sync up later today?",
      "Quick question about the meeting room booking for next week.",
      "Hope you're having a great day! Let me know when you're free to chat about the weekend plans.",
      "Did you get a chance to review the design mockups I sent? Would love your feedback when you have a moment.",
      "Thanks for the help earlier! The solution worked perfectly. I owe you one.",
      "Hey! Are we still on for coffee tomorrow morning? I can meet you at the usual spot around 9.",
      "Quick update on the project status - everything is on track for the deadline. Will send details later.",
      "Just finished reading your latest article. Really insightful points about the industry trends!",
      "Can you send me those files we discussed? Need them for the presentation on Friday.",
      "Happy birthday! Hope you're having an amazing day. Let's celebrate this weekend!",
      "Thanks for the recommendation! I checked it out and it's exactly what I was looking for.",
      "The event was fantastic! Thanks for organizing everything. Can't wait for the next one.",
      "Just wanted to say thanks again for your help with the project. Really appreciate it!",
      "Got it! Thanks for the update.",
      "Sounds good to me!",
      "I'll check that out right away.",
      "Perfect timing!",
      "That works for me.",
    ]

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'public', 'voice-messages')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Create placeholder audio files
    const createPlaceholderAudio = async (filename: string) => {
      const filepath = join(uploadsDir, filename)
      if (!existsSync(filepath)) {
        // Create a minimal valid WebM file (just metadata, no actual audio)
        // For now, we'll create an empty file - the UI will show the message even if audio doesn't play
        await writeFile(filepath, '')
      }
      return `/voice-messages/${filename}`
    }

    let conversationsCreated = 0
    let messagesCreated = 0

    for (let i = 0; i < Math.min(6, friendsToAdd.length); i++) {
      const friend = friendsToAdd[i]
      
      // Create or get conversation
      let conversation = await prisma.conversation.findFirst({
        where: {
          participants: {
            every: {
              userId: {
                in: [userId, friend.id]
              }
            }
          }
        },
        include: { participants: true }
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            participants: {
              create: [
                { userId: userId },
                { userId: friend.id }
              ]
            }
          },
          include: { participants: true }
        })
        conversationsCreated++
      }

      if (!conversation) {
        continue // Skip if conversation creation failed
      }

      // Check if conversation already has messages
      const existingMessages = await prisma.message.count({
        where: { conversationId: conversation.id }
      })

      if (existingMessages === 0) {
        // Create messages - some from friend, some from current user
        const messageCount = Math.floor(Math.random() * 3) + 2 // 2-4 messages per conversation
        
        for (let j = 0; j < messageCount; j++) {
          const isFromFriend = j % 2 === 0
          const senderId = isFromFriend ? friend.id : userId
          const receiverId = isFromFriend ? userId : friend.id
          
          const duration = Math.floor(Math.random() * 60) + 10 // 10-70 seconds
          const hoursAgo = j + (i * 24) // Stagger messages over days
          const timestamp = Date.now() - (hoursAgo * 3600000)
          const audioFilename = `seed-${timestamp}-${Math.random().toString(36).substring(2, 15)}.webm`
          const audioUrl = await createPlaceholderAudio(audioFilename)

          await prisma.message.create({
            data: {
              audioUrl,
              duration,
              senderId,
              receiverId,
              conversationId: conversation.id,
              createdAt: new Date(timestamp),
            }
          })
          messagesCreated++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${friendsToAdd.length} friends, ${conversationsCreated} conversations, and ${messagesCreated} messages`
    })
  } catch (error) {
    console.error('Error seeding database:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
