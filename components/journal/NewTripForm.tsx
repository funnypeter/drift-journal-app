'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
import BatchPhotoImport from './BatchPhotoImport'
import { compressForUpload } from '@/lib/imageUtils'
import { enqueueTrip } from '@/lib/offline/queueClient'
import { drainQueue } from '@/lib/offline/sync'
import { notifyQueueChanged } from '@/hooks/usePendingCount'
import type { PendingCatch, PendingPhoto, PendingTrip } from '@/lib/offline/db'
import type { Catch } from '@/types'
import styles from './NewTripForm.module.css'

const LocationMiniMap = dynamic(() => import('./LocationMiniMap'), { ssr: false })

interface LocationData {
  name: string
  lat: number
  lng: number
  state: string
}

interface CatchDraft extends Omit<Catch, 'id' | 'trip_id' | 'user_id' | 'created_at' | 'updated_at'> {
  photoFile?: File
  photoPreview?: string
  kind?: 'fish' | 'flower'
}

export default function NewTripForm() {
  const router = useRouter()

  // Step 1: Location, Step 2: Log entry
  const [step, setStep] = useState<1 | 2 | 'batch'>(1)
  const [location, setLocation] = useState<LocationData | null>(null)

  // Trip fields
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [conditions, setConditions] = useState({
    flow: '', water_temp: '', gauge_height: '', air_temp: '', baro: '', weather: '', wind: '', moon: '', usgs_site_id: ''
  })

  // Catches
  const [catches, setCatches] = useState<CatchDraft[]>([])
  const [heroIndex, setHeroIndex] = useState<number>(0)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Track the last location/date we auto-fetched for so changing location
  // re-fires the fetch (the previous `conditions.flow` guard blocked refetch
  // once any value existed, stranding users on a stale location's data).
  const lastFetchKey = useRef<string | null>(null)

  useEffect(() => {
    if (!location) return
    const key = `${location.lat},${location.lng}|${date}`
    if (lastFetchKey.current === key) return
    lastFetchKey.current = key

    // Clear stale river readings immediately so the panel doesn't show the
    // previous location's values while the new fetch is in flight.
    setConditions(prev => ({ ...prev, flow: '', water_temp: '', gauge_height: '', usgs_site_id: '' }))

    const params = new URLSearchParams({
      type: 'usgs', location: location.name,
      lat: String(location.lat), lng: String(location.lng), date,
    })
    fetch(`/api/conditions?${params}`).then(r => r.json()).then(data => {
      if (!data.error) {
        setConditions(prev => ({
          ...prev,
          flow: data.flow || '',
          water_temp: data.waterTemp || '',
          gauge_height: data.gaugeHeight || '',
          usgs_site_id: data.siteId || '',
        }))
      }
    }).catch(() => {})
    // Also fetch weather
    fetch(`/api/conditions?type=weather&lat=${location.lat}&lng=${location.lng}&date=${date}`)
      .then(r => r.json()).then(data => {
        if (!data.error) {
          setConditions(prev => ({
            ...prev,
            air_temp: data.airTemp || prev.air_temp,
            weather: data.weather || prev.weather,
            baro: data.baro || prev.baro,
            wind: data.wind || prev.wind,
          }))
        }
      }).catch(() => {})
  }, [location, date])

  function addCatch() {
    setCatches(prev => [...prev, {
      species: 'Unknown', fly: '', fly_category: 'Dry Flies', fly_size: '16',
      length: undefined, time_caught: undefined, date: date, notes: '', sort_order: prev.length,
    }])
  }

  function updateCatch(i: number, updates: Partial<CatchDraft>) {
    setCatches(prev => prev.map((c, idx) => idx === i ? { ...c, ...updates } : c))
  }

  function removeCatch(i: number) {
    setCatches(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveOnline(tripId: string, catchIds: string[]): Promise<void> {
    if (!location) throw new Error('Please select a location')
    const tripTitle = title || `${location.name.split(',')[0]} Trip`
    const tripResp = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tripId,
        title: tripTitle,
        date,
        location: location.name,
        state: location.state,
        lat: location.lat,
        lng: location.lng,
        notes,
        ...conditions,
        bg_color: `linear-gradient(160deg,${randomDark()},${randomDark()})`,
      }),
    })
    if (!tripResp.ok) {
      const errData = await tripResp.json().catch(() => ({}))
      throw new Error(errData.error || `Save failed (${tripResp.status})`)
    }

    const photoUrls: (string | null)[] = []
    for (let i = 0; i < catches.length; i++) {
      const c = catches[i]
      if (c.kind === 'flower') { photoUrls.push(null); continue }
      let photoUrl: string | null = null

      if (c.photoFile) {
        const compressed = await compressForUpload(c.photoFile, 1600, 0.8)
        const formData = new FormData()
        formData.append('file', compressed)
        formData.append('catchId', catchIds[i])
        const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!uploadResp.ok) {
          const errData = await uploadResp.json().catch(() => ({}))
          throw new Error(errData.error || `Photo upload failed for catch #${i + 1}`)
        }
        const uploadData = await uploadResp.json()
        photoUrl = uploadData.url
      }
      photoUrls.push(photoUrl)

      const catchResp = await fetch('/api/catches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: catchIds[i],
          trip_id: tripId,
          species: c.species || 'Unknown',
          length: c.length || null,
          fly: c.fly || null,
          fly_category: c.fly_category,
          fly_size: c.fly_size,
          time_caught: c.time_caught || null,
          date: c.date || date,
          notes: c.notes,
          photo_url: photoUrl,
          sort_order: i,
        }),
      })
      if (!catchResp.ok) {
        const errData = await catchResp.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to save catch #${i + 1}`)
      }
    }

    const heroPhotoUrl = photoUrls[heroIndex] || photoUrls.find(u => u) || null
    if (heroPhotoUrl) {
      await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hero_photo_url: heroPhotoUrl }),
      })
    }
  }

  async function saveOffline(tripId: string, catchIds: string[]): Promise<void> {
    if (!location) throw new Error('Please select a location')
    const tripTitle = title || `${location.name.split(',')[0]} Trip`
    const photos: PendingPhoto[] = []
    const pendingCatches: PendingCatch[] = []

    for (let i = 0; i < catches.length; i++) {
      const c = catches[i]
      if (c.kind === 'flower') continue
      let photoId: string | undefined
      if (c.photoFile) {
        // Try to compress for IDB. Some Android devices fail canvas.toBlob on
        // very large images (memory limits) — if that happens, fall back to
        // storing the original file (already JPEG via ensureJpegIfHeic in
        // CatchCard) so the photo and downstream identify aren't lost.
        let blob: Blob = c.photoFile
        let mimeType = c.photoFile.type || 'image/jpeg'
        try {
          const compressed = await compressForUpload(c.photoFile, 1600, 0.8)
          blob = compressed
          mimeType = compressed.type || mimeType
        } catch (e) {
          console.warn('Photo compression failed during offline queue, queuing original:', e)
        }
        photoId = crypto.randomUUID()
        photos.push({ id: photoId, blob, mimeType })
      }
      pendingCatches.push({
        id: catchIds[i],
        trip_id: tripId,
        species: c.species || 'Unknown',
        length: c.length,
        fly: c.fly,
        fly_category: c.fly_category,
        fly_size: c.fly_size,
        time_caught: c.time_caught,
        date: c.date || date,
        notes: c.notes,
        sort_order: i,
        photoId,
        needs_identify: !!photoId,
        syncState: 'queued',
      })
    }

    const heroCatchId = pendingCatches[heroIndex]?.id || pendingCatches[0]?.id || null
    const needsGeocode = /^Pinned location/.test(location.name)
    const needsConditions = !conditions.flow && !conditions.water_temp && !conditions.air_temp

    const trip: PendingTrip = {
      id: tripId,
      title: tripTitle,
      date,
      location: location.name,
      state: location.state,
      lat: location.lat,
      lng: location.lng,
      notes,
      bg_color: `linear-gradient(160deg,${randomDark()},${randomDark()})`,
      usgs_site_id: conditions.usgs_site_id,
      flow: conditions.flow,
      water_temp: conditions.water_temp,
      gauge_height: conditions.gauge_height,
      air_temp: conditions.air_temp,
      baro: conditions.baro,
      weather: conditions.weather,
      wind: conditions.wind,
      moon: conditions.moon,
      heroCatchId,
      needs_geocode: needsGeocode,
      needs_conditions: needsConditions,
      syncState: 'queued',
      createdAt: Date.now(),
    }

    await enqueueTrip({ trip, catches: pendingCatches, photos })
    notifyQueueChanged()
  }

  async function save() {
    if (!location) { setError('Please select a location'); return }
    setSaving(true)
    setError('')

    const tripId = crypto.randomUUID()
    const catchIds = catches.map(() => crypto.randomUUID())

    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false

    if (isOnline) {
      try {
        await saveOnline(tripId, catchIds)
        router.push('/dashboard')
        return
      } catch (err: any) {
        // Network hiccup mid-save: fall through and queue offline so the user
        // doesn't lose their data. The sync engine will replay everything
        // (upserts are idempotent — partial progress on the server is fine).
        console.warn('Online save failed, queuing offline:', err)
      }
    }

    try {
      await saveOffline(tripId, catchIds)
      // Best-effort: if we're actually online, kick off a drain right away.
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        drainQueue().catch(() => {})
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to save')
      setSaving(false)
    }
  }

  if (step === 'batch') {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button onClick={() => setStep(1)} className={styles.backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
        <div className={styles.stepLabel}>Batch Import</div>
        <h1 className={styles.stepTitle}>Import Photos</h1>
        <BatchPhotoImport onCancel={() => setStep(1)} />
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button onClick={() => router.back()} className={styles.backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
        <div className={styles.stepLabel}>New Entry · Step 1 of 2</div>
        <h1 className={styles.stepTitle}>Where did you fish?</h1>
        <LocationSearch
          onSelect={(loc) => {
            setLocation(loc)
            setStep(2)
          }}
        />

        <div className={styles.batchDivider}>
          <span>or</span>
        </div>

        <button className={styles.batchBtn} onClick={() => setStep('batch')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Import multiple photos from camera roll
        </button>
        <p className={styles.batchSub}>I'll organize them into trips by date and identify each fish</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={() => setStep(1)} className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
      <div className={styles.stepLabel}>New Entry · Step 2 of 2</div>
      <h1 className={styles.stepTitle}>{location?.name || 'Log Entry'}</h1>

      {/* Location badge */}
      <div className={styles.locBadge}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>{location?.name}</span>
        <button onClick={() => setStep(1)} className={styles.changeBtn}>Change</button>
      </div>

      {/* Mini map */}
      {location && <LocationMiniMap lat={location.lat} lng={location.lng} />}

      {/* Title */}
      <div className={styles.field}>
        <label className={styles.label}>Trip Title</label>
        <input
          className={styles.input}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={location ? `${location.name.split(',')[0]} Trip` : 'Trip name'}
        />
      </div>

      {/* Date */}
      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input
          type="date"
          className={styles.input}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* Conditions */}
      <ConditionsPanel
        location={location}
        date={date}
        conditions={conditions}
        onChange={setConditions}
      />

      {/* Notes */}
      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea
          className={styles.textarea}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How was the fishing? Any observations..."
          rows={3}
        />
      </div>

      {/* Catches */}
      <div className={styles.catchSection}>
        <div className={styles.catchHeader}>
          <h2 className={styles.catchTitle}>Catches</h2>
          <span className={styles.catchCount}>{catches.length}</span>
        </div>
        {catches.map((c, i) => (
          <CatchCard
            key={i}
            index={i}
            catch_={c}
            onChange={(updates) => updateCatch(i, updates)}
            onRemove={() => removeCatch(i)}
            isHero={heroIndex === i}
            onSetHero={() => setHeroIndex(i)}
          />
        ))}
        <button className={styles.addCatchBtn} onClick={addCatch}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Catch
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Save */}
      <button className={styles.saveBtn} onClick={save} disabled={saving}>
        {saving ? <span className={styles.spinner} /> : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="18" height="18">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Log Entry
          </>
        )}
      </button>
    </div>
  )
}

function randomDark() {
  const colors = ['#374a3a','#1a2e1c','#0d2b4e','#1a4a6e','#2a1a3a','#1a0a2a','#3a2a1a','#2a1a0a']
  return colors[Math.floor(Math.random() * colors.length)]
}

