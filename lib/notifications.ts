// Browser notification utilities for PWA

export interface ExtendedNotificationOptions extends NotificationOptions {
  url?: string
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission
  }

  return Notification.permission
}

export async function showBrowserNotification(
  title: string,
  options: ExtendedNotificationOptions = {}
): Promise<void> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications')
    return
  }

  if (Notification.permission !== 'granted') {
    const permission = await requestNotificationPermission()
    if (permission !== 'granted') {
      console.warn('Notification permission not granted')
      return
    }
  }

  // Try to use service worker notification if available
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      if (registration.active) {
        registration.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: {
            ...options,
            url: options.url || '/app',
          },
        })
        return
      }
    } catch (error) {
      console.warn('Service worker notification failed, falling back to direct notification:', error)
    }
  }

  // Fallback to direct notification
  new Notification(title, {
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    ...options,
  })
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported')
    return Promise.resolve(null)
  }

  return navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registered:', registration)
      
      // Force update check on every load to ensure we get the latest service worker
      registration.update().catch((error) => {
        console.error('Service Worker update check failed:', error)
      })

      // If there's a waiting service worker, activate it immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        console.log('Activating waiting service worker')
      }
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker installed - reload to activate
              console.log('New service worker installed - reloading page')
              window.location.reload()
            }
          })
        }
      })

      return registration
    })
    .catch((error) => {
      console.error('Service Worker registration failed:', error)
      return null
    })
}
