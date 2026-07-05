import crypto from 'crypto'

// AES-256-GCM encryption for the Garmin session token at rest. The key is
// derived from a server-only secret: GARMIN_TOKEN_KEY if set (lets you rotate),
// otherwise the Supabase service-role key (always present server-side). Either
// way the material never reaches the client — these helpers are server-only.
function key(): Buffer {
  const secret = process.env.GARMIN_TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('No encryption secret configured (GARMIN_TOKEN_KEY / SUPABASE_SERVICE_ROLE_KEY)')
  return crypto.createHash('sha256').update(secret).digest() // 32 bytes
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv.tag.ciphertext, base64
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

export function decryptJson<T = unknown>(blob: string): T {
  const [ivB64, tagB64, dataB64] = blob.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed token cipher')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return JSON.parse(dec.toString('utf8')) as T
}
