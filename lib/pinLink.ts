import type { GarminPin } from '@/types'

export interface Linkable {
  lat?: number
  lng?: number
  time_caught?: string
  capturedAt?: string // photo EXIF wall-clock "YYYY-MM-DDTHH:MM:SS"
}

const WINDOW_MS = 1 * 60 * 1000

// Both times are naive local wall-clock; parse as UTC so the difference is the
// true wall-clock gap regardless of the runtime's timezone.
function wallMs(s?: string): number {
  if (!s) return NaN
  return Date.parse(s.replace(' ', 'T') + 'Z')
}

/**
 * Link photo catches to Garmin pins by capture time. A catch that has a capture
 * time but no GPS yet adopts the GPS of the nearest-in-time pin within 1 min,
 * and (unless the catch already has a time) its Time Caught from the pin's
 * logged catch moment. Each pin is used at most once. Mutates the catches it
 * links and returns the pins that stayed unlinked (shown as bare map markers).
 */
export function linkCatchesToPins<C extends Linkable>(catches: C[], pins: GarminPin[]): GarminPin[] {
  if (!pins.length) return pins
  const used = new Set<number>()
  for (const c of catches) {
    if (c.lat != null && c.lng != null) continue // keep a manually dropped pin
    const cm = wallMs(c.capturedAt)
    if (!Number.isFinite(cm)) continue
    let best = -1
    let bestDiff = WINDOW_MS + 1
    pins.forEach((p, i) => {
      if (used.has(i)) return
      const pm = wallMs(p.time)
      if (!Number.isFinite(pm)) return
      const diff = Math.abs(pm - cm)
      if (diff <= WINDOW_MS && diff < bestDiff) { best = i; bestDiff = diff }
    })
    if (best >= 0) {
      used.add(best)
      c.lat = pins[best].lat
      c.lng = pins[best].lng
      // Set Time Caught from the pin's logged catch moment (local wall clock
      // "YYYY-MM-DDTHH:MM:SS" → "HH:MM"), unless the catch already has a time.
      const t = pins[best].time
      if (!c.time_caught && t && t.length >= 16) c.time_caught = t.slice(11, 16)
    }
  }
  return pins.filter((_, i) => !used.has(i))
}
