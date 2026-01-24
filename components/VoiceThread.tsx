'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
  updatedAt: string
}

interface Message {
  id: string
  audioUrl: string
  duration: number
  senderId: string
  receiverId?: string
  isRead: boolean
  sender: {
    id: string
    username: string
  }
  createdAt: string
}

interface VoiceThreadProps {
  conversation: Conversation
  animationDelay: number
  isPlaying: boolean
  pauseAudio?: boolean
  onPlay: () => void
  onStop: () => void
  onMessageRead?: (conversationId: string, messageId: string) => void
  threadRef?: (el: HTMLDivElement | null) => void
}

export default function VoiceThread({
  conversation,
  animationDelay,
  isPlaying,
  pauseAudio = false,
  onPlay,
  onStop,
  onMessageRead,
  threadRef,
}: VoiceThreadProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [waveform, setWaveform] = useState<number[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [localIsRead, setLocalIsRead] = useState(conversation.lastMessage?.isRead ?? false)
  const [friendMessages, setFriendMessages] = useState<Message[]>([])
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  let [totalDuration, setTotalDuration] = useState(0)
  const [hasFinishedPlaying, setHasFinishedPlaying] = useState(false)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasStartedPlayingRef = useRef(false)
  const markedMessagesRef = useRef<Set<string>>(new Set())
  const [loadedMessages, setLoadedMessages] = useState<Set<string>>(new Set())
  const [loadingMessages, setLoadingMessages] = useState<Set<string>>(new Set())
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  useEffect(() => {
    // Generate random waveform
    const bars = Array.from({ length: 40 }, () => Math.random() * 30 + 5)
    setWaveform(bars)
  }, [])

  // Sync local read state with conversation prop
  useEffect(() => {
    setLocalIsRead(conversation.lastMessage?.isRead ?? false)
  }, [conversation.lastMessage?.isRead])

  const markAsRead = useCallback(async (messageId: string) => {
    // Don't mark as read if there's no conversation (friend without messages)
    if (!conversation.id) return
    
    // Prevent duplicate calls for the same message
    if (markedMessagesRef.current.has(messageId)) {
      return
    }
    
    markedMessagesRef.current.add(messageId)

    try {
      const response = await fetch(`/api/messages/${messageId}/read`, {
        method: 'POST',
      })
      if (response.ok) {
        // Only update UI and notify parent when API call succeeds
        setLocalIsRead(true)
        onMessageRead?.(conversation.id, messageId)
      } else {
        // Remove from set if failed
        markedMessagesRef.current.delete(messageId)
        console.error('Failed to mark message as read')
      }
    } catch (error) {
      // Remove from set if failed
      markedMessagesRef.current.delete(messageId)
      console.error('Error marking message as read:', error)
    }
  }, [conversation.id, onMessageRead])

  // Fetch all messages from friend when playing starts (single fetch for both friend messages and unread duration)
  useEffect(() => {
    if (isPlaying && conversation.lastMessage && conversation.id && session?.user?.id) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(`/api/messages?conversationId=${conversation.id}`)
          if (response.ok) {
            const data = await response.json()
            
            // Filter to only messages from the friend (not from current user)
            const messages = data.messages.filter((msg: Message) => msg.senderId !== session.user.id)
            setFriendMessages(messages)
            setCurrentMessageIndex(0)
            setCurrentTime(0)
            
            // Calculate total duration from friend messages
            if (messages.length > 0) {
              const total = messages.reduce((sum: number, msg: Message) => sum + msg.duration, 0)
              setTotalDuration(total)
            } else if (conversation.lastMessage) {
              // No friend messages, use lastMessage duration
              setTotalDuration(conversation.lastMessage.duration)
            }
            
            // Preload all audio files in parallel
            const messagesToPreload = messages.length > 0 ? messages : (conversation.lastMessage ? [conversation.lastMessage] : [])
            setLoadingMessages(new Set(messagesToPreload.map((msg: Message) => msg.id)))
            setLoadedMessages(new Set())
            
            // Clean up old audio elements
            audioElementsRef.current.forEach((audio) => {
              audio.pause()
              audio.src = ''
            })
            audioElementsRef.current.clear()
            
            // Create and preload audio elements for all messages
            const loadPromises = messagesToPreload.map((msg: Message) => {
              return new Promise<void>((resolve, reject) => {
                const audio = new Audio()
                audio.preload = 'auto'
                audio.src = msg.audioUrl
                
                audioElementsRef.current.set(msg.id, audio)
                
                const handleCanPlay = () => {
                  audio.removeEventListener('canplaythrough', handleCanPlay)
                  audio.removeEventListener('error', handleError)
                  setLoadedMessages(prev => new Set([...prev, msg.id]))
                  setLoadingMessages(prev => {
                    const next = new Set(prev)
                    next.delete(msg.id)
                    return next
                  })
                  resolve()
                }
                
                const handleError = () => {
                  audio.removeEventListener('canplaythrough', handleCanPlay)
                  audio.removeEventListener('error', handleError)
                  setLoadingMessages(prev => {
                    const next = new Set(prev)
                    next.delete(msg.id)
                    return next
                  })
                  reject(new Error(`Failed to load audio for message ${msg.id}`))
                }
                
                audio.addEventListener('canplaythrough', handleCanPlay)
                audio.addEventListener('error', handleError)
                
                // Start loading
                audio.load()
              })
            })
            
            // Wait for all to load (but don't block - they load in parallel)
            Promise.allSettled(loadPromises).catch(() => {
              // Errors are handled individually above
            })
            
          }
        } catch (error) {
          console.error('Error fetching messages:', error)
          // On error, treat as single message
          setFriendMessages([])
          if (conversation.lastMessage) {
            setTotalDuration(conversation.lastMessage.duration)
          }
        }
      }
      fetchMessages()
    } else {
      setFriendMessages([])
      setCurrentMessageIndex(0)
      setCurrentTime(0)
      setTotalDuration(0)
      setLoadedMessages(new Set())
      setLoadingMessages(new Set())
      // Clean up audio elements
      audioElementsRef.current.forEach((audio) => {
        audio.pause()
        audio.src = ''
      })
      audioElementsRef.current.clear()
    }
  }, [isPlaying, conversation.id, conversation.lastMessage, session?.user?.id])

  // Pause audio when recording starts (but keep visual state)
  useEffect(() => {
    if (pauseAudio && audioRef.current) {
      audioRef.current.pause()
      setIsAudioPlaying(false)
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [pauseAudio])

  // Handle playback of current message
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsAudioPlaying(false)
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      setHasFinishedPlaying(false)
      return
    }

    // Reset finished state when starting to play
    setHasFinishedPlaying(false)

    // Don't start playback if audio is paused
    if (pauseAudio) {
      return
    }

    if (!conversation.lastMessage) return

    // Determine which message to play
    let messageToPlay = conversation.lastMessage
    if (friendMessages.length === 1) {
      messageToPlay = friendMessages[0]
    } else if (friendMessages.length > 1 && currentMessageIndex < friendMessages.length) {
      messageToPlay = friendMessages[currentMessageIndex]
    }

    // Check if message is loaded before playing
    if (!messageToPlay || !loadedMessages.has(messageToPlay.id)) {
      // Message not loaded yet, wait for it
      setIsAudioPlaying(false)
      return
    }

    // Use preloaded audio element or create one if needed
    const preloadedAudio = audioElementsRef.current.get(messageToPlay.id)
    if (preloadedAudio && audioRef.current !== preloadedAudio) {
      // Switch to preloaded audio element
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      // We'll use the preloaded audio, but we need to update the ref
      // For now, copy the src to the main audioRef
      if (audioRef.current) {
        audioRef.current.src = preloadedAudio.src
        audioRef.current.currentTime = 0
      }
    }

    // Start playback only when loaded
    if (audioRef.current && messageToPlay && !pauseAudio && loadedMessages.has(messageToPlay.id)) {
      // Ensure we're using the correct source
      if (audioRef.current.src !== messageToPlay.audioUrl) {
        audioRef.current.src = messageToPlay.audioUrl
      }
      audioRef.current.currentTime = 0
      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // Ignore AbortError - it's expected when audio is interrupted
          if (error.name !== 'AbortError') {
            console.error('Error playing audio:', error)
          }
        })
      }
      setIsAudioPlaying(true)
      hasStartedPlayingRef.current = true
      
      // Mark as read if needed (only for messages from others, not your own)
      if ('isRead' in messageToPlay && !messageToPlay.isRead && messageToPlay.senderId !== session?.user?.id) {
        markAsRead(messageToPlay.id)
      }
    }

    // Set up timer update interval
    const updateProgress = () => {
      if (audioRef.current && isPlaying) {
        if (friendMessages.length <= 1) {
          // Single message case
          setCurrentTime(audioRef.current.currentTime)
        } else if (friendMessages.length > 1) {
          // Multiple messages case
          const current = audioRef.current.currentTime
          let totalElapsed = 0
          for (let i = 0; i < currentMessageIndex; i++) {
            totalElapsed += friendMessages[i].duration
          }
          totalElapsed += current
          setCurrentTime(totalElapsed)
        }
      }
    }

    progressIntervalRef.current = setInterval(updateProgress, 100)

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [isPlaying, pauseAudio, friendMessages, currentMessageIndex, conversation.lastMessage, session?.user?.id, markAsRead, loadedMessages])

  // Handle stopping playback
  useEffect(() => {
    if (!isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setIsAudioPlaying(false)
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      
      // Only mark as read if playback had actually started (not on initial mount)
      if (hasStartedPlayingRef.current) {
        // Mark current playing message as read when user stops listening (taps away)
        if (friendMessages.length > 0 && currentMessageIndex < friendMessages.length) {
          const currentMessage = friendMessages[currentMessageIndex]
          if (!currentMessage.isRead && currentMessage.senderId !== session?.user?.id) {
            markAsRead(currentMessage.id)
          }
        } else if (conversation.lastMessage && !localIsRead && conversation.lastMessage.senderId !== session?.user?.id) {
          // Fallback to last message if no friend messages loaded yet
          markAsRead(conversation.lastMessage.id)
        }
        hasStartedPlayingRef.current = false
      }
      
      setCurrentTime(0)
    }
  }, [isPlaying, friendMessages, currentMessageIndex, conversation.lastMessage, localIsRead, session?.user?.id, markAsRead])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering feed click handler
    // For friends without messages, clicking should just show the recorder (handled by parent)
    // Don't try to play audio if there's no lastMessage
    if (!conversation.lastMessage) {
      onPlay()
      return
    }
    if (isPlaying) {
      // If playback has finished, restart it instead of stopping
      if (hasFinishedPlaying) {
        setHasFinishedPlaying(false)
        setCurrentMessageIndex(0)
        setCurrentTime(0)
        setIsAudioPlaying(false) // Reset to allow playback to start fresh
        // Reset audio element
        if (audioRef.current) {
          audioRef.current.currentTime = 0
        }
        // The playback useEffect will restart when currentMessageIndex changes
      } else {
        onStop()
      }
    } else {
      onPlay()
    }
  }

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    e.stopPropagation()
    if (friendMessages.length === 0) return
    
    setCurrentMessageIndex(index)
    
    // Calculate total elapsed time up to this message
    let totalElapsed = 0
    for (let i = 0; i < index; i++) {
      totalElapsed += friendMessages[i].duration
    }
    setCurrentTime(totalElapsed)
    
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const handleMessageEnd = () => {
    // Safety check: ensure we have a valid message
    if (friendMessages.length === 0 || currentMessageIndex >= friendMessages.length) {
      // Single message case or edge case - stop playback and animation but keep screen visible
      setIsAudioPlaying(false)
      setHasFinishedPlaying(true)
      setCurrentTime(totalDuration > 0 ? totalDuration : (conversation.lastMessage?.duration || 0))
      
      // Clear progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      
      // Mark as read if needed
      if (conversation.lastMessage && !conversation.lastMessage.isRead && conversation.lastMessage.senderId !== session?.user?.id) {
        markAsRead(conversation.lastMessage.id)
      }
      
      // Don't call onStop() - keep the screen visible so users can reply immediately
      return
    }

    const currentMessage = friendMessages[currentMessageIndex]
    if (!currentMessage) {
      // Edge case - stop playback and animation but keep screen visible
      setIsAudioPlaying(false)
      setHasFinishedPlaying(true)
      setCurrentTime(totalDuration)
      
      // Clear progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      
      // Don't call onStop() - keep the screen visible so users can reply immediately
      return
    }

    if (currentMessageIndex < friendMessages.length - 1) {
      // Mark current message as read
      if (!currentMessage.isRead && currentMessage.senderId !== session?.user?.id) {
        markAsRead(currentMessage.id)
      }
      
      // Move to next message
      setCurrentMessageIndex(prev => prev + 1)
    } else {
      // All messages played - stop playback and animation but keep screen visible
      if (!currentMessage.isRead && currentMessage.senderId !== session?.user?.id) {
        markAsRead(currentMessage.id)
      }
      setIsAudioPlaying(false)
      setHasFinishedPlaying(true)
      setCurrentTime(totalDuration) // Set to end so progress bar shows 100%
      
      // Clear progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      
      // Don't call onStop() - keep the screen visible so users can reply immediately
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'JUST NOW'
    if (diffMins < 60) return `${diffMins}M AGO`
    if (diffHours < 24) return `${diffHours}H AGO`
    if (diffDays === 1) return 'YESTERDAY'
    if (diffDays < 7) return `${diffDays}D AGO`
    return `${Math.floor(diffDays / 7)}W AGO`
  }

  // Determine message state using local read state
  const getMessageState = () => {
    if (!conversation.lastMessage || !session?.user?.id) return 'listened'
    
    const isMine = conversation.lastMessage.senderId === session.user.id
    if (isMine) return 'mine'
    
    // If there are unread messages, show as new
    if (conversation.unreadCount > 0) return 'new'
    
    if (!localIsRead) return 'new'
    
    return 'listened'
  }

  const messageState = getMessageState()
  const isMine = conversation.lastMessage?.senderId === session?.user?.id

  const previewText = conversation.lastMessage
    ? isMine 
      ? 'Voice message from you'
      : `Voice message from ${conversation.lastMessage.sender.username}`
    : 'No messages yet'

  return (
    <div
      ref={threadRef}
      className={`voice-thread reveal ${isPlaying ? 'playing' : ''} ${messageState === 'new' ? 'new' : ''} ${messageState === 'mine' ? 'mine' : ''}`}
      style={{ animationDelay: `${animationDelay}s` }}
      onClick={handleClick}
      data-user={conversation.otherUser.username}
      data-avatar={messageState === 'new' ? 'accent' : messageState === 'mine' ? 'faded' : 'outline'}
    >
      {conversation.lastMessage && (
        <audio
          ref={audioRef}
          preload="none"
          onEnded={handleMessageEnd}
          onLoadedMetadata={() => {
            // Set total duration when audio loads
            if (audioRef.current && isPlaying && conversation.lastMessage) {
              if (friendMessages.length <= 1) {
                const lastMsg = conversation.lastMessage
                setTotalDuration(audioRef.current.duration || lastMsg.duration)
              }
            }
          }}
          onTimeUpdate={() => {
            // Backup timer update - ensures timer updates even if interval is delayed
            if (audioRef.current && isPlaying) {
              if (friendMessages.length <= 1) {
                // Single message case
                setCurrentTime(audioRef.current.currentTime)
              } else if (friendMessages.length > 1 && currentMessageIndex < friendMessages.length) {
                // Multiple messages case
                const current = audioRef.current.currentTime
                let totalElapsed = 0
                for (let i = 0; i < currentMessageIndex; i++) {
                  totalElapsed += friendMessages[i].duration
                }
                totalElapsed += current
                setCurrentTime(totalElapsed)
              }
            }
          }}
        />
      )}
      <div className="user-info">
        <div className={`avatar ${messageState === 'mine' ? 'mine-avatar' : ''}`}>
          {messageState === 'new' && conversation.unreadCount > 0 && (
            <div className="avatar-badge">{conversation.unreadCount}</div>
          )}
        </div>
        <span className={`username ${messageState === 'mine' ? 'mine-username' : ''}`}>
          {isMine ? (
            <>You <span className="to-separator">to</span> {conversation.otherUser.username}</>
          ) : (
            <>{conversation.otherUser.username} <span className="to-separator">to</span> you</>
          )}
        </span>
      </div>
      {conversation.lastMessage && (
        <>
          <div className="waveform-wrapper">
            <div className={`waveform-container ${isPlaying && !pauseAudio && !hasFinishedPlaying ? 'playing' : ''}`}>
              {waveform.map((height, i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    height: `${height}px`,
                    animationDelay: (isPlaying && !pauseAudio && !hasFinishedPlaying) ? `${i * 0.05}s` : '0s',
                  }}
                />
              ))}
            </div>
            <div className={`message-preview ${messageState === 'new' ? 'new-preview' : messageState === 'mine' ? 'mine-preview' : ''}`}>
              {previewText}
            </div>
          </div>
          {isPlaying && totalDuration > 0 && (
            <div className="progress-bar-container">
              <div className="progress-bar">
                {(friendMessages.length > 0 ? friendMessages : conversation.lastMessage ? [conversation.lastMessage] : []).map((msg, index) => {
                  const messagesToShow = friendMessages.length > 0 ? friendMessages : (conversation.lastMessage ? [conversation.lastMessage] : [])
                  const messageCount = messagesToShow.length
                  
                  // Round totalDuration to 0 decimal places
                  totalDuration = Math.round(totalDuration);

                  const segmentWidth = (msg.duration / totalDuration) * 100
                  let fillWidth = 0
                  
                  if (messageCount === 1) {
                    // Single message case - use currentTime directly
                    fillWidth = Math.min(100, Math.max(0, (currentTime / msg.duration) * 100))
                  } else {
                    // Multiple messages case
                    if (index < currentMessageIndex) {
                      fillWidth = 100
                    } else if (index === currentMessageIndex) {
                      // Calculate elapsed time for current message
                      let elapsedBeforeCurrent = 0
                      for (let i = 0; i < currentMessageIndex; i++) {
                        elapsedBeforeCurrent += messagesToShow[i].duration
                      }
                      const currentMsgElapsed = currentTime - elapsedBeforeCurrent
                      fillWidth = Math.min(100, Math.max(0, (currentMsgElapsed / msg.duration) * 100))
                    }
                  }
                  
                  const isLoading = loadingMessages.has(msg.id)
                  
                  return (
                    <div
                      key={msg.id}
                      className="progress-segment"
                      style={{ width: `${segmentWidth}%` }}
                      onClick={(e) => friendMessages.length > 0 ? handleProgressBarClick(e, index) : undefined}
                    >
                      {isLoading && (
                        <div className="progress-segment-loading" />
                      )}
                      <div 
                        className="progress-segment-fill"
                        style={{ width: `${fillWidth}%` }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="meta-data">
            {isPlaying && totalDuration > 0 ? (
              <span>{formatDuration(Math.floor(currentTime))} / {formatDuration(totalDuration)}</span>
            ) : conversation.lastMessage ? (
              <span>
                {formatDuration(conversation.lastMessage.duration)}
                {conversation.totalUnreadDuration > 0 && (
                  <span style={{ fontSize: '9px', opacity: 0.5 }}> / {formatDuration(conversation.totalUnreadDuration)}</span>
                )}
              </span>
            ) : null}
            {conversation.lastMessage && (
              <span>{formatTimeAgo(conversation.lastMessage.createdAt)}</span>
            )}
          </div>
        </>
      )}
      {!conversation.lastMessage && (
        <div className="meta-data">
          <span>Never contacted</span>
        </div>
      )}
    </div>
  )
}
