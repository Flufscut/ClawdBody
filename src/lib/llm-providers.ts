/**
 * LLM Provider Detection and Configuration
 * 
 * Auto-detects provider from API key prefix and provides configuration
 * 
 * Built-in providers (per OpenClaw docs): openai, anthropic, google, openrouter, 
 * xai, groq, cerebras, mistral, github-copilot
 */

export interface LLMProvider {
  id: string
  name: string
  envVar: string
  defaultModel: string
  keyPrefix: string[]
  needsModelsProviders: boolean  // Whether it needs models.providers config (vs built-in)
  baseUrl?: string  // Only for providers needing models.providers
}

// Supported LLM providers with auto-detection
// Built-in providers are officially supported by OpenClaw and don't need models.providers config
export const LLM_PROVIDERS: LLMProvider[] = [
  // === BUILT-IN PROVIDERS (officially supported, no models.providers needed) ===
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4',
    keyPrefix: ['sk-ant-'],
    needsModelsProviders: false,  // Built-in
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (100+ models)',
    envVar: 'OPENROUTER_API_KEY',
    defaultModel: 'openrouter/anthropic/claude-3.5-sonnet',  // Reliable default
    keyPrefix: ['sk-or-'],
    needsModelsProviders: false,  // Built-in! (was incorrectly true before)
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'openai/gpt-4o',
    keyPrefix: ['sk-proj-', 'sk-'],  // sk-proj- first (more specific)
    needsModelsProviders: false,  // Built-in
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    envVar: 'GEMINI_API_KEY',
    defaultModel: 'google/gemini-2.0-flash',
    keyPrefix: ['AIza'],
    needsModelsProviders: false,  // Built-in
  },
  {
    id: 'groq',
    name: 'Groq (Fast Inference)',
    envVar: 'GROQ_API_KEY',
    defaultModel: 'groq/llama-3.3-70b-versatile',
    keyPrefix: ['gsk_'],
    needsModelsProviders: false,  // Built-in
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    envVar: 'XAI_API_KEY',
    defaultModel: 'xai/grok-4',
    keyPrefix: ['xai-'],
    needsModelsProviders: false,  // Built-in
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    envVar: 'MISTRAL_API_KEY',
    defaultModel: 'mistral/mistral-large-latest',
    keyPrefix: [''],  // Mistral keys don't have a distinct prefix - detected by elimination
    needsModelsProviders: false,  // Built-in
  },
  // === CUSTOM PROVIDERS (need models.providers config) ===
  // These are not officially built-in but can work via models.providers
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    envVar: 'MOONSHOT_API_KEY',
    defaultModel: 'moonshot/kimi-k2.5',
    keyPrefix: ['sk-'],  // Note: conflicts with OpenAI, detected by context
    needsModelsProviders: true,
    baseUrl: 'https://api.moonshot.ai/v1',
  },
]

/**
 * Get a provider by ID
 */
export function getProviderById(providerId: string): LLMProvider | null {
  return LLM_PROVIDERS.find(p => p.id === providerId) || null
}

/**
 * Check if API key is ambiguous (could match multiple providers)
 * Returns array of possible providers, or empty if key has a unique match
 */
export function getAmbiguousProviders(apiKey: string): LLMProvider[] {
  if (!apiKey || typeof apiKey !== 'string') {
    return []
  }

  const trimmedKey = apiKey.trim()
  
  // Check if it's a generic sk- key (not sk-ant-, sk-or-, sk-proj-)
  if (trimmedKey.startsWith('sk-') && 
      !trimmedKey.startsWith('sk-ant-') && 
      !trimmedKey.startsWith('sk-or-') &&
      !trimmedKey.startsWith('sk-proj-')) {
    // Could be OpenAI or Moonshot
    return LLM_PROVIDERS.filter(p => p.id === 'openai' || p.id === 'moonshot')
  }
  
  return []
}

/**
 * Detect LLM provider from API key prefix
 * Returns null if not detected
 * Note: For ambiguous keys (sk-), call getAmbiguousProviders() first to check
 */
export function detectProvider(apiKey: string): LLMProvider | null {
  if (!apiKey || typeof apiKey !== 'string') {
    return null
  }

  const trimmedKey = apiKey.trim()
  
  // Check providers in order (more specific prefixes first)
  // Anthropic (sk-ant-) must come before OpenAI (sk-)
  // OpenRouter (sk-or-) must come before OpenAI (sk-)
  const orderedProviders = [
    ...LLM_PROVIDERS.filter(p => p.id === 'anthropic'),
    ...LLM_PROVIDERS.filter(p => p.id === 'openrouter'),
    ...LLM_PROVIDERS.filter(p => p.id === 'google'),
    ...LLM_PROVIDERS.filter(p => p.id === 'groq'),
    ...LLM_PROVIDERS.filter(p => p.id === 'xai'),
    // OpenAI last (generic sk- prefix) - but NOT moonshot (user must select explicitly)
    ...LLM_PROVIDERS.filter(p => p.id === 'openai'),
  ]

  for (const provider of orderedProviders) {
    for (const prefix of provider.keyPrefix) {
      if (prefix && trimmedKey.startsWith(prefix)) {
        return provider
      }
    }
  }

  return null
}

/**
 * Get list of supported providers for display
 */
export function getSupportedProvidersText(): string {
  return LLM_PROVIDERS.filter(p => !p.needsModelsProviders).map(p => p.name.split(' ')[0]).join(' • ')
}

/**
 * Get detailed list of key formats for error message
 */
export function getKeyFormatsHelp(): string[] {
  return [
    'sk-or-v1-...  → OpenRouter (100+ models)',
    'sk-ant-...    → Anthropic (Claude)',
    'sk-...        → OpenAI (GPT)',
    'AIza...       → Google (Gemini)',
    'gsk_...       → Groq (fast inference)',
    'xai-...       → xAI (Grok)',
  ]
}

/**
 * Generate Clawdbot config for a provider
 */
export function generateClawdbotConfig(options: {
  provider: LLMProvider
  apiKey: string
  model?: string
  telegramBotToken?: string
  telegramUserId?: string
  gatewayToken: string
  workspace?: string
  heartbeatMinutes?: number
}): string {
  const {
    provider,
    apiKey,
    model,
    telegramBotToken,
    telegramUserId,
    gatewayToken,
    workspace = '/home/user/clawd',
    heartbeatMinutes = 30,
  } = options

  const finalModel = model || provider.defaultModel
  const allowFromJson = telegramUserId ? `"allowFrom": ["${telegramUserId}"],` : ''

  // Build env section
  const envSection: Record<string, string> = {
    [provider.envVar]: apiKey,
  }

  // Build auth profiles
  const authProfiles: Record<string, any> = {
    [`${provider.id}:default`]: {
      provider: provider.id,
      mode: 'api_key',
    },
  }

  // Build models.providers section (only for providers that need it)
  let modelsSection = ''
  if (provider.needsModelsProviders && provider.baseUrl) {
    // Extract just the model ID from the full model path (e.g., "moonshot/kimi-k2.5" -> "kimi-k2.5")
    const modelId = finalModel.startsWith(`${provider.id}/`) 
      ? finalModel.substring(provider.id.length + 1) 
      : finalModel
    
    const modelsProviders: Record<string, any> = {
      [provider.id]: {
        baseUrl: provider.baseUrl,
        apiKey: `\${${provider.envVar}}`,
        api: 'openai-completions',
        models: [
          { id: modelId, name: modelId }
        ]
      },
    }

    modelsSection = `
  "models": {
    "mode": "merge",
    "providers": ${JSON.stringify(modelsProviders, null, 6).replace(/\n/g, '\n    ')}
  },`
  }

  // Build telegram section
  let telegramSection = ''
  if (telegramBotToken) {
    telegramSection = `
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${telegramBotToken}",
      "dmPolicy": "allowlist",
      ${allowFromJson}
      "groupPolicy": "allowlist"
    }
  },`
  }

  const config = `{
  "meta": {
    "lastTouchedVersion": "2026.1.24"
  },
  "env": ${JSON.stringify(envSection, null, 4).replace(/\n/g, '\n  ')},
  "auth": {
    "profiles": ${JSON.stringify(authProfiles, null, 6).replace(/\n/g, '\n    ')}
  },
  "agents": {
    "defaults": {
      "workspace": "${workspace}",
      "model": {
        "primary": "${finalModel}"
      },
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      },
      "heartbeat": {
        "every": "${heartbeatMinutes}m",
        "target": "last",
        "activeHours": { "start": "00:00", "end": "24:00" },
        "includeReasoning": true
      }
    }
  },${modelsSection}
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },${telegramSection}
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${gatewayToken}"
    }
  },
  "plugins": {
    "entries": {
      "telegram": {"enabled": true}
    }
  }
}`

  return config
}
