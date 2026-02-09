'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, CreditCard, Zap, AlertCircle, CheckCircle } from 'lucide-react'

interface CreditStatus {
  usageCents: number
  limitCents: number
  limitRemainingCents?: number | null
  monthlyAllowanceCents: number
  topupBalanceCents: number
  status: string | null
  periodEnd: string
  periodStart: string
}

const PRESETS = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$20', cents: 2000 },
  { label: '$50', cents: 5000 },
]

export default function CreditsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<CreditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState<number>(1000)
  const [customAmount, setCustomAmount] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const autoSetupDoneRef = useRef(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/api/auth/signin')
      return
    }
    if (authStatus !== 'authenticated') return

    fetch('/api/credits/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.error && data.status === null) {
          setStatus(null)
          return
        }
        setStatus(data as CreditStatus)
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [authStatus, router])

  // Pro users with no credit account: auto-run setup once so they land on the full credits page
  useEffect(() => {
    if (authStatus !== 'authenticated' || loading || status !== null || settingUp) return
    if (!(session?.user as any)?.isPro || autoSetupDoneRef.current) return

    autoSetupDoneRef.current = true
    setSettingUp(true)
    fetch('/api/credits/setup', { method: 'POST' })
      .then(async (res) => {
        const setupData = await res.json()
        if (!res.ok) {
          setMessage({ type: 'error', text: setupData.error ?? 'Could not set up credit account.' })
          return
        }
        const statusRes = await fetch('/api/credits/status')
        const statusData = await statusRes.json()
        if (!statusData.error || statusData.status != null) setStatus(statusData as CreditStatus)
      })
      .catch(() => setMessage({ type: 'error', text: 'Could not set up credit account.' }))
      .finally(() => setSettingUp(false))
  }, [authStatus, loading, status, settingUp, session?.user])

  useEffect(() => {
    const topup = searchParams.get('topup')
    if (topup === 'success') {
      setMessage({ type: 'success', text: 'Credits added successfully.' })
      window.history.replaceState({}, '', '/dashboard/credits')
      fetch('/api/credits/status').then((r) => r.json()).then(setStatus).catch(() => {})
    } else if (topup === 'cancelled') {
      setMessage({ type: 'info', text: 'Checkout was cancelled.' })
      window.history.replaceState({}, '', '/dashboard/credits')
    }
  }, [searchParams])

  const handleSetupCredits = async () => {
    setSettingUp(true)
    setMessage(null)
    try {
      const res = await fetch('/api/credits/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Setup failed')
      setMessage({ type: 'success', text: 'Credit account created. Loading your balance…' })
      const statusRes = await fetch('/api/credits/status')
      const statusData = await statusRes.json()
      if (!statusData.error || statusData.status != null) setStatus(statusData as CreditStatus)
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message ?? 'Could not set up credit account.' })
    } finally {
      setSettingUp(false)
    }
  }

  const handleAddCredits = async () => {
    const cents = customAmount.trim() ? Math.round(parseFloat(customAmount) * 100) : topupAmount
    if (!cents || cents < 500 || cents > 10000) {
      setMessage({ type: 'error', text: 'Please choose an amount between $5 and $100.' })
      return
    }
    setCreatingSession(true)
    setMessage(null)
    try {
      const res = await fetch('/api/stripe/create-topup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create checkout')
      if (data.url) window.location.href = data.url
      else throw new Error('No checkout URL returned')
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message ?? 'Something went wrong.' })
      setCreatingSession(false)
    }
  }

  if (authStatus === 'loading' || authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-sam-bg text-sam-text flex items-center justify-center">
        <div className="animate-pulse">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sam-bg text-sam-text p-6 md:p-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/select-vm"
          className="inline-flex items-center gap-2 text-sm text-sam-text/70 hover:text-sam-text mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to workspace
        </Link>

        <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
          <CreditCard className="w-7 h-7" />
          AI Credits
        </h1>
        <p className="text-sam-text/70 mb-8">
          Your Pro plan includes $15/month in AI credits. Add more when you need it.
        </p>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400'
                : message.type === 'error'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-blue-500/10 text-blue-400'
            }`}
          >
            {message.type === 'success' && <CheckCircle className="w-5 h-5 shrink-0" />}
            {message.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse h-40 rounded-xl bg-white/5" />
        ) : status ? (
          <>
            <div className="rounded-xl bg-white/5 border border-white/10 p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sam-text/70">Usage this period</span>
                <span className="font-mono">
                  ${(status.usageCents / 100).toFixed(2)} / ${(status.limitCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-6">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{
                    width: `${status.limitCents ? Math.min(100, (status.usageCents / status.limitCents) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-sam-text/60">Monthly allowance</p>
                  <p className="font-mono">${(status.monthlyAllowanceCents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sam-text/60">Top-up balance</p>
                  <p className="font-mono">${(status.topupBalanceCents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sam-text/60">Remaining</p>
                  <p className="font-mono">
                    {status.limitRemainingCents != null
                      ? `$${(status.limitRemainingCents / 100).toFixed(2)}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sam-text/60">Resets</p>
                  <p className="font-mono">
                    {new Date(status.periodEnd).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    status.status === 'exhausted'
                      ? 'bg-red-500/20 text-red-400'
                      : status.status === 'low'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {status.status === 'exhausted' && <AlertCircle className="w-3.5 h-3.5" />}
                  {status.status === 'low' && <Zap className="w-3.5 h-3.5" />}
                  {status.status === 'active' && <CheckCircle className="w-3.5 h-3.5" />}
                  {status.status === 'exhausted'
                    ? 'Credits exhausted'
                    : status.status === 'low'
                      ? 'Low credits'
                      : 'Active'}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-6">
              <h2 className="font-medium mb-4">Add credits</h2>
              <p className="text-sm text-sam-text/70 mb-4">
                One-time purchase. Credits are added to your account immediately.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {PRESETS.map((p) => (
                  <button
                    key={p.cents}
                    type="button"
                    onClick={() => {
                      setTopupAmount(p.cents)
                      setCustomAmount('')
                    }}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      topupAmount === p.cents && !customAmount
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'border-white/20 hover:border-white/40'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mb-6">
                <span className="inline-flex items-center px-3 border border-white/20 rounded-lg text-sam-text/70">
                  $
                </span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={1}
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/20 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <button
                onClick={handleAddCredits}
                disabled={creatingSession}
                className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingSession ? (
                  'Redirecting to checkout…'
                ) : (
                  <>
                    Add credits
                    {!customAmount && ` ($${(topupAmount / 100).toFixed(2)})`}
                    {customAmount && ` ($${customAmount})`}
                  </>
                )}
              </button>
            </div>
          </>
        ) : (session?.user as any)?.isPro ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
            {settingUp ? (
              <p className="text-sam-text/70">Setting up your credit account…</p>
            ) : (
              <>
                <p className="text-sam-text/70 mb-4">
                  Set up your AI credit account to see your balance and add top-ups. You’ll get
                  $15/month included and can add more anytime.
                </p>
                <button
                  onClick={handleSetupCredits}
                  disabled={settingUp}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
                >
                  Set up credit account
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center">
            <p className="text-sam-text/70 mb-4">
              You need a Pro subscription and a credit account to view or add credits.
            </p>
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-2 text-emerald-400 hover:underline"
            >
              Upgrade to Pro <ArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
