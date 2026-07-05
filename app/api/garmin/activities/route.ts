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
    console.error('[garmin/activities]', err)
    const detail = err?.message || String(err)
    // 401 from Garmin means the stored session is no longer valid → reconnect.
    const isAuth = /401|unauthor/i.test(detail)
    return NextResponse.json(
      {
        error: isAuth ? 'Garmin session expired — reconnect in Settings' : 'Could not load Garmin activities',
        detail,
        code: isAuth ? 'reconnect' : undefined,
      },
      { status: isAuth ? 409 : 502 }
    )
  }
}
