'use client'

import { useState } from 'react'

export default function SeedButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSeed = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch('/api/seed', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(data.message || 'Database seeded successfully!')
        // Refresh the page after a short delay
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setMessage(data.error || 'Failed to seed database')
      }
    } catch (error) {
      setMessage('Error seeding database')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', top: '100px', right: '32px', zIndex: 1000 }}>
      <button
        onClick={handleSeed}
        disabled={loading}
        style={{
          padding: '12px 24px',
          background: loading ? 'var(--glass-border)' : 'var(--filament-tension)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Seeding...' : 'Seed Data'}
      </button>
      {message && (
        <div
          style={{
            position: 'absolute',
            top: '50px',
            right: 0,
            padding: '12px 16px',
            background: message.includes('success') ? 'var(--filament-accent)' : 'rgba(255, 0, 0, 0.9)',
            color: 'white',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
