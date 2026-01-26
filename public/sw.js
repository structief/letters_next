// Service Worker for PWA notifications
const CACHE_NAME = 'lttrs-v1'

// Install event - cache resources
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  return self.clients.claim()
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const action = event.action || 'default'
  const data = event.notification.data || {}

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url === data.url && 'focus' in client) {
          return client.focus()
        }
      }

      // Otherwise, open the app
      if (clients.openWindow) {
        return clients.openWindow(data.url || '/app')
      }
    })
  )
})

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'notification',
    data: {
      url: data.url || '/app',
      type: data.type || 'info'
    },
    requireInteraction: false,
    vibrate: [200, 100, 200]
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Lttrs.', options)
  )
})

// Store last known notification counts
let lastCounts = {
  pendingRequests: 0,
  unreadMessages: 0
}
let pollingInterval = null
let isPolling = false

// Poll for notifications in the background
async function pollForNotifications() {
  if (isPolling) return // Prevent concurrent polls
  isPolling = true

  try {
    const response = await fetch('/api/notifications/counts', {
      credentials: 'include', // Include cookies for authentication
      cache: 'no-store'
    })

    if (response.ok) {
      const data = await response.json()
      const newPendingRequests = data.pendingRequests || 0
      const newUnreadMessages = data.unreadMessages || 0

      // Check for new friend requests
      if (newPendingRequests > lastCounts.pendingRequests) {
        const newRequestsCount = newPendingRequests - lastCounts.pendingRequests
        const message = newRequestsCount === 1 
          ? 'You have a new friend request' 
          : `You have ${newRequestsCount} new friend requests`
        
        try {
          await self.registration.showNotification('New Friend Request', {
            body: message,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: 'friend-request',
            data: {
              url: '/app?tab=orbit',
              type: 'friend-request'
            },
            requireInteraction: false,
            vibrate: [200, 100, 200]
          })
        } catch (notifError) {
          console.error('Error showing friend request notification:', notifError)
        }
      }

      // Check for new messages
      if (newUnreadMessages > lastCounts.unreadMessages) {
        const newMessagesCount = newUnreadMessages - lastCounts.unreadMessages
        const message = newMessagesCount === 1 
          ? 'You have a new message' 
          : `You have ${newMessagesCount} new messages`
        
        try {
          await self.registration.showNotification('New Message', {
            body: message,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: 'new-message',
            data: {
              url: '/app?tab=friends',
              type: 'message'
            },
            requireInteraction: false,
            vibrate: [200, 100, 200]
          })
        } catch (notifError) {
          console.error('Error showing message notification:', notifError)
        }
      }

      // Update last known counts
      lastCounts = {
        pendingRequests: newPendingRequests,
        unreadMessages: newUnreadMessages
      }
    } else if (response.status === 401) {
      // Unauthorized - stop polling
      stopPolling()
    }
  } catch (error) {
    console.error('Error polling for notifications:', error)
  } finally {
    isPolling = false
  }
}

// Start background polling
function startPolling(intervalMs = 30000) {
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }

  // Poll immediately
  pollForNotifications()

  // Then poll at intervals
  pollingInterval = setInterval(() => {
    pollForNotifications()
  }, intervalMs)
}

// Stop background polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

// Message handler for showing notifications from the app and controlling polling
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data
    
    event.waitUntil(
      self.registration.showNotification(title, {
        ...options,
        icon: options.icon || '/icons/icon-192x192.png',
        badge: options.badge || '/icons/icon-72x72.png',
        data: {
          url: options.url || '/app',
          ...options.data
        }
      })
    )
  } else if (event.data && event.data.type === 'START_POLLING') {
    // Start background polling
    const intervalMs = event.data.intervalMs || 30000
    startPolling(intervalMs)
  } else if (event.data && event.data.type === 'STOP_POLLING') {
    // Stop background polling
    stopPolling()
  } else if (event.data && event.data.type === 'UPDATE_COUNTS') {
    // Update last known counts (from main thread)
    if (event.data.counts) {
      lastCounts = {
        pendingRequests: event.data.counts.pendingRequests || 0,
        unreadMessages: event.data.counts.unreadMessages || 0
      }
    }
  }
})
