'use client'

interface NotificationBarProps {
  message: string | null
  type?: 'success' | 'info' | 'error'
}

export default function NotificationBar({ message, type = 'info' }: NotificationBarProps) {
  if (!message) return null

  const getBackgroundColor = () => {
    switch (type) {
      default:
        return 'rgba(255, 77, 0, 0.95)'
    }
  }

  return (
    <div 
      className="connection-notification"
      style={{ background: getBackgroundColor() }}
    >
      {message}
    </div>
  )
}
