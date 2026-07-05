import os from 'os'
import path from 'path'
import fs from 'fs'
import { unzipSync } from 'fflate'
import { GarminConnect } from 'garmin-connect'
import { parseFitActivity, type FitCatch } from './fit'

// Server-only. garmin-connect uses Node fs/https, so only import this from
// API routes (never a client component).

export interface GarminTokens {
  oauth1: unknown
  oauth2: unknown
}

export interface FishingActivity {
  activityId: number
  name: string
  date: string // YYYY-MM-DD
  startTime: string // display
  lat: number | null
  lng: number | null
}

export interface GarminPin {
  lat: number
  lng: number
  time?: string // trip-local wall clock "YYYY-MM-DDTHH:MM:SS" (for EXIF matching)
}

export interface ImportedActivity {
  activityId: number
  title: string
  date: string // YYYY-MM-DD
  lat: number | null
  lng: number | null
  pins: GarminPin[]
}

/** Log in with email + password and return the session token to persist. */
export async function garminLogin(email: string, password: string): Promise<GarminTokens> {
  const gc = new GarminConnect({ username: email, password })
  await gc.login()
  const tokens = gc.exportToken() as unknown as GarminTokens
  if (!tokens?.oauth1 || !tokens?.oauth2) throw new Error('Login succeeded but no token returned')
  return tokens
}

/** Restore a client from stored tokens (no password needed). */
export function garminClient(tokens: GarminTokens): GarminConnect {
  // The constructor throws "Missing credentials" on an empty object, but we
  // authenticate via the stored token (loadToken), not login() — so these
  // placeholder values are never used. They just satisfy the constructor.
  const gc = new GarminConnect({ username: 'token', password: 'token' })
  gc.loadToken(tokens.oauth1 as any, tokens.oauth2 as any)
  return gc
}

const isFishing = (typeKey?: string) => !!typeKey && typeKey.toLowerCase().includes('fishing')

function localDate(a: any): string {
  const s: string = a?.startTimeLocal || a?.startTimeGMT || ''
  // Garmin gives "2026-07-05 00:22:37" (or ISO) — take the date part.
  return s.replace('T', ' ').split(' ')[0]
}

// Parse a Garmin datetime string as UTC epoch ms (their times carry no zone).
function asUtcMs(s?: string): number {
  if (!s) return NaN
  let t = s.trim().replace(' ', 'T')
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(t)) t += 'Z'
  return Date.parse(t)
}

// UTC→local offset for this activity, from its own GMT vs local start times.
// Avoids a lat/lng timezone lookup and correctly reflects DST for the date.
function localOffsetMs(summary: any): number {
  const off = asUtcMs(summary?.startTimeLocal) - asUtcMs(summary?.startTimeGMT)
  return Number.isFinite(off) ? off : 0
}

/** Recent fishing activities, newest first. */
export async function listFishingActivities(gc: GarminConnect): Promise<FishingActivity[]> {
  const activities = (await gc.getActivities(0, 40)) as any[]
  return activities
    .filter(a => isFishing(a?.activityType?.typeKey))
    .map(a => ({
      activityId: a.activityId,
      name: a.activityName || 'Fishing',
      date: localDate(a),
      startTime: a.startTimeLocal || a.startTimeGMT || '',
      lat: a.startLatitude ?? null,
      lng: a.startLongitude ?? null,
    }))
}

/** Download the original FIT for one activity and extract its catch pins. */
export async function importFishingActivity(gc: GarminConnect, activityId: number): Promise<ImportedActivity> {
  const summary = (await gc.getActivity({ activityId })) as any

  const dir = os.tmpdir()
  await gc.downloadOriginalActivityData({ activityId }, dir, 'zip')
  const zipPath = path.join(dir, `${activityId}.zip`)
  let fitCatches: FitCatch[] = []
  let fitStartLat: number | null = null
  let fitStartLng: number | null = null
  try {
    const zipBuf = fs.readFileSync(zipPath)
    const entries = unzipSync(new Uint8Array(zipBuf))
    const fitName = Object.keys(entries).find(n => n.toLowerCase().endsWith('.fit'))
    if (!fitName) throw new Error('No FIT file inside the Garmin export')
    const parsed = parseFitActivity(entries[fitName])
    fitCatches = parsed.catches
    fitStartLat = parsed.startLat
    fitStartLng = parsed.startLng
  } finally {
    try { fs.unlinkSync(zipPath) } catch { /* best effort */ }
  }

  // FIT lap timestamps are UTC; shift to the activity's local wall clock so the
  // pin time can be compared to a photo's EXIF capture time (also wall clock).
  const off = localOffsetMs(summary)
  const pins: GarminPin[] = fitCatches.map(c => {
    let time = c.time
    if (time) {
      const ms = Date.parse(time) + off
      if (Number.isFinite(ms)) time = new Date(ms).toISOString().slice(0, 19)
    }
    return { lat: c.lat, lng: c.lng, time }
  })

  return {
    activityId,
    title: summary?.activityName || 'Fishing Trip',
    date: localDate(summary),
    lat: summary?.startLatitude ?? fitStartLat,
    lng: summary?.startLongitude ?? fitStartLng,
    pins,
  }
}
