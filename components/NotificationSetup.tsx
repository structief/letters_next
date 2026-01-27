'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { registerServiceWorker, requestNotificationPermission } from '@/lib/notifications'

async function subscribeToPushNotifications(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    // Get VAPID public key from server
    const response = await fetch('/api/push/vapid-public-key')
    if (!response.ok) {
      console.warn('Failed to get VAPID public key, push notifications disabled')
      return
    }

    const { publicKey } = await response.json()
    if (!publicKey) {
      console.warn('VAPID public key not configured, push notifications disabled')
      return
    }

    // Convert VAPID key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(publicKey)

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    })

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    })

    console.log('Successfully subscribed to push notifications')
  } catch (error) {
    console.error('Error subscribing to push notifications:', error)
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function NotificationSetup() {
  const { data: session } = useSession()
  const hasInitializedRef = useRef(false)
  const isInitializingRef = useRef(false)

  useEffect(() => {
    if (!session?.user) return
    if (hasInitializedRef.current) return // Already initialized
    if (isInitializingRef.current) return // Currently initializing

    isInitializingRef.current = true

    // Register service worker
    registerServiceWorker().then(async (registration) => {
      if (registration) {
        console.log('Service worker registered for notifications')

        // Request notification permission after a short delay
        // This gives the user time to see the app before being prompted
        setTimeout(async () => {
          const permission = await requestNotificationPermission()
          if (permission === 'granted') {
            console.log('Notification permission granted')
            
            // Subscribe to push notifications
            if ('PushManager' in window && registration.pushManager) {
              try {
                // Check if already subscribed
                const existingSubscription = await registration.pushManager.getSubscription()
                if (!existingSubscription) {
                  // Only subscribe if we don't have a subscription
                  await subscribeToPushNotifications(registration)
                } else {
                  // Subscription already exists - no need to resubscribe or verify
                  console.log('Push subscription already exists')
                }
              } catch (error) {
                console.error('Error setting up push subscription:', error)
              }
            }
          } else if (permission === 'denied') {
            console.log('Notification permission denied')
          }
          
          hasInitializedRef.current = true
          isInitializingRef.current = false
        }, 2000) // Wait 2 seconds before requesting permission
      } else {
        isInitializingRef.current = false
      }
    })
  }, [session]) // Re-run when session changes

  return null // This component doesn't render anything
}