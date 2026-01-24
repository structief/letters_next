import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create fake users
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

  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const createdUsers = []
  for (const user of fakeUsers) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email }
    })
    
    if (!existing) {
      const created = await prisma.user.create({
        data: {
          ...user,
          password: hashedPassword,
        }
      })
      createdUsers.push(created)
      console.log(`Created user: ${user.username}`)
    } else {
      createdUsers.push(existing)
      console.log(`User already exists: ${user.username}`)
    }
  }

  // Get the first user (or create a test user if none exist)
  let testUser = await prisma.user.findFirst()
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        username: 'Test User',
        password: hashedPassword,
      }
    })
    console.log('Created test user')
  }

  // Create friend relationships for test user
  console.log('Creating friend relationships...')
  for (let i = 0; i < Math.min(8, createdUsers.length); i++) {
    const friend = createdUsers[i]
    if (friend.id !== testUser.id) {
      const existing = await prisma.friend.findUnique({
        where: {
          userId_friendId: {
            userId: testUser.id,
            friendId: friend.id,
          }
        }
      })
      
      if (!existing) {
        await prisma.friend.create({
          data: {
            userId: testUser.id,
            friendId: friend.id,
          }
        })
        console.log(`Added friend: ${friend.username}`)
      }
    }
  }

  // Create conversations and messages
  console.log('Creating conversations and messages...')
  const friends = await prisma.friend.findMany({
    where: { userId: testUser.id },
    include: { friend: true }
  })

  // Sample messages
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

  // Create placeholder audio files directory structure
  const fs = require('fs')
  const path = require('path')
  const uploadsDir = path.join(process.cwd(), 'public', 'voice-messages')
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create a simple silent audio file as placeholder
  // We'll create empty files and the app will handle missing audio gracefully
  const createPlaceholderAudio = (filename: string) => {
    // Just create an empty file - the app will show the message even if audio doesn't play
    const filepath = path.join(uploadsDir, filename)
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, '')
    }
    return `/voice-messages/${filename}`
  }

  for (let i = 0; i < Math.min(6, friends.length); i++) {
    const friend = friends[i].friend
    
    // Create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: {
            userId: {
              in: [testUser.id, friend.id]
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
              { userId: testUser.id },
              { userId: friend.id }
            ]
          }
        },
        include: { participants: true }
      })
    }

    if (!conversation) {
      continue // Skip if conversation creation failed
    }

    // Create messages - some from friend, some from test user
    const messageCount = Math.floor(Math.random() * 4) + 2 // 2-5 messages per conversation
    
    for (let j = 0; j < messageCount; j++) {
      const isFromFriend = j % 2 === 0
      const senderId = isFromFriend ? friend.id : testUser.id
      const receiverId = isFromFriend ? testUser.id : friend.id
      
      const duration = Math.floor(Math.random() * 60) + 10 // 10-70 seconds
      const timestamp = Date.now() - (j * 3600000) - (i * 86400000) // Stagger messages
      const audioFilename = `${timestamp}-${Math.random().toString(36).substring(2, 15)}.webm`
      const audioUrl = createPlaceholderAudio(audioFilename)

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
    }

    console.log(`Created conversation with ${friend.username} (${messageCount} messages)`)
  }

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
