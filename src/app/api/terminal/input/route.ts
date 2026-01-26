/**
 * Terminal Input API
 * 
 * Sends input to an active terminal session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getSessionManager } from '@/lib/terminal'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId, input } = await request.json()

    if (!sessionId || input === undefined) {
      return NextResponse.json(
        { error: 'Missing sessionId or input' },
        { status: 400 }
      )
    }

    // Verify session belongs to user
    if (!sessionId.startsWith(session.user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionManager = getSessionManager()
    const provider = sessionManager.getSession(sessionId)

    if (!provider) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      )
    }

    // Send input to the terminal
    await provider.sendInput?.(input)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Terminal input error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send input' },
      { status: 500 }
    )
  }
}
