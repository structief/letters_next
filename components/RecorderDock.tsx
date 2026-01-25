'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { generateWaveform } from '@/lib/waveform'
import { transcribeAndSummarize } from '@/lib/transcription'

interface RecorderDockProps {
  isActive: boolean
  conversationId: string | null | undefined
  receiverId: string | null | undefined
  onSent: () => void
  onRecordingStart?: () => void
}

export default function RecorderDock({
  isActive,
  conversationId,
  receiverId,
  onSent,
  onRecordingStart,
}: RecorderDockProps) {
  const { data: session } = useSession()
  const [isRecording, setIsRecording] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recordingStartTimeRef = useRef<number | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const startRecording = async () => {
    if (!receiverId || isRecording) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Try to use the best available mime type
      let mimeType = 'audio/webm'
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blobType = mediaRecorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType })
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        
        // Transcribe and send message
        await uploadAndSendMessage(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingDuration(0)
      recordingStartTimeRef.current = Date.now()

      // Notify parent that recording has started (to stop playback)
      onRecordingStart?.()

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
          setRecordingDuration(elapsed)
        }
      }, 100) // Update every 100ms for smooth display

      if (navigator.vibrate) {
        navigator.vibrate(10)
      }
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Failed to access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      recordingStartTimeRef.current = null
      setRecordingDuration(0)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Remove the onstop handler to prevent sending the message
      mediaRecorderRef.current.onstop = null
      
      // Stop the recorder
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      
      setIsRecording(false)
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      recordingStartTimeRef.current = null
      setRecordingDuration(0)
      
      // Stop all tracks and clean up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      // Clear audio chunks
      audioChunksRef.current = []
      mediaRecorderRef.current = null
    }
  }

  const handleToggleRecording = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent event from bubbling to feed click handler
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const uploadAndSendMessage = async (audioBlob: Blob) => {
    if (!receiverId) return

    try {
      // Upload audio file
      const formData = new FormData()
      const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
      formData.append('file', audioBlob, `recording.${extension}`)

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Upload failed')
      }

      const { audioUrl } = await uploadResponse.json()

      // Get audio duration and generate waveform in parallel
      const [duration, waveform] = await Promise.all([
        // Get audio duration from the blob directly (more reliable than loading from URL)
        new Promise<number>((resolve) => {
          const audio = new Audio()
          const blobUrl = URL.createObjectURL(audioBlob)
          audio.src = blobUrl
          
          const cleanup = () => {
            URL.revokeObjectURL(blobUrl)
            audio.removeEventListener('loadedmetadata', handleLoaded)
            audio.removeEventListener('error', handleError)
          }
          
          const handleLoaded = () => {
            const durationValue = Math.floor(audio.duration)
            cleanup()
            resolve(durationValue > 0 ? durationValue : 1) // Minimum 1 second
          }
          
          const handleError = () => {
            cleanup()
            // Fallback: estimate duration from blob size (rough approximation)
            // WebM/Opus is roughly 1KB per second at 32kbps
            const estimatedDuration = Math.max(1, Math.floor(audioBlob.size / 1000))
            resolve(estimatedDuration)
          }
          
          audio.addEventListener('loadedmetadata', handleLoaded)
          audio.addEventListener('error', handleError)
          
          // Start loading
          audio.load()
          
          // Timeout after 5 seconds
          setTimeout(() => {
            if (audio.readyState < 2) { // HAVE_CURRENT_DATA
              cleanup()
              const estimatedDuration = Math.max(1, Math.floor(audioBlob.size / 1000))
              resolve(estimatedDuration)
            }
          }, 5000)
        }),
        // Generate waveform from audio blob
        generateWaveform(audioBlob, 40).catch((error) => {
          console.error('Error generating waveform:', error)
          // Fallback to empty array if waveform generation fails
          return []
        })
      ])

      // Transcribe and summarize audio
      setIsTranscribing(true)
      let summary = ''
      try {
        summary = await transcribeAndSummarize(audioBlob)
      } catch (error) {
        console.error('Error transcribing audio:', error)
        // Continue without transcription if it fails
      } finally {
        setIsTranscribing(false)
      }

      // Create message
      const messageResponse = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioUrl,
          duration,
          waveform: waveform.length > 0 ? waveform : undefined,
          transcription: summary || undefined,
          conversationId,
          receiverId,
        }),
      })

      if (!messageResponse.ok) {
        throw new Error('Failed to send message')
      }

      setShowSuccess(true)
      setTimeout(() => {
        setShowSuccess(false)
        onSent()
      }, 2000)
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message. Please try again.')
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Cancel recording when component becomes inactive (user clicked away)
  useEffect(() => {
    if (!isActive && isRecording) {
      // Remove the onstop handler to prevent sending the message
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null
        
        // Stop the recorder
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
        mediaRecorderRef.current = null
      }
      
      setIsRecording(false)
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      recordingStartTimeRef.current = null
      setRecordingDuration(0)
      
      // Stop all tracks and clean up
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      // Clear audio chunks
      audioChunksRef.current = []
    }
  }, [isActive, isRecording])

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [])

  if (!isActive) {
    return null
  }

  return (
    <section 
      className={`recorder-dock friends-recorder-dock ${isActive ? 'active' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`record-trigger ${isRecording ? 'recording' : ''}`}
        onClick={handleToggleRecording}
      >
        <div className="record-icon"></div>
      </div>
      <div className="instruction">
        {isTranscribing 
          ? 'Transcribing...' 
          : isRecording 
          ? formatDuration(recordingDuration) 
          : 'Tap to record'}
      </div>
      {showSuccess && (
        <div className="record-success-message">SENT</div>
      )}
    </section>
  )
}
