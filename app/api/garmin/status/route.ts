import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadConnection } from '@/lib/garmin/store'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conn = await loadConnection(session.user.id).catch(() => null)
  return NextResponse.json({ connected: !!conn, email: conn?.email || null })
}
