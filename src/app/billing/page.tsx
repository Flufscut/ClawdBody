'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  CreditCard, 
  Check, 
  Loader2, 
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Clock,
  TrendingUp,
  LogOut,
  Crown,
} from 'lucide-react'
import { PaywallModal } from '@/components/paywall-modal'

interface PlanInfo {
  plan: {
    id: string
    name: string
    description: string
    priceMonthly: number
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
  isLegacyUser: boolean
  bucket: string | null
  earlyAdopterDiscount: number | null
  subscription: {
    active: boolean
    currentPeriodEnd: string | null
  }
  usage: {
    llmTokens: number
    llmPriceCents: number
    vmMinutes: number
    vmPriceCents: number
    totalPriceCents: number
  } | null
  limits: {
    vms: {
      current: number
      max: number | 'unlimited'
    }
    maxRamGB: number
  }
  keys: {
    hasVMKey: boolean
    hasLLMKey: boolean
  }
}

function BillingPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)

  // Check for success/cancel from Stripe
  const checkoutSuccess = searchParams.get('success')
  const checkoutCanceled = searchParams.get('canceled')
  const upgradedPlan = searchParams.get('plan')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  useEffect(() => {
    const fetchPlanInfo = async () => {
      try {
        const response = await fetch('/api/user/plan')
        if (response.ok) {
          const data = await response.json()
          setPlanInfo(data)
        }
      } catch (error) {
        console.error('Failed to fetch plan info:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user?.id) {
      fetchPlanInfo()
    }
  }, [session?.user?.id])

  const handleUpgrade = async () => {
    const plan = 'pro'
    setUpgradeLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plan,
          applyDiscount: planInfo?.isLegacyUser,
        }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout')
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setUpgradeLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setPortalLoading(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
          <p className="text-sam-text-dim font-mono text-sm">Loading billing...</p>
        </div>
      </div>
    )
  }

  if (!session || !planInfo) {
    return null
  }

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      {/* Ambient glow */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-sam-accent/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/select-vm')}
              className="p-2 rounded-lg border border-sam-border hover:border-sam-accent/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-sam-text-dim" />
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold text-sam-text">Billing</h1>
              <p className="text-sam-text-dim text-sm">Manage your subscription and usage</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {/* Success/Cancel messages */}
        {checkoutSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30"
          >
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">
                  Welcome to Pro!
                </p>
                <p className="text-sm text-sam-text-dim">
                  Your subscription is now active. Enjoy your new features!
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {checkoutCanceled && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
          >
            <p className="text-amber-400">
              Checkout was canceled. No charges were made.
            </p>
          </motion.div>
        )}

        {/* Current Plan Card */}
        <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden mb-6">
          <div className="p-6 border-b border-sam-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  planInfo.plan.id === 'pro' 
                    ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20' 
                    : 'bg-sam-accent/20'
                }`}>
                  {planInfo.plan.id === 'pro' ? (
                    <Crown className="w-6 h-6 text-amber-400" />
                  ) : (
                    <Sparkles className="w-6 h-6 text-sam-accent" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-sam-text">
                      {planInfo.plan.name}
                    </h2>
                    {planInfo.isLegacyUser && (
                      <span className="px-2 py-0.5 rounded-full bg-sam-accent/20 text-sam-accent text-xs font-medium">
                        Early Adopter
                      </span>
                    )}
                  </div>
                  <p className="text-sam-text-dim text-sm">{planInfo.plan.description}</p>
                </div>
              </div>
              <div className="text-right">
                {planInfo.plan.priceMonthly > 0 ? (
                  <>
                    <p className="font-display text-2xl font-bold text-sam-text">
                      {formatCurrency(planInfo.plan.priceMonthly)}
                      <span className="text-sm text-sam-text-dim font-normal">/mo</span>
                    </p>
                    {planInfo.earlyAdopterDiscount && (
                      <p className="text-sm text-sam-accent">
                        {planInfo.earlyAdopterDiscount}% lifetime discount applied
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-display text-2xl font-bold text-sam-accent">Free</p>
                )}
              </div>
            </div>
          </div>

          {/* Plan features */}
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-sam-bg/50">
              <p className="text-xs text-sam-text-dim mb-1">VMs</p>
              <p className="font-mono text-sam-text">
                {planInfo.limits.vms.current} / {planInfo.limits.vms.max === 'unlimited' ? '∞' : planInfo.limits.vms.max}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-sam-bg/50">
              <p className="text-xs text-sam-text-dim mb-1">Max RAM</p>
              <p className="font-mono text-sam-text">{planInfo.limits.maxRamGB} GB</p>
            </div>
            <div className="p-3 rounded-lg bg-sam-bg/50">
              <p className="text-xs text-sam-text-dim mb-1">VM Keys</p>
              <p className="font-mono text-sam-text">
                {planInfo.keys.hasVMKey ? (
                  <span className="text-green-400">Connected</span>
                ) : (
                  <span className="text-sam-text-dim">Not set</span>
                )}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-sam-bg/50">
              <p className="text-xs text-sam-text-dim mb-1">LLM Keys</p>
              <p className="font-mono text-sam-text">
                {planInfo.keys.hasLLMKey ? (
                  <span className="text-green-400">Connected</span>
                ) : (
                  <span className="text-sam-text-dim">Not set</span>
                )}
              </p>
            </div>
          </div>

          {/* Subscription status */}
          {planInfo.subscription.active && planInfo.subscription.currentPeriodEnd && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between p-3 rounded-lg bg-sam-bg/50">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sam-text-dim" />
                  <span className="text-sm text-sam-text-dim">
                    Next billing date: {formatDate(planInfo.subscription.currentPeriodEnd)}
                  </span>
                </div>
                <button
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  className="text-sm text-sam-accent hover:underline flex items-center gap-1"
                >
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Manage subscription
                      <ExternalLink className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Usage Card (if on paid plan) */}
        {planInfo.usage && planInfo.plan.id === 'pro' && (
          <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden mb-6">
            <div className="p-6 border-b border-sam-border">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-sam-accent" />
                <h3 className="font-display font-bold text-sam-text">Current Period Usage</h3>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-sam-bg/50">
                <p className="text-sm text-sam-text-dim mb-2">LLM Tokens</p>
                <p className="font-display text-2xl font-bold text-sam-text">
                  {(planInfo.usage.llmTokens / 1000).toFixed(0)}K
                </p>
                <p className="text-sm text-sam-accent">
                  {formatCurrency(planInfo.usage.llmPriceCents)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-sam-bg/50">
                <p className="text-sm text-sam-text-dim mb-2">VM Time</p>
                <p className="font-display text-2xl font-bold text-sam-text">
                  {Math.floor(planInfo.usage.vmMinutes / 60)}h {planInfo.usage.vmMinutes % 60}m
                </p>
                <p className="text-sm text-sam-accent">
                  {formatCurrency(planInfo.usage.vmPriceCents)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-sam-accent/10 border border-sam-accent/30">
                <p className="text-sm text-sam-text-dim mb-2">Total Usage</p>
                <p className="font-display text-2xl font-bold text-sam-accent">
                  {formatCurrency(planInfo.usage.totalPriceCents)}
                </p>
                <p className="text-sm text-sam-text-dim">This billing period</p>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade option (if not on Pro) */}
        {planInfo.plan.id !== 'pro' && (
          <div className="rounded-2xl border border-sam-accent/30 bg-gradient-to-br from-sam-accent/5 to-orange-500/5 backdrop-blur overflow-hidden">
            <div className="p-6 border-b border-sam-accent/20">
              <h3 className="font-display font-bold text-sam-text">Upgrade to Pro</h3>
              <p className="text-sm text-sam-text-dim">
                1-click deployment with managed infrastructure
              </p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Crown className="w-8 h-8 text-sam-accent" />
                  <div>
                    <span className="font-display text-2xl font-bold text-sam-text">$29.99</span>
                    <span className="text-sam-text-dim">/month + usage</span>
                  </div>
                </div>
                {planInfo.isLegacyUser && (
                  <span className="px-3 py-1 rounded-full bg-sam-accent/20 text-sam-accent text-sm font-medium">
                    50% off for life
                  </span>
                )}
              </div>
              <ul className="space-y-3 mb-6 text-sm">
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Instant setup - no API keys needed
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Managed VMs (Orgo, AWS, E2B)
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Claude AI included
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Unlimited agents
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Create & sell templates
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-5 h-5 text-sam-accent" />
                  Priority support
                </li>
              </ul>
              <button
                onClick={() => handleUpgrade()}
                disabled={upgradeLoading}
                className="w-full py-3 rounded-xl bg-sam-accent text-sam-bg font-display font-bold hover:bg-sam-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {upgradeLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Upgrade to Pro'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Legacy user note */}
        {planInfo.isLegacyUser && planInfo.plan.id === 'legacy_free' && (
          <div className="mt-6 p-4 rounded-xl bg-sam-accent/5 border border-sam-accent/20">
            <p className="text-sm text-sam-text-dim">
              <span className="text-sam-accent font-medium">Thank you for being an early adopter!</span>
              {' '}Your Legacy Free plan will never be taken away. All your current features 
              will continue to work forever. Upgrading is entirely optional and unlocks 
              additional convenience features.
            </p>
          </div>
        )}
      </div>

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="template_creation"
        discount={planInfo?.isLegacyUser ? 40 : undefined}
        currentPlan={planInfo?.plan.id}
      />
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-sam-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
      </div>
    }>
      <BillingPageContent />
    </Suspense>
  )
}
