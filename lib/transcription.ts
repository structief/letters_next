import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm'
// @ts-ignore - @xenova/transformers may not have full TypeScript support
import { pipeline, env } from '@xenova/transformers'

// Disable local model files for browser use
env.allowLocalModels = false

// Initialize transcriber (lazy load)
let transcriberPipeline: any = null
let llmEngine: MLCEngine | null = null

export async function initializeTranscriber() {
  if (transcriberPipeline) {
    return transcriberPipeline
  }

  try {
    // Use tiny English model for faster transcription
    transcriberPipeline = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      {
        quantized: true,
      }
    )
    
    return transcriberPipeline
  } catch (error) {
    console.error('Failed to initialize Whisper transcriber:', error)
    throw error
  }
}

export async function initializeLLM(): Promise<MLCEngine> {
  if (llmEngine) {
    return llmEngine
  }

  try {
    // Use TinyLlama for summarization (small and fast)
    llmEngine = await CreateMLCEngine('TinyLlama-1.1B-Chat-v0.4-q4f16_1', {
      initProgressCallback: (progress) => {
        console.log('LLM loading progress:', progress)
      },
    })

    return llmEngine
  } catch (error) {
    console.error('Failed to initialize LLM:', error)
    throw error
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    const transcriber = await initializeTranscriber()
    
    // Transcribe the audio blob
    const result = await transcriber(audioBlob, {
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    
    // Extract text from result
    const text = result?.text || ''
    return text.trim()
  } catch (error) {
    console.error('Transcription error:', error)
    return ''
  }
}

export async function summarizeText(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return ''
  }

  // If text is already short, return as-is
  if (text.length < 100) {
    return text.trim()
  }

  try {
    const engine = await initializeLLM()
    
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes voice messages concisely in one short sentence.'
      },
      {
        role: 'user',
        content: `Summarize this voice message in one or two short sentences (maximum 15 words in total). Leave out any non-essential details. Use short sentences and leave out any words that are not essential to the summary. Use the original language of the transcription. Keep it concise and capture the main point:\n\n${text}`
      }
    ]
    
    const reply = await engine.chat.completions.create({
      messages: messages as any, // Type assertion needed for WebLLM API compatibility
      temperature: 0.7,
      max_tokens: 50,
    })

    const summary = reply.choices[0]?.message?.content?.trim() || ''
    
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

export async function transcribeAndSummarize(audioBlob: Blob): Promise<string> {
  try {
    // First transcribe
    const fullTranscription = await transcribeAudio(audioBlob)
    
    if (!fullTranscription || fullTranscription.trim().length === 0) {
      return ''
    }

    // Then summarize
    const summary = await summarizeText(fullTranscription)
    
    return summary
  } catch (error) {
    console.error('Transcribe and summarize error:', error)
    return ''
  }
}
