import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

// Cloudflare bindings (see wrangler.jsonc). Server-only.
export interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  EMAIL: { send(message: {
    to: string
    from: string | { email: string; name?: string }
    subject: string
    html?: string
    text?: string
  }): Promise<unknown> }
  NEXT_PUBLIC_APP_URL: string
  PHOTOS_PUBLIC_URL: string
  EMAIL_FROM: string
}

export function env(): Env {
  return getCloudflareContext().env as unknown as Env
}

export const db = () => env().DB
