'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LandingPage } from '@/components/landing-page'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && session) {
      // Redirect to onboarding - it will check plan and redirect to select-vm if needed
      router.push('/onboarding')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-sam-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sam-text-dim font-mono text-sm">Initializing...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LandingPage />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sam-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-sam-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sam-text-dim font-mono text-sm">Redirecting...</p>
      </div>
    </div>
  )
}


