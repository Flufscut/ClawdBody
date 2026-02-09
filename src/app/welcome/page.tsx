'use client'

import { motion } from 'framer-motion'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Check, Server, Key, Zap, Headphones, ArrowRight, Clock, DollarSign, X } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function WelcomePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if already Pro
  useEffect(() => {
    if (session && (session.user as any).isPro) {
      router.push('/select-vm')
    }
  }, [session, router])

  const markWelcomeSeen = async () => {
    try {
      await fetch('/api/user/mark-welcome-seen', {
        method: 'POST',
      })
    } catch (error) {
      console.error('Error marking welcome page as seen:', error)
      // Don't block the flow if this fails
    }
  }

  const handleUpgrade = async () => {
    if (!session?.user) {
      router.push('/api/auth/signin')
      return
    }

    // Mark welcome page as seen before redirecting to checkout
    await markWelcomeSeen()

    setIsLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: '/select-vm',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      alert('Failed to start checkout. Please try again.')
      setIsLoading(false)
    }
  }

  const handleContinueFree = async () => {
    // Mark welcome page as seen before continuing
    await markWelcomeSeen()
    router.push('/select-vm')
  }

  const proBenefits = [
    {
      icon: Clock,
      title: 'Setup in <10 seconds',
      description: 'Get started instantly with fully managed infrastructure',
      highlight: '10 seconds',
    },
    {
      icon: Server,
      title: 'Managed VMs (AWS EC2)',
      description: 'Deploy powerful virtual machines with zero configuration',
    },
    {
      icon: Key,
      title: '$15/month in LLM credits',
      description: 'We handle all API key management and give you $15/month in AI credits - no setup required',
    },
    {
      icon: Zap,
      title: 'Early Access to Integrations',
      description: 'Get first access to Gmail, Calendar, and more integrations',
      highlight: 'Gmail, Calendar & more',
    },
    {
      icon: Headphones,
      title: 'Priority Support from Founder PJ',
      description: 'Direct priority support from our founder',
    },
  ]

  const freeLimitations = [
    {
      icon: Clock,
      text: 'Takes 20-25 minutes to set up',
    },
    {
      icon: Key,
      text: 'Bring your own keys – you provide and pay for your own API keys',
    },
    {
      icon: DollarSign,
      text: 'You pay for your own API usage',
    },
    {
      icon: Server,
      text: 'You need to configure your own VM infrastructure',
    },
    {
      icon: Key,
      text: 'Manual configuration of all services required',
    },
  ]

  if (session && (session.user as any).isPro) {
    return null
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-sam-bg">
      {/* Background effects */}
      <div className="landing-nebula" />
      <div className="landing-stars" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Content */}
        <motion.div
          className="max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Hero Section */}
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-6"
            >
              <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent mb-6">
                Welcome to ClawdBody!
              </h1>
              <p className="text-2xl sm:text-3xl text-white font-semibold mb-4">
                Get started in <span className="text-teal-400">less than 10 seconds</span> with Pro
              </p>
              <p className="text-gray-400 text-lg max-w-3xl mx-auto">
                Or spend 20-25 minutes setting up your own infrastructure and API keys with the free tier
              </p>
            </motion.div>
          </div>

          {/* Comparison Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Pro Card */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="relative p-8 rounded-2xl bg-gradient-to-br from-sam-accent/20 to-teal-500/20 border-2 border-sam-accent/50 backdrop-blur-sm"
            >
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 rounded-full bg-sam-accent/30 text-sam-accent text-sm font-semibold border border-sam-accent/50">
                  RECOMMENDED
                </span>
              </div>
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Pro Plan</h2>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-teal-400" />
                  <span className="text-2xl font-bold text-teal-400">&lt;10 seconds</span>
                  <span className="text-gray-400">to setup</span>
                </div>
                <p className="text-gray-300 mb-6">
                  Everything managed for you. Just click and deploy.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                {proBenefits.map((benefit, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center mt-0.5">
                      <Check className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{benefit.title}</span>
                        {benefit.highlight && (
                          <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30">
                            {benefit.highlight}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm mt-1">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-rose-500 to-teal-400 text-white font-semibold rounded-lg hover:from-rose-600 hover:to-teal-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Upgrade to Pro
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </motion.div>

            {/* Free Card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="relative p-8 rounded-2xl bg-sam-surface/30 border-2 border-sam-border backdrop-blur-sm"
            >
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">Free Plan</h2>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <span className="text-2xl font-bold text-gray-400">20-25 minutes</span>
                  <span className="text-gray-500">to setup</span>
                </div>
                <p className="text-gray-400 mb-6">
                  Bring your own keys. Requires manual configuration.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                {freeLimitations.map((limitation, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
                      <X className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <span className="text-gray-400">{limitation.text}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleContinueFree}
                className="w-full py-4 bg-sam-surface/50 text-gray-300 font-semibold rounded-lg hover:bg-sam-surface/70 border border-sam-border hover:border-sam-border/50 transition-all"
              >
                Continue with Free Plan
              </button>
            </motion.div>
          </div>

          {/* Final CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-12 text-center"
          >
            <p className="text-gray-400 mb-6">
              Ready to get started in seconds instead of minutes?
            </p>
            <button
              onClick={handleUpgrade}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-rose-500 to-teal-400 text-white font-semibold text-lg rounded-lg hover:from-rose-600 hover:to-teal-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Upgrade to Pro Now
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
