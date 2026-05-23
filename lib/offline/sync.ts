import { compressForIdentify } from '@/lib/imageUtils'
import {
  deleteTripCascade,
  getCatchesForTrip,
  getPendingTrips,
  getPhoto,
  updateCatch,
  updateTrip,
} from './queueClient'
import type { PendingCatch, PendingTrip } from './db'

export const AUTH_EXPIRED_EVENT = 'drift-offline-auth-expired'
export const SYNC_COMPLETE_EVENT = 'drift-offline-sync-complete'

let running = false

class AuthExpiredError extends Error {
  constructor() { super('auth expired') }
}

async function jsonFetch(url: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(url, { ...init, credentials: 'same-origin' })
  if (r.status === 401) throw new AuthExpiredError()
  return r
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let s = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

async function syncCatchPhoto(c: PendingCatch): Promise<string | null> {
  if (c.serverPhotoUrl) return c.serverPhotoUrl
  if (!c.photoId) return null
  const photo = await getPhoto(c.photoId)
  if (!photo) return null
  const ext = (photo.mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const file = new File([photo.blob], `photo.${ext}`, { type: photo.mimeType })
  const fd = new FormData()
  fd.append('file', file)
  fd.append('catchId', c.id)
  const resp = await jsonFetch('/api/upload', { method: 'POST', body: fd })
  if (!resp.ok) {
    // Pull the server-side reason so the user-visible lastError tells us
    // what Supabase actually rejected (mime, size, bucket, RLS) instead of
    // just the HTTP code.
    let detail = ''
    try {
      const body = await resp.json()
      detail = body?.error ? `: ${body.error}` : ''
    } catch { /* non-JSON body */ }
    throw new Error(`upload failed (${resp.status}) [size=${photo.blob.size} type=${photo.mimeType}]${detail}`)
  }
  const data = await resp.json()
  c.serverPhotoUrl = data.url ?? null
  await updateCatch(c)
  return c.serverPhotoUrl ?? null
}

async function syncCatch(c: PendingCatch, tripId: string): Promise<PendingCatch> {
  const photoUrl = await syncCatchPhoto(c)

  const upResp = await jsonFetch('/api/catches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: c.id,
      trip_id: tripId,
      species: c.species || 'Unknown',
      length: c.length || null,
      fly: c.fly || null,
      fly_category: c.fly_category,
      fly_size: c.fly_size,
      time_caught: c.time_caught || null,
      date: c.date,
      notes: c.notes,
      photo_url: photoUrl,
      sort_order: c.sort_order,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
    }),
  })
  if (!upResp.ok) throw new Error(`catch upsert failed (${upResp.status})`)

  if (c.needs_identify && c.photoId) {
    const photo = await getPhoto(c.photoId)
    if (photo) {
      try {
        const compressed = await compressForIdentify(
          new File([photo.blob], 'photo.jpg', { type: photo.mimeType }),
          1200,
          0.7
        )
        const idResp = await jsonFetch('/api/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: compressed.base64, mimeType: compressed.mimeType }),
        })
        if (idResp.ok) {
          const result = await idResp.json()
          if (result.species && result.kind !== 'flower') {
            await jsonFetch('/api/catches', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: c.id,
                species: result.species,
                length: result.length ? parseFloat(result.length) : c.length,
              }),
            })
          }
        }
      } catch {
        // Identify is best-effort; don't block the rest of the trip.
      }
      c.needs_identify = false
      await updateCatch(c)
    }
  }

  c.syncState = 'synced'
  await updateCatch(c)
  return c
}

async function syncConditions(trip: PendingTrip): Promise<void> {
  if (!trip.lat || !trip.lng) return
  const params = new URLSearchParams({
    type: 'usgs',
    location: trip.location,
    lat: String(trip.lat),
    lng: String(trip.lng),
    date: trip.date,
  })
  const usgs = await jsonFetch(`/api/conditions?${params}`).then(r => r.ok ? r.json() : null).catch(() => null)
  const weather = await jsonFetch(
    `/api/conditions?type=weather&lat=${trip.lat}&lng=${trip.lng}&date=${trip.date}`
  ).then(r => r.ok ? r.json() : null).catch(() => null)

  const patch: Record<string, any> = {}
  if (usgs && !usgs.error) {
    if (usgs.flow) patch.flow = usgs.flow
    if (usgs.waterTemp) patch.water_temp = usgs.waterTemp
    if (usgs.gaugeHeight) patch.gauge_height = usgs.gaugeHeight
    if (usgs.siteId) patch.usgs_site_id = usgs.siteId
  }
  if (weather && !weather.error) {
    if (weather.airTemp) patch.air_temp = weather.airTemp
    if (weather.weather) patch.weather = weather.weather
    if (weather.baro) patch.baro = weather.baro
    if (weather.wind) patch.wind = weather.wind
  }
  if (Object.keys(patch).length === 0) return
  await jsonFetch(`/api/trips/${trip.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

async function syncTrip(trip: PendingTrip): Promise<void> {
  trip.syncState = 'syncing'
  trip.lastError = undefined
  await updateTrip(trip)

  const tripBody: Record<string, any> = {
    id: trip.id,
    title: trip.title,
    date: trip.date,
    location: trip.location,
    state: trip.state,
    lat: trip.lat,
    lng: trip.lng,
    notes: trip.notes,
    bg_color: trip.bg_color,
    usgs_site_id: trip.usgs_site_id,
    flow: trip.flow,
    water_temp: trip.water_temp,
    gauge_height: trip.gauge_height,
    air_temp: trip.air_temp,
    baro: trip.baro,
    weather: trip.weather,
    wind: trip.wind,
    moon: trip.moon,
  }
  const tripResp = await jsonFetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripBody),
  })
  if (!tripResp.ok) throw new Error(`trip upsert failed (${tripResp.status})`)

  const catches = await getCatchesForTrip(trip.id)
  for (const c of catches) {
    if (c.syncState !== 'synced') {
      await syncCatch(c, trip.id)
    }
  }

  const heroCatch = trip.heroCatchId
    ? catches.find(c => c.id === trip.heroCatchId)
    : catches.find(c => c.serverPhotoUrl)
  const heroUrl = heroCatch?.serverPhotoUrl || catches.find(c => c.serverPhotoUrl)?.serverPhotoUrl || null
  if (heroUrl) {
    await jsonFetch(`/api/trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_photo_url: heroUrl }),
    })
  }

  if (trip.needs_geocode && trip.lat != null && trip.lng != null) {
    try {
      const resp = await jsonFetch(
        `/api/resolve-location?lat=${trip.lat}&lng=${trip.lng}`
      )
      if (resp.ok) {
        const { name, state } = await resp.json() as { name: string | null; state: string }
        if (name) {
          const finalState = trip.state || state || ''
          const fullLocation = finalState ? `${name}, ${finalState}` : name
          await jsonFetch(`/api/trips/${trip.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: fullLocation,
              state: finalState || trip.state,
              title: trip.title === 'Pinned location' || /^Pinned location/.test(trip.title)
                ? `${name} Trip`
                : trip.title,
            }),
          })
        }
      }
    } catch (err) {
      // Non-fatal: leave the trip on the server with its placeholder name
      // rather than trapping it in the queue. The dashboard backfill will
      // get another shot on next load.
      console.warn('[sync] geocode resolve failed:', err)
    }
  }

  if (trip.needs_conditions) {
    try { await syncConditions(trip) } catch { /* best-effort */ }
  }

  // Full success — drop everything from IDB.
  await deleteTripCascade(trip.id)
}

export async function drainQueue(): Promise<{ synced: number; failed: number; authExpired: boolean }> {
  if (running) return { synced: 0, failed: 0, authExpired: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, authExpired: false }
  }
  running = true
  let synced = 0
  let failed = 0
  let authExpired = false
  try {
    const trips = await getPendingTrips()
    for (const trip of trips) {
      if (trip.syncState === 'synced') continue
      try {
        await syncTrip(trip)
        synced++
      } catch (err: any) {
        if (err instanceof AuthExpiredError) {
          authExpired = true
          break
        }
        failed++
        trip.syncState = 'error'
        trip.lastError = err?.message || String(err)
        try { await updateTrip(trip) } catch {}
      }
    }
  } finally {
    running = false
  }

  if (typeof window !== 'undefined') {
    if (authExpired) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    if (synced > 0 || failed > 0) {
      window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT, { detail: { synced, failed } }))
    }
  }
  return { synced, failed, authExpired }
}
