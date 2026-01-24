'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

interface User {
  id: string
  username: string
  email: string
}

interface UserSearchProps {
  onConversationCreated: () => void
}

export default function UserSearch({ onConversationCreated }: UserSearchProps) {
  const { data: session } = useSession()
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const searchUsers = async (term: string) => {
    if (!term.trim()) {
      setUsers([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/users?search=${encodeURIComponent(term)}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error searching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)
    searchUsers(term)
  }

  const startConversation = async (userId: string) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      })

      if (response.ok) {
        setShowSearch(false)
        setSearchTerm('')
        setUsers([])
        onConversationCreated()
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
      alert('Failed to start conversation')
    }
  }

  if (!showSearch) {
    return (null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
      }}
      onClick={() => {
        setShowSearch(false)
        setSearchTerm('')
        setUsers([])
      }}
    >
      <div
        style={{
          background: 'var(--alabaster-base)',
          borderRadius: '8px',
          padding: '24px',
          width: '100%',
          maxWidth: '360px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Search Users
          </h2>
          <button
            onClick={() => {
              setShowSearch(false)
              setSearchTerm('')
              setUsers([])
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              opacity: 0.6,
            }}
          >
            ×
          </button>
        </div>
        <input
          type="text"
          placeholder="Search by username..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="auth-input"
          autoFocus
        />
        {loading && (
          <div style={{ textAlign: 'center', padding: '24px', opacity: 0.4 }}>
            Searching...
          </div>
        )}
        {!loading && users.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            {users.map((user) => (
              <div
                key={user.id}
                onClick={() => startConversation(user.id)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: 'var(--alabaster-depth)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'opacity 0.3s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <div style={{ fontWeight: 500 }}>{user.username}</div>
                <div style={{ fontSize: '12px', opacity: 0.6 }}>{user.email}</div>
              </div>
            ))}
          </div>
        )}
        {!loading && searchTerm && users.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', opacity: 0.4 }}>
            No users found
          </div>
        )}
      </div>
    </div>
  )
}
