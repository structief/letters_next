import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Get the filename from the path array
    const filename = params.path.join('/')
    
    // Security: prevent path traversal
    if (filename.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Construct file path - files are stored in public/voice-messages/
    const filepath = join(process.cwd(), 'public', 'voice-messages', filename)

    // Check if file exists
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Read and return file
    const fileBuffer = await readFile(filepath)
    
    // Determine content type based on extension
    const extension = filename.split('.').pop()?.toLowerCase()
    const contentType = extension === 'webm' 
      ? 'audio/webm' 
      : extension === 'm4a' || extension === 'mp4'
      ? 'audio/mp4'
      : 'audio/webm'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error serving voice message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
