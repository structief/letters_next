import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // This is a simple middleware - auth is handled by getServerSession in layouts
  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*']
}
