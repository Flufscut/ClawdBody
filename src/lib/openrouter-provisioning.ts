/**
 * OpenRouter Provisioning API – key info and limit updates.
 * Uses OPENROUTER_PROVISIONING_KEY (from OpenRouter settings → Provisioning API Keys).
 */

const OPENROUTER_KEYS_BASE = 'https://openrouter.ai/api/v1/keys'
const PROVISIONING_KEY = process.env.OPENROUTER_PROVISIONING_KEY

export interface OpenRouterKeyInfo {
  hash: string
  limit: number | null
  limit_remaining: number | null
  limit_reset: string | null
  usage: number
  usage_daily: number
  usage_weekly: number
  usage_monthly: number
  disabled: boolean
  label?: string
  name?: string
}

async function provisionRequest<T>(
  method: string,
  path: string,
  body?: object
): Promise<T> {
  if (!PROVISIONING_KEY) {
    throw new Error('OPENROUTER_PROVISIONING_KEY is not set')
  }
  const url = path.startsWith('http') ? path : `${OPENROUTER_KEYS_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${PROVISIONING_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body && { body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter provisioning API error ${res.status}: ${text}`)
  }
  const json = await res.json()
  return json as T
}

/**
 * Get key info (usage, limit, limit_remaining) by key hash.
 * Uses the Provisioning API GET /api/v1/keys/:hash
 */
export async function getOpenRouterKeyInfo(hash: string): Promise<OpenRouterKeyInfo> {
  const raw = await provisionRequest<{ data?: OpenRouterKeyInfo } | OpenRouterKeyInfo>(`GET`, `/${encodeURIComponent(hash)}`)
  const data = (raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: OpenRouterKeyInfo }).data : raw) as OpenRouterKeyInfo
  return {
    hash: data.hash,
    limit: data.limit ?? null,
    limit_remaining: data.limit_remaining ?? null,
    limit_reset: data.limit_reset ?? null,
    usage: data.usage ?? 0,
    usage_daily: data.usage_daily ?? 0,
    usage_weekly: data.usage_weekly ?? 0,
    usage_monthly: data.usage_monthly ?? 0,
    disabled: data.disabled ?? false,
    label: data.label,
    name: data.name,
  }
}

/**
 * Update the spending limit for a key (cumulative cap in USD).
 * OpenRouter's limit is a cap: new limit = current usage + additional allowance.
 */
export async function updateOpenRouterKeyLimit(hash: string, limitUsd: number): Promise<OpenRouterKeyInfo> {
  const raw = await provisionRequest<{ data?: OpenRouterKeyInfo } | OpenRouterKeyInfo>(`PATCH`, `/${encodeURIComponent(hash)}`, {
    limit: limitUsd,
  })
  const data = (raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: OpenRouterKeyInfo }).data : raw) as OpenRouterKeyInfo
  return {
    hash: data.hash,
    limit: data.limit ?? null,
    limit_remaining: data.limit_remaining ?? null,
    limit_reset: data.limit_reset ?? null,
    usage: data.usage ?? 0,
    usage_daily: data.usage_daily ?? 0,
    usage_weekly: data.usage_weekly ?? 0,
    usage_monthly: data.usage_monthly ?? 0,
    disabled: data.disabled ?? false,
    label: data.label,
    name: data.name,
  }
}

/**
 * Create a new API key with an initial limit (e.g. $15 for monthly allowance).
 * Returns the key info including the secret key string (only returned once).
 */
export interface CreateKeyResult extends OpenRouterKeyInfo {
  key?: string // Present only on create; store encrypted and never log.
}

/** Create key response: { data: { hash, ... }, key: "sk-or-v1-..." } */
interface CreateKeyResponse {
  data?: { hash: string; limit?: number; limit_remaining?: number; [k: string]: unknown }
  key?: string
}

export async function createOpenRouterKey(params: {
  name: string
  limitUsd: number
  limitReset?: 'monthly' | 'daily' | 'weekly' | null
}): Promise<CreateKeyResult> {
  const raw = await provisionRequest<CreateKeyResponse>('POST', '', {
    name: params.name,
    limit: params.limitUsd,
    limit_reset: params.limitReset ?? undefined,
  })
  const keySecret = raw.key
  const keyData = raw.data
  const hash = keyData?.hash
  return {
    hash: hash ?? '',
    limit: keyData?.limit ?? params.limitUsd,
    limit_remaining: keyData?.limit_remaining ?? params.limitUsd,
    limit_reset: null,
    usage: 0,
    usage_daily: 0,
    usage_weekly: 0,
    usage_monthly: 0,
    disabled: false,
    ...keyData,
    key: keySecret,
  }
}
