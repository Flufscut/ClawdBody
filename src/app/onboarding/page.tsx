'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PricingOnboarding } from '@/components/pricing-onboarding'

export default function OnboardingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [checkingPlan, setCheckingPlan] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
      return
    }

    if (status === 'authenticated' && session?.user?.id) {
      // Check if user has API keys or a paid plan
      fetch('/api/user/plan')
        .then(res => {
          if (!res.ok) {
            // API error - show pricing
            console.log('API error, showing pricing')
            setCheckingPlan(false)
            return null
          }
          return res.json()
        })
        .then(data => {
          if (!data) return // Already handled above
          
          console.log('Plan data:', {
            plan: data.plan?.id,
            hasVMKey: data.keys?.hasVMKey,
            hasLLMKey: data.keys?.hasLLMKey,
            onboardingCompleted: data.onboardingCompleted,
          })
          
          // Skip onboarding if:
          // 1. User has Pro plan (paid)
          // 2. User has any API keys set up (VM or LLM)
          // 3. User already completed onboarding (chose free before)
          const hasPaidPlan = data.plan?.id === 'pro'
          const hasVMKey = data.keys?.hasVMKey === true
          const hasLLMKey = data.keys?.hasLLMKey === true
          const alreadyCompletedOnboarding = data.onboardingCompleted === true
          
          if (hasPaidPlan || hasVMKey || hasLLMKey || alreadyCompletedOnboarding) {
            // User is set up or already saw onboarding - go to dashboard
            console.log('Skipping onboarding - user has keys, paid plan, or already completed')
            router.push('/select-vm')
          } else {
            // No keys and no paid plan and hasn't seen onboarding - show pricing
            console.log('Showing pricing - no keys, no paid plan, first time')
            setCheckingPlan(false)
          }
        })
        .catch((err) => {
          // On error, show pricing to be safe
          console.error('Onboarding check error:', err)
          setCheckingPlan(false)
        })
    }
  }, [status, session, router])

  const handleSelectPro = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
      setIsLoading(false)
    }
  }

  const handleSelectFree = async () => {
    setIsLoading(true)
    try {
      // Mark onboarding as completed in the database
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: 'free' }),
      })
      
      // Go to VM setup page where they'll need to add their own keys
      router.push('/select-vm')
    } catch (error) {
      console.error('Error completing onboarding:', error)
      // Still navigate even if API fails
      router.push('/select-vm')
    }
  }

  if (status === 'loading' || checkingPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
          <p className="text-sam-text-dim font-mono text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <PricingOnboarding
      onSelectPro={handleSelectPro}
      onSelectFree={handleSelectFree}
      isLoading={isLoading}
      userName={session?.user?.name || undefined}
    />
  )
}
