import { unzipSync } from 'fflate'
import { GarminClient, garminLogin as login, type GarminTokens } from './client'
import { parseFitActivity, type FitCatch } from './fit'

// Server-only. Uses the fetch-based client in ./client, so it runs in a Worker.

export type { GarminTokens }

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
  return login(email, password)
}

/** Restore a client from stored tokens (no password needed). */
export function garminClient(tokens: GarminTokens): GarminClient {
  return new GarminClient(tokens)
}

const isFishing = (typeKey?: string) => !!typeKey && typeKey.toLowerCase().includes('fishing')

function localDate(a: any): string {
  const s: string = a?.startTimeLocal || a?.startTimeGMT || ''
  // Garmin gives "2026-07-05 00:22:37" (or ISO) — take the date part.
  return s.replace('T', ' ').split(' ')[0]
}

/** Recent fishing activities, newest first. */
export async function listFishingActivities(gc: GarminClient): Promise<FishingActivity[]> {
  const activities = await gc.getActivities(0, 40)
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
export async function importFishingActivity(gc: GarminClient, activityId: number): Promise<ImportedActivity> {
  const summary = await gc.getActivity(activityId)

  const entries = unzipSync(await gc.downloadOriginal(activityId))
  const fitName = Object.keys(entries).find(n => n.toLowerCase().endsWith('.fit'))
  if (!fitName) throw new Error('No FIT file inside the Garmin export')
  const parsed = parseFitActivity(entries[fitName])
  const fitCatches: FitCatch[] = parsed.catches

  // Pin times already come back as trip-local wall clock from the FIT parser
  // (it derives the offset from the FIT's own local_timestamp).
  const pins: GarminPin[] = fitCatches.map(c => ({ lat: c.lat, lng: c.lng, time: c.time }))

  return {
    activityId,
    title: summary?.activityName || 'Fishing Trip',
    date: localDate(summary),
    lat: summary?.startLatitude ?? parsed.startLat,
    lng: summary?.startLongitude ?? parsed.startLng,
    pins,
  }
}
