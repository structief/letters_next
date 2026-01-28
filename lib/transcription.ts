import OpenAI from 'openai'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Transcribe audio file using OpenAI Whisper API
 * @param audioUrl - URL path to audio file (e.g., "/voice-messages/filename.webm")
 * @returns Transcribed text or empty string on error
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured')
    return ''
  }

  try {
    // Extract filename from URL path
    const filename = audioUrl.replace(/^\/voice-messages\//, '')
    
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      console.error('Invalid audio path:', audioUrl)
      return ''
    }

    // Construct file path
    const filepath = join(process.cwd(), 'public', 'voice-messages', filename)

    // Check if file exists
    if (!existsSync(filepath)) {
      console.error('Audio file not found:', filepath)
      return ''
    }

    // Read file as buffer
    const fileBuffer = await readFile(filepath)
    
    // Determine MIME type
    const mimeType = filename.endsWith('.webm') ? 'audio/webm' : 
                     filename.endsWith('.m4a') || filename.endsWith('.mp4') ? 'audio/mp4' :
                     'audio/webm'
    
    // Create a File object for OpenAI API
    // OpenAI SDK v4+ supports File objects in Node.js 18+
    // File is available globally in Node.js 18+
    const file = new File([fileBuffer], filename, { type: mimeType })

    // Transcribe using Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: undefined, // Auto-detect language
    })

    return transcription.text.trim()
  } catch (error) {
    console.error('Transcription error:', error)
    return ''
  }
}

/**
 * Summarize text using OpenAI Chat API
 * @param text - Text to summarize
 * @returns Summarized text or original text on error
 */
export async function summarizeText(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return ''
  }

  // If text is already short, return as-is
  if (text.length < 100) {
    return text.trim()
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured')
    return text.trim()
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano', // Cost-effective model
      messages: [
        {
          role: 'system',
          content: 'Summarize this voice message in one or two short sentences (maximum 10 words in total). Use short phrases and leave out any words that are not essential to the summary. Use the original language of the transcription. Keep it concise and capture the main point. Write in first person.'
        },
        {
          role: 'user',
          content: `Transcription:\n\n${text}`
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 500,
    })

    const summary = response.choices[0]?.message?.content?.trim() || ''
    
    // Fallback to original if summary is too long or empty
    if (summary.length > 150 || summary.length === 0) {
      return text.trim()
    }

    return summary
  } catch (error) {
    console.error('Summarization error:', error)
    // Fallback to original text if summarization fails
    return text.trim()
  }
}
