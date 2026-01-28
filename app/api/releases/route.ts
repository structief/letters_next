import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'

export interface Commit {
  hash: string
  date: string
  message: string
  author: string
}

export function getCommits(): Commit[] {
  try {
    // Ensure we're in the project root directory
    const projectRoot = process.cwd()
    
    // Use execFileSync with explicit arguments array to prevent shell injection
    // All arguments are hardcoded literals - no user input
    const gitArgs = [
      'log',
      '--pretty=format:%H%x09%ai%x09%s%x09%an',
      '--date=iso',
      '-50'
    ]
    
    // execFileSync bypasses shell interpretation, preventing injection
    const gitLog = execFileSync(
      'git',
      gitArgs,
      { 
        encoding: 'utf-8',
        cwd: projectRoot,
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 5000, // 5 second timeout
      }
    )

    return gitLog
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t')
        if (parts.length < 4) return null
        const [hash, date, message, author] = parts
        return {
          hash: hash.substring(0, 7),
          date: new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          message,
          author,
        }
      })
      .filter((commit): commit is Commit => commit !== null)
  } catch (error) {
    console.error('Error fetching git commits:', error)
    return []
  }
}

export async function GET() {
  try {
    const commits = getCommits()
    
    // Cache for 5 minutes
    return NextResponse.json(commits, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('Error in releases API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500 }
    )
  }
}
