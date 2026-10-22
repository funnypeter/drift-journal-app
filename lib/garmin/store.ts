import { db } from '@/lib/cf'
import { encryptJson, decryptJson } from './crypto'
import type { GarminTokens } from './garmin'

// Persist / read the encrypted Garmin token row, scoped to the owner.
// Server-only (imports crypto).

export async function saveConnection(userId: string, email: string, tokens: GarminTokens) {
  await db()
    .prepare(
      `insert into garmin_connections (user_id, garmin_email, token_cipher) values (?, ?, ?)
       on conflict(user_id) do update set garmin_email = excluded.garmin_email,
         token_cipher = excluded.token_cipher, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    )
    .bind(userId, email, encryptJson(tokens))
    .run()
}

export async function loadConnection(userId: string): Promise<{ email: string; tokens: GarminTokens } | null> {
  const data = await db()
    .prepare('select garmin_email, token_cipher from garmin_connections where user_id = ?')
    .bind(userId)
    .first<{ garmin_email: string; token_cipher: string }>()
  if (!data) return null
  return { email: data.garmin_email, tokens: decryptJson<GarminTokens>(data.token_cipher) }
}

export async function deleteConnection(userId: string) {
  await db().prepare('delete from garmin_connections where user_id = ?').bind(userId).run()
}
