'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import VoiceFeed from '@/components/VoiceFeed'
import TabNavigation from '@/components/TabNavigation'
import Header from '@/components/Header'
import NotificationBar from '@/components/NotificationBar'
import NotificationSetup from '@/components/NotificationSetup'
import { NotificationContext } from '@/contexts/NotificationContext'

export default function AppPage() {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState('friends')
  const [showConnectionBanner, setShowConnectionBanner] = useState(true)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)

  useEffect(() => {
    // Hide banner after 5 seconds
    const timer = setTimeout(() => {
      setShowConnectionBanner(false)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ message, type })
  }

  if (!session) {
    return null
  }

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      <NotificationSetup />
      <div className="app-container">
        {notification && (
          <NotificationBar message={notification.message} type={notification.type} />
        )}
        {showConnectionBanner && !notification && (
          <div className="connection-notification">Connected</div>
        )}
        <div className="filament-line"></div>
        <Header />
        <VoiceFeed activeTab={activeTab} />
        <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </NotificationContext.Provider>
  )
}
