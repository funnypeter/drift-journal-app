import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadConnection, saveConnection } from '@/lib/garmin/store'
import { garminClient, importFishingActivity } from '@/lib/garmin/garmin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { activityId } = await req.json().catch(() => ({}))
  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

  const conn = await loadConnection(session.user.id).catch(() => null)
  if (!conn) return NextResponse.json({ error: 'Garmin not connected' }, { status: 409 })

  try {
    const gc = garminClient(conn.tokens)
    const result = await importFishingActivity(gc, Number(activityId))
    if (gc.refreshed) await saveConnection(session.user.id, conn.email, gc.tokens).catch(() => {})
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[garmin/import]', err)
    return NextResponse.json(
      { error: 'Failed to import activity', detail: err?.message || String(err) },
      { status: 502 }
    )
  }
}
