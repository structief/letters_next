'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useNotification } from '@/contexts/NotificationContext'

interface User {
  id: string
  username: string
  email: string
}

interface Friend {
  id: string
  username: string
  email: string
  addedAt: string
  status?: string
}

interface FriendRequest {
  id: string
  userId: string
  username: string
  email: string
  requestedAt: string
  status: string
}

export default function OrbitView() {
  const { data: session } = useSession()
  const { showNotification } = useNotification()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<Friend[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetchFriends()
    // Auto-refresh every minute
    const interval = setInterval(() => {
      fetchFriends()
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchFriends = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/friends')
      if (response.ok) {
        const data = await response.json()
        setFriends(data.friends || [])
        setPendingRequests(data.pendingRequests || [])
        setSentRequests(data.sentRequests || [])
      }
    } catch (error) {
      console.error('Error fetching friends:', error)
    } finally {
      setLoading(false)
    }
  }

  const searchUsers = async (term: string) => {
    if (!term.trim()) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/users?search=${encodeURIComponent(term)}`)
      if (response.ok) {
        const data = await response.json()
        // Friends are already filtered out by the API, so these are non-friends
        setSearchResults(data.users || [])
      }
    } catch (error) {
      console.error('Error searching users:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)
    searchUsers(term)
  }

  const addFriend = async (userId: string) => {
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendId: userId }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.friend.status === 'accepted') {
          setFriends([data.friend, ...friends])
          showNotification(`Added ${data.friend.username}`, 'success')
        } else {
          setSentRequests([data.friend, ...sentRequests])
          showNotification(`Friend request sent to ${data.friend.username}`, 'success')
        }
        // Remove from search results
        setSearchResults(searchResults.filter(u => u.id !== userId))
        setSearchTerm('')
      } else {
        const error = await response.json()
        showNotification(error.error || 'Failed to send friend request', 'error')
      }
    } catch (error) {
      console.error('Error adding friend:', error)
      showNotification('Failed to add friend', 'error')
    }
  }

  const removeFriend = async (friendId: string) => {
    const friend = friends.find(f => f.id === friendId)
    if (!confirm('Remove this friend?')) return

    try {
      const response = await fetch(`/api/friends?friendId=${friendId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setFriends(friends.filter(f => f.id !== friendId))
        showNotification(`Removed ${friend?.username || 'friend'}`, 'success')
      } else {
        showNotification('Failed to remove friend', 'error')
      }
    } catch (error) {
      console.error('Error removing friend:', error)
      showNotification('Failed to remove friend', 'error')
    }
  }

  const handleRequestAction = async (requestId: string, action: 'accept' | 'decline', username: string) => {
    try {
      const response = await fetch(`/api/friends/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      if (response.ok) {
        const data = await response.json()
        setPendingRequests(pendingRequests.filter(r => r.id !== requestId))
        if (action === 'accept') {
          // Refresh friends list to include the new friend
          fetchFriends()
          showNotification(`Accepted friend request from ${username}`, 'success')
        } else {
          showNotification(`Declined friend request from ${username}`, 'success')
        }
        // Trigger notification count refresh
        window.dispatchEvent(new Event('refreshNotificationCounts'))
      } else {
        const error = await response.json()
        showNotification(error.error || `Failed to ${action} friend request`, 'error')
      }
    } catch (error) {
      console.error(`Error ${action}ing friend request:`, error)
      showNotification(`Failed to ${action} friend request`, 'error')
    }
  }

  // Filter friends based on search term
  const filteredFriends = searchTerm
    ? friends.filter(friend =>
        friend.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        friend.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : friends

  return (
    <div className="view-container active">
      <div style={{ flex: 1, padding: '24px 32px', paddingBottom: `calc(100px + env(safe-area-inset-bottom, 0))`, display: 'flex', flexDirection: 'column', overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
        {/* Search input */}
        <input
          type="text"
          placeholder="Search friends or users..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{
            width: '100%',
            padding: '14px 16px',
            marginBottom: '32px',
            marginLeft: '3px',
            borderLeft: '0px solid rgba(0, 0, 0, 0.03)',
            background: 'transparent',
            border: '1px solid rgba(0, 0, 0, 0.03)',
            borderRadius: '2px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            color: 'var(--filament-tension)',
            transition: 'all 0.3s ease',
            outline: 'none',
          }}
        />

        {loading && !searchTerm && (
          <div style={{ textAlign: 'center', padding: '64px 32px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.3 }}>
            Loading...
          </div>
        )}

        {!loading && (
          <>
            {/* Pending Requests Section */}
            {pendingRequests.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '9px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.15em', 
                  opacity: 0.4, 
                  marginBottom: '16px' 
                }}>
                  Pending Requests ({pendingRequests.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '16px',
                        transition: 'opacity 0.3s ease',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ 
                            width: '6px', 
                            height: '6px', 
                            borderRadius: '50%', 
                            background: 'var(--filament-tension)',
                            boxShadow: '0 0 0 3px var(--alabaster-depth)'
                          }}></div>
                          <div style={{ fontWeight: 500, fontSize: '14px', letterSpacing: '-0.01em' }}>{request.username}</div>
                        </div>
                        <div style={{ fontSize: '11px', opacity: '0.5', fontFamily: 'var(--font-mono)', textTransform: 'lowercase', paddingLeft: '14px' }}>{request.email}</div>
                        <div style={{ fontSize: '9px', opacity: 0.4, marginTop: '4px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '14px' }}>
                          {new Date(request.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginLeft: '16px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleRequestAction(request.id, 'accept', request.username)}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: 'var(--filament-accent)',
                            border: '1px solid rgba(255, 77, 0, 0.3)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '9px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            cursor: 'pointer',
                            transition: 'all 0.3s var(--ease-out-expo)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--filament-accent)'
                            e.currentTarget.style.color = 'white'
                            e.currentTarget.style.borderColor = 'var(--filament-accent)'
                            e.currentTarget.style.transform = 'scale(1.05)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--filament-accent)'
                            e.currentTarget.style.borderColor = 'rgba(255, 77, 0, 0.3)'
                            e.currentTarget.style.transform = 'scale(1)'
                          }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRequestAction(request.id, 'decline', request.username)}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            color: 'var(--filament-tension)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '9px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            cursor: 'pointer',
                            transition: 'all 0.3s var(--ease-out-expo)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--filament-tension)'
                            e.currentTarget.style.color = 'white'
                            e.currentTarget.style.transform = 'scale(1.05)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--filament-tension)'
                            e.currentTarget.style.transform = 'scale(1)'
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filtered Friends Section */}
            {filteredFriends.length > 0 && (
              <div style={{ marginBottom: searchResults.length > 0 ? '32px' : '0' }}>
                {searchTerm && (
                  <div style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '9px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.15em', 
                    opacity: 0.4, 
                    marginBottom: '16px' 
                  }}>
                    Friends ({filteredFriends.length})
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {filteredFriends.map((friend) => (
                    <div
                      key={friend.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '16px',
                        transition: 'opacity 0.3s ease',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ 
                            width: '6px', 
                            height: '6px', 
                            borderRadius: '50%', 
                            background: 'var(--filament-accent)',
                            boxShadow: '0 0 0 3px var(--alabaster-depth)'
                          }}></div>
                          <div style={{ fontWeight: 500, fontSize: '14px', letterSpacing: '-0.01em' }}>{friend.username}</div>
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.5, fontFamily: 'var(--font-mono)', textTransform: 'lowercase', paddingLeft: '14px' }}>{friend.email}</div>
                        <div style={{ fontSize: '9px', opacity: 0.4, marginTop: '4px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '14px' }}>
                          {new Date(friend.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFriend(friend.id)}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          color: 'var(--filament-accent)',
                          border: '1px solid rgba(255, 77, 0, 0.3)',
                          borderRadius: '2px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.15em',
                          cursor: 'pointer',
                          transition: 'all 0.3s var(--ease-out-expo)',
                          marginLeft: '16px',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--filament-accent)'
                          e.currentTarget.style.color = 'white'
                          e.currentTarget.style.borderColor = 'var(--filament-accent)'
                          e.currentTarget.style.transform = 'scale(1.05)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--filament-accent)'
                          e.currentTarget.style.borderColor = 'rgba(255, 77, 0, 0.3)'
                          e.currentTarget.style.transform = 'scale(1)'
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results (Non-Friends) Section */}
            {searchTerm && (
              <>
                {searching && (
                  <div style={{ textAlign: 'center', padding: '32px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.3 }}>
                    Searching...
                  </div>
                )}
                {!searching && searchResults.length > 0 && (
                  <div>
                    <div style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '9px', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.15em', 
                      opacity: 0.4, 
                      marginBottom: '16px', 
                      marginLeft: '16px'
                    }}>
                      Users ({searchResults.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginLeft:'16px' }}>
                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingBottom: '16px',
                            transition: 'opacity 0.3s ease',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px', letterSpacing: '-0.01em' }}>{user.username}</div>
                            <div style={{ fontSize: '11px', opacity: 0.5, fontFamily: 'var(--font-mono)', textTransform: 'lowercase' }}>{user.email}</div>
                          </div>
                          <button
                            onClick={() => addFriend(user.id)}
                            style={{
                              padding: '6px 12px',
                              background: 'transparent',
                              color: 'var(--filament-tension)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: '2px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '9px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.15em',
                              cursor: 'pointer',
                              transition: 'all 0.3s var(--ease-out-expo)',
                              marginLeft: '16px',
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--filament-tension)'
                              e.currentTarget.style.color = 'white'
                              e.currentTarget.style.transform = 'scale(1.05)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--filament-tension)'
                              e.currentTarget.style.transform = 'scale(1)'
                            }}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!searching && searchTerm && filteredFriends.length === 0 && searchResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '64px 32px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.3 }}>
                    No results found
                  </div>
                )}
              </>
            )}

            {/* Sent Requests Section */}
            {!searchTerm && sentRequests.length > 0 && (
              <div style={{ marginTop: pendingRequests.length > 0 ? '32px' : '0', marginBottom: filteredFriends.length > 0 ? '32px' : '0' }}>
                <div style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '9px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.15em', 
                  opacity: 0.4, 
                  marginBottom: '16px' 
                }}>
                  Sent Requests ({sentRequests.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '16px',
                        transition: 'opacity 0.3s ease',
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ 
                            width: '6px', 
                            height: '6px', 
                            borderRadius: '50%', 
                            background: 'var(--filament-tension)',
                            boxShadow: '0 0 0 3px var(--alabaster-depth)'
                          }}></div>
                          <div style={{ fontWeight: 500, fontSize: '14px', letterSpacing: '-0.01em' }}>{request.username}</div>
                        </div>
                        <div style={{ fontSize: '11px', opacity: '0.5', fontFamily: 'var(--font-mono)', textTransform: 'lowercase', paddingLeft: '14px' }}>{request.email}</div>
                        <div style={{ fontSize: '9px', opacity: 0.4, marginTop: '4px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', paddingLeft: '14px' }}>
                          Pending
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state when no search and no friends */}
            {!searchTerm && friends.length === 0 && pendingRequests.length === 0 && sentRequests.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 32px', fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.3 }}>
                No friends yet. Search for users to add them.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
