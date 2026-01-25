'use client'

import { useEffect } from 'react'
import { registerServiceWorker, requestNotificationPermission } from '@/lib/notifications'

export default function NotificationSetup() {
  useEffect(() => {
    // Register service worker
    registerServiceWorker().then((registration) => {
      if (registration) {
        console.log('Service worker registered for notifications')
      }
    })

    // Request notification permission after a short delay
    // This gives the user time to see the app before being prompted
    const permissionTimer = setTimeout(() => {
      requestNotificationPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('Notification permission granted')
        } else if (permission === 'denied') {
          console.log('Notification permission denied')
        }
      })
    }, 2000) // Wait 2 seconds before requesting permission

    return () => {
      clearTimeout(permissionTimer)
    }
  }, [])

  return null // This component doesn't render anything
}