import { getSession } from '@/lib/auth'
import { getProfile, updateProfile } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getProfile(session.user.id)
  if (!data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  try {
    return NextResponse.json(await updateProfile(session.user.id, body))
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
