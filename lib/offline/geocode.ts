// Resolve the closest named waterway (river / stream / canal / lake) to a
// given lat/lng via Overpass. Returns the name string or null.
//
// Used by:
//   - LocationSearch.tsx (live, when GPS is tapped online)
//   - lib/offline/sync.ts (deferred, when a GPS-only trip syncs)
export async function nearestWaterway(lat: number, lng: number): Promise<string | null> {
  const radii = [1500, 5000]
  for (const r of radii) {
    try {
      const q = `[out:json][timeout:15];(way(around:${r},${lat},${lng})["waterway"~"river|stream|canal|tidal_channel"]["name"];way(around:${r},${lat},${lng})["natural"="water"]["name"];relation(around:${r},${lat},${lng})["natural"="water"]["name"];);out tags center;`
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      })
      if (!resp.ok) continue
      const data = await resp.json()
      const elements: any[] = data.elements || []
      if (!elements.length) continue
      const withDist = elements
        .map(e => {
          const c = e.center || { lat: e.lat, lon: e.lon }
          if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return null
          const dLat = (c.lat - lat) * 111000
          const dLng = (c.lon - lng) * 111000 * Math.cos((lat * Math.PI) / 180)
          const dist = Math.sqrt(dLat * dLat + dLng * dLng)
          const isFlowing = e.tags?.waterway && e.tags.waterway !== 'tidal_channel'
          return { name: e.tags?.name as string, dist, score: dist - (isFlowing ? 100 : 0) }
        })
        .filter((x): x is { name: string; dist: number; score: number } => !!x && !!x.name)
        .sort((a, b) => a.score - b.score)
      if (withDist[0]) return withDist[0].name
    } catch {}
  }
  return null
}

