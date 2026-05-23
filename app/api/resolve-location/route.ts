import { NextRequest, NextResponse } from 'next/server'

// Server-side waterway resolver. Tries Overpass (best for OSM tags), then
// Mapbox reverse geocoding (good lake/POI coverage when an access token is
// configured), then Nominatim (last resort).
//
// Running this on the server has three benefits over hitting these from the
// browser:
//   1. Overpass occasionally 504s on combined queries; we can retry / log it.
//   2. Mapbox's secret-free token is fine to use here, but it's already a
//      public env var, so we just use it directly.
//   3. Vercel function logs make it easy to see what each tier returned when
//      a coord still ends up as "Pinned location".

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'

async function overpass(body: string): Promise<any[]> {
  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'DriftJournal/2.0 (resolve-location)',
      },
      body: 'data=' + encodeURIComponent(body),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return data.elements || []
  } catch (err) {
    console.warn('[resolve-location] overpass fetch failed:', err)
    return []
  }
}

function pickNearest(elements: any[], lat: number, lng: number): string | null {
  const scored = elements
    .map(e => {
      const c = e.center || { lat: e.lat, lon: e.lon }
      if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return null
      const dLat = (c.lat - lat) * 111000
      const dLng = (c.lon - lng) * 111000 * Math.cos((lat * Math.PI) / 180)
      const dist = Math.sqrt(dLat * dLat + dLng * dLng)
      return { name: e.tags?.name as string, dist }
    })
    .filter((x): x is { name: string; dist: number } => !!x && !!x.name)
    .sort((a, b) => a.dist - b.dist)
  return scored[0]?.name || null
}

async function tryOverpass(lat: number, lng: number): Promise<string | null> {
  for (const r of [1500, 5000]) {
    const waysQ = `[out:json][timeout:15];(way(around:${r},${lat},${lng})["waterway"~"river|stream|canal|tidal_channel"]["name"];way(around:${r},${lat},${lng})["natural"="water"]["name"];);out tags center 10;`
    const relsQ = `[out:json][timeout:15];(relation(around:${r},${lat},${lng})["natural"="water"]["name"];relation(around:${r},${lat},${lng})["waterway"]["name"];);out tags center 5;`
    const [ways, rels] = await Promise.all([overpass(waysQ), overpass(relsQ)])
    // Major water bodies (relations) win over a tributary stream that
    // happens to pass a few meters closer to the user.
    const lakeName = pickNearest(rels, lat, lng)
    if (lakeName) return lakeName
    const wayName = pickNearest(ways, lat, lng)
    if (wayName) return wayName
  }
  return null
}

async function tryMapbox(lat: number, lng: number): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  try {
    // types=poi catches named water bodies (Mapbox tags Lake Washington and
    // similar as POIs even when they don't appear in OSM ways).
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=poi&limit=5`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    const features: any[] = data.features || []
    // Prefer features whose category includes water-y terms.
    const watery = features.find(f => {
      const cat = (f.properties?.category || '').toLowerCase()
      const txt = (f.text || '').toLowerCase()
      return /lake|river|reservoir|pond|stream|creek|bay|water/.test(cat + ' ' + txt)
    })
    return watery?.text || features[0]?.text || null
  } catch (err) {
    console.warn('[resolve-location] mapbox fetch failed:', err)
    return null
  }
}

async function tryNominatim(lat: number, lng: number): Promise<{ name: string | null; state: string }> {
  try {
    const resp = await fetch(
      `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { 'User-Agent': 'DriftJournal/2.0 (resolve-location)' } }
    )
    if (!resp.ok) return { name: null, state: '' }
    const data = await resp.json()
    const address = data?.address || {}
    const name = address.river
      || address.lake
      || address.water
      || address.body_of_water
      || address.bay
      || address.natural
      || (data?.name as string)
      || null
    return { name, state: address.state || '' }
  } catch (err) {
    console.warn('[resolve-location] nominatim fetch failed:', err)
    return { name: null, state: '' }
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get('lat') || '')
  const lng = parseFloat(url.searchParams.get('lng') || '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid lat/lng' }, { status: 400 })
  }

  const [overpassName, mapboxName, nomi] = await Promise.all([
    tryOverpass(lat, lng),
    tryMapbox(lat, lng),
    tryNominatim(lat, lng),
  ])

  const name = overpassName || mapboxName || nomi.name || null
  const state = nomi.state || ''

  // Log a one-liner so we can grep Vercel logs when a coord still misses.
  console.log('[resolve-location]', { lat, lng, overpassName, mapboxName, nomi, picked: name })

  return NextResponse.json({ name, state, source: overpassName ? 'overpass' : mapboxName ? 'mapbox' : nomi.name ? 'nominatim' : null })
}
