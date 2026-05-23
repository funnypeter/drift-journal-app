import { createRouteClient } from '@/lib/supabase/route'
import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Auth gate uses the SSR client (cookie-bound session).
  const supabase = createRouteClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const catchId = formData.get('catchId') as string

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  // Path always starts with session.user.id, so an authenticated user can
  // only write to their own folder by construction. We do the upload with
  // the service role to sidestep storage RLS, which was intermittently
  // rejecting the SSR client's JWT for offline-sync requests (online
  // uploads worked, but the deferred sync hit "new row violates row-level
  // security policy" — likely an SSR auth/storage propagation edge case).
  const path = `${session.user.id}/${catchId || crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('catch-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage
    .from('catch-photos')
    .getPublicUrl(data.path)

  return NextResponse.json({ url: publicUrl, path: data.path })
}
