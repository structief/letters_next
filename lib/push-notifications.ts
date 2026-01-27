import webpush from 'web-push'
import { prisma } from './prisma'

// Initialize web-push with VAPID keys
// These should be set as environment variables
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:your-email@example.com'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
}

export interface PushNotificationPayload {
  title: string
  body: string
  url?: string
  tag?: string
  type?: 'message' | 'friend-request' | 'info'
}

/**
 * Send a push notification to a user
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    // Get all push subscriptions for the user
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    })

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions found for user ${userId}`)
      return
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: payload.tag || 'notification',
      data: {
        url: payload.url || '/app',
        type: payload.type || 'info'
      },
      requireInteraction: false,
      vibrate: [200, 100, 200]
    })

    // Send to all subscriptions
    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          notificationPayload
        )
      } catch (error: any) {
        // If subscription is invalid, remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Removing invalid subscription for user ${userId}`)
          await prisma.pushSubscription.delete({
            where: { id: subscription.id }
          })
        } else {
          console.error(`Error sending push notification to subscription ${subscription.id}:`, error)
        }
      }
    })

    await Promise.allSettled(sendPromises)
  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error)
    // Don't throw - push notifications are non-critical
  }
}

/**
 * Send push notification for a new message
 */
export async function sendMessageNotification(
  receiverId: string,
  senderUsername: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: 'New Message',
    body: `You have a new message from ${senderUsername}`,
    url: '/app?tab=friends',
    tag: 'new-message',
    type: 'message'
  })
}

/**
 * Send push notification for a new friend request
 */
export async function sendFriendRequestNotification(
  receiverId: string,
  senderUsername: string
): Promise<void> {
  await sendPushNotification(receiverId, {
    title: 'New Friend Request',
    body: `${senderUsername} sent you a friend request`,
    url: '/app?tab=orbit',
    tag: 'friend-request',
    type: 'friend-request'
  })
}
