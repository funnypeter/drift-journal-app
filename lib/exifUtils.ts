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
    const tags = ExifReader.load(buf, { expanded: true })

    // Parse date: EXIF format is "YYYY:MM:DD HH:MM:SS"
    let date = fallbackDate
    let time: string | null = null
    const exifTags = tags.exif || {}
    const dto = exifTags.DateTimeOriginal?.description || exifTags.DateTime?.description
    if (dto) {
      const [datePart, timePart] = dto.split(' ')
      date = datePart.replace(/:/g, '-')
      if (timePart) time = timePart.slice(0, 5) // HH:MM
    }

    // Parse GPS — expanded mode puts GPS in tags.gps
    let lat: number | null = null
    let lng: number | null = null
    const gps = tags.gps
    if (gps) {
      // expanded mode provides Latitude/Longitude as signed decimals
      if (gps.Latitude != null && gps.Longitude != null) {
        lat = gps.Latitude
        lng = gps.Longitude
      }
    }
    // Fallback: try non-expanded GPS tags
    if (lat == null || lng == null) {
      const flat = tags.exif || {}
      const gpsLat = flat.GPSLatitude?.description
      const gpsLng = flat.GPSLongitude?.description
      if (gpsLat != null && gpsLng != null) {
        lat = parseFloat(String(gpsLat))
        lng = parseFloat(String(gpsLng))
        const latRef = String(flat.GPSLatitudeRef?.value ?? '')
        const lngRef = String(flat.GPSLongitudeRef?.value ?? '')
        if (latRef.startsWith('S')) lat = -lat
        if (lngRef.startsWith('W')) lng = -lng
      }
    }
    if (lat != null && lng != null && (isNaN(lat) || isNaN(lng))) { lat = null; lng = null }

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
