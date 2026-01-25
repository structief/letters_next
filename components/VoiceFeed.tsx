'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import VoiceThread from './VoiceThread'
import RecorderDock from './RecorderDock'
import UserSearch from './UserSearch'
import OrbitView from './OrbitView'

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
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [playingThreadId, setPlayingThreadId] = useState<string | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(true) // Track if audio should play
  const voiceFeedRef = useRef<HTMLElement | null>(null)
  const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const lastFetchedUserIdRef = useRef<string | null>(null)

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
  }, [activeTab, status, session?.user?.id])

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

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }

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
