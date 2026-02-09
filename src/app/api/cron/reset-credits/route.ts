import { NextRequest, NextResponse } from 'next/server'
import { resetAllMonthlyCredits } from '@/lib/credit-reset'

/**
 * Cron: reset monthly credits for users whose period has ended (daily at midnight UTC).
 * Add to vercel.json: { "path": "/api/cron/reset-credits", "schedule": "0 0 * * *" }
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resetCount = await resetAllMonthlyCredits()
    return NextResponse.json({
      success: true,
      resetCount,
    })
  } catch (error: any) {
    console.error('[cron/reset-credits]', error)
    return NextResponse.json(
      { error: error?.message ?? 'Reset credits failed' },
      { status: 500 }
    )
  }
}
