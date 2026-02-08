'use client'

import { signIn } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Github, ArrowRight, Sparkles, Check, Users } from 'lucide-react'
import Script from 'next/script'
import Link from 'next/link'

// Typewriter phrases - simple, high-impact
const TYPEWRITER_PHRASES = [
  'Deploy AI agents on cloud computers',
  'Create AI employees that make money for you',
  'Build your personal AI assistant',
  'Automate your entire email inbox',
  'Run a 24/7 AI sales rep for your business',
  'Launch an AI customer support agent',
  'Orchestrate hundreds of agents at once',
  'Build AI workflows that run while you sleep',
  'Run AI on any cloud, any hardware',
  'Automate lead generation & outreach',
]

// Template cards
const TEMPLATES = [
  {
    id: 'assistant',
    emoji: '🤖',
    title: 'Personal Assistant',
    description: 'Email, calendar, tasks',
  },
  {
    id: 'sales',
    emoji: '💰',
    title: 'Sales Rep',
    description: 'Outreach, follow-ups, CRM',
  },
  {
    id: 'support',
    emoji: '🎧',
    title: 'Customer Support',
    description: 'Tickets, responses, escalation',
  },
  {
    id: 'social',
    emoji: '📱',
    title: 'Social Media',
    description: 'Content, scheduling, posting',
  },
  {
    id: 'research',
    emoji: '🔬',
    title: 'Researcher',
    description: 'Web research, summaries, reports',
  },
  {
    id: 'ops',
    emoji: '⚙️',
    title: 'Business Ops',
    description: 'Workflows, data, automation',
  },
]

// Discord Icon SVG (official logo shape)
const DiscordIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
)

// Google Icon SVG Component
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

// Typewriter hook
function useTypewriter(phrases: string[], typingSpeed = 50, deletingSpeed = 30, pauseDuration = 2000) {
  const [displayText, setDisplayText] = useState('')
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex]

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentPhrase.length) {
          setDisplayText(currentPhrase.slice(0, displayText.length + 1))
        } else {
          setTimeout(() => setIsDeleting(true), pauseDuration)
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1))
        } else {
          setIsDeleting(false)
          setPhraseIndex((prev) => (prev + 1) % phrases.length)
        }
      }
    }, isDeleting ? deletingSpeed : typingSpeed)

    return () => clearTimeout(timeout)
  }, [displayText, isDeleting, phraseIndex, phrases, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

export function LandingPage() {
  const [phase, setPhase] = useState<'input' | 'ready'>('input')
  const [inputValue, setInputValue] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [userCount, setUserCount] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typewriterText = useTypewriter(TYPEWRITER_PHRASES, 45, 25, 1800)

  useEffect(() => {
    fetch('/api/user-count')
      .then((res) => res.json())
      .then((data) => setUserCount(data.count || 0))
      .catch(() => { })
  }, [])

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() && !selectedTemplate) return
    setPhase('ready')
  }, [inputValue, selectedTemplate])

  const handleTemplateClick = (template: typeof TEMPLATES[0]) => {
    setSelectedTemplate(template.id)
    setInputValue(template.title + ' — ' + template.description)
    // Small delay so user sees the selection, then auto-submit
    setTimeout(() => {
      setPhase('ready')
    }, 400)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleClaimEmployee = () => {
    signIn('google')
  }

  return (
    <div className="landing-page-container min-h-screen relative overflow-hidden bg-transparent">
      <div className="landing-nebula" />
      <div className="landing-stars" />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 sm:px-10 pt-6 sm:pt-8">
        <div className="flex items-center gap-3">
          <img
            src="/logos/ClawdBody.png"
            alt="ClawdBody"
            className="h-7 sm:h-8 object-contain"
          />
          <span className="text-lg sm:text-xl font-semibold tracking-tight text-white/90">
            ClawdBody
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://discord.gg/u6nn9r4Cy5"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-all"
          >
            <DiscordIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Community</span>
          </a>
          <a
            href="https://github.com/Prakshal-Jain/ClawdBody"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 text-[13px] text-white/80 hover:bg-white/10 hover:text-white transition-all"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-6 sm:pt-8 pb-16">
        <AnimatePresence mode="wait">
          {phase === 'input' ? (
            <motion.div
              key="input-phase"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.98 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-3xl mx-auto flex flex-col items-center"
            >
              {/* Hero: one clear headline */}
              <motion.h1
                className="text-[26px] sm:text-[32px] md:text-[40px] font-semibold text-center text-white tracking-tight leading-[1.15] max-w-2xl mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                1-Click deployment of AI agents on cloud computers & GPUs. Individuals and Enterprise.
              </motion.h1>

              {/* Typewriter */}
              <motion.div
                className="h-7 flex items-center justify-center mb-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.5 }}
              >
                <span className="text-[15px] text-white/50 font-normal">
                  {typewriterText}
                </span>
                <span className="inline-block w-[2px] h-4 bg-white/40 ml-0.5 animate-pulse rounded-full" />
              </motion.div>

              {/* Input area */}
              <motion.div
                className="w-full relative group"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <div className="absolute -inset-px bg-white/10 rounded-[20px] opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
                <div className="relative bg-white/[0.03] border border-white/[0.06] rounded-[20px] overflow-hidden">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="What will your AI employee do?"
                    rows={3}
                    className="w-full bg-transparent text-white placeholder-white/35 text-[17px] leading-relaxed px-5 pt-5 pb-2 resize-none focus:outline-none"
                  />
                  <div className="flex items-center justify-between px-4 pb-4">
                    <span className="text-[13px] text-white/40 group-focus-within:text-white/55">
                      Press Enter to submit
                    </span>
                    <button
                      onClick={handleSubmit}
                      disabled={!inputValue.trim() && !selectedTemplate}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[15px] font-medium hover:bg-white/95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Sparkles className="w-4 h-4" />
                      Create Employee
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Template cards */}
              <motion.div
                className="w-full mt-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.5 }}
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40 mb-5 text-center">
                  Or start with a template
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {TEMPLATES.map((template, index) => (
                    <motion.button
                      key={template.id}
                      onClick={() => handleTemplateClick(template)}
                      className={`group relative flex flex-col items-center gap-2.5 px-4 py-4 rounded-2xl border text-center transition-all duration-200 ${selectedTemplate === template.id
                        ? 'bg-white/10 border-white/20 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] text-white/70 hover:text-white'
                        }`}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 + index * 0.05, duration: 0.3 }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="text-2xl">{template.emoji}</span>
                      <span className="text-[13px] font-medium leading-snug">{template.title}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Quick sign-in + user count */}
              <motion.div
                className="mt-12 flex flex-col items-center gap-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.85, duration: 0.5 }}
              >
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 max-w-12 bg-white/10" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">or</span>
                  <div className="h-px flex-1 max-w-12 bg-white/10" />
                </div>
                <motion.button
                  onClick={() => signIn('google')}
                  className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-white text-black text-[15px] font-medium hover:bg-white/95 active:scale-[0.98] transition-all"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <GoogleIcon className="w-4 h-4" />
                  Sign in with Google
                </motion.button>

                <motion.div
                  className="flex items-center gap-2 text-[15px] text-white/50"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2, duration: 0.4 }}
                >
                  <Users className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span>
                    Trusted by <span className="font-medium text-white/70">{userCount.toLocaleString()}</span> users
                  </span>
                </motion.div>
              </motion.div>

              {/* Value props strip */}
              <motion.div
                className="mt-16 w-full max-w-2xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.5 }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                  {[
                    { label: 'Runs 24/7', detail: 'On cloud computers' },
                    { label: 'Your data', detail: 'Stays on your instance' },
                    { label: 'Open source', detail: 'Full transparency' },
                    { label: 'Any scale', detail: 'One agent or hundreds' },
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span className="text-[13px] font-medium text-white/80">{item.label}</span>
                      <span className="text-[11px] text-white/40">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Tweets */}
              <motion.div
                className="mt-14 w-full"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3, duration: 0.6 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[800px] mx-auto">
                  <div className="min-h-[300px]">
                    <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
                      <p lang="en" dir="ltr">
                        Install Clawd Bot automatically with this script.<br />
                        No need to spend $799 on Mac Mini!<br /><br />
                        Don&apos;t spend hours setting it up.<br /><br />
                        Let it run 24/7 on Orgo VM automating your life.{' '}
                        <a href="https://t.co/TNhKMqL69n">pic.twitter.com/TNhKMqL69n</a>
                      </p>
                      &mdash; Prakshal Jain (@prakshaljain_){' '}
                      <a href="https://twitter.com/prakshaljain_/status/2014931950105231653?ref_src=twsrc%5Etfw">
                        January 24, 2026
                      </a>
                    </blockquote>
                  </div>

                  <div className="min-h-[300px]">
                    <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
                      <p lang="en" dir="ltr">
                        No one knows how to make money with Clawdbot (moltbot/openclaw)<br /><br />
                        Now it&apos;s easier than ever.{' '}
                        <a href="https://t.co/K19fpRAHEw">pic.twitter.com/K19fpRAHEw</a>
                      </p>
                      &mdash; nick vasilescu (@nickvasiles){' '}
                      <a href="https://twitter.com/nickvasiles/status/2018450077019513159?ref_src=twsrc%5Etfw">
                        February 2, 2026
                      </a>
                    </blockquote>
                  </div>

                  <div className="min-h-[300px]">
                    <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
                      <p lang="en" dir="ltr">
                        Set up 100s of Clawd bots without touching the terminal. <br /><br />
                        You can now do it in just a few clicks.<br /><br />
                        I am adding them all to a groupchat.<br /><br />
                        Maybe they can start a company by working together?{' '}
                        <a href="https://t.co/8kAaT49iB6">pic.twitter.com/8kAaT49iB6</a>
                      </p>
                      &mdash; nick vasilescu (@nickvasiles){' '}
                      <a href="https://twitter.com/nickvasiles/status/2016374181160747259?ref_src=twsrc%5Etfw">
                        January 28, 2026
                      </a>
                    </blockquote>
                  </div>

                  <div className="min-h-[300px]">
                    <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
                      <p lang="en" dir="ltr">
                        Moltbook isn&apos;t a social media platform.<br /><br />
                        It&apos;s the first large scale experiment where agents can teach other agents how to do things.<br /><br />
                        They can collaborate on tasks, and provide new tools and information to one another. <br /><br />
                        This is both the most dangerous and exciting moment since&hellip;{' '}
                        <a href="https://t.co/kNtrFedB0Z">pic.twitter.com/kNtrFedB0Z</a>
                      </p>
                      &mdash; nick vasilescu (@nickvasiles){' '}
                      <a href="https://twitter.com/nickvasiles/status/2018161067852210532?ref_src=twsrc%5Etfw">
                        February 2, 2026
                      </a>
                    </blockquote>
                  </div>
                </div>

                <Script
                  src="https://platform.twitter.com/widgets.js"
                  strategy="lazyOnload"
                  charSet="utf-8"
                />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="ready-phase"
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-lg mx-auto flex flex-col items-center text-center"
            >
              {/* Success animation */}
              <motion.div
                className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500/20 to-teal-500/20 border border-white/10 flex items-center justify-center mb-8"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, type: 'spring', stiffness: 200 }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.3, type: 'spring' }}
                >
                  <Check className="w-10 h-10 text-emerald-400" strokeWidth={2.5} />
                </motion.div>
              </motion.div>

              <motion.h2
                className="text-[28px] sm:text-[34px] font-semibold text-white tracking-tight leading-tight mb-3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                Your AI Employee is Ready
              </motion.h2>

              <motion.button
                onClick={handleClaimEmployee}
                className="group flex items-center gap-3 px-8 py-4 rounded-full bg-white text-black text-[17px] font-semibold hover:bg-white/95 active:scale-[0.98] transition-all"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                whileHover={{ scale: 1.01 }}
              >
                <GoogleIcon className="w-5 h-5" />
                Claim Your Employee
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </motion.button>

              <motion.p
                className="text-[13px] text-white/45 mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.4 }}
              >
                Sign in with Google to deploy your AI employee
              </motion.p>

              {/* Back button */}
              <motion.button
                onClick={() => setPhase('input')}
                className="mt-8 text-[13px] text-white/45 hover:text-white/70 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1, duration: 0.4 }}
              >
                ← Start over
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 sm:px-10 pb-8 pt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/[0.06]">
          <p className="text-[12px] text-white/35">
            © {new Date().getFullYear()} ClawdBody. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">
              Terms
            </Link>
            <a href="https://discord.gg/u6nn9r4Cy5" target="_blank" rel="noopener noreferrer" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">
              Discord
            </a>
            <a href="https://github.com/Prakshal-Jain/ClawdBody" target="_blank" rel="noopener noreferrer" className="text-[12px] text-white/40 hover:text-white/60 transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
