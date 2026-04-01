import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const catchId = formData.get('catchId') as string

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${session.user.id}/${catchId || crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase.storage
    .from('catch-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('catch-photos')
    .getPublicUrl(data.path)

  return NextResponse.json({ url: publicUrl, path: data.path })
}
