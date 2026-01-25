'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface TabNavigationProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

export default function TabNavigation({ activeTab, setActiveTab }: TabNavigationProps) {
  const { data: session } = useSession()
  const [pendingRequests, setPendingRequests] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const fetchCounts = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const response = await fetch('/api/notifications/counts')
      if (response.ok) {
        const data = await response.json()
        setPendingRequests(data.pendingRequests || 0)
        setUnreadMessages(data.unreadMessages || 0)
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
