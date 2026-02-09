import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo } from '@/lib/openrouter-provisioning'

/**
 * GET /api/credits/status
 * Returns current credit status from OpenRouter API (no cache).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit) {
    return NextResponse.json({
      error: 'No credit account',
      usageCents: 0,
      limitCents: 0,
      limitRemainingCents: null,
      monthlyAllowanceCents: 1500,
      topupBalanceCents: 0,
      status: null,
      periodEnd: null,
      periodStart: null,
    })
  }

  try {
    const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
    const usageUsd = keyInfo.usage ?? 0
    const limitUsd = keyInfo.limit
    const limitRemainingUsd = keyInfo.limit_remaining

    const usageCents = Math.round(usageUsd * 100)
    const limitCents = limitUsd != null ? Math.round(limitUsd * 100) : llmCredit.currentLimitCents
    const limitRemainingCents =
      limitRemainingUsd != null ? Math.round(limitRemainingUsd * 100) : null

    const status =
      limitRemainingUsd === null
        ? 'active'
        : limitRemainingUsd <= 0
          ? 'exhausted'
          : limitRemainingUsd < 2
            ? 'low'
            : 'active'

    return NextResponse.json({
      usageCents,
      limitCents,
      limitRemainingCents,
      monthlyAllowanceCents: llmCredit.monthlyAllowanceCents,
      topupBalanceCents: llmCredit.topupBalanceCents,
      status,
      periodEnd: llmCredit.periodEnd.toISOString(),
      periodStart: llmCredit.periodStart.toISOString(),
    })
  } catch (err) {
    console.error('[credits/status] getOpenRouterKeyInfo failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch credit balance from OpenRouter' },
      { status: 502 }
    )
  }
}
