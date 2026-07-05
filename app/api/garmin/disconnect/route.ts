import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { deleteConnection } from '@/lib/garmin/store'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteConnection(supabase, session.user.id)
  return NextResponse.json({ connected: false })
}
