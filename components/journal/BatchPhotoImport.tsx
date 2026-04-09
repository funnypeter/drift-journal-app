'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseExif, groupPhotosByDate, type PhotoGroup } from '@/lib/exifUtils'
import { compressForIdentify, compressForUpload } from '@/lib/imageUtils'
import styles from './BatchPhotoImport.module.css'

type Phase = 'select' | 'parsing' | 'preview' | 'processing' | 'done'

interface Props {
  onCancel: () => void
}

export default function BatchPhotoImport({ onCancel }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('select')
  const [groups, setGroups] = useState<PhotoGroup[]>([])
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 })
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0, status: '' })
  const [result, setResult] = useState({ trips: 0, catches: 0, failed: 0 })
  const [thumbUrls, setThumbUrls] = useState<Map<File, string>>(new Map())

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setPhase('parsing')
    setParseProgress({ current: 0, total: files.length })

    // Create thumbnail URLs
    const urls = new Map<File, string>()
    for (const f of files) urls.set(f, URL.createObjectURL(f))
    setThumbUrls(urls)

    // Parse EXIF
    const parsed = []
    for (let i = 0; i < files.length; i++) {
      setParseProgress({ current: i + 1, total: files.length })
      parsed.push(await parseExif(files[i]))
    }

    setGroups(groupPhotosByDate(parsed))
    setPhase('preview')
  }

  function removePhoto(groupIdx: number, photoIdx: number) {
    setGroups(prev => {
      const next = prev.map((g, gi) => {
        if (gi !== groupIdx) return g
        const photos = g.photos.filter((_, pi) => pi !== photoIdx)
        return { ...g, photos }
      })
      return next.filter(g => g.photos.length > 0)
    })
  }

  function removeGroup(groupIdx: number) {
    setGroups(prev => prev.filter((_, i) => i !== groupIdx))
  }

  async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; state: string } | null> {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'DriftJournal/2.0' } }
      )
      const data = await resp.json()
      const addr = data.address || {}
      const name = data.name || addr.water || addr.natural || addr.city || addr.town || addr.village || 'Unknown'
      const state = addr.state || ''
      return { name: `${name}, ${state}`, state }
    } catch { return null }
  }

  function randomDark() {
    const colors = ['#374a3a','#1a2e1c','#0d2b4e','#1a4a6e','#2a1a3a','#1a0a2a','#3a2a1a','#2a1a0a']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  async function startImport() {
    setPhase('processing')
    const totalPhotos = groups.reduce((n, g) => n + g.photos.length, 0)
    let processed = 0
    let tripsCreated = 0
    let catchesCreated = 0
    let failed = 0

    for (const group of groups) {
      // Reverse geocode if GPS available
      let location: string | undefined
      let state: string | undefined
      if (group.lat != null && group.lng != null) {
        setProcessProgress({ current: processed, total: totalPhotos, status: 'Getting location...' })
        const geo = await reverseGeocode(group.lat, group.lng)
        if (geo) { location = geo.name; state = geo.state }
      }

      // Create trip
      const tripTitle = location
        ? `${location.split(',')[0]} Trip`
        : `Imported Trip - ${group.date}`
      setProcessProgress({ current: processed, total: totalPhotos, status: `Creating trip: ${tripTitle}` })

      // Fetch conditions if we have location
      let conditions: Record<string, string> = {}
      if (group.lat != null && group.lng != null) {
        try {
          const usgsParams = new URLSearchParams({
            type: 'usgs', lat: String(group.lat), lng: String(group.lng), date: group.date,
            ...(location ? { location } : {}),
          })
          const usgsResp = await fetch(`/api/conditions?${usgsParams}`)
          const usgsData = await usgsResp.json()
          if (!usgsData.error) {
            if (usgsData.flow) conditions.flow = usgsData.flow
            if (usgsData.waterTemp) conditions.water_temp = usgsData.waterTemp
            if (usgsData.gaugeHeight) conditions.gauge_height = usgsData.gaugeHeight
            if (usgsData.siteId) conditions.usgs_site_id = usgsData.siteId
          }
        } catch {}
        try {
          const wxResp = await fetch(`/api/conditions?type=weather&lat=${group.lat}&lng=${group.lng}&date=${group.date}`)
          const wxData = await wxResp.json()
          if (!wxData.error) {
            if (wxData.airTemp) conditions.air_temp = wxData.airTemp
            if (wxData.weather) conditions.weather = wxData.weather
            if (wxData.baro) conditions.baro = wxData.baro
            if (wxData.wind) conditions.wind = wxData.wind
          }
        } catch {}
      }

      let tripId: string
      try {
        const tripResp = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: tripTitle,
            date: group.date,
            location, state,
            lat: group.lat, lng: group.lng,
            ...conditions,
            bg_color: `linear-gradient(160deg,${randomDark()},${randomDark()})`,
          }),
        })
        if (!tripResp.ok) { failed += group.photos.length; processed += group.photos.length; continue }
        const trip = await tripResp.json()
        tripId = trip.id
      } catch { failed += group.photos.length; processed += group.photos.length; continue }

      tripsCreated++
      let heroUrl: string | null = null

      // Process each photo
      for (let i = 0; i < group.photos.length; i++) {
        const photo = group.photos[i]
        processed++
        setProcessProgress({
          current: processed,
          total: totalPhotos,
          status: `Photo ${i + 1} of ${group.photos.length} — ${tripTitle}`,
        })

        let photoUrl: string | null = null
        let species = 'Unknown'
        let length: number | undefined

        // Upload
        try {
          const compressed = await compressForUpload(photo.file)
          const formData = new FormData()
          formData.append('file', compressed)
          const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData })
          if (uploadResp.ok) {
            const uploadData = await uploadResp.json()
            photoUrl = uploadData.url
            if (!heroUrl) heroUrl = photoUrl
          }
        } catch {}

        // AI identify
        try {
          const idData = await compressForIdentify(photo.file)
          const idResp = await fetch('/api/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: idData.base64, mimeType: idData.mimeType }),
          })
          if (idResp.ok) {
            const idResult = await idResp.json()
            if (idResult.species) species = idResult.species
            if (idResult.length) length = parseFloat(idResult.length)
          }
        } catch {}

        // Create catch
        try {
          const catchResp = await fetch('/api/catches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trip_id: tripId,
              species,
              length: length || null,
              time_caught: photo.time || null,
              date: group.date,
              photo_url: photoUrl,
              sort_order: i,
            }),
          })
          if (catchResp.ok) catchesCreated++
          else failed++
        } catch { failed++ }
      }

      // Set hero photo
      if (heroUrl) {
        await fetch(`/api/trips/${tripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hero_photo_url: heroUrl }),
        }).catch(() => {})
      }
    }

    setResult({ trips: tripsCreated, catches: catchesCreated, failed })
    setPhase('done')
  }

  // ── Render ──

  if (phase === 'select') {
    return (
      <div className={styles.container}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden />
        <div className={styles.selectArea} onClick={() => fileRef.current?.click()}>
          <div className={styles.selectIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div className={styles.selectTitle}>Select photos from camera roll</div>
          <div className={styles.selectSub}>I'll organize them into trips by date and identify each fish</div>
        </div>
      </div>
    )
  }

  if (phase === 'parsing') {
    return (
      <div className={styles.container}>
        <div className={styles.statusBox}>
          <div className={styles.spinner} />
          <div className={styles.statusText}>
            Reading photo data... {parseProgress.current} of {parseProgress.total}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'preview') {
    const totalPhotos = groups.reduce((n, g) => n + g.photos.length, 0)
    return (
      <div className={styles.container}>
        {groups.map((group, gi) => (
          <div key={group.date} className={styles.groupCard}>
            <div className={styles.groupHeader}>
              <div>
                <div className={styles.groupDate}>{group.date}</div>
                {group.lat != null && (
                  <div className={styles.groupLocation}>GPS location found</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={styles.groupCount}>{group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}</span>
                <button className={styles.removeGroup} onClick={() => removeGroup(gi)}>Remove</button>
              </div>
            </div>
            <div className={styles.photoGrid}>
              {group.photos.map((photo, pi) => (
                <div key={pi} className={styles.thumbWrap}>
                  <img src={thumbUrls.get(photo.file)} alt="" className={styles.thumb} />
                  <button className={styles.removeThumb} onClick={() => removePhoto(gi, pi)}>&times;</button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {groups.length === 0 ? (
          <div className={styles.statusBox}>
            <div className={styles.statusText}>No photos remaining</div>
          </div>
        ) : (
          <button className={styles.startBtn} onClick={startImport}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="18" height="18">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Import {totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} into {groups.length} trip{groups.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    )
  }

  if (phase === 'processing') {
    const pct = processProgress.total > 0 ? (processProgress.current / processProgress.total) * 100 : 0
    return (
      <div className={styles.container}>
        <div className={styles.statusBox}>
          <div className={styles.spinner} />
          <div className={styles.statusText}>{processProgress.status}</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressDetail}>
            {processProgress.current} of {processProgress.total} photos
          </div>
        </div>
      </div>
    )
  }

  // phase === 'done'
  return (
    <div className={styles.container}>
      <div className={styles.doneBox}>
        <div className={styles.doneIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div className={styles.doneTitle}>Import Complete</div>
        <div className={styles.doneSub}>
          Created {result.trips} trip{result.trips !== 1 ? 's' : ''} with {result.catches} catch{result.catches !== 1 ? 'es' : ''}
          {result.failed > 0 && ` (${result.failed} failed)`}
        </div>
        <button className={styles.doneBtn} onClick={() => router.push('/dashboard')}>
          View Trips
        </button>
      </div>
    </div>
  )
}
