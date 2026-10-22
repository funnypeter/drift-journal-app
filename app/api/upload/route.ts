import { getSession } from '@/lib/auth'
import { putPhoto } from '@/lib/photos'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await getSession()
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

  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '')
  const safeId = (catchId || crypto.randomUUID()).replace(/[^a-z0-9-]/gi, '')
  // Path always starts with session.user.id, so a user can only write to their
  // own folder by construction.
  const path = `${session.user.id}/${safeId}.${ext}`

  try {
    const url = await putPhoto(path, await file.arrayBuffer(), file.type)
    // Same path is reused when a catch's photo is replaced; version the URL so
    // browsers and the edge cache don't keep showing the old one.
    return NextResponse.json({ url: `${url}?v=${Date.now()}`, path })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 })
  }
}
