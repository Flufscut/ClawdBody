import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { 
  getUserPlanContext, 
  getUpsellContext, 
  PLANS,
  detectBucket,
  type BucketId,
} from '@/lib/plans'
import { getCurrentPeriodUsage } from '@/lib/stripe'

/**
 * GET /api/user/plan
 * Returns the current user's plan, bucket, and upsell context
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get plan context
    const planContext = await getUserPlanContext(userId)
    const planDef = PLANS[planContext.plan]

    // Get upsell context for legacy users
    const upsellContext = await getUpsellContext(userId)

    // Get current usage
    let usage = null
    try {
      usage = await getCurrentPeriodUsage(userId)
    } catch (e) {
      // Usage tracking might not be set up yet
    }

    // Get setup state for bucket detection
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
      select: {
        orgoApiKey: true,
        awsAccessKeyId: true,
        awsSecretAccessKey: true,
        e2bApiKey: true,
        llmApiKey: true,
      },
    })

    // Detect current bucket (might differ from stored if user added keys)
    const currentBucket = detectBucket(setupState)

    // Get VM count for limits display
    const vmCount = await prisma.vM.count({
      where: { userId, status: { not: 'error' } },
    })

    // Get user's onboarding status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompletedAt: true },
    })

    return NextResponse.json({
      plan: {
        id: planContext.plan,
        name: planDef.name,
        description: planDef.description,
        priceMonthly: planDef.priceMonthly,
        features: planDef.features,
      },
      isLegacyUser: planContext.isLegacyUser,
      bucket: planContext.bucket,
      currentBucket, // Real-time bucket based on current keys
      earlyAdopterDiscount: planContext.earlyAdopterDiscount,
      subscription: {
        active: !!planContext.stripeSubscriptionId,
        currentPeriodEnd: planContext.stripeCurrentPeriodEnd,
      },
      upsell: upsellContext,
      usage,
      limits: {
        vms: {
          current: vmCount,
          max: planDef.features.maxVMs,
        },
        maxRamGB: planDef.features.maxRamGB,
      },
      keys: {
        hasVMKey: !!(setupState?.orgoApiKey || 
          (setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey) || 
          setupState?.e2bApiKey),
        hasLLMKey: !!setupState?.llmApiKey,
      },
      onboardingCompleted: !!user?.onboardingCompletedAt,
    })
  } catch (error) {
    console.error('Get plan error:', error)
    return NextResponse.json(
      { error: 'Failed to get plan information' },
      { status: 500 }
    )
  }
}
