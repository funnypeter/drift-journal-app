'use client'

// localStorage-backed entry conveniences: recent locations and remembered
// custom flies. All access is SSR-safe (guards on `window`) and swallows
// quota/parse errors so a full or corrupt store never breaks the form.
//
// Note: fly carry-over to the next catch is deliberately NOT stored here — it's
// per-trip in-memory (see addCatch in the trip forms), so it resets each trip.

const RECENT_LOCATIONS_KEY = 'drift.recentLocations'
const CUSTOM_FLIES_KEY = 'drift.customFlies'

const MAX_RECENT_LOCATIONS = 6
const MAX_CUSTOM_FLIES = 12

export interface RecentLocation {
  name: string
  lat: number
  lng: number
  state: string
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

// ── Recent locations ──────────────────────────────────────────────────────────
export function getRecentLocations(): RecentLocation[] {
  return read<RecentLocation[]>(RECENT_LOCATIONS_KEY, [])
}

export function addRecentLocation(loc: RecentLocation): RecentLocation[] {
  // Skip GPS placeholders that haven't been resolved to a real waterway yet —
  // a list of "Pinned location" chips would be useless.
  if (!loc.name || /^(Pinned location|Current Location)/i.test(loc.name)) {
    return getRecentLocations()
  }
  const existing = getRecentLocations().filter(
    l => l.name.toLowerCase() !== loc.name.toLowerCase()
  )
  const next = [loc, ...existing].slice(0, MAX_RECENT_LOCATIONS)
  write(RECENT_LOCATIONS_KEY, next)
  return next
}

// ── Custom flies (per category) ───────────────────────────────────────────────
export function getCustomFlies(category: string): string[] {
  const all = read<Record<string, string[]>>(CUSTOM_FLIES_KEY, {})
  return all[category] || []
}

export function addCustomFly(category: string, fly: string): string[] {
  const trimmed = fly.trim()
  const all = read<Record<string, string[]>>(CUSTOM_FLIES_KEY, {})
  const current = all[category] || []
  if (!trimmed) return current
  if (current.some(f => f.toLowerCase() === trimmed.toLowerCase())) return current
  const next = [...current, trimmed].slice(-MAX_CUSTOM_FLIES)
  all[category] = next
  write(CUSTOM_FLIES_KEY, all)
  return next
}
