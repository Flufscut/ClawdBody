'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Server, Key, Zap, Headphones, X, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function ProPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelSuccess, setCancelSuccess] = useState(false)
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<Date | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      if (!session?.user) return

      try {
        const response = await fetch('/api/stripe/subscription-status')
        if (response.ok) {
          const data = await response.json()
          if (data.isCancelling && data.periodEndDate) {
            setCancelSuccess(true)
            setSubscriptionEndDate(new Date(data.periodEndDate))
          }
        }
      } catch (error) {
        console.error('Error checking subscription status:', error)
      } finally {
        setIsLoadingStatus(false)
      }
    }

    checkSubscriptionStatus()
  }, [session])

  const benefits = [
    {
      icon: Server,
      title: 'Managed VMs (AWS EC2)',
      description: 'Deploy powerful virtual machines in just 10 seconds with our fully managed AWS EC2 infrastructure',
    },
    {
      icon: Key,
      title: '$15/month in LLM credits',
      description: 'We handle your LLM API key management and give you $15/month in AI credits, so you can focus on building without worrying about configuration',
    },
    {
      icon: Zap,
      title: 'Early Access to Integrations',
      description: 'Get first access to new integrations including Gmail and Calendar, plus more coming soon',
    },
    {
      icon: Headphones,
      title: 'Priority Support from Founder PJ',
      description: 'Receive direct priority support from our founder, ensuring your questions and issues are addressed quickly',
    },
    {
      icon: Server,
      title: 'More VM Support',
      description: 'Support for multiple VMs with GUI support for VMs coming soon',
    },
  ]

  const handleCancelSubscription = async () => {
    setIsCancelling(true)
    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to cancel subscription' }))
        throw new Error(errorData.message || 'Failed to cancel subscription')
      }

      const data = await response.json()
      
      // Store the subscription end date
      if (data.periodEndDate) {
        setSubscriptionEndDate(new Date(data.periodEndDate))
      }

      // Show warning card (no redirect)
      setCancelSuccess(true)
      setShowCancelConfirm(false)
    } catch (error: any) {
      console.error('Error cancelling subscription:', error)
      alert(error.message || 'Failed to cancel subscription. Please try again or contact support.')
      setIsCancelling(false)
    }
  }

  // Redirect if not Pro
  if (session && !(session.user as any).isPro) {
    router.push('/upgrade')
    return null
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-sam-bg">
      {/* Background effects */}
      <div className="landing-nebula" />
      <div className="landing-stars" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Link 
            href="/select-vm"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </motion.div>

        {/* Content */}
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-block mb-4"
            >
              <span className="bg-zinc-800 text-zinc-400 text-sm font-medium px-3 py-1.5 rounded border border-zinc-700">
                PRO
              </span>
            </motion.div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent mb-4">
              Pro Plan Benefits
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              You're enjoying all the premium features of ClawdBody Pro. Here's what you have access to:
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="p-6 rounded-xl bg-sam-surface/50 border border-sam-border backdrop-blur-sm hover:border-sam-accent/50 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-sam-accent/10 flex items-center justify-center">
                    <benefit.icon className="w-6 h-6 text-sam-accent" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2">
                      {benefit.title}
                    </h3>
                    <p className="text-gray-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Cancel Subscription Section */}
          {isLoadingStatus ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-12 p-6 rounded-xl bg-zinc-900/50 border border-zinc-800"
            >
              <div className="flex items-center justify-center">
                <div className="text-sm text-gray-400">Loading subscription status...</div>
              </div>
            </motion.div>
          ) : cancelSuccess ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30"
            >
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-amber-400 mb-2">
                    Subscription Scheduled for Cancellation
                  </h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p>
                      Your subscription will remain active until{' '}
                      <span className="font-semibold text-amber-300">
                        {subscriptionEndDate ? subscriptionEndDate.toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        }) : 'the end of your billing period'}
                      </span>.
                    </p>
                    <p className="text-amber-300 font-medium">
                      Important: All your Pro VMs will be automatically deleted when your subscription ends.
                    </p>
                    <p className="text-gray-400">
                      Please make sure to back up any important data from your VMs before the subscription end date.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-12 p-6 rounded-xl bg-zinc-900/50 border border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-300 mb-1">
                    Manage Subscription
                  </h3>
                  <p className="text-sm text-gray-500">
                    Cancel your subscription at any time
                  </p>
                </div>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isCancelling}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-0"
                  style={{ 
                    outline: 'none',
                    boxShadow: 'none',
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = 'none'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                </button>
              </div>
            </motion.div>
          )}

          {/* Cancel Confirmation Modal */}
          {showCancelConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-sam-surface border border-sam-border rounded-xl p-6 max-w-md w-full mx-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white">
                    Cancel Subscription
                  </h3>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-gray-400 mb-6">
                  Are you sure you want to cancel your Pro subscription? You'll lose access to all Pro features at the end of your billing period.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-sam-border text-sam-text hover:bg-sam-surface/50 transition-colors"
                  >
                    Keep Subscription
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={isCancelling}
                    className="flex-1 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
