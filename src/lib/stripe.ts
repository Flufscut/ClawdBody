/**
 * Stripe integration for ClawdBody billing
 * 
 * Handles:
 * - Checkout session creation for upgrades
 * - Customer portal for subscription management
 * - Webhook event processing
 * - Usage-based billing reporting
 */

import Stripe from 'stripe'
import { prisma } from './prisma'
import { PlanId, PLANS, EARLY_ADOPTER_DISCOUNTS, getManagedLLMKey, getManagedVMCredentials } from './plans'
import { encrypt } from './encryption'

// ============================================================================
// Stripe Client
// ============================================================================

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set - billing features will be disabled')
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
    })
  : null

// ============================================================================
// Price IDs (from environment)
// ============================================================================

export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRO_PRICE_ID || '',
  usage: process.env.STRIPE_USAGE_PRICE_ID || '', // Metered usage
}

// ============================================================================
// Customer Management
// ============================================================================

/**
 * Get or create Stripe customer for a user
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeCustomerId: true,
      email: true,
      name: true,
    },
  })

  if (!user) throw new Error('User not found')

  // Return existing customer ID
  if (user.stripeCustomerId) {
    return user.stripeCustomerId
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    metadata: {
      userId,
    },
  })

  // Save customer ID
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

// ============================================================================
// Checkout Sessions
// ============================================================================

export interface CreateCheckoutOptions {
  userId: string
  plan: 'pro'
  successUrl: string
  cancelUrl: string
  applyEarlyAdopterDiscount?: boolean
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
  options: CreateCheckoutOptions
): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error('Stripe not configured')

  const { userId, plan, successUrl, cancelUrl, applyEarlyAdopterDiscount } = options

  const customerId = await getOrCreateStripeCustomer(userId)
  const priceId = STRIPE_PRICES.pro

  if (!priceId) {
    throw new Error(`Price ID not configured for ${plan} plan`)
  }

  // Check if user is legacy and should get early adopter discount
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isLegacyUser: true },
  })

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price: priceId,
      quantity: 1,
    },
  ]

  // Add metered usage price if configured
  if (STRIPE_PRICES.usage) {
    lineItems.push({
      price: STRIPE_PRICES.usage,
    })
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      plan,
    },
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
  }

  // Apply early adopter discount for legacy users
  if (applyEarlyAdopterDiscount && user?.isLegacyUser) {
    // You'll need to create a coupon in Stripe Dashboard for this
    // Coupon code: EARLY_ADOPTER_50 (50% off forever)
    const couponId = process.env.STRIPE_EARLY_ADOPTER_COUPON_ID
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }]
    }
  }

  return stripe.checkout.sessions.create(sessionParams)
}

// ============================================================================
// Customer Portal
// ============================================================================

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  if (!stripe) throw new Error('Stripe not configured')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  })

  if (!user?.stripeCustomerId) {
    throw new Error('User has no Stripe customer ID')
  }

  return stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  })
}

// ============================================================================
// Subscription Management
// ============================================================================

/**
 * Handle successful checkout - update user's plan
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.metadata?.userId
  const plan = session.metadata?.plan as 'starter' | 'pro'

  if (!userId || !plan) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  const subscription = await stripe!.subscriptions.retrieve(
    session.subscription as string
  )

  // Get the user to check if they're legacy
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isLegacyUser: true },
  })

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      // Set early adopter discount if legacy user
      earlyAdopterDiscount: user?.isLegacyUser
        ? EARLY_ADOPTER_DISCOUNTS.upgrade
        : null,
      earlyAdopterExpiresAt: null, // Lifetime discount
      // Mark onboarding as complete since they paid
      onboardingCompletedAt: new Date(),
    },
  })

  console.log(`User ${userId} upgraded to ${plan} plan`)

  // Auto-provision managed LLM and VM keys for Pro users
  if (plan === 'pro') {
    // Auto-provision LLM key
    try {
      const managedKey = await getManagedLLMKey(userId)
      if (managedKey.apiKey) {
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
        console.log(`Auto-provisioned managed LLM key for Pro user ${userId}`)
      }
    } catch (error) {
      console.error('Failed to auto-provision LLM key:', error)
      // Don't fail the webhook - user can manually provision later
    }

    // Auto-provision VM credentials
    try {
      const managedVM = await getManagedVMCredentials(userId)
      if (managedVM.config) {
        const updateData: Record<string, string> = {
          vmProvider: managedVM.config.provider,
        }

        if (managedVM.config.provider === 'orgo' && managedVM.config.orgoApiKey) {
          updateData.orgoApiKey = encrypt(managedVM.config.orgoApiKey)
        } else if (managedVM.config.provider === 'e2b' && managedVM.config.e2bApiKey) {
          updateData.e2bApiKey = encrypt(managedVM.config.e2bApiKey)
        } else if (managedVM.config.provider === 'aws') {
          if (managedVM.config.awsAccessKeyId) {
            updateData.awsAccessKeyId = encrypt(managedVM.config.awsAccessKeyId)
          }
          if (managedVM.config.awsSecretAccessKey) {
            updateData.awsSecretAccessKey = encrypt(managedVM.config.awsSecretAccessKey)
          }
          if (managedVM.config.awsRegion) {
            updateData.awsRegion = managedVM.config.awsRegion
          }
        }

        await prisma.setupState.upsert({
          where: { userId },
          update: updateData,
          create: {
            userId,
            ...updateData,
            status: 'pending',
          },
        })
        console.log(`Auto-provisioned managed VM credentials (${managedVM.config.provider}) for Pro user ${userId}`)
      }
    } catch (error) {
      console.error('Failed to auto-provision VM credentials:', error)
      // Don't fail the webhook - user can manually provision later
    }
  }
}

/**
 * Handle subscription updated
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata?.userId

  if (!userId) {
    // Try to find user by customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: subscription.customer as string },
    })
    if (!user) {
      console.error('Could not find user for subscription:', subscription.id)
      return
    }
  }

  const userIdToUpdate = userId || (
    await prisma.user.findFirst({
      where: { stripeCustomerId: subscription.customer as string },
      select: { id: true },
    })
  )?.id

  if (!userIdToUpdate) return

  // Safely handle the period end date
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : undefined

  await prisma.user.update({
    where: { id: userIdToUpdate },
    data: {
      ...(periodEnd && { stripeCurrentPeriodEnd: periodEnd }),
      stripePriceId: subscription.items.data[0]?.price.id,
    },
  })
}

/**
 * Handle subscription deleted/canceled
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  })

  if (!user) {
    console.error('Could not find user for deleted subscription:', subscription.id)
    return
  }

  // Downgrade to legacy_free if they were legacy, otherwise free
  const newPlan = user.isLegacyUser ? 'legacy_free' : 'free'

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: newPlan,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
    },
  })

  console.log(`User ${user.id} subscription canceled, downgraded to ${newPlan}`)
}

// ============================================================================
// Usage Reporting
// ============================================================================

/**
 * Report usage to Stripe for metered billing
 */
export async function reportUsage(
  userId: string,
  quantity: number,
  type: 'llm_tokens' | 'vm_minutes'
): Promise<void> {
  if (!stripe) return

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true },
  })

  if (!user?.stripeSubscriptionId) {
    // User is not on a paid plan, usage is tracked but not billed to Stripe
    // (might be legacy user with pay-per-use)
    return
  }

  // Get the metered subscription item
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
  const meteredItem = subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === 'metered'
  )

  if (!meteredItem) {
    console.warn('No metered subscription item found for user:', userId)
    return
  }

  // Report usage to Stripe
  await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
    quantity,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment',
  })
}

/**
 * Record usage in our database (for all users, including pay-per-use)
 */
export async function recordUsage(options: {
  userId: string
  type: 'llm_tokens' | 'vm_hours'
  quantity: number
  provider?: string
  model?: string
  costCents: number
  priceCents: number
}): Promise<void> {
  const { userId, type, quantity, provider, model, costCents, priceCents } = options

  await prisma.usageRecord.create({
    data: {
      userId,
      type,
      quantity,
      provider,
      model,
      costCents,
      priceCents,
    },
  })

  // Also report to Stripe if user has active subscription
  if (type === 'llm_tokens') {
    // Convert to thousands of tokens for Stripe metering
    const units = Math.ceil(quantity / 1000)
    await reportUsage(userId, units, 'llm_tokens')
  }
}

// ============================================================================
// Usage Queries
// ============================================================================

/**
 * Get user's usage for current billing period
 */
export async function getCurrentPeriodUsage(userId: string): Promise<{
  llmTokens: number
  llmCostCents: number
  llmPriceCents: number
  vmMinutes: number
  vmCostCents: number
  vmPriceCents: number
  totalPriceCents: number
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCurrentPeriodEnd: true },
  })

  // Default to current month if no subscription period
  const periodStart = user?.stripeCurrentPeriodEnd
    ? new Date(user.stripeCurrentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const usage = await prisma.usageRecord.groupBy({
    by: ['type'],
    where: {
      userId,
      createdAt: { gte: periodStart },
    },
    _sum: {
      quantity: true,
      costCents: true,
      priceCents: true,
    },
  })

  const llmUsage = usage.find((u) => u.type === 'llm_tokens')
  const vmUsage = usage.find((u) => u.type === 'vm_hours')

  const llmPriceCents = llmUsage?._sum.priceCents || 0
  const vmPriceCents = vmUsage?._sum.priceCents || 0

  return {
    llmTokens: llmUsage?._sum.quantity || 0,
    llmCostCents: llmUsage?._sum.costCents || 0,
    llmPriceCents,
    vmMinutes: vmUsage?._sum.quantity || 0,
    vmCostCents: vmUsage?._sum.costCents || 0,
    vmPriceCents,
    totalPriceCents: llmPriceCents + vmPriceCents,
  }
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!stripe) throw new Error('Stripe not configured')

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured')
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}
