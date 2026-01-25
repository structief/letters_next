/**
 * Generates a waveform array from an audio blob using Web Audio API
 * @param audioBlob - The audio blob to analyze
 * @param bars - Number of bars to generate (default: 40)
 * @returns Promise that resolves to an array of amplitude values (0-100)
 */
export async function generateWaveform(
  audioBlob: Blob,
  bars: number = 40
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const fileReader = new FileReader()

    fileReader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        
        // Get raw audio data (mono channel)
        const rawData = audioBuffer.getChannelData(0)
        const blockSize = Math.floor(rawData.length / bars)
        const waveform: number[] = []

        // Calculate RMS (Root Mean Square) for each bar
        for (let i = 0; i < bars; i++) {
          let sum = 0
          const start = i * blockSize
          const end = Math.min(start + blockSize, rawData.length)
          
          // Calculate RMS for this block
          for (let j = start; j < end; j++) {
            sum += rawData[j] * rawData[j]
          }
          
          const rms = Math.sqrt(sum / (end - start))
          
          // Convert to 0-100 scale, with minimum height of 5px
          // RMS values are typically between 0 and 1, so we scale and add minimum
          const amplitude = Math.max(5, Math.min(100, rms * 200))
          waveform.push(amplitude)
        }

        // Normalize to ensure we have a good visual range
        // Find max and min to scale appropriately
        const max = Math.max(...waveform)
        const min = Math.min(...waveform)
        const range = max - min || 1 // Avoid division by zero
        
        // Normalize to 5-35 range (similar to current random generation)
        const normalized = waveform.map(value => {
          const normalizedValue = ((value - min) / range) * 30 + 5
          return Math.round(normalizedValue * 10) / 10 // Round to 1 decimal
        })

        audioContext.close()
        resolve(normalized)
      } catch (error) {
        audioContext.close()
        reject(error)
      }
    }

    fileReader.onerror = () => {
      audioContext.close()
      reject(new Error('Failed to read audio file'))
    }

    fileReader.readAsArrayBuffer(audioBlob)
  })
}
