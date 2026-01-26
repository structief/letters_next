'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { registerServiceWorker, requestNotificationPermission } from '@/lib/notifications'

export default function NotificationSetup() {
  const { data: session } = useSession()

  useEffect(() => {
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
            
            // Start background polling in service worker
            if (registration.active) {
              registration.active.postMessage({
                type: 'START_POLLING',
                intervalMs: 30000 // Poll every 30 seconds
              })
            }
          } else if (permission === 'denied') {
            console.log('Notification permission denied')
          }
        }, 2000) // Wait 2 seconds before requesting permission
      }
    })

    // Cleanup: stop polling when component unmounts
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          if (registration.active) {
            registration.active.postMessage({
              type: 'STOP_POLLING'
            })
          }
        })
      }
    }
  }, [session]) // Re-run when session changes

  return null // This component doesn't render anything
}