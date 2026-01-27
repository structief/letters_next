// Service Worker for PWA notifications
// Update this version number when deploying to force cache invalidation
const CACHE_NAME = 'lttrs-v2'

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

// Fetch event - handle network requests
// IMPORTANT: Do not cache Next.js build files or API routes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  
  // Never cache or interfere with:
  // - Next.js build files (/_next/*)
  // - API routes (/api/*)
  // - Server actions (contain 'Next-Action' header)
  // - Dynamic routes
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/') ||
    event.request.headers.has('Next-Action') ||
    event.request.method !== 'GET'
  ) {
    // Network only - do not cache
    return event.respondWith(fetch(event.request))
  }
  
  // For all other requests, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // If network fails, don't return anything from cache
        // This ensures fresh data on new installs
        return new Response('Network error', { status: 408 })
      })
  )
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

// Message handler for showing notifications from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Skip waiting and activate immediately
    self.skipWaiting()
  } else if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
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
  }
})
