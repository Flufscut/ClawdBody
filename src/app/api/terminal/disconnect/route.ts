/**
 * Terminal Disconnect API
 * 
 * Closes an active terminal session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getSessionManager } from '@/lib/terminal'
import { sessionOutputBuffers } from '../connect/route'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      )
    }

    // Verify session belongs to user
    if (!sessionId.startsWith(session.user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionManager = getSessionManager()
    await sessionManager.closeSession(sessionId)

    // Clean up output buffer
    sessionOutputBuffers.delete(sessionId)

    return NextResponse.json({
      success: true,
      message: 'Terminal session closed',
    })

  } catch (error) {
    console.error('Terminal disconnect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect terminal' },
      { status: 500 }
    )
  }
}
