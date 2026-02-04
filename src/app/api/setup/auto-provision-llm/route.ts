import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getManagedLLMKey, canAutoProvisionLLM } from '@/lib/plans'
import { encrypt } from '@/lib/encryption'

/**
 * POST /api/setup/auto-provision-llm
 * Auto-provision ClawdBody's managed Anthropic API key for eligible users (Pro plan)
 * 
 * This stores the managed key in the user's SetupState so it can be used during VM setup
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check eligibility
    const eligibility = await canAutoProvisionLLM(userId)
    if (!eligibility.eligible) {
      return NextResponse.json({
        success: false,
        error: eligibility.reason,
        eligible: false,
      }, { status: 403 })
    }

    // Get the managed key
    const managedKey = await getManagedLLMKey(userId)
    if (!managedKey.apiKey) {
      return NextResponse.json({
        success: false,
        error: managedKey.reason,
        eligible: true,
      }, { status: 503 })
    }

    // Encrypt and store the managed key in user's SetupState
    const encryptedKey = encrypt(managedKey.apiKey)

    await prisma.setupState.upsert({
      where: { userId },
      update: {
        llmApiKey: encryptedKey,
        llmProvider: managedKey.provider,
        llmModel: managedKey.model,
      },
      create: {
        userId,
        llmApiKey: encryptedKey,
        llmProvider: managedKey.provider,
        llmModel: managedKey.model,
        status: 'pending',
      },
    })

    return NextResponse.json({
      success: true,
      provider: managedKey.provider,
      model: managedKey.model,
      message: 'Managed LLM API key provisioned successfully',
      isManaged: true,
    })
  } catch (error) {
    console.error('Auto-provision LLM error:', error)
    return NextResponse.json(
      { error: 'Failed to provision managed LLM key' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/setup/auto-provision-llm
 * Check if user is eligible for auto-provisioning and current status
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check eligibility
    const eligibility = await canAutoProvisionLLM(userId)

    // Check if they already have a key configured
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
      select: { llmApiKey: true, llmProvider: true, llmModel: true },
    })

    const hasExistingKey = !!setupState?.llmApiKey

    return NextResponse.json({
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      hasExistingKey,
      currentProvider: setupState?.llmProvider || null,
      currentModel: setupState?.llmModel || null,
    })
  } catch (error) {
    console.error('Check auto-provision eligibility error:', error)
    return NextResponse.json(
      { error: 'Failed to check eligibility' },
      { status: 500 }
    )
  }
}
