'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Check, 
  X, 
  Loader2, 
  Zap, 
  Server, 
  Brain, 
  Sparkles,
  ArrowRight,
  Clock,
  Key,
} from 'lucide-react'

interface PricingOnboardingProps {
  onSelectPro: () => void
  onSelectFree: () => void
  isLoading?: boolean
  userName?: string
}

export function PricingOnboarding({
  onSelectPro,
  onSelectFree,
  isLoading = false,
  userName,
}: PricingOnboardingProps) {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'free' | null>('pro')

  const handleContinue = () => {
    if (selectedPlan === 'pro') {
      onSelectPro()
    } else if (selectedPlan === 'free') {
      onSelectFree()
    }
  }

  return (
    <div className="min-h-screen bg-sam-bg flex items-center justify-center p-6">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-sam-accent/5 rounded-full blur-[180px] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-4xl w-full"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <img
              src="/logos/ClawdBody.png"
              alt="ClawdBody"
              className="h-16 mx-auto mb-6"
            />
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-sam-text mb-3">
            {userName ? `Welcome, ${userName.split(' ')[0]}!` : 'Welcome to ClawdBody'}
          </h1>
          <p className="text-lg text-sam-text-dim max-w-xl mx-auto">
            Deploy autonomous AI agents that run 24/7 in the cloud
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          
          {/* Pro Card - Primary */}
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            onClick={() => setSelectedPlan('pro')}
            className={`relative p-6 rounded-2xl border-2 text-left transition-all ${
              selectedPlan === 'pro'
                ? 'border-sam-accent bg-sam-accent/10 shadow-lg shadow-sam-accent/20'
                : 'border-sam-accent/50 bg-sam-surface/80 hover:border-sam-accent hover:bg-sam-accent/5'
            }`}
          >
            {/* Recommended badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 rounded-full bg-sam-accent text-sam-bg text-xs font-bold uppercase tracking-wide">
                Recommended
              </span>
            </div>

            <div className="flex items-start justify-between mb-4 mt-2">
              <div>
                <h3 className="text-2xl font-display font-bold text-sam-text mb-1">Pro</h3>
                <p className="text-sam-text-dim text-sm">1-click deployment</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-display font-bold text-sam-accent">$29.99</div>
                <div className="text-sam-text-dim text-sm">/month + usage</div>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <Feature icon={<Zap className="w-4 h-4" />} text="Instant setup - no API keys needed" highlight />
              <Feature icon={<Server className="w-4 h-4" />} text="Managed VMs (Orgo, AWS, E2B)" highlight />
              <Feature icon={<Brain className="w-4 h-4" />} text="Claude AI included" highlight />
              <Feature icon={<Sparkles className="w-4 h-4" />} text="Unlimited agents" highlight />
              <Feature icon={<Clock className="w-4 h-4" />} text="24/7 uptime monitoring" highlight />
            </div>

            <div className={`w-full py-3 rounded-xl font-medium text-center transition-all ${
              selectedPlan === 'pro'
                ? 'bg-sam-accent text-sam-bg'
                : 'bg-sam-accent/20 text-sam-accent'
            }`}>
              {selectedPlan === 'pro' ? (
                <span className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" /> Selected
                </span>
              ) : (
                'Select Pro'
              )}
            </div>
          </motion.button>

          {/* Free Card - Muted */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => setSelectedPlan('free')}
            className={`relative p-6 rounded-2xl border text-left transition-all ${
              selectedPlan === 'free'
                ? 'border-sam-border bg-sam-surface/60'
                : 'border-sam-border/50 bg-sam-surface/30 hover:border-sam-border hover:bg-sam-surface/40'
            }`}
          >
            <div className="flex items-start justify-between mb-4 opacity-60">
              <div>
                <h3 className="text-2xl font-display font-bold text-sam-text-dim mb-1">Free</h3>
                <p className="text-sam-text-dim/70 text-sm">Bring your own keys</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-display font-bold text-sam-text-dim">$0</div>
                <div className="text-sam-text-dim/70 text-sm">/month</div>
              </div>
            </div>

            <div className="space-y-3 mb-6 opacity-50">
              <FeatureMissing text="Requires your own VM provider API key" />
              <FeatureMissing text="On an average cost $50+ or above per month" />
              <FeatureMissing text="Requires your own LLM API key" />
              <FeatureMissing text="Manual setup & configuration" />
              <Feature icon={<Server className="w-4 h-4" />} text="1 agent limit" muted />
              <Feature icon={<Key className="w-4 h-4" />} text="Community support only" muted />
            </div>

            <div className={`w-full py-3 rounded-xl font-medium text-center transition-all ${
              selectedPlan === 'free'
                ? 'bg-sam-surface border border-sam-border text-sam-text-dim'
                : 'bg-sam-surface/50 text-sam-text-dim/70 border border-transparent'
            }`}>
              {selectedPlan === 'free' ? (
                <span className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" /> Selected
                </span>
              ) : (
                'Continue with Free'
              )}
            </div>
          </motion.button>
        </div>

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <button
            onClick={handleContinue}
            disabled={!selectedPlan || isLoading}
            className={`px-8 py-4 rounded-xl font-display font-bold text-lg transition-all flex items-center gap-3 mx-auto ${
              selectedPlan === 'pro'
                ? 'bg-sam-accent text-sam-bg hover:bg-sam-accent/90 shadow-lg shadow-sam-accent/30'
                : selectedPlan === 'free'
                ? 'bg-sam-surface border border-sam-border text-sam-text hover:bg-sam-surface/80'
                : 'bg-sam-surface text-sam-text-dim cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {selectedPlan === 'pro' ? 'Continue to Checkout' : 'Continue with Free'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {selectedPlan === 'free' && (
            <p className="mt-4 text-sm text-sam-text-dim/70">
              You'll need to configure your own VM and LLM API keys
            </p>
          )}
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-xs text-sam-text-dim/50 mb-3">Trusted by 2,500+ developers</p>
          <div className="flex items-center justify-center gap-6 opacity-40">
            <span className="text-xs text-sam-text-dim">Secure payments via Stripe</span>
            <span className="text-sam-text-dim">•</span>
            <span className="text-xs text-sam-text-dim">Cancel anytime</span>
            <span className="text-sam-text-dim">•</span>
            <span className="text-xs text-sam-text-dim">SOC 2 compliant infrastructure</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

function Feature({ 
  icon, 
  text, 
  highlight = false,
  muted = false,
}: { 
  icon: React.ReactNode
  text: string
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 ${muted ? 'text-sam-text-dim/60' : ''}`}>
      <div className={`flex-shrink-0 ${highlight ? 'text-sam-accent' : 'text-sam-text-dim'}`}>
        {icon}
      </div>
      <span className={`text-sm ${highlight ? 'text-sam-text' : 'text-sam-text-dim'}`}>
        {text}
      </span>
    </div>
  )
}

function FeatureMissing({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-sam-text-dim/60">
      <X className="w-4 h-4 flex-shrink-0 text-sam-error/50" />
      <span className="text-sm">{text}</span>
    </div>
  )
}
