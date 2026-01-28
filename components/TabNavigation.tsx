'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
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

  const isFetchingRef = useRef(false)
  const lastUserIdRef = useRef<string | null>(null)

  const fetchCounts = useCallback(async () => {
    if (!session?.user?.id) return
    if (isFetchingRef.current) return // Prevent concurrent fetches
    
    isFetchingRef.current = true
    try {
      const response = await fetch('/api/notifications/counts')
      if (response.ok) {
        const data = await response.json()
        const newPendingRequests = data.pendingRequests || 0
        const newUnreadMessages = data.unreadMessages || 0

        // Mark initial load as complete after first successful fetch
        if (isInitialLoadRef.current) {
          isInitialLoadRef.current = false
        }

        setPendingRequests(newPendingRequests)
        setUnreadMessages(newUnreadMessages)
        previousCountsRef.current = {
          pendingRequests: newPendingRequests,
          unreadMessages: newUnreadMessages,
        }
      }
    } catch (error) {
      console.error('Error fetching notification counts:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [session?.user?.id])

  // Single effect to handle all fetching logic
  useEffect(() => {
    const currentUserId = session?.user?.id
    if (!currentUserId) return
    
    // Only fetch if user ID changed (prevents duplicate fetches on re-renders)
    if (lastUserIdRef.current === currentUserId) return
    
    lastUserIdRef.current = currentUserId
    
    // Reset initial load flag for new user
    isInitialLoadRef.current = true
    
    // Initial fetch
    fetchCounts()
    
    // Set up polling interval (30 seconds)
    const interval = setInterval(() => {
      fetchCounts()
    }, 30000)
    
    // Listen for custom events to refresh counts immediately
    const handleRefresh = () => {
      fetchCounts()
    }
    window.addEventListener('refreshNotificationCounts', handleRefresh)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('refreshNotificationCounts', handleRefresh)
    }
  }, [session?.user?.id, fetchCounts])

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
