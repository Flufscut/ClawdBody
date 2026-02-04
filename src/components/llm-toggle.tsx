'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Key, Info, ExternalLink } from 'lucide-react'

interface LLMToggleProps {
  hasOwnKey: boolean
  onToggle: (useManaged: boolean) => void
  onAddKey: () => void
  defaultUseManaged?: boolean
}

/**
 * Toggle component for Bucket B legacy users to choose between
 * managed LLM (pay-per-use) or adding their own API key
 */
export function LLMToggle({
  hasOwnKey,
  onToggle,
  onAddKey,
  defaultUseManaged = true,
}: LLMToggleProps) {
  const [useManaged, setUseManaged] = useState(defaultUseManaged && !hasOwnKey)

  const handleToggle = (value: boolean) => {
    setUseManaged(value)
    onToggle(value)
  }

  return (
    <div className="p-4 rounded-xl border border-sam-border bg-sam-surface/50">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-blue-400" />
        <h4 className="font-medium text-sam-text text-sm">LLM Provider</h4>
      </div>

      <div className="space-y-2">
        {/* Managed LLM option */}
        <button
          onClick={() => handleToggle(true)}
          className={`w-full p-3 rounded-lg border text-left transition-all ${
            useManaged
              ? 'border-blue-500/50 bg-blue-500/10'
              : 'border-sam-border hover:border-blue-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                useManaged ? 'border-blue-400' : 'border-sam-text-dim'
              }`}>
                {useManaged && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2 h-2 rounded-full bg-blue-400"
                  />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${useManaged ? 'text-blue-400' : 'text-sam-text'}`}>
                  Use Managed LLM
                </p>
                <p className="text-xs text-sam-text-dim">
                  Claude via ClawdBody (pay per use)
                </p>
              </div>
            </div>
            <span className="text-xs text-blue-400 font-mono">
              ~$0.003/1K tokens
            </span>
          </div>
        </button>

        {/* Own key option */}
        <button
          onClick={() => hasOwnKey ? handleToggle(false) : onAddKey()}
          className={`w-full p-3 rounded-lg border text-left transition-all ${
            !useManaged && hasOwnKey
              ? 'border-green-500/50 bg-green-500/10'
              : 'border-sam-border hover:border-green-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                !useManaged && hasOwnKey ? 'border-green-400' : 'border-sam-text-dim'
              }`}>
                {!useManaged && hasOwnKey && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2 h-2 rounded-full bg-green-400"
                  />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${!useManaged && hasOwnKey ? 'text-green-400' : 'text-sam-text'}`}>
                  Use Your Own Key
                </p>
                <p className="text-xs text-sam-text-dim">
                  {hasOwnKey ? 'Your Anthropic API key' : 'Add your API key'}
                </p>
              </div>
            </div>
            {hasOwnKey ? (
              <span className="text-xs text-green-400 font-mono">
                Connected
              </span>
            ) : (
              <span className="text-xs text-sam-accent flex items-center gap-1">
                Add key <Key className="w-3 h-3" />
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Info note */}
      <div className="mt-3 flex items-start gap-2 text-xs text-sam-text-dim">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <p>
          {useManaged 
            ? 'Managed LLM charges are billed monthly based on token usage. View pricing in billing.'
            : hasOwnKey
            ? 'Using your own API key means you pay Anthropic directly. No ClawdBody charges for LLM usage.'
            : 'Add your Anthropic API key to avoid per-use LLM charges.'}
        </p>
      </div>
    </div>
  )
}

/**
 * Inline version for compact spaces
 */
export function LLMToggleInline({
  useManaged,
  onToggle,
  hasOwnKey,
}: {
  useManaged: boolean
  onToggle: (value: boolean) => void
  hasOwnKey: boolean
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-sam-bg/50">
      <span className="text-xs text-sam-text-dim">LLM:</span>
      <div className="flex items-center bg-sam-surface rounded-lg p-0.5">
        <button
          onClick={() => onToggle(true)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            useManaged
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-sam-text-dim hover:text-sam-text'
          }`}
        >
          Managed
        </button>
        <button
          onClick={() => hasOwnKey && onToggle(false)}
          disabled={!hasOwnKey}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            !useManaged && hasOwnKey
              ? 'bg-green-500/20 text-green-400'
              : hasOwnKey
              ? 'text-sam-text-dim hover:text-sam-text'
              : 'text-sam-text-dim/50 cursor-not-allowed'
          }`}
        >
          Own Key
        </button>
      </div>
      {useManaged && (
        <span className="text-xs text-blue-400">
          Pay per use
        </span>
      )}
    </div>
  )
}
