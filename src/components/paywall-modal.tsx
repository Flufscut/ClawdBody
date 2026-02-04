'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Check, Loader2, Zap, Server, Brain } from 'lucide-react'

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  feature: 'template_creation' | 'vm_limit' | 'ram_limit'
  discount?: number // e.g., 40 for 40% off
  currentPlan?: string
}

export function PaywallModal({
  isOpen,
  onClose,
  feature,
  discount,
  currentPlan,
}: PaywallModalProps) {
  const [loading, setLoading] = useState(false)

  const featureConfig = {
    template_creation: {
      title: 'Custom Template Creation',
      description: 'Create, share, and sell your own agent templates.',
    },
    vm_limit: {
      title: 'More Virtual Machines',
      description: 'Run multiple AI agents simultaneously.',
    },
    ram_limit: {
      title: 'Higher RAM Tiers',
      description: 'Access 8GB+ RAM for demanding AI workloads.',
    },
  }

  const config = featureConfig[feature]

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plan: 'pro',
          applyDiscount: !!discount,
        }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout session')
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-md rounded-2xl border border-sam-accent/30 bg-sam-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-lg text-sam-text-dim hover:text-sam-text hover:bg-sam-bg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-sam-accent/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-sam-accent" />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold text-sam-text mb-1">
                  {config.title}
                </h2>
                <p className="text-sam-text-dim text-sm">
                  {config.description}
                </p>
              </div>
            </div>

            {/* Early adopter discount banner */}
            {discount && (
              <div className="mb-6 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
                <p className="text-amber-400 text-sm font-medium flex items-center gap-2">
                  <span className="text-lg">🎉</span>
                  As an early user, you get <span className="font-bold">{discount}% off</span> for life!
                </p>
              </div>
            )}

            {/* Pro Plan Card */}
            <div className="p-4 rounded-xl border border-sam-accent/30 bg-sam-accent/5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-display text-lg font-bold text-sam-text">Pro Plan</span>
                <div className="text-right">
                  <span className="text-2xl font-display font-bold text-sam-accent">$29.99</span>
                  <span className="text-sam-text-dim text-sm">/mo</span>
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-3 text-sam-text">
                  <Zap className="w-4 h-4 text-sam-accent" />
                  Instant setup - no API keys needed
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Server className="w-4 h-4 text-sam-accent" />
                  Managed VMs (Orgo, AWS, E2B)
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Brain className="w-4 h-4 text-sam-accent" />
                  Claude AI included
                </li>
                <li className="flex items-center gap-3 text-sam-text">
                  <Check className="w-4 h-4 text-sam-accent" />
                  Unlimited agents & templates
                </li>
              </ul>
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-sam-accent text-sam-bg font-display font-bold hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Upgrade to Pro
                    {discount && ` (-${discount}%)`}
                  </>
                )}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2 text-sam-text-dim hover:text-sam-text text-sm transition-colors"
              >
                Maybe later
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-xs text-sam-text-dim text-center">
              {currentPlan === 'legacy_free'
                ? "You're on the Legacy Free plan. Your current features will never be taken away."
                : 'Cancel anytime. No long-term commitment.'}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
