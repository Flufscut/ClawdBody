import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo } from '@/lib/openrouter-provisioning'
import { sendCreditExhaustedNotification } from '@/lib/notifications'

const USAGE_CHECK_STALE_MS = 5 * 60 * 1000 // 5 minutes

export interface CreditCheckResult {
  userId: string
  limitRemaining: number | null
  usage: number
  status: 'active' | 'exhausted' | 'low'
  notified: boolean
}

/**
 * Check a single user's credits and optionally process exhaustion (update status + notify).
 */
export async function checkUserCredits(userId: string): Promise<CreditCheckResult | null> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
    include: { user: true },
  })
  if (!llmCredit) return null

  const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
  const limitRemaining = keyInfo.limit_remaining
  const usage = keyInfo.usage ?? 0

  const status =
    limitRemaining === null
      ? 'active'
      : limitRemaining <= 0
        ? 'exhausted'
        : limitRemaining < 2
          ? 'low'
          : 'active'

  const usageCents = Math.round((usage * 100))
  const limitCents = keyInfo.limit != null ? Math.round(keyInfo.limit * 100) : llmCredit.currentLimitCents

  await prisma.llmCredit.update({
    where: { userId },
    data: {
      status,
      lastUsageCheckAt: new Date(),
      lastKnownUsageCents: usageCents,
      currentLimitCents: limitCents,
    },
  })

  let notified = false
  if (status === 'exhausted') {
    notified = await processExhaustedCredits(userId, llmCredit.user.email)
  }

  return {
    userId,
    limitRemaining,
    usage,
    status,
    notified,
  }
}

/**
 * When credits are exhausted: update status and send notification (once per event).
 */
export async function processExhaustedCredits(userId: string, email: string | null): Promise<boolean> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit || llmCredit.status !== 'exhausted') return false

  // Only notify once per exhaustion (e.g. don't spam if cron runs every 15 min)
  const lastNotified = llmCredit.lastNotifiedAt
  const now = new Date()
  if (lastNotified && now.getTime() - lastNotified.getTime() < 24 * 60 * 60 * 1000) {
    return false // Already notified in last 24h
  }

  await sendCreditExhaustedNotification(userId, email ?? undefined)
  await prisma.llmCredit.update({
    where: { userId },
    data: { lastNotifiedAt: now },
  })
  return true
}

/**
 * Cron-style: check all active LlmCredit records and process exhaustion.
 */
export async function checkAllUserCredits(): Promise<CreditCheckResult[]> {
  const credits = await prisma.llmCredit.findMany({
    where: { status: { in: ['active', 'low', 'exhausted'] } },
    include: { user: true },
  })
  const results: CreditCheckResult[] = []
  for (const c of credits) {
    try {
      const r = await checkUserCredits(c.userId)
      if (r) results.push(r)
    } catch (err) {
      console.error(`[credit-monitor] checkUserCredits failed for ${c.userId}:`, err)
    }
  }
  return results
}

/**
 * Get cached credit status if we've checked recently; otherwise returns null (caller should fetch fresh).
 */
export async function getCachedCreditStatus(userId: string): Promise<{
  usageCents: number
  limitCents: number
  limitRemainingCents: number | null
  status: string
  lastUsageCheckAt: Date | null
} | null> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit) return null

  const lastCheck = llmCredit.lastUsageCheckAt
  const stale = !lastCheck || Date.now() - lastCheck.getTime() > USAGE_CHECK_STALE_MS
  if (stale) return null

  const usageCents = llmCredit.lastKnownUsageCents ?? 0
  const limitCents = llmCredit.currentLimitCents
  const limitRemainingCents = Math.max(0, limitCents - usageCents)

  return {
    usageCents,
    limitCents,
    limitRemainingCents,
    status: llmCredit.status,
    lastUsageCheckAt: llmCredit.lastUsageCheckAt,
  }
}
