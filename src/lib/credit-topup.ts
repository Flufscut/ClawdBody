import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo, updateOpenRouterKeyLimit } from '@/lib/openrouter-provisioning'

const MONTHLY_ALLOWANCE_USD = 15

/**
 * Apply a top-up to a user's OpenRouter key.
 * OpenRouter's limit is a cumulative spending cap. We add the top-up to the current limit
 * so the user gets amountCents/100 more to spend (on top of any existing remaining).
 * Formula: newLimitUsd = currentLimitUsd + (amountCents / 100)
 */
export async function applyTopUp(
  userId: string,
  amountCents: number,
  stripeSessionId?: string
): Promise<void> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit) {
    throw new Error(`No LlmCredit record for user ${userId}`)
  }

  const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
  const currentLimitUsd = keyInfo.limit ?? 0
  const topupUsd = amountCents / 100
  const newLimitUsd = currentLimitUsd + topupUsd

  await updateOpenRouterKeyLimit(llmCredit.openRouterKeyHash, newLimitUsd)

  const newLimitCents = Math.round(newLimitUsd * 100)
  const newTopupBalanceCents = llmCredit.topupBalanceCents + amountCents

  await prisma.llmCredit.update({
    where: { userId },
    data: {
      currentLimitCents: newLimitCents,
      topupBalanceCents: newTopupBalanceCents,
      status: 'active',
      lastUsageCheckAt: new Date(),
    },
  })

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'topup',
      amountCents,
      description: `Top-up $${(amountCents / 100).toFixed(2)}`,
      stripeSessionId: stripeSessionId ?? undefined,
    },
  })
}
