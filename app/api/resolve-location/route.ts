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

async function overpassRels(r: number, lat: number, lng: number): Promise<any[]> {
  const q = `[out:json][timeout:15];(relation(around:${r},${lat},${lng})["natural"="water"]["name"];relation(around:${r},${lat},${lng})["waterway"]["name"];);out tags center 5;`
  let els = await overpass(q)
  if (!els.length) {
    // Overpass is intermittently empty under load — give it one more shot.
    await new Promise(res => setTimeout(res, 600))
    els = await overpass(q)
  }
  return els
}

async function tryOverpass(lat: number, lng: number): Promise<string | null> {
  // Exhaust the relation search across both radii before looking at small
  // ways. Big lakes like Lake Washington are multipolygon relations, and a
  // shore-adjacent point should pick the lake — not a Forbes-Creek-sized
  // tributary that happens to be closer in metres.
  for (const r of [1500, 5000]) {
    const rels = await overpassRels(r, lat, lng)
    const lakeName = pickNearest(rels, lat, lng)
    if (lakeName) return lakeName
  }
  for (const r of [1500, 5000]) {
    const waysQ = `[out:json][timeout:15];(way(around:${r},${lat},${lng})["waterway"~"river|stream|canal|tidal_channel"]["name"];way(around:${r},${lat},${lng})["natural"="water"]["name"];);out tags center 10;`
    const ways = await overpass(waysQ)
    const wayName = pickNearest(ways, lat, lng)
    if (wayName) return wayName
  }
  return null
}

// Match "Lake Washington" but not "Lake Washington Blvd" / "Forbes Creek Park".
// Anchor at start so the keyword has to be the actual feature name, not a
// substring inside something like a park or street that happens to mention it.
const BIG_WATER_RE = /^(lake|reservoir|bay|sound|gulf|inlet|harbor|harbour)\b/i
const SMALL_WATER_RE = /^(river|creek|stream|brook|pond|fork)\b/i

function mapboxWaterName(f: any): { name: string; rank: number } | null {
  const text = (f.text || '').trim()
  if (!text) return null
  // Mapbox usually leads "Lake Washington" with "Lake "; same for "Forbes Creek".
  if (BIG_WATER_RE.test(text)) return { name: text, rank: 2 }
  // Trailing form: "Some Lake", "Some Reservoir".
  if (/\b(Lake|Reservoir|Bay|Sound|Gulf|Inlet|Harbor|Harbour)$/i.test(text)) return { name: text, rank: 2 }
  if (SMALL_WATER_RE.test(text)) return { name: text, rank: 1 }
  if (/\b(River|Creek|Stream|Brook|Pond)$/i.test(text)) return { name: text, rank: 1 }
  return null
}

async function tryMapbox(lat: number, lng: number): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  try {
    // Cast a wide net — Mapbox tags Lake Washington as a 'poi' feature in
    // Reverse Geocoding, but neighbourhood/locality/place may surface other
    // named bodies. Filtered/ranked below.
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=poi,locality,place,district,neighborhood&limit=10`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    const features: any[] = data.features || []
    // Pick highest-ranked water match; "lake" beats "creek". This is the
    // step that previously returned "Forbes Creek Park" for a shore point.
    const scored = features
      .map(mapboxWaterName)
      .filter((x): x is { name: string; rank: number } => !!x)
      .sort((a, b) => b.rank - a.rank)
    return scored[0]?.name || null
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
