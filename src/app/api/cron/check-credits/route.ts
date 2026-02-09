import { NextRequest, NextResponse } from 'next/server'
import { checkAllUserCredits } from '@/lib/credit-monitor'

/**
 * Cron: check all Pro users' OpenRouter credit usage every 15 minutes.
 * Marks exhausted and sends notification (once per event).
 * Add to vercel.json: { "path": "/api/cron/check-credits", "schedule": "*/15 * * * *" }
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await checkAllUserCredits()
    return NextResponse.json({
      success: true,
      checked: results.length,
      exhausted: results.filter((r) => r.status === 'exhausted').length,
      notified: results.filter((r) => r.notified).length,
    })
  } catch (error: any) {
    console.error('[cron/check-credits]', error)
    return NextResponse.json(
      { error: error?.message ?? 'Check credits failed' },
      { status: 500 }
    )
  }
}
