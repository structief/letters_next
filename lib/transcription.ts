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

export type TranscriptionSummaries = {
  shortSummary: string
  longSummary: string
}

/**
 * Summarize transcription into a short (list) and long (playback) summary using OpenAI Chat API.
 * @param text - Full transcription text
 * @returns shortSummary for friends list (max ~10 words), longSummary for reading while playing (2-4 sentences)
 */
export async function summarizeTranscription(text: string): Promise<TranscriptionSummaries> {
  if (!text || text.trim().length === 0) {
    return { shortSummary: '', longSummary: '' }
  }

  const trimmed = text.trim()
  if (trimmed.length < 100) {
    return { shortSummary: trimmed, longSummary: trimmed }
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured')
    return { shortSummary: trimmed, longSummary: trimmed }
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: `You summarize voice message transcriptions. Reply with valid JSON only, no other text, in this exact shape:
{"short":"...","long":"..."}

Rules:
- short: One short phrase or sentence, maximum 10 words total. For the friends list preview. Use the original language. First person. Essential words only.
- long: A cleaned up version of the entire transcript. Correct typos, words that seem out of place and punctuation. It's for reading while the message plays, so stay as close to the original transcript as possible. Use the original language. First person. Include main points and context.
- Use the same language as the transcription.`
        },
        {
          role: 'user',
          content: `Transcription:\n\n${trimmed}`
        }
      ],
      max_completion_tokens: 400,
    })

    const raw = response.choices[0]?.message?.content?.trim() || ''
    const parsed = raw.replace(/^```json?\s*|\s*```$/g, '').trim()
    const obj = JSON.parse(parsed) as { short?: string; long?: string }
    const shortSummary = typeof obj.short === 'string' && obj.short.length > 0
      ? obj.short.trim().slice(0, 150)
      : trimmed.slice(0, 150)
    const longSummary = typeof obj.long === 'string' && obj.long.length > 0
      ? obj.long.trim().slice(0, 800)
      : trimmed.slice(0, 800)

    return { shortSummary, longSummary }
  } catch (error) {
    console.error('Summarization error:', error)
    const fallback = trimmed.slice(0, 150)
    return { shortSummary: fallback, longSummary: trimmed.slice(0, 800) }
  }
}

/**
 * Short summary only (for backward compatibility).
 * @deprecated Prefer summarizeTranscription when both short and long are needed.
 */
export async function summarizeText(text: string): Promise<string> {
  const { shortSummary } = await summarizeTranscription(text)
  return shortSummary
}
