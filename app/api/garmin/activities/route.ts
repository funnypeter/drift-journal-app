import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { loadConnection } from '@/lib/garmin/store'
import { garminClient, listFishingActivities } from '@/lib/garmin/garmin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conn = await loadConnection(supabase, session.user.id).catch(() => null)
  if (!conn) return NextResponse.json({ error: 'Garmin not connected' }, { status: 409 })

  try {
    const gc = garminClient(conn.tokens)
    const activities = await listFishingActivities(gc)
    return NextResponse.json({ activities })
  } catch (err: any) {
    // Token likely expired / revoked — tell the client to reconnect.
    return NextResponse.json(
      { error: 'Garmin session expired — reconnect in Settings', code: 'reconnect' },
      { status: 409 }
    )
  }
}
