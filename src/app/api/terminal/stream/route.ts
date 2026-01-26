/**
 * Terminal Stream API
 * 
 * Streams terminal output via Server-Sent Events (SSE).
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { sessionOutputBuffers } from '../connect/route'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 })
  }

  // Verify session belongs to user
  if (!sessionId.startsWith(session.user.id)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Create SSE stream with interval-based polling
  const encoder = new TextEncoder()
  let lastIndex = 0
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isClosed = false

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      )

      // Poll for new output every 50ms
      intervalId = setInterval(() => {
        if (isClosed) {
          if (intervalId) clearInterval(intervalId)
          return
        }

        const buffer = sessionOutputBuffers.get(sessionId)
        
        if (!buffer) {
          // Session ended
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'system', data: 'Session ended\r\n' })}\n\n`)
            )
            controller.close()
          } catch (e) {
            // Controller might already be closed
          }
          isClosed = true
          if (intervalId) clearInterval(intervalId)
          return
        }

        // Send any new outputs
        while (lastIndex < buffer.length) {
          try {
            const output = buffer[lastIndex]
            controller.enqueue(encoder.encode(`data: ${output}\n\n`))
            lastIndex++
          } catch (e) {
            // Controller might be closed
            isClosed = true
            if (intervalId) clearInterval(intervalId)
            return
          }
        }
      }, 50)
    },
    cancel() {
      // Clean up when client disconnects
      isClosed = true
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
