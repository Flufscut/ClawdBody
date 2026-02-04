/**
 * Encryption utility for sensitive data (API keys, credentials, user data)
 * Uses AES-256-GCM for authenticated encryption
 * 
 * Two separate keys are used:
 * - ENCRYPTION_KEY: For API keys and credentials
 * - USER_DATA_ENCRYPTION_KEY: For user PII (emails, etc.)
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const ENCRYPTION_PREFIX = 'enc:v1:' // Prefix to identify encrypted values
const USER_ENCRYPTION_PREFIX = 'uenc:v1:' // Prefix for user data encryption

/**
 * Get the encryption key from environment variable
 * Key must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  
  if (!key) {
    // In development, use a default key (NOT for production!)
    const nodeEnv = process.env.NODE_ENV as string
    if (nodeEnv === 'development') {
      return crypto.createHash('sha256').update('dev-key-not-for-production').digest()
    }
    throw new Error('ENCRYPTION_KEY environment variable is required')
  }
  
  // If key is base64 encoded (recommended for binary keys)
  if (key.length === 44 && key.endsWith('=')) {
    return Buffer.from(key, 'base64')
  }
  
  // Otherwise, derive a 256-bit key from the provided string
  return crypto.createHash('sha256').update(key).digest()
}

/**
 * Get the user data encryption key from environment variable
 * Separate key for user PII (emails, etc.)
 */
function getUserDataEncryptionKey(): Buffer {
  const key = process.env.USER_DATA_ENCRYPTION_KEY
  
  if (!key) {
    // In development, use a default key (NOT for production!)
    const nodeEnv = process.env.NODE_ENV as string
    if (nodeEnv === 'development') {
      return crypto.createHash('sha256').update('dev-user-key-not-for-production').digest()
    }
    throw new Error('USER_DATA_ENCRYPTION_KEY environment variable is required')
  }
  
  // If key is base64 encoded (recommended for binary keys)
  if (key.length === 44 && key.endsWith('=')) {
    return Buffer.from(key, 'base64')
  }
  
  // Otherwise, derive a 256-bit key from the provided string
  return crypto.createHash('sha256').update(key).digest()
}

/**
 * Encrypt a string value
 * Returns the encrypted value with format: enc:v1:iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  
  // Don't double-encrypt
  if (isEncrypted(plaintext)) {
    return plaintext
  }
  
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  const authTag = cipher.getAuthTag()
  
  // Format: prefix + iv + authTag + ciphertext (all base64)
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt an encrypted string value
 * Accepts format: enc:v1:iv:authTag:ciphertext
 */
export function decrypt(encryptedValue: string): string {
  if (!encryptedValue) return encryptedValue
  
  // If not encrypted, return as-is (for backward compatibility)
  if (!isEncrypted(encryptedValue)) {
    return encryptedValue
  }
  
  const key = getEncryptionKey()
  
  // Remove prefix and split parts
  const withoutPrefix = encryptedValue.slice(ENCRYPTION_PREFIX.length)
  const parts = withoutPrefix.split(':')
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format')
  }
  
  const [ivBase64, authTagBase64, ciphertext] = parts
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * Check if a value is already encrypted (API keys)
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTION_PREFIX) ?? false
}

/**
 * Check if a value is already encrypted (user data)
 */
export function isUserDataEncrypted(value: string): boolean {
  return value?.startsWith(USER_ENCRYPTION_PREFIX) ?? false
}

/**
 * Encrypt user data (emails, etc.) using USER_DATA_ENCRYPTION_KEY
 */
export function encryptUserData(plaintext: string): string {
  if (!plaintext) return plaintext
  
  // Don't double-encrypt
  if (isUserDataEncrypted(plaintext)) {
    return plaintext
  }
  
  const key = getUserDataEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  const authTag = cipher.getAuthTag()
  
  // Format: prefix + iv + authTag + ciphertext (all base64)
  return `${USER_ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt user data (emails, etc.) using USER_DATA_ENCRYPTION_KEY
 */
export function decryptUserData(encryptedValue: string): string {
  if (!encryptedValue) return encryptedValue
  
  // If not encrypted, return as-is (for backward compatibility)
  if (!isUserDataEncrypted(encryptedValue)) {
    return encryptedValue
  }
  
  const key = getUserDataEncryptionKey()
  
  // Remove prefix and split parts
  const withoutPrefix = encryptedValue.slice(USER_ENCRYPTION_PREFIX.length)
  const parts = withoutPrefix.split(':')
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted user data format')
  }
  
  const [ivBase64, authTagBase64, ciphertext] = parts
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * Encrypt an object's specified fields
 */
export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj }
  
  for (const field of fields) {
    const value = result[field]
    if (typeof value === 'string' && value) {
      result[field] = encrypt(value) as T[keyof T]
    }
  }
  
  return result
}

/**
 * Decrypt an object's specified fields
 */
export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj }
  
  for (const field of fields) {
    const value = result[field]
    if (typeof value === 'string' && value) {
      try {
        result[field] = decrypt(value) as T[keyof T]
      } catch (error) {
        // Keep original value if decryption fails (might not be encrypted)
      }
    }
  }
  
  return result
}

/**
 * List of sensitive fields in SetupState that should be encrypted
 */
export const SETUP_STATE_SENSITIVE_FIELDS = [
  'llmApiKey',
  'orgoApiKey',
  'awsAccessKeyId',
  'awsSecretAccessKey',
  'e2bApiKey',
  'awsPrivateKey',
] as const

/**
 * List of sensitive fields in VM that should be encrypted
 */
export const VM_SENSITIVE_FIELDS = [
  'awsPrivateKey',
] as const

/**
 * List of sensitive fields in User that should be encrypted
 */
export const USER_SENSITIVE_FIELDS = [
  'email',
] as const

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and save the output to ENCRYPTION_KEY env var
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64')
}
