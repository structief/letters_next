import { NextResponse } from 'next/server'
import { getCommits } from '@/lib/git-commits'

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
