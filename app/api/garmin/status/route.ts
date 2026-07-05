import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { loadConnection } from '@/lib/garmin/store'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conn = await loadConnection(supabase, session.user.id).catch(() => null)
  return NextResponse.json({ connected: !!conn, email: conn?.email || null })
}
