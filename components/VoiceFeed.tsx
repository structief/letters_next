'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import VoiceThread from './VoiceThread'
import RecorderDock from './RecorderDock'
import UserSearch from './UserSearch'
import OrbitView from './OrbitView'
import { useNotification } from '@/contexts/NotificationContext'

interface Conversation {
  id: string | null
  otherUser: {
    id: string
    username: string
  }
  lastMessage: {
    id: string
    audioUrl: string
    duration: number
    senderId: string
    isRead: boolean
    sender: {
      id: string
      username: string
    }
    createdAt: string
  } | null
  unreadCount: number
  totalUnreadDuration: number
  totalMessageCount: number
  updatedAt: string
}

interface VoiceFeedProps {
  activeTab: string
}

export default function VoiceFeed({ activeTab }: VoiceFeedProps) {
  const { data: session, status } = useSession()
  const { showNotification } = useNotification()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [playingThreadId, setPlayingThreadId] = useState<string | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(true) // Track if audio should play
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const voiceFeedRef = useRef<HTMLElement | null>(null)
  const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const lastFetchedUserIdRef = useRef<string | null>(null)
  const previousConversationsRef = useRef<Conversation[]>([])
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pullStartYRef = useRef<number | null>(null)
  const isPullingRef = useRef(false)

  const detectAndNotifyChanges = useCallback((oldConversations: Conversation[], newConversations: Conversation[]) => {
    const changes: string[] = []

    // Check for new conversations
    const oldConversationIds = new Set(oldConversations.map(c => c.id || `friend-${c.otherUser.id}`))
    const newConversationsList = newConversations.filter(
      c => !oldConversationIds.has(c.id || `friend-${c.otherUser.id}`)
    )
    if (newConversationsList.length > 0) {
      if (newConversationsList.length === 1) {
        changes.push(`New conversation with ${newConversationsList[0].otherUser.username}`)
      } else {
        changes.push(`${newConversationsList.length} new conversations`)
      }
    }

    // Check for new messages or updated unread counts
    const conversationMap = new Map(
      oldConversations.map(c => [c.id || `friend-${c.otherUser.id}`, c])
    )

    for (const newConv of newConversations) {
      const key = newConv.id || `friend-${newConv.otherUser.id}`
      const oldConv = conversationMap.get(key)

      if (oldConv) {
        // Check for new messages (new lastMessage or updated timestamp)
        const oldLastMessageId = oldConv.lastMessage?.id
        const newLastMessageId = newConv.lastMessage?.id
        
        if (newLastMessageId && newLastMessageId !== oldLastMessageId) {
          // New message received
          if (newConv.lastMessage?.senderId !== session?.user?.id) {
            changes.push(`New message from ${newConv.otherUser.username}`)
          }
        }

        // Check for increased unread count
        if (newConv.unreadCount > oldConv.unreadCount) {
          const unreadDiff = newConv.unreadCount - oldConv.unreadCount
          if (unreadDiff === 1) {
            changes.push(`1 unread message from ${newConv.otherUser.username}`)
          } else {
            changes.push(`${unreadDiff} unread messages from ${newConv.otherUser.username}`)
          }
        }
      }
    }

    // Show notification if there are changes
    if (changes.length > 0) {
      // Show the first change, or a summary if multiple
      const notificationMessage = changes.length === 1 
        ? changes[0] 
        : `${changes.length} updates`
      showNotification(notificationMessage, 'info')
    }
  }, [session?.user?.id, showNotification])

  const fetchConversations = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        const newConversations = data.conversations || []
        
        if (!silent && previousConversationsRef.current.length > 0) {
          detectAndNotifyChanges(previousConversationsRef.current, newConversations)
        }
        
        setConversations(newConversations)
        previousConversationsRef.current = newConversations
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [detectAndNotifyChanges])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setPullDistance(0) // Reset immediately since we don't show visual indicator
    await fetchConversations(true) // Silent refresh - don't show change notifications
    showNotification('Conversations refreshed', 'info')
  }, [fetchConversations, showNotification])

  useEffect(() => {
    // Only fetch when:
    // 1. Tab is 'friends'
    // 2. Session is authenticated
    // 3. We have a user ID
    // 4. We haven't fetched for this user yet (or user changed)
    const currentUserId = session?.user?.id
    const shouldFetch = 
      activeTab === 'friends' && 
      status === 'authenticated' && 
      currentUserId && 
      lastFetchedUserIdRef.current !== currentUserId

    if (shouldFetch) {
      lastFetchedUserIdRef.current = currentUserId
      fetchConversations()
    }
  }, [activeTab, status, session?.user?.id, fetchConversations])

  // Poll for conversation changes every 30 seconds
  useEffect(() => {
    // Only poll when:
    // 1. Tab is 'friends'
    // 2. Session is authenticated
    // 3. We have conversations loaded (or at least tried to load)
    const shouldPoll = activeTab === 'friends' && status === 'authenticated' && !loading

    if (shouldPoll) {
      // Clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }

      // Set up polling interval
      pollingIntervalRef.current = setInterval(async () => {
        await fetchConversations(false)
      }, 30000) // 30 seconds

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    } else {
      // Clear interval if we shouldn't poll
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [activeTab, status, loading, fetchConversations])

  // Reset audio playing state when playingThreadId changes
  useEffect(() => {
    setAudioPlaying(true)
  }, [playingThreadId])

  // Scroll playing thread to top
  useEffect(() => {
    if (playingThreadId && voiceFeedRef.current) {
      const threadElement = threadRefs.current.get(playingThreadId)
      if (threadElement) {
        // Calculate scroll position to bring thread to top
        const feedRect = voiceFeedRef.current.getBoundingClientRect()
        const threadRect = threadElement.getBoundingClientRect()
        const scrollTop = voiceFeedRef.current.scrollTop
        const targetScrollTop = scrollTop + threadRect.top - feedRect.top - 24 // 24px is padding-top
        
        voiceFeedRef.current.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        })
      }
    }
  }, [playingThreadId])

  const handleFeedClick = (e: React.MouseEvent<HTMLElement>) => {
    // If clicking directly on the feed background (not on a thread or its children), stop playback
    const target = e.target as HTMLElement
    const isClickOnThread = target.closest('.voice-thread')
    const isClickOnRecorder = target.closest('.recorder-dock')
    
    if (!isClickOnThread && !isClickOnRecorder && playingThreadId) {
      setPlayingThreadId(null)
    }
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!voiceFeedRef.current) return
    
    // Only allow pull-to-refresh when scrolled to top
    if (voiceFeedRef.current.scrollTop === 0) {
      pullStartYRef.current = e.touches[0].clientY
      isPullingRef.current = true
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!voiceFeedRef.current || !isPullingRef.current || pullStartYRef.current === null) return
    
    const currentY = e.touches[0].clientY
    const deltaY = currentY - pullStartYRef.current
    
    // Only allow pulling down (positive deltaY)
    if (deltaY > 0 && voiceFeedRef.current.scrollTop === 0) {
      // Prevent default scrolling while pulling
      e.preventDefault()
      
      // Calculate pull distance with resistance (easing)
      const maxPull = 120
      const resistance = 2.5
      const distance = Math.min(deltaY / resistance, maxPull)
      setPullDistance(distance)
    } else if (deltaY <= 0) {
      // Reset if user scrolls up
      setPullDistance(0)
      isPullingRef.current = false
      pullStartYRef.current = null
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!isPullingRef.current) return
    
    const threshold = 80
    if (pullDistance >= threshold) {
      // Trigger refresh
      handleRefresh()
    } else {
      // Reset pull distance
      setPullDistance(0)
    }
    
    isPullingRef.current = false
    pullStartYRef.current = null
  }, [pullDistance, handleRefresh])

  const handleMessageRead = (conversationId: string, messageId: string) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        // Decrement unreadCount for any message in this conversation
        const updates: Partial<typeof conv> = {
          unreadCount: Math.max(0, conv.unreadCount - 1),
        }
        
        // If this is the lastMessage, also update its read status
        if (conv.lastMessage?.id === messageId) {
          updates.lastMessage = {
            ...conv.lastMessage,
            isRead: true,
          }
        }
        
        return {
          ...conv,
          ...updates,
        }
      }
      return conv
    }))
  }

  if (activeTab === 'orbit') {
    return <OrbitView />
  }

  return (
    <div className="view-container friends-view active">
      <UserSearch onConversationCreated={fetchConversations} />
      <main 
        ref={voiceFeedRef}
        className="voice-feed"
        onClick={handleFeedClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div style={{ textAlign: 'center', opacity: 0.4, padding: '48px' }}>
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: 'center', opacity: 0.4, padding: '48px' }}>
            No conversations yet. Add friends in &quot;Orbit&quot; to start a conversation.
          </div>
        ) : (
          conversations.map((conv, index) => (
            <VoiceThread
              key={conv.id || `friend-${conv.otherUser.id}`}
              conversation={conv}
              animationDelay={index * 0.1}
              isPlaying={playingThreadId === (conv.id || `friend-${conv.otherUser.id}`)}
              pauseAudio={!audioPlaying}
              onPlay={() => {
                setPlayingThreadId(conv.id || `friend-${conv.otherUser.id}`)
                setAudioPlaying(true)
              }}
              onStop={() => setPlayingThreadId(null)}
              onMessageRead={handleMessageRead}
              threadRef={(el) => {
                const key = conv.id || `friend-${conv.otherUser.id}`
                if (el) {
                  threadRefs.current.set(key, el)
                } else {
                  threadRefs.current.delete(key)
                }
              }}
            />
          ))
        )}
      </main>
      <RecorderDock
        isActive={playingThreadId !== null}
        conversationId={playingThreadId ? (() => {
          const conv = conversations.find(c => 
            c.id === playingThreadId || 
            (c.id === null && playingThreadId === `friend-${c.otherUser.id}`)
          )
          return conv?.id ?? null
        })() : null}
        receiverId={playingThreadId ? (() => {
          const conv = conversations.find(c => 
            c.id === playingThreadId || 
            (c.id === null && playingThreadId === `friend-${c.otherUser.id}`)
          )
          return conv?.otherUser.id ?? null
        })() : null}
        onSent={() => {
          setPlayingThreadId(null)
          fetchConversations()
        }}
        onRecordingStart={() => {
          setAudioPlaying(false)
        }}
      />
    </div>
  )
}
