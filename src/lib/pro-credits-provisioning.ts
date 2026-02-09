import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { createOpenRouterKey } from '@/lib/openrouter-provisioning'

const MONTHLY_ALLOWANCE_USD = 15
const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4'

/**
 * When a user becomes Pro, ensure they have an LlmCredit record and an OpenRouter provisioned key.
 * Idempotent: if LlmCredit already exists, ensures SetupState is using OpenRouter (repairs if it was overwritten).
 * If OPENROUTER_PROVISIONING_KEY is not set, skips silently.
 */
export async function ensureLlmCreditForProUser(userId: string): Promise<boolean> {
  if (!process.env.OPENROUTER_PROVISIONING_KEY) {
    console.warn('[pro-credits] OPENROUTER_PROVISIONING_KEY not set; skipping LlmCredit provisioning')
    return false
  }

  const existingCredit = await prisma.llmCredit.findUnique({ where: { userId } })
  const setupState = await prisma.setupState.findUnique({ where: { userId } })

  // User already has LlmCredit and SetupState is correctly OpenRouter – nothing to do
  if (existingCredit && setupState?.llmProvider === 'openrouter' && setupState?.isManagedLlmApiKey) {
    return true
  }

  // Repair: user has LlmCredit but SetupState missing or overwritten (e.g. anthropic from old deploy)
  if (existingCredit && (!setupState || setupState.llmProvider !== 'openrouter' || !setupState.isManagedLlmApiKey)) {
    try {
      const result = await createOpenRouterKey({
        name: `Pro ${userId} (repair)`,
        limitUsd: MONTHLY_ALLOWANCE_USD,
        limitReset: 'monthly',
      })
      const keySecret = result.key
      if (!keySecret || !result.hash) {
        console.error('[pro-credits] Repair: OpenRouter key created but no key/hash')
        return false
      }
      await prisma.llmCredit.update({
        where: { userId },
        data: { openRouterKeyHash: result.hash },
      })
      await prisma.setupState.upsert({
        where: { userId },
        create: {
          userId,
          status: 'pending',
          llmApiKey: encrypt(keySecret),
          llmProvider: 'openrouter',
          llmModel: DEFAULT_OPENROUTER_MODEL,
          isManagedLlmApiKey: true,
        },
        update: {
          llmApiKey: encrypt(keySecret),
          llmProvider: 'openrouter',
          llmModel: DEFAULT_OPENROUTER_MODEL,
          isManagedLlmApiKey: true,
        },
      })
      console.log(`[pro-credits] Repaired OpenRouter key for user ${userId}`)
      return true
    } catch (err) {
      console.error('[pro-credits] Repair failed for', userId, err)
      return false
    }
  }

  // No LlmCredit – create key and LlmCredit
  try {
    const result = await createOpenRouterKey({
      name: `Pro ${userId}`,
      limitUsd: MONTHLY_ALLOWANCE_USD,
      limitReset: 'monthly',
    })

    const keySecret = result.key
    if (!keySecret || !result.hash) {
      console.error('[pro-credits] OpenRouter key created but no key/hash in response')
      return false
    }

    const periodStart = new Date()
    const periodEnd = new Date(periodStart)
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

    await prisma.llmCredit.create({
      data: {
        userId,
        openRouterKeyHash: result.hash,
        status: 'active',
        currentLimitCents: MONTHLY_ALLOWANCE_USD * 100,
        topupBalanceCents: 0,
        monthlyAllowanceCents: MONTHLY_ALLOWANCE_USD * 100,
        periodStart,
        periodEnd,
      },
    })

    await prisma.setupState.upsert({
      where: { userId },
      create: {
        userId,
        status: 'pending',
        llmApiKey: encrypt(keySecret),
        llmProvider: 'openrouter',
        llmModel: DEFAULT_OPENROUTER_MODEL,
        isManagedLlmApiKey: true,
      },
      update: {
        llmApiKey: encrypt(keySecret),
        llmProvider: 'openrouter',
        llmModel: DEFAULT_OPENROUTER_MODEL,
        isManagedLlmApiKey: true,
      },
    })

    await prisma.creditTransaction.create({
      data: {
        userId,
        type: 'monthly_allowance',
        amountCents: MONTHLY_ALLOWANCE_USD * 100,
        description: 'Initial $15 monthly allowance',
      },
    })

    console.log(`[pro-credits] Provisioned OpenRouter key and LlmCredit for user ${userId}`)
    return true
  } catch (err) {
    console.error('[pro-credits] Failed to provision LlmCredit for', userId, err)
    return false
  }
}
