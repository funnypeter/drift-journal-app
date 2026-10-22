import { NextRequest, NextResponse } from 'next/server'
import { sendLoginCode, verifyLoginCode, signOut } from '@/lib/auth'

// POST { action: 'send', email } | { action: 'verify', email, code } | { action: 'signout' }
export async function POST(req: NextRequest) {
  const { action, email, code } = await req.json().catch(() => ({}))
  try {
    if (action === 'send') await sendLoginCode(String(email || ''))
    else if (action === 'verify') await verifyLoginCode(String(email || ''), String(code || ''))
    else if (action === 'signout') await signOut()
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Sign-in failed' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
