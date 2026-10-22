import { env } from '@/lib/cf'

// Catch photos live in R2 and are served publicly by app/photos/[...key].
export async function putPhoto(key: string, body: ArrayBuffer, contentType: string) {
  await env().PHOTOS.put(key, body, { httpMetadata: { contentType, cacheControl: 'public, max-age=86400' } })
  return `${env().PHOTOS_PUBLIC_URL}/${key}`
}
