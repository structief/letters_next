import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { join } from 'path'
import { statSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { parseFile } from 'music-metadata'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/voice_messaging'
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const VOICE_MESSAGES_DIR = join(__dirname, '..', 'public', 'voice-messages')
const KB = 1024

// Plausible byte-rate ranges (bytes per second) for known audio formats
const FORMAT_RANGES = {
  webm: { minBps: 500, maxBps: 50000 },  // Opus 4kbps – 400kbps
  m4a:  { minBps: 2000, maxBps: 100000 }, // AAC 16kbps – 800kbps
  aac:  { minBps: 2000, maxBps: 100000 },
  mp4:  { minBps: 2000, maxBps: 100000 },
}

function isPlausible(durationSeconds, fileSize, ext) {
  if (!durationSeconds || durationSeconds <= 0) return false
  const bps = fileSize / durationSeconds
  const range = FORMAT_RANGES[ext] || FORMAT_RANGES.webm
  return bps >= range.minBps && bps <= range.maxBps
}

function estimateDuration(fileSize, ext) {
  const bps = FORMAT_RANGES[ext]
  // Use the midpoint of the plausible range as the estimate
  const estimateBps = bps ? (bps.minBps + bps.maxBps) / 2 : 1000
  return Math.max(1, Math.round(fileSize / estimateBps))
}

async function getDurationFromFfprobe(filepath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filepath,
    ])
    const seconds = parseFloat(stdout.trim())
    return isNaN(seconds) ? null : seconds
  } catch {
    return null
  }
}

async function getDurationFromMetadata(filepath) {
  try {
    const metadata = await parseFile(filepath)
    const dur = metadata.format.duration
    if (dur && isFinite(dur) && dur > 0) return dur
    return null
  } catch {
    return null
  }
}

async function resolveDuration(filepath, ext) {
  const fileSize = statSync(filepath).size

  // 1. Try ffprobe (most reliable)
  let duration = await getDurationFromFfprobe(filepath)
  if (duration !== null && isPlausible(duration, fileSize, ext)) {
    return { seconds: Math.max(1, Math.round(duration)), source: 'ffprobe' }
  }

  // 2. Try music-metadata (works without external deps)
  duration = await getDurationFromMetadata(filepath)
  if (duration !== null && isPlausible(duration, fileSize, ext)) {
    return { seconds: Math.max(1, Math.round(duration)), source: 'metadata' }
  }

  // 3. Fall back to size estimation
  return { seconds: estimateDuration(fileSize, ext), source: 'estimate' }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const messages = await prisma.message.findMany({
    include: { sender: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Total messages in DB: ${messages.length}\n`)

  let fixed = 0, skipped = 0, missing = 0, correct = 0

  for (const msg of messages) {
    const filename = msg.audioUrl.replace(/^\/voice-messages\//, '')
    const filepath = join(VOICE_MESSAGES_DIR, filename)
    const ext = filename.split('.').pop()?.toLowerCase()

    if (!existsSync(filepath)) {
      console.log(`  MISS ${msg.id.slice(0, 16)}  stored ${msg.duration}s  file not found`)
      missing++
      continue
    }

    const fileSize = statSync(filepath).size
    const { seconds: actual, source } = await resolveDuration(filepath, ext)

    if (actual === msg.duration) {
      console.log(`       ${msg.id.slice(0, 16)}  ${msg.duration.toString().padStart(5)}s  ✓ ${source}`)
      correct++
      continue
    }

    if (dryRun) {
      console.log(`  WOULD-FIX ${msg.id.slice(0, 16)}  ${msg.duration.toString().padStart(5)}s → ${actual.toString().padStart(5)}s  [${source}]  ${(fileSize / KB).toFixed(0)}KB  ${ext}  ${msg.sender.username}`)
      fixed++
      continue
    }

    await prisma.message.update({
      where: { id: msg.id },
      data: { duration: actual },
    })

    const off = msg.duration !== actual ? `${(msg.duration / actual).toFixed(1)}x` : ''
    console.log(`  FIX  ${msg.id.slice(0, 16)}  ${msg.duration.toString().padStart(5)}s → ${actual.toString().padStart(5)}s  ${off ? `(${off} off)` : ''} [${source}]  ${(fileSize / KB).toFixed(0)}KB  ${ext}  ${msg.sender.username}`)
    fixed++
  }

  console.log(`\nDone: ${dryRun ? 'WOULD-FIX' : 'FIXED'} ${fixed}, correct ${correct}, missing ${missing}, skipped ${skipped}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
