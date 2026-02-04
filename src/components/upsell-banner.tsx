'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Sparkles, Zap, Server, Rocket, ArrowRight } from 'lucide-react'

type BannerType = 'managed_upgrade' | 'llm_toggle' | 'vm_upgrade' | 'get_started'

interface UpsellBannerProps {
  type: BannerType
  headline: string
  description: string
  ctaText: string
  discount?: number
  discountLabel?: string
  onUpgrade?: () => void
  onDismiss?: () => void
  dismissible?: boolean
  variant?: 'banner' | 'card' | 'inline'
}

const bannerIcons: Record<BannerType, React.ReactNode> = {
  managed_upgrade: <Sparkles className="w-5 h-5" />,
  llm_toggle: <Zap className="w-5 h-5" />,
  vm_upgrade: <Server className="w-5 h-5" />,
  get_started: <Rocket className="w-5 h-5" />,
}

const bannerColors: Record<BannerType, { bg: string; border: string; accent: string }> = {
  managed_upgrade: {
    bg: 'bg-gradient-to-r from-sam-accent/10 to-orange-500/10',
    border: 'border-sam-accent/30',
    accent: 'text-sam-accent',
  },
  llm_toggle: {
    bg: 'bg-gradient-to-r from-blue-500/10 to-purple-500/10',
    border: 'border-blue-500/30',
    accent: 'text-blue-400',
  },
  vm_upgrade: {
    bg: 'bg-gradient-to-r from-green-500/10 to-emerald-500/10',
    border: 'border-green-500/30',
    accent: 'text-green-400',
  },
  get_started: {
    bg: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10',
    border: 'border-amber-500/30',
    accent: 'text-amber-400',
  },
}

export function UpsellBanner({
  type,
  headline,
  description,
  ctaText,
  discount,
  discountLabel,
  onUpgrade,
  onDismiss,
  dismissible = true,
  variant = 'banner',
}: UpsellBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  const colors = bannerColors[type]
  const icon = bannerIcons[type]

  if (variant === 'inline') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-3 p-3 rounded-lg ${colors.bg} border ${colors.border}`}
      >
        <div className={`${colors.accent}`}>{icon}</div>
        <p className="flex-1 text-sm text-sam-text-dim">
          {headline}
        </p>
        <button
          onClick={() => onUpgrade?.()}
          className={`text-sm font-medium ${colors.accent} hover:underline flex items-center gap-1`}
        >
          {ctaText}
          <ArrowRight className="w-4 h-4" />
        </button>
      </motion.div>
    )
  }

  if (variant === 'card') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative p-5 rounded-xl ${colors.bg} border ${colors.border}`}
      >
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1 rounded-lg text-sam-text-dim hover:text-sam-text hover:bg-sam-bg/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.accent}`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold text-sam-text mb-1">
              {headline}
            </h3>
            <p className="text-sm text-sam-text-dim mb-3">
              {description}
            </p>
            
            {discount && discountLabel && (
              <p className={`text-sm ${colors.accent} mb-3`}>
                🎁 Early adopter special: {discountLabel}
              </p>
            )}

            <button
              onClick={() => onUpgrade?.()}
              className={`px-4 py-2 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors flex items-center gap-2`}
            >
              {ctaText}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  // Default banner variant
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex items-center gap-4 p-4 rounded-xl ${colors.bg} border ${colors.border}`}
    >
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded-lg text-sam-text-dim hover:text-sam-text hover:bg-sam-bg/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className={`w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0 ${colors.accent}`}>
        {icon}
      </div>

      <div className="flex-1 min-w-0 pr-8">
        <h4 className="font-medium text-sam-text truncate">
          {headline}
        </h4>
        <p className="text-sm text-sam-text-dim truncate">
          {description}
          {discount && (
            <span className={`ml-2 ${colors.accent}`}>
              {discountLabel}
            </span>
          )}
        </p>
      </div>

      <button
        onClick={() => onUpgrade?.('starter')}
        className={`px-4 py-2 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors flex-shrink-0 flex items-center gap-2`}
      >
        {ctaText}
        <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

/**
 * Hook to fetch and use upsell context
 */
export function useUpsell() {
  const [upsellContext, setUpsellContext] = useState<{
    showBanner: boolean
    bannerType: BannerType | null
    headline: string
    description: string
    ctaText: string
    discount?: number
    discountLabel?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUpsell = async () => {
    try {
      const response = await fetch('/api/user/plan')
      if (response.ok) {
        const data = await response.json()
        setUpsellContext(data.upsell)
      }
    } catch (e) {
      console.error('Failed to fetch upsell context:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async () => {
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          plan: 'pro',
          applyDiscount: !!upsellContext?.discount,
        }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Upgrade error:', error)
    }
  }

  return {
    upsellContext,
    loading,
    fetchUpsell,
    handleUpgrade,
  }
}
