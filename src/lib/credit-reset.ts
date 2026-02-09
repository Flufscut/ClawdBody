import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo, updateOpenRouterKeyLimit } from '@/lib/openrouter-provisioning'

const MONTHLY_ALLOWANCE_USD = 15

/**
 * Reset monthly credits for one user: set OpenRouter limit to current usage + $15.
 * Top-up balance carries over (we add usage + 15 + remaining top-up to set the cap).
 */
export async function resetMonthlyCredits(userId: string): Promise<void> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit) return

  const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
  const currentUsageUsd = keyInfo.usage ?? 0
  const topupRemainingUsd = Math.max(0, (llmCredit.topupBalanceCents / 100) - (currentUsageUsd - (llmCredit.currentLimitCents / 100 - llmCredit.topupBalanceCents / 100)))
  // Simpler: new limit = usage + $15 (fresh allowance) + any top-up we're carrying
  // Top-up that was "remaining" is already reflected in (limit - usage). So remaining top-up = limit - usage - 0 (after reset we give 15). Actually the plan says:
  // "New limit = usage + $15.00 (fresh monthly allowance)" and "if you want topup to carry: newLimit = usage + $15 + remainingTopupDollars"
  // So: remaining top-up in dollars = how much of their topupBalance they haven't spent. We don't track "remaining" separately - we track total topupBalanceCents. The "remaining" is effectively (current limit - usage) minus the monthly allowance portion. So remainingTopupUsd = (currentLimit - usage) - 15 if we attribute first $15 to allowance. Or we could just do: newLimit = usage + 15 + (topupBalanceCents/100). That would give them $15 + their entire top-up balance as new cap, which double-counts if they had already used some of that top-up. So the correct formula: current limit = usage + X where X = allowance left + topup left. After reset, allowance left = $15, topup left = we need to compute. topup left = total topup ever added - (usage that came from topup). We don't have "usage that came from topup". Simpler approach: treat topup as carrying over by saying new limit = usage + 15 + (topupBalanceCents/100). But then if they had $10 topup and used $5, we'd set limit = usage + 15 + 10 = usage + 25, so they'd have $25 more from this point - that's $15 + $10, but they already had $5 of that $10 used. So we're giving them 15 + 10 = 25 when they should have 15 + 5 = 20. So we need to track "remaining top-up" or derive it. Easiest: don't carry top-up (plan said "topup balance does NOT carry over" as one option). If we do carry: we need remainingTopupUsd. One way: remainingTopupUsd = max(0, (limit - usage)) - 15? No. Actually (limit - usage) = limit_remaining. So limit_remaining = allowance_remaining + topup_remaining. We don't split. So if we want top-up to carry: set newLimit = usage + 15 + limit_remaining (that would give them 15 + whatever was left). So newLimitUsd = currentUsageUsd + 15 + (keyInfo.limit_remaining ?? 0). That way we give $15 fresh + whatever was left. Let me use that.
  */
  const limitRemainingUsd = keyInfo.limit_remaining ?? 0
  const newLimitUsd = currentUsageUsd + MONTHLY_ALLOWANCE_USD + Math.max(0, limitRemainingUsd)

  await updateOpenRouterKeyLimit(llmCredit.openRouterKeyHash, newLimitUsd)

  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

  await prisma.llmCredit.update({
    where: { userId },
    data: {
      currentLimitCents: Math.round(newLimitUsd * 100),
      periodStart,
      periodEnd,
      status: 'active',
      lastUsageCheckAt: new Date(),
    },
  })

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'monthly_reset',
      amountCents: MONTHLY_ALLOWANCE_USD * 100,
      description: 'Monthly $15 allowance reset',
    },
  })
}

/**
 * Reset all users whose periodEnd has passed.
 */
export async function resetAllMonthlyCredits(): Promise<number> {
  const now = new Date()
  const due = await prisma.llmCredit.findMany({
    where: { periodEnd: { lte: now } },
  })
  for (const c of due) {
    try {
      await resetMonthlyCredits(c.userId)
    } catch (err) {
      console.error(`[credit-reset] resetMonthlyCredits failed for ${c.userId}:`, err)
    }
  }
  return due.length
}
