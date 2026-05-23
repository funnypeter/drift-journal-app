// Resolve the closest named waterway (river / stream / canal / lake) to a
// given lat/lng via Overpass. Returns the name string or null.
//
// Used by:
//   - LocationSearch.tsx (live, when GPS is tapped online)
//   - lib/offline/sync.ts (deferred, when a GPS-only trip syncs)
//
// Implementation note: the public Overpass server frequently 504s when a
// single query unions ways + relations (the merge is expensive under load).
// We split into two parallel queries — ways for rivers/creeks/ponds and
// relations for multipolygon lakes (e.g. Lake Washington's outer ways are
// untagged; the natural=water tag lives on the relation). When a relation
// matches the around radius, the user is on or near a major water body, so
// that wins over a small named stream that happens to be a bit closer.
async function queryOverpass(body: string): Promise<any[]> {
  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(body),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return data.elements || []
  } catch {
    return []
  }
}

function nearest(elements: any[], lat: number, lng: number): string | null {
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

export async function nearestWaterway(lat: number, lng: number): Promise<string | null> {
  const radii = [1500, 5000]
  for (const r of radii) {
    const waysQ = `[out:json][timeout:15];(way(around:${r},${lat},${lng})["waterway"~"river|stream|canal|tidal_channel"]["name"];way(around:${r},${lat},${lng})["natural"="water"]["name"];);out tags center 10;`
    const relsQ = `[out:json][timeout:15];(relation(around:${r},${lat},${lng})["natural"="water"]["name"];relation(around:${r},${lat},${lng})["waterway"]["name"];);out tags center 5;`
    const [ways, rels] = await Promise.all([queryOverpass(waysQ), queryOverpass(relsQ)])
    // Lakes/reservoirs (relations) win when present — a fly fisherman standing
    // on a lake shore wants the lake name, not the small tributary stream that
    // happens to be a few meters closer.
    const lakeName = nearest(rels, lat, lng)
    if (lakeName) return lakeName
    const wayName = nearest(ways, lat, lng)
    if (wayName) return wayName
  }
  return null
}
