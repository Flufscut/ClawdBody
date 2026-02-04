/**
 * Plan definitions, bucket detection, and feature gating for ClawdBody monetization
 * 
 * Plans:
 * - legacy_free: Grandfathered users (pre-payment launch), forever free with BYOK
 * - free: New users on free tier - BYOK, limited features
 * - pro: $29.99/mo + usage - managed keys, unlimited VMs, create templates
 * 
 * Buckets (for legacy users):
 * - A: Has both VM and LLM keys (full BYOK)
 * - B: Has VM keys only (BYOK VMs, managed LLM)
 * - C: Has LLM keys only (managed VMs, BYOK LLM)
 * - D: Has neither (treat like new user with legacy benefits)
 */

import { prisma } from './prisma'

// ============================================================================
// Plan Definitions
// ============================================================================

export type PlanId = 'legacy_free' | 'free' | 'pro'
export type BucketId = 'A' | 'B' | 'C' | 'D'

export interface PlanDefinition {
  id: PlanId
  name: string
  description: string
  priceMonthly: number // in cents, 0 for free
  features: {
    maxVMs: number | 'unlimited'
    maxRamGB: number
    managedLLM: boolean
    managedVM: boolean
    createTemplates: boolean
    sellTemplates: boolean
    prioritySupport: boolean
  }
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  legacy_free: {
    id: 'legacy_free',
    name: 'Legacy Free',
    description: 'Forever free for early adopters',
    priceMonthly: 0,
    features: {
      maxVMs: 'unlimited', // With their own keys
      maxRamGB: 64, // No limit with BYOK
      managedLLM: false, // Must use own keys (except Bucket B/D pay-per-use)
      managedVM: false, // Must use own keys (except Bucket C/D upgrade)
      createTemplates: false, // Paywall
      sellTemplates: false,
      prioritySupport: false,
    },
  },
  free: {
    id: 'free',
    name: 'Free',
    description: 'Get started with your own API keys',
    priceMonthly: 0,
    features: {
      maxVMs: 1,
      maxRamGB: 4,
      managedLLM: false,
      managedVM: false,
      createTemplates: false,
      sellTemplates: false,
      prioritySupport: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: '1-click deployment, no setup required',
    priceMonthly: 2999, // $29.99
    features: {
      maxVMs: 'unlimited',
      maxRamGB: 64,
      managedLLM: true,
      managedVM: true,
      createTemplates: true,
      sellTemplates: true,
      prioritySupport: true,
    },
  },
}

// Early adopter discounts
export const EARLY_ADOPTER_DISCOUNTS = {
  upgrade: 50, // 50% off base fee for life when legacy user upgrades
  templatePaywall: 40, // 40% off first year for template creation
}

// ============================================================================
// Bucket Detection
// ============================================================================

interface SetupStateKeys {
  orgoApiKey: string | null
  awsAccessKeyId: string | null
  awsSecretAccessKey: string | null
  e2bApiKey: string | null
  llmApiKey: string | null
}

/**
 * Detect user's bucket based on their stored API keys
 */
export function detectBucket(setupState: SetupStateKeys | null): BucketId {
  if (!setupState) return 'D'

  const hasVMKeys = !!(
    setupState.orgoApiKey ||
    (setupState.awsAccessKeyId && setupState.awsSecretAccessKey) ||
    setupState.e2bApiKey
  )
  const hasLLMKeys = !!setupState.llmApiKey

  if (hasVMKeys && hasLLMKeys) return 'A'
  if (hasVMKeys && !hasLLMKeys) return 'B'
  if (!hasVMKeys && hasLLMKeys) return 'C'
  return 'D'
}

/**
 * Get bucket description for UI
 */
export function getBucketDescription(bucket: BucketId): string {
  switch (bucket) {
    case 'A':
      return 'Full self-managed (VM + LLM keys)'
    case 'B':
      return 'Self-managed VMs, managed LLM available'
    case 'C':
      return 'Self-managed LLM, managed VMs available'
    case 'D':
      return 'No keys configured'
  }
}

// ============================================================================
// Feature Gating
// ============================================================================

export interface UserPlanContext {
  userId: string
  plan: PlanId
  isLegacyUser: boolean
  bucket: BucketId | null
  earlyAdopterDiscount: number | null
  stripeSubscriptionId: string | null
  stripeCurrentPeriodEnd: Date | null
}

/**
 * Get user's plan context with all billing info
 */
export async function getUserPlanContext(userId: string): Promise<UserPlanContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      isLegacyUser: true,
      legacyBucket: true,
      earlyAdopterDiscount: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  return {
    userId,
    plan: (user.plan || 'free') as PlanId,
    isLegacyUser: user.isLegacyUser,
    bucket: user.legacyBucket as BucketId | null,
    earlyAdopterDiscount: user.earlyAdopterDiscount,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
  }
}

/**
 * Check if user can create a new VM
 */
export async function canCreateVM(userId: string): Promise<{
  allowed: boolean
  reason?: string
  upgradeRequired?: boolean
  suggestedPlan?: PlanId
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Legacy users with own VM keys can create unlimited VMs
  if (context.isLegacyUser && context.bucket && ['A', 'B'].includes(context.bucket)) {
    return { allowed: true }
  }

  // Check VM limit
  if (planDef.features.maxVMs !== 'unlimited') {
    const vmCount = await prisma.vM.count({
      where: { userId, status: { not: 'error' } },
    })

    if (vmCount >= planDef.features.maxVMs) {
      return {
        allowed: false,
        reason: `You've reached your limit of ${planDef.features.maxVMs} VM(s) on the ${planDef.name} plan`,
        upgradeRequired: true,
        suggestedPlan: 'pro',
      }
    }
  }

  return { allowed: true }
}

/**
 * Check if user can use a specific RAM tier
 */
export async function canUseRAM(userId: string, ramGB: number): Promise<{
  allowed: boolean
  reason?: string
  upgradeRequired?: boolean
  maxAllowed: number
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Legacy users with own VM keys have no RAM limit
  if (context.isLegacyUser && context.bucket && ['A', 'B'].includes(context.bucket)) {
    return { allowed: true, maxAllowed: 64 }
  }

  if (ramGB > planDef.features.maxRamGB) {
    return {
      allowed: false,
      reason: `${ramGB}GB RAM requires ${ramGB > 8 ? 'Pro' : 'Starter'} plan`,
      upgradeRequired: true,
      maxAllowed: planDef.features.maxRamGB,
    }
  }

  return { allowed: true, maxAllowed: planDef.features.maxRamGB }
}

/**
 * Check if user can create custom templates
 */
export async function canCreateTemplate(userId: string): Promise<{
  allowed: boolean
  reason?: string
  showPaywall: boolean
  discount?: number
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  if (planDef.features.createTemplates) {
    return { allowed: true, showPaywall: false }
  }

  // Legacy users get special discount on template paywall
  if (context.isLegacyUser) {
    return {
      allowed: false,
      reason: 'Custom template creation is a Pro feature',
      showPaywall: true,
      discount: EARLY_ADOPTER_DISCOUNTS.templatePaywall,
    }
  }

  return {
    allowed: false,
    reason: 'Custom template creation is a Pro feature',
    showPaywall: true,
  }
}

/**
 * Check if user should use managed LLM (ClawdBody's API key)
 */
export async function shouldUseManagedLLM(userId: string): Promise<{
  useManaged: boolean
  reason: string
  payPerUse: boolean
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Paid plans always use managed LLM
  if (planDef.features.managedLLM && context.stripeSubscriptionId) {
    return {
      useManaged: true,
      reason: 'Using ClawdBody managed LLM (included in plan)',
      payPerUse: false,
    }
  }

  // Legacy Bucket B users without LLM key can use managed LLM (pay-per-use)
  if (context.isLegacyUser && context.bucket === 'B') {
    // Check if they have their own LLM key
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
      select: { llmApiKey: true },
    })

    if (!setupState?.llmApiKey) {
      return {
        useManaged: true,
        reason: 'Using ClawdBody managed LLM (pay-per-use)',
        payPerUse: true,
      }
    }
  }

  // Legacy Bucket D users can use managed LLM (pay-per-use)
  if (context.isLegacyUser && context.bucket === 'D') {
    return {
      useManaged: true,
      reason: 'Using ClawdBody managed LLM (pay-per-use)',
      payPerUse: true,
    }
  }

  return {
    useManaged: false,
    reason: 'Using your own LLM API key',
    payPerUse: false,
  }
}

/**
 * Check if user should use managed VM (ClawdBody provisions)
 */
export async function shouldUseManagedVM(userId: string): Promise<{
  useManaged: boolean
  reason: string
  payPerUse: boolean
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Paid plans always use managed VM
  if (planDef.features.managedVM && context.stripeSubscriptionId) {
    return {
      useManaged: true,
      reason: 'Using ClawdBody managed VM (included in plan)',
      payPerUse: false,
    }
  }

  // Legacy users with VM keys use their own
  if (context.isLegacyUser && context.bucket && ['A', 'B'].includes(context.bucket)) {
    return {
      useManaged: false,
      reason: 'Using your own VM provider keys',
      payPerUse: false,
    }
  }

  // Legacy Bucket C/D users need to either upgrade or add their own keys
  if (context.isLegacyUser && context.bucket && ['C', 'D'].includes(context.bucket)) {
    return {
      useManaged: false, // They need to upgrade or add keys
      reason: 'VM provider keys required - upgrade to managed or add your own',
      payPerUse: true,
    }
  }

  return {
    useManaged: false,
    reason: 'Using your own VM provider keys',
    payPerUse: false,
  }
}

// ============================================================================
// Upsell Helpers
// ============================================================================

export interface UpsellContext {
  showBanner: boolean
  bannerType: 'managed_upgrade' | 'llm_toggle' | 'vm_upgrade' | 'get_started' | null
  headline: string
  description: string
  ctaText: string
  discount?: number
  discountLabel?: string
}

/**
 * Get upsell context based on user's bucket and plan
 */
export async function getUpsellContext(userId: string): Promise<UpsellContext> {
  const context = await getUserPlanContext(userId)

  // Non-legacy users don't see bucket-specific upsells
  if (!context.isLegacyUser) {
    return {
      showBanner: false,
      bannerType: null,
      headline: '',
      description: '',
      ctaText: '',
    }
  }

  const discount = EARLY_ADOPTER_DISCOUNTS.upgrade
  const discountLabel = `${discount}% off base fee for life`

  switch (context.bucket) {
    case 'A':
      // Has both keys - subtle upsell for managed experience
      return {
        showBanner: true,
        bannerType: 'managed_upgrade',
        headline: 'Upgrade to managed 1-click VMs & LLMs',
        description: 'No more key management, auto-scaling, 24/7 reliability.',
        ctaText: 'Switch now →',
        discount,
        discountLabel,
      }

    case 'B':
      // Has VM keys, no LLM - show LLM toggle option
      return {
        showBanner: true,
        bannerType: 'llm_toggle',
        headline: 'Get bundled LLM credits + seamless experience',
        description: 'Use managed LLMs (pay per use) or add your own LLM API key.',
        ctaText: 'Upgrade to Starter',
        discount,
        discountLabel,
      }

    case 'C':
      // Has LLM keys, no VM - prompt for managed VM
      return {
        showBanner: true,
        bannerType: 'vm_upgrade',
        headline: 'Launch a managed VM in one click',
        description: 'No keys, no setup. Or add your own VM provider key.',
        ctaText: 'Upgrade to Starter',
        discount,
        discountLabel,
      }

    case 'D':
      // Has neither - prompt for full managed experience
      return {
        showBanner: true,
        bannerType: 'get_started',
        headline: 'Get started with 1-click managed VMs & LLMs',
        description: 'Starter plan from $10/mo + usage. Or set up your own keys for free.',
        ctaText: 'Get Started',
        discount,
        discountLabel,
      }

    default:
      return {
        showBanner: false,
        bannerType: null,
        headline: '',
        description: '',
        ctaText: '',
      }
  }
}

// ============================================================================
// Managed API Key Provisioning
// ============================================================================

/**
 * Get ClawdBody's managed Anthropic API key for Pro users
 * Returns null if managed LLM is not available or user isn't eligible
 */
export async function getManagedLLMKey(userId: string): Promise<{
  apiKey: string | null
  provider: string
  model: string
  reason: string
}> {
  const managedKey = process.env.CLAWDBODY_ANTHROPIC_API_KEY
  
  if (!managedKey) {
    return {
      apiKey: null,
      provider: 'anthropic',
      model: 'anthropic/claude-sonnet-4-5',
      reason: 'Managed LLM not configured (missing CLAWDBODY_ANTHROPIC_API_KEY)',
    }
  }

  const llmStatus = await shouldUseManagedLLM(userId)
  
  if (!llmStatus.useManaged) {
    return {
      apiKey: null,
      provider: 'anthropic',
      model: 'anthropic/claude-sonnet-4-5',
      reason: llmStatus.reason,
    }
  }

  return {
    apiKey: managedKey,
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-5', // Default managed model
    reason: llmStatus.reason,
  }
}

/**
 * Managed VM provider configuration
 * ClawdBody can use Orgo, AWS, or E2B for managed VMs
 */
export type ManagedVMProvider = 'orgo' | 'aws' | 'e2b'

export interface ManagedVMConfig {
  provider: ManagedVMProvider
  apiKey: string | null
  // Orgo specific
  orgoApiKey?: string
  // AWS specific
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsRegion?: string
  // E2B specific
  e2bApiKey?: string
}

/**
 * Get ClawdBody's managed VM provider credentials for Pro users
 * Returns null if managed VM is not available or user isn't eligible
 */
export async function getManagedVMCredentials(userId: string): Promise<{
  config: ManagedVMConfig | null
  reason: string
}> {
  const vmStatus = await shouldUseManagedVM(userId)
  
  if (!vmStatus.useManaged) {
    return {
      config: null,
      reason: vmStatus.reason,
    }
  }

  // Check which managed VM provider is configured (prefer Orgo > E2B > AWS)
  const orgoKey = process.env.CLAWDBODY_ORGO_API_KEY
  const e2bKey = process.env.CLAWDBODY_E2B_API_KEY
  const awsAccessKey = process.env.CLAWDBODY_AWS_ACCESS_KEY_ID
  const awsSecretKey = process.env.CLAWDBODY_AWS_SECRET_ACCESS_KEY

  if (orgoKey) {
    return {
      config: {
        provider: 'orgo',
        apiKey: orgoKey,
        orgoApiKey: orgoKey,
      },
      reason: 'Using ClawdBody managed Orgo VM',
    }
  }

  if (e2bKey) {
    return {
      config: {
        provider: 'e2b',
        apiKey: e2bKey,
        e2bApiKey: e2bKey,
      },
      reason: 'Using ClawdBody managed E2B sandbox',
    }
  }

  if (awsAccessKey && awsSecretKey) {
    return {
      config: {
        provider: 'aws',
        apiKey: awsAccessKey,
        awsAccessKeyId: awsAccessKey,
        awsSecretAccessKey: awsSecretKey,
        awsRegion: process.env.CLAWDBODY_AWS_REGION || 'us-east-1',
      },
      reason: 'Using ClawdBody managed AWS EC2',
    }
  }

  return {
    config: null,
    reason: 'Managed VM not configured (no CLAWDBODY_ORGO_API_KEY, CLAWDBODY_E2B_API_KEY, or AWS credentials)',
  }
}

/**
 * Check if user is eligible for managed VM auto-provisioning
 */
export async function canAutoProvisionVM(userId: string): Promise<{
  eligible: boolean
  reason: string
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Pro users with active subscription get managed VM
  if (planDef.features.managedVM && context.stripeSubscriptionId) {
    return {
      eligible: true,
      reason: 'Pro plan includes managed VMs',
    }
  }

  // Legacy Bucket C/D users can upgrade to managed VM
  if (context.isLegacyUser && context.bucket && ['C', 'D'].includes(context.bucket)) {
    return {
      eligible: false, // They need to upgrade first
      reason: 'Upgrade to Pro for managed VMs, or add your own VM provider key',
    }
  }

  return {
    eligible: false,
    reason: 'Add your own VM provider key or upgrade to Pro for managed VMs',
  }
}

/**
 * Check if user is eligible for managed LLM auto-provisioning
 */
export async function canAutoProvisionLLM(userId: string): Promise<{
  eligible: boolean
  reason: string
}> {
  const context = await getUserPlanContext(userId)
  const planDef = PLANS[context.plan]

  // Pro users with active subscription get managed LLM
  if (planDef.features.managedLLM && context.stripeSubscriptionId) {
    return {
      eligible: true,
      reason: 'Pro plan includes managed LLM',
    }
  }

  // Legacy Bucket B/D users can use managed LLM (pay-per-use)
  if (context.isLegacyUser && context.bucket && ['B', 'D'].includes(context.bucket)) {
    return {
      eligible: true,
      reason: 'Pay-per-use managed LLM available',
    }
  }

  return {
    eligible: false,
    reason: 'Add your own LLM API key or upgrade to Pro for managed LLM',
  }
}

// ============================================================================
// Usage Pricing
// ============================================================================

// LLM token pricing (cost in cents per 1M tokens)
export const LLM_PRICING = {
  anthropic: {
    'claude-sonnet-4-20250514': { input: 300, output: 1500 }, // $3 / $15 per 1M
    'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
    'claude-3-5-haiku-20241022': { input: 100, output: 500 }, // $1 / $5 per 1M
    default: { input: 300, output: 1500 },
  },
}

// Markup percentage (20%)
export const USAGE_MARKUP = 0.20

/**
 * Calculate price for LLM usage with markup
 */
export function calculateLLMPrice(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): { costCents: number; priceCents: number } {
  const providerPricing = LLM_PRICING[provider as keyof typeof LLM_PRICING] || LLM_PRICING.anthropic
  const modelPricing = providerPricing[model as keyof typeof providerPricing] || providerPricing.default

  // Cost in cents (provider cost)
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output
  const costCents = Math.ceil(inputCost + outputCost)

  // Price with markup
  const priceCents = Math.ceil(costCents * (1 + USAGE_MARKUP))

  return { costCents, priceCents }
}

// VM hourly pricing (cost in cents per hour)
export const VM_PRICING = {
  orgo: {
    4: 5, // 4GB RAM: $0.05/hr
    8: 10, // 8GB RAM: $0.10/hr
    16: 20, // 16GB RAM: $0.20/hr
    32: 40, // 32GB RAM: $0.40/hr
  },
  aws: {
    't3.micro': 1, // $0.01/hr
    't3.small': 2,
    't3.medium': 4,
    't3.large': 8,
    'm7i-flex.large': 8,
  },
  e2b: {
    default: 2, // $0.02/hr base
  },
}

/**
 * Calculate price for VM usage with markup
 */
export function calculateVMPrice(
  provider: string,
  instanceTypeOrRam: string | number,
  minutes: number
): { costCents: number; priceCents: number } {
  let hourlyRate = 5 // Default: $0.05/hr

  if (provider === 'orgo' && typeof instanceTypeOrRam === 'number') {
    hourlyRate = VM_PRICING.orgo[instanceTypeOrRam as keyof typeof VM_PRICING.orgo] || 5
  } else if (provider === 'aws' && typeof instanceTypeOrRam === 'string') {
    hourlyRate = VM_PRICING.aws[instanceTypeOrRam as keyof typeof VM_PRICING.aws] || 8
  } else if (provider === 'e2b') {
    hourlyRate = VM_PRICING.e2b.default
  }

  // Cost in cents (provider cost)
  const costCents = Math.ceil((minutes / 60) * hourlyRate)

  // Price with markup
  const priceCents = Math.ceil(costCents * (1 + USAGE_MARKUP))

  return { costCents, priceCents }
}
