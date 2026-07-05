import { encryptJson, decryptJson } from './crypto'
import type { GarminTokens } from './garmin'

// Persist / read the encrypted Garmin token row. `supabase` is a route client
// (RLS scopes rows to the owner). Server-only (imports crypto).

export async function saveConnection(supabase: any, userId: string, email: string, tokens: GarminTokens) {
  const { error } = await supabase
    .from('garmin_connections')
    .upsert(
      { user_id: userId, garmin_email: email, token_cipher: encryptJson(tokens), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) throw new Error(error.message)
}

export async function loadConnection(
  supabase: any,
  userId: string
): Promise<{ email: string; tokens: GarminTokens } | null> {
  const { data } = await supabase
    .from('garmin_connections')
    .select('garmin_email, token_cipher')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return { email: data.garmin_email, tokens: decryptJson<GarminTokens>(data.token_cipher) }
}

export async function deleteConnection(supabase: any, userId: string) {
  await supabase.from('garmin_connections').delete().eq('user_id', userId)
}
