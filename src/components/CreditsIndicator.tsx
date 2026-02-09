'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CreditCard } from 'lucide-react'

interface CreditStatus {
  usageCents?: number
  limitCents?: number
  limitRemainingCents?: number | null
  status?: string | null
}

/**
 * Shows LLM credits remaining for Pro users in the nav. Links to /dashboard/credits.
 */
export function CreditsIndicator({ isPro }: { isPro: boolean }) {
  const [status, setStatus] = useState<CreditStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isPro) {
      setLoading(false)
      return
    }
    fetch('/api/credits/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.error && data.status === null) {
          setStatus({}) // No account: still show "Credits" link
          return
        }
        setStatus(data)
      })
      .catch(() => setStatus({}))
      .finally(() => setLoading(false))
  }, [isPro])

  if (!isPro) return null

  const hasAmount =
    status != null &&
    typeof status.limitRemainingCents === 'number'
  const remaining = hasAmount
    ? (status!.limitRemainingCents! / 100).toFixed(2)
    : null
  const isLow = status?.status === 'low' || status?.status === 'exhausted'

  if (loading) {
    return (
      <span className="flex items-center gap-1.5 bg-zinc-800 text-zinc-500 text-xs font-medium px-2 py-0.5 rounded border border-zinc-700">
        <CreditCard className="w-3.5 h-3.5 animate-pulse" />
        <span>Credits…</span>
      </span>
    )
  }

  return (
    <Link
      href="/dashboard/credits"
      className="flex items-center gap-1.5 bg-zinc-800 text-zinc-400 text-xs font-medium px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
      title="View and manage AI credits"
    >
      <CreditCard className="w-3.5 h-3.5 shrink-0" />
      <span>Credits</span>
    </Link>
  )
}
