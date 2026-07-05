import { Decoder, Stream } from '@garmin/fitsdk'

// Semicircles → degrees. Garmin stores lat/long as int32 semicircles.
const SEMI = 180 / 2 ** 31
const toDeg = (v: number | null | undefined) =>
  v == null ? null : +(v * SEMI).toFixed(6)

export interface FitCatch {
  lat: number
  lng: number
  time?: string // ISO
}

export interface FitActivitySummary {
  sport?: string
  startLat: number | null
  startLng: number | null
  startTime?: string
  catches: FitCatch[]
}

/**
 * Decode a Garmin `.fit` activity and pull out fishing catches.
 *
 * On the Fish activity, pressing "Log Catch" drops a manually-triggered lap
 * (lapTrigger === 'manual'), and that lap records the GPS position at the
 * moment of the press. We treat each manual lap as one catch, using its end
 * position. Auto/sessionEnd laps are ignored. Verified against a real export
 * (one catch → exactly one manual lap on the user's watch).
 */
export function parseFitActivity(fitBytes: Uint8Array): FitActivitySummary {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(fitBytes)))
  if (!decoder.isFIT()) throw new Error('Not a FIT file')
  const { messages } = decoder.read({ convertDateTimesToDates: true })

  const session = (messages.sessionMesgs || [])[0] || {}
  const laps = messages.lapMesgs || []

  const catches: FitCatch[] = []
  for (const lap of laps) {
    if (lap.lapTrigger !== 'manual') continue
    const lat = toDeg(lap.endPositionLat)
    const lng = toDeg(lap.endPositionLong)
    if (lat == null || lng == null) continue
    const t = lap.timestamp instanceof Date ? lap.timestamp.toISOString() : undefined
    catches.push({ lat, lng, time: t })
  }

  const startTime = session.startTime instanceof Date ? session.startTime.toISOString() : undefined

  return {
    sport: session.sport != null ? String(session.sport) : undefined,
    startLat: toDeg(session.startPositionLat),
    startLng: toDeg(session.startPositionLong),
    startTime,
    catches,
  }
}
