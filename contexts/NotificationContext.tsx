'use client'

import { createContext, useContext } from 'react'

interface NotificationContextType {
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}

export { NotificationContext }
