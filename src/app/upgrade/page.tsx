'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Server, Key, Zap, Headphones, ArrowRight } from 'lucide-react'
import { useState } from 'react'

export default function UpgradePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const benefits = [
    {
      icon: Server,
      title: 'Managed VMs (AWS EC2)',
      description: 'Deploy powerful virtual machines in just 10 seconds with our fully managed AWS EC2 infrastructure',
      highlight: 'Deploys in 10s',
    },
    {
      icon: Key,
      title: 'Managed LLM API Key',
      description: 'We handle your LLM API key management, so you can focus on building without worrying about configuration',
    },
    {
      icon: Zap,
      title: 'Early Access to Integrations',
      description: 'Get first access to new integrations including Gmail and Calendar, plus more coming soon',
      highlight: 'Gmail, Calendar & more',
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
      highlight: 'GUI support',
    },
  ]

  const handleUpgrade = async () => {
    if (!session?.user) {
      router.push('/api/auth/signin')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
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

  // Redirect if already Pro
  if (session && (session.user as any).isPro) {
    router.push('/pro')
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
            </motion.div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent mb-4">
              Upgrade to Pro
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
              Unlock the full power of ClawdBody with our Pro plan. Get access to managed infrastructure, priority support, and exclusive features.
            </p>
            <motion.button
              onClick={handleUpgrade}
              disabled={isLoading}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-rose-500 to-teal-400 text-white font-semibold rounded-lg hover:from-rose-600 hover:to-teal-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
            </motion.button>
          </div>

          {/* Benefits Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="p-6 rounded-xl bg-sam-surface/50 border border-sam-border backdrop-blur-sm hover:border-sam-accent/50 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-sam-accent/10 flex items-center justify-center">
                    <benefit.icon className="w-6 h-6 text-sam-accent" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-semibold text-white">
                        {benefit.title}
                      </h3>
                      {benefit.highlight && (
                        <span className="text-xs px-2 py-0.5 rounded bg-sam-accent/20 text-sam-accent border border-sam-accent/30">
                          {benefit.highlight}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="text-center p-8 rounded-xl bg-gradient-to-r from-sam-accent/10 to-teal-500/10 border border-sam-accent/30"
          >
            <h3 className="text-2xl font-bold text-white mb-3">
              Ready to unlock Pro features?
            </h3>
            <p className="text-gray-400 mb-6">
              Join Pro today and start deploying managed VMs in seconds
            </p>
            <button
              onClick={handleUpgrade}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-rose-500 to-teal-400 text-white font-semibold rounded-lg hover:from-rose-600 hover:to-teal-500 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
        </motion.div>
      </div>
    </div>
  )
}
