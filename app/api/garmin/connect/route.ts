import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { garminLogin } from '@/lib/garmin/garmin'
import { saveConnection } from '@/lib/garmin/store'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  let tokens
  try {
    tokens = await garminLogin(email, password)
  } catch (err: any) {
    // Garmin login can fail for bad credentials or, when run from a datacenter
    // IP, a bot-protection challenge. Surface the reason so it's actionable.
    const msg = err?.message || 'Garmin login failed'
    return NextResponse.json({ error: `Could not connect to Garmin: ${msg}` }, { status: 502 })
  }

  try {
    await saveConnection(supabase, session.user.id, email, tokens)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save connection' }, { status: 500 })
  }

  return NextResponse.json({ connected: true, email })
}
