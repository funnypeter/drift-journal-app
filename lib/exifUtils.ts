import ExifReader from 'exifreader'

export interface PhotoWithExif {
  file: File
  date: string       // YYYY-MM-DD
  time: string | null // HH:MM
  lat: number | null
  lng: number | null
}

export interface PhotoGroup {
  date: string
  lat: number | null
  lng: number | null
  photos: PhotoWithExif[]
}

export async function parseExif(file: File): Promise<PhotoWithExif> {
  const fallbackDate = new Date(file.lastModified).toISOString().split('T')[0]

  try {
    const buf = await file.arrayBuffer()
    const tags = ExifReader.load(buf)

    // Parse date: EXIF format is "YYYY:MM:DD HH:MM:SS"
    let date = fallbackDate
    let time: string | null = null
    const dto = tags.DateTimeOriginal?.description || tags.DateTime?.description
    if (dto) {
      const [datePart, timePart] = dto.split(' ')
      date = datePart.replace(/:/g, '-')
      if (timePart) time = timePart.slice(0, 5) // HH:MM
    }

    // Parse GPS
    let lat: number | null = null
    let lng: number | null = null
    const gpsLat = tags.GPSLatitude?.description
    const gpsLng = tags.GPSLongitude?.description
    if (gpsLat != null && gpsLng != null) {
      lat = parseFloat(String(gpsLat))
      lng = parseFloat(String(gpsLng))
      const latRef = String(tags.GPSLatitudeRef?.value ?? '')
      const lngRef = String(tags.GPSLongitudeRef?.value ?? '')
      if (latRef.startsWith('S')) lat = -lat
      if (lngRef.startsWith('W')) lng = -lng
      if (isNaN(lat) || isNaN(lng)) { lat = null; lng = null }
    }

    return { file, date, time, lat, lng }
  } catch {
    return { file, date: fallbackDate, time: null, lat: null, lng: null }
  }
}

export function groupPhotosByDate(photos: PhotoWithExif[]): PhotoGroup[] {
  const groups = new Map<string, PhotoWithExif[]>()

  for (const p of photos) {
    const existing = groups.get(p.date) || []
    existing.push(p)
    groups.set(p.date, existing)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, photos]) => {
      // Sort by time within group
      photos.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      // Use first available GPS as group location
      const withGps = photos.find(p => p.lat != null)
      return {
        date,
        lat: withGps?.lat ?? null,
        lng: withGps?.lng ?? null,
        photos,
      }
    })
}
