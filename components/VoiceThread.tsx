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
    waveform?: number[] | null
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
  waveform?: number[] | null
  senderId: string
  receiverId?: string
  isRead: boolean
  sender: {
    id: string
    username: string
  }
  receiver?: {
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
  const [allMessages, setAllMessages] = useState<Message[]>([])
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

  // Set waveform from stored data or generate fallback
  useEffect(() => {
    const messageToUse = isPlaying && allMessages.length > 0 && currentMessageIndex < allMessages.length
      ? allMessages[currentMessageIndex]
      : conversation.lastMessage

    if (messageToUse?.waveform && Array.isArray(messageToUse.waveform) && messageToUse.waveform.length > 0) {
      // Use stored waveform
      setWaveform(messageToUse.waveform)
    } else {
      // Fallback to random waveform for backwards compatibility
      const bars = Array.from({ length: 40 }, () => Math.random() * 30 + 5)
      setWaveform(bars)
    }
  }, [conversation.lastMessage, allMessages, currentMessageIndex, isPlaying])

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

  // Fetch all messages when playing starts
  useEffect(() => {
    if (isPlaying && conversation.lastMessage && conversation.id && session?.user?.id) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(`/api/messages?conversationId=${conversation.id}`)
          if (response.ok) {
            const data = await response.json()
            
            // Use all messages (both sent and received)
            const messages = data.messages
            setAllMessages(messages)
            
            // Find first unread message index, or start at the beginning
            const firstUnreadIndex = data.firstUnreadMessageId 
              ? messages.findIndex((msg: Message) => msg.id === data.firstUnreadMessageId)
              : -1
            
            // If all messages are read or there are no messages, start at the last one
            const startIndex = firstUnreadIndex >= 0 
              ? firstUnreadIndex 
              : Math.max(0, messages.length - 1)
            
            setCurrentMessageIndex(startIndex)
            
            // Calculate elapsed time up to starting message
            let elapsedTime = 0
            for (let i = 0; i < startIndex; i++) {
              elapsedTime += messages[i].duration
            }
            setCurrentTime(elapsedTime)
            
            // Calculate total duration from all messages
            if (messages.length > 0) {
              const total = messages.reduce((sum: number, msg: Message) => sum + msg.duration, 0)
              setTotalDuration(total)
            } else if (conversation.lastMessage) {
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
                  setLoadedMessages(prev => {
                    const next = new Set([...prev, msg.id])
                    return next
                  })
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
          setAllMessages([])
          if (conversation.lastMessage) {
            setTotalDuration(conversation.lastMessage.duration)
          }
        }
      }
      fetchMessages()
    } else {
      setAllMessages([])
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
    if (allMessages.length === 1) {
      messageToPlay = allMessages[0]
    } else if (allMessages.length > 1 && currentMessageIndex < allMessages.length) {
      messageToPlay = allMessages[currentMessageIndex]
    }

    // Check if message exists
    if (!messageToPlay) {
      setIsAudioPlaying(false)
      return
    }

    // If message is not loaded yet, try to load it now (for newly sent messages)
    if (!loadedMessages.has(messageToPlay.id) && !loadingMessages.has(messageToPlay.id)) {
      // Start loading this message
      setLoadingMessages(prev => new Set([...prev, messageToPlay.id]))
      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = messageToPlay.audioUrl
      
      audioElementsRef.current.set(messageToPlay.id, audio)
      
      const handleCanPlay = () => {
        audio.removeEventListener('canplaythrough', handleCanPlay)
        audio.removeEventListener('error', handleError)
        setLoadedMessages(prev => new Set([...prev, messageToPlay.id]))
        setLoadingMessages(prev => {
          const next = new Set(prev)
          next.delete(messageToPlay.id)
          return next
        })
      }
      
      const handleError = () => {
        audio.removeEventListener('canplaythrough', handleCanPlay)
        audio.removeEventListener('error', handleError)
        setLoadingMessages(prev => {
          const next = new Set(prev)
          next.delete(messageToPlay.id)
          return next
        })
        
        // Don't log errors during preload - the audio might still load/play successfully
        // when audioRef.current.src is set directly during playback.
        // Preload failures are often transient and don't prevent actual playback.
        // Only log if there's a persistent, real error that prevents playback.
        // Since playback works, we'll skip logging preload errors to avoid false positives.
      }
      
      audio.addEventListener('canplaythrough', handleCanPlay)
      audio.addEventListener('error', handleError)
      audio.load()
      
      // Wait a bit for it to load, but don't block indefinitely
      setIsAudioPlaying(false)
      return
    }
    
    // If still loading, wait
    if (loadingMessages.has(messageToPlay.id)) {
      setIsAudioPlaying(false)
      return
    }

    // Start playback only when loaded
    if (audioRef.current && messageToPlay && !pauseAudio && loadedMessages.has(messageToPlay.id)) {
      // Read audio state BEFORE any potential resets
      const currentSrc = audioRef.current.src
      const currentTimeBefore = audioRef.current.currentTime
      const wasPlaying = !audioRef.current.paused
      
      // Normalize URLs for comparison - extract pathname from full URL or use as-is for relative paths
      const normalizeUrl = (url: string) => {
        if (!url) return ''
        try {
          // If it's already a full URL, extract the pathname
          if (url.startsWith('http://') || url.startsWith('https://')) {
            return new URL(url).pathname
          }
          // Otherwise it's already a relative path
          return url
        } catch {
          return url
        }
      }
      const normalizedCurrentSrc = normalizeUrl(currentSrc)
      const normalizedMessageUrl = normalizeUrl(messageToPlay.audioUrl)
      const needsSrcChange = normalizedCurrentSrc !== normalizedMessageUrl
      
      // If audio is already playing the correct message, don't reset or restart
      if (wasPlaying && !needsSrcChange) {
        // Just ensure state is set correctly
        setIsAudioPlaying(true)
        return
      }
      
      // Use preloaded audio element or create one if needed (only if we need to change src)
      const preloadedAudio = audioElementsRef.current.get(messageToPlay.id)
      if (preloadedAudio && needsSrcChange) {
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
      
      // Only change src and reset if actually needed
      if (needsSrcChange) {
        audioRef.current.src = messageToPlay.audioUrl
        // Reset currentTime when changing src
        audioRef.current.currentTime = 0
      } else if (!wasPlaying && currentTimeBefore === 0) {
        // Only reset if audio wasn't playing and is at the start
        audioRef.current.currentTime = 0
      }
      
      // Only call play if not already playing
      if (!wasPlaying) {
        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Audio started playing successfully
              setIsAudioPlaying(true)
              hasStartedPlayingRef.current = true
            })
            .catch((error) => {
              // Ignore AbortError - it's expected when audio is interrupted
              if (error.name !== 'AbortError') {
                console.error('Error playing audio:', error, 'URL:', audioRef.current?.src)
                setIsAudioPlaying(false)
                // Try to get more info about the error
                if (audioRef.current) {
                  console.error('Audio element state:', {
                    readyState: audioRef.current.readyState,
                    networkState: audioRef.current.networkState,
                    error: audioRef.current.error
                  })
                }
              }
            })
        } else {
          // If play() returns undefined (synchronous), assume it's playing
          setIsAudioPlaying(true)
          hasStartedPlayingRef.current = true
        }
      }
      
      // Mark as read if needed (only for messages from others, not your own)
      if ('isRead' in messageToPlay && !messageToPlay.isRead && messageToPlay.senderId !== session?.user?.id) {
        markAsRead(messageToPlay.id)
      }
    }

    // Set up timer update interval
    const updateProgress = () => {
      if (audioRef.current && isPlaying) {
        if (allMessages.length <= 1) {
          // Single message case
          setCurrentTime(audioRef.current.currentTime)
        } else if (allMessages.length > 1) {
          // Multiple messages case
          const current = audioRef.current.currentTime
          let totalElapsed = 0
          for (let i = 0; i < currentMessageIndex; i++) {
            totalElapsed += allMessages[i].duration
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
  }, [isPlaying, pauseAudio, allMessages, currentMessageIndex, conversation.lastMessage, session?.user?.id, markAsRead, loadedMessages])

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
        if (allMessages.length > 0 && currentMessageIndex < allMessages.length) {
          const currentMessage = allMessages[currentMessageIndex]
          if (!currentMessage.isRead && currentMessage.senderId !== session?.user?.id) {
            markAsRead(currentMessage.id)
          }
        } else if (conversation.lastMessage && !localIsRead && conversation.lastMessage.senderId !== session?.user?.id) {
          // Fallback to last message if no messages loaded yet
          markAsRead(conversation.lastMessage.id)
        }
        hasStartedPlayingRef.current = false
      }
      
      setCurrentTime(0)
    }
  }, [isPlaying, allMessages, currentMessageIndex, conversation.lastMessage, localIsRead, session?.user?.id, markAsRead])

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
    if (allMessages.length === 0) return
    
    setCurrentMessageIndex(index)
    
    // Calculate total elapsed time up to this message
    let totalElapsed = 0
    for (let i = 0; i < index; i++) {
      totalElapsed += allMessages[i].duration
    }
    setCurrentTime(totalElapsed)
    
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }

  const handleMessageEnd = () => {
    // Safety check: ensure we have a valid message
    if (allMessages.length === 0 || currentMessageIndex >= allMessages.length) {
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

    const currentMessage = allMessages[currentMessageIndex]
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

    if (currentMessageIndex < allMessages.length - 1) {
      // Mark current message as read if it's received
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
  
  // Determine which message to display (currently playing or last message)
  const displayMessage = isPlaying && allMessages.length > 0 && currentMessageIndex < allMessages.length
    ? allMessages[currentMessageIndex]
    : conversation.lastMessage

  const isMine = displayMessage?.senderId === session?.user?.id
  
  // When playing, update the display state based on current message
  const displayState = isPlaying && displayMessage
    ? (displayMessage.senderId === session?.user?.id ? 'mine' : 
       (!displayMessage.isRead && 'receiverId' in displayMessage && displayMessage.receiverId === session?.user?.id ? 'new' : 'listened'))
    : messageState

  const previewText = displayMessage
    ? isMine 
      ? 'Voice message from you'
      : `Voice message from ${displayMessage.sender.username}`
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
            // Set total duration when audio loads - use actual duration from audio element
            if (audioRef.current && isPlaying) {
              const actualDuration = audioRef.current.duration
              // Use actual duration if available and valid
              if (actualDuration && isFinite(actualDuration) && actualDuration > 0) {
                if (allMessages.length <= 1) {
                  // Single message - update total duration
                  setTotalDuration(actualDuration)
                } else if (allMessages.length > 1 && currentMessageIndex < allMessages.length) {
                  // Multiple messages - recalculate total with actual duration for current message
                  const currentMsg = allMessages[currentMessageIndex]
                  if (currentMsg) {
                    // Update the current message's duration in our calculation
                    let total = 0
                    for (let i = 0; i < allMessages.length; i++) {
                      if (i === currentMessageIndex) {
                        total += actualDuration
                      } else {
                        total += allMessages[i].duration
                      }
                    }
                    setTotalDuration(total)
                  }
                }
              }
            }
          }}
          onError={(e) => {
            console.error('Audio playback error:', e, audioRef.current?.src)
            // If audio fails to load, mark as not playing
            setIsAudioPlaying(false)
          }}
          onCanPlay={() => {
            // Ensure audio can actually play
            if (audioRef.current && isPlaying && !pauseAudio) {
              // Update duration from actual audio element if available
              if (allMessages.length <= 1 && audioRef.current.duration) {
                const actualDuration = audioRef.current.duration
                if (actualDuration && isFinite(actualDuration) && actualDuration > 0) {
                  setTotalDuration(actualDuration)
                }
              }
            }
          }}
          onTimeUpdate={() => {
            // Backup timer update - ensures timer updates even if interval is delayed
            if (audioRef.current && isPlaying) {
              if (allMessages.length <= 1) {
                // Single message case
                setCurrentTime(audioRef.current.currentTime)
              } else if (allMessages.length > 1 && currentMessageIndex < allMessages.length) {
                // Multiple messages case
                const current = audioRef.current.currentTime
                let totalElapsed = 0
                for (let i = 0; i < currentMessageIndex; i++) {
                  totalElapsed += allMessages[i].duration
                }
                totalElapsed += current
                setCurrentTime(totalElapsed)
              }
            }
          }}
        />
      )}
      <div className="user-info">
        <div className={`avatar ${displayState === 'mine' ? 'mine-avatar' : ''}`}>
          {displayState === 'new' && conversation.unreadCount > 0 && !isPlaying && (
            <div className="avatar-badge">{conversation.unreadCount}</div>
          )}
        </div>
        <span className={`username ${displayState === 'mine' ? 'mine-username' : ''}`}>
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
            <div className={`message-preview ${displayState === 'new' ? 'new-preview' : displayState === 'mine' ? 'mine-preview' : ''}`}>
              {previewText}
            </div>
          </div>
          {isPlaying && totalDuration > 0 && (
            <div className="progress-bar-container">
              <div className="progress-bar">
                {(allMessages.length > 0 ? allMessages : conversation.lastMessage ? [conversation.lastMessage] : []).map((msg, index) => {
                  const messagesToShow = allMessages.length > 0 ? allMessages : (conversation.lastMessage ? [conversation.lastMessage] : [])
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
                  const isMine = msg.senderId === session?.user?.id
                  
                  return (
                    <div
                      key={msg.id}
                      className={`progress-segment ${isMine ? 'sent' : 'received'}`}
                      style={{ width: `${segmentWidth}%` }}
                      onClick={(e) => allMessages.length > 0 ? handleProgressBarClick(e, index) : undefined}
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
