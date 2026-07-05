import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { loadConnection } from '@/lib/garmin/store'
import { garminClient, importFishingActivity } from '@/lib/garmin/garmin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { activityId } = await req.json().catch(() => ({}))
  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

  const conn = await loadConnection(supabase, session.user.id).catch(() => null)
  if (!conn) return NextResponse.json({ error: 'Garmin not connected' }, { status: 409 })

  try {
    const gc = garminClient(conn.tokens)
    const result = await importFishingActivity(gc, Number(activityId))
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to import activity' },
      { status: 502 }
    )
  }
}
