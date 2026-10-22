import { env } from '@/lib/cf'

// Public photo URLs (formerly the public Supabase `catch-photos` bucket).
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params
  const obj = await env().PHOTOS.get(key.map(decodeURIComponent).join('/'))
  if (!obj) return new Response('Not found', { status: 404 })
  return new Response(obj.body as unknown as BodyInit, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': obj.httpMetadata?.cacheControl || 'public, max-age=86400',
      etag: obj.httpEtag,
    },
  })
}
