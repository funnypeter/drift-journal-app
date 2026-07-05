import exifr from 'exifr'

// Read a photo's capture time as a naive local wall-clock string
// "YYYY-MM-DDTHH:MM:SS" (no timezone — EXIF DateTimeOriginal carries none), or
// undefined if the file has no datetime. Must run on the ORIGINAL file before
// the app recompresses it (canvas re-encode strips EXIF). Used to match a photo
// to a Garmin catch pin by time — see lib/pinLink.ts.
export async function readCaptureTime(file: File): Promise<string | undefined> {
  try {
    const data = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
      reviveValues: false, // keep the raw "2026:07:04 17:23:05" string
    })
    const raw: unknown = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate
    if (typeof raw !== 'string') return undefined
    const m = raw.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (!m) return undefined
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  } catch {
    return undefined
  }
}
