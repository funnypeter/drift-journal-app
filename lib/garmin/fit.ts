import { Decoder, Stream } from '@garmin/fitsdk'

// Semicircles → degrees. Garmin stores lat/long as int32 semicircles.
const SEMI = 180 / 2 ** 31
const toDeg = (v: number | null | undefined) =>
  v == null ? null : +(v * SEMI).toFixed(6)

export interface FitCatch {
  lat: number
  lng: number
  time?: string // trip-local wall clock "YYYY-MM-DDTHH:MM:SS"
}

const FIT_EPOCH = 631065600 // seconds between Unix epoch and FIT epoch (1989-12-31)

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
  const activity = (messages.activityMesgs || [])[0] || {}

  // UTC→local offset straight from the FIT's activity message: local_timestamp
  // (a raw FIT-epoch second count encoding local wall clock) minus the UTC
  // timestamp. Self-contained and correct for the activity's date/DST — no
  // dependency on Garmin's summary fields, which may be absent from getActivity.
  let offsetMs = 0
  if (activity.timestamp instanceof Date && typeof activity.localTimestamp === 'number') {
    const tsFitSec = activity.timestamp.getTime() / 1000 - FIT_EPOCH
    offsetMs = (activity.localTimestamp - tsFitSec) * 1000
  }
  const toLocalWall = (utcMs: number) => new Date(utcMs + offsetMs).toISOString().slice(0, 19)

  const catches: FitCatch[] = []
  for (const lap of laps) {
    if (lap.lapTrigger !== 'manual') continue
    const lat = toDeg(lap.endPositionLat)
    const lng = toDeg(lap.endPositionLong)
    if (lat == null || lng == null) continue
    // Catch moment = end of the manual lap (when "Log Catch" was pressed) =
    // startTime + elapsed. lap.timestamp is unreliable here (it decoded to the
    // session start for every lap), so derive it from startTime + elapsed.
    let time: string | undefined
    if (lap.startTime instanceof Date && typeof lap.totalElapsedTime === 'number') {
      time = toLocalWall(lap.startTime.getTime() + Math.round(lap.totalElapsedTime * 1000))
    } else if (lap.timestamp instanceof Date) {
      time = toLocalWall(lap.timestamp.getTime())
    }
    catches.push({ lat, lng, time })
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
