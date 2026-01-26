'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { showBrowserNotification } from '@/lib/notifications'

interface TabNavigationProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

export default function TabNavigation({ activeTab, setActiveTab }: TabNavigationProps) {
  const { data: session } = useSession()
  const [pendingRequests, setPendingRequests] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const previousCountsRef = useRef({ pendingRequests: 0, unreadMessages: 0 })
  const isInitialLoadRef = useRef(true)

  const fetchCounts = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const response = await fetch('/api/notifications/counts')
      if (response.ok) {
        const data = await response.json()
        const newPendingRequests = data.pendingRequests || 0
        const newUnreadMessages = data.unreadMessages || 0
        
        // Only show notifications after initial load
        if (!isInitialLoadRef.current) {
          const prevPending = previousCountsRef.current.pendingRequests
          const prevUnread = previousCountsRef.current.unreadMessages
          
          // Check for new friend requests
          if (newPendingRequests > prevPending) {
            const newRequestsCount = newPendingRequests - prevPending
            const message = newRequestsCount === 1 
              ? 'You have a new friend request' 
              : `You have ${newRequestsCount} new friend requests`
            
            showBrowserNotification('New Friend Request', {
              body: message,
              tag: 'friend-request',
              url: '/app?tab=orbit',
              requireInteraction: false,
            })
          }
          
          // Check for new messages
          if (newUnreadMessages > prevUnread) {
            const newMessagesCount = newUnreadMessages - prevUnread
            const message = newMessagesCount === 1 
              ? 'You have a new message' 
              : `You have ${newMessagesCount} new messages`
            
            showBrowserNotification('New Message', {
              body: message,
              tag: 'new-message',
              url: '/app?tab=friends',
              requireInteraction: false,
            })
          }
        } else {
          // Mark initial load as complete after first fetch
          isInitialLoadRef.current = false
        }
        
        setPendingRequests(newPendingRequests)
        setUnreadMessages(newUnreadMessages)
        previousCountsRef.current = {
          pendingRequests: newPendingRequests,
          unreadMessages: newUnreadMessages,
        }

        // Sync counts with service worker to prevent duplicate notifications
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            if (registration.active) {
              registration.active.postMessage({
                type: 'UPDATE_COUNTS',
                counts: {
                  pendingRequests: newPendingRequests,
                  unreadMessages: newUnreadMessages
                }
              })
            }
          })
        }
      }
    } catch (error) {
      console.error('Error fetching notification counts:', error)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return

    fetchCounts()
    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [session?.user?.id, fetchCounts])

  // Refresh counts when tab changes
  useEffect(() => {
    fetchCounts()
  }, [activeTab, fetchCounts])

  // Listen for custom events to refresh counts immediately
  useEffect(() => {
    window.addEventListener('refreshNotificationCounts', fetchCounts)
    return () => {
      window.removeEventListener('refreshNotificationCounts', fetchCounts)
    }
  }, [fetchCounts])

  return (
    <nav className="tab-navigation">
      <div
        className={`tab-item ${activeTab === 'friends' ? 'active' : ''}`}
        data-tab="friends"
        onClick={() => setActiveTab('friends')}
      >
        FRIENDS
        {unreadMessages > 0 && (
          <span className="tab-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
        )}
      </div>
      <div
        className={`tab-item ${activeTab === 'orbit' ? 'active' : ''}`}
        data-tab="orbit"
        onClick={() => setActiveTab('orbit')}
      >
        ORBIT
        {pendingRequests > 0 && (
          <span className="tab-badge">{pendingRequests > 99 ? '99+' : pendingRequests}</span>
        )}
      </div>
    </nav>
  )
}
