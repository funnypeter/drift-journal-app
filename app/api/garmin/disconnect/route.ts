import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { deleteConnection } from '@/lib/garmin/store'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteConnection(session.user.id)
  return NextResponse.json({ connected: false })
}
