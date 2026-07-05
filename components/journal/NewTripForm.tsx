'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
import BatchPhotoImport from './BatchPhotoImport'
import GarminActivityPicker, { type GarminImportResult } from './GarminActivityPicker'
import { compressForUpload, ensureJpegIfHeic } from '@/lib/imageUtils'
import { readCaptureTime } from '@/lib/exif'
import { linkCatchesToPins } from '@/lib/pinLink'
import { enqueueTrip } from '@/lib/offline/queueClient'
import { drainQueue } from '@/lib/offline/sync'
import { notifyQueueChanged } from '@/hooks/usePendingCount'
import type { PendingCatch, PendingPhoto, PendingTrip } from '@/lib/offline/db'
import type { Catch, GarminPin } from '@/types'
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
  kind?: 'fish' | 'flower' | 'none'
  // Photo capture time (EXIF wall-clock) — used to match a Garmin catch pin.
  capturedAt?: string
  _autoIdentify?: boolean
  _identifying?: boolean
}

export default function NewTripForm() {
  const router = useRouter()

  // Step 1: Location, Step 2: Log entry
  const [step, setStep] = useState<1 | 2 | 'batch' | 'garmin'>(1)
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
  // GPS pins from an imported Garmin activity (not catches — bare map markers).
  const [garminPins, setGarminPins] = useState<GarminPin[]>([])

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
    // Default the fly to the most recent catch in THIS trip that used one — if
    // you hooked a fish on a fly, odds are you keep fishing it. Per-trip only:
    // a fresh trip starts with no default until you pick a fly.
    setCatches(prev => {
      const lastFly = [...prev].reverse().find(c => c.fly)
      return [...prev, {
        species: 'Unknown',
        fly: lastFly?.fly || '',
        fly_category: lastFly?.fly_category || 'Dry Flies',
        fly_size: lastFly?.fly_size || '',
        length: undefined, time_caught: undefined, date: date, notes: '', sort_order: prev.length,
      }]
    })
  }

  // Multi-photo add: each selected image becomes its own catch, which then
  // self-identifies via the card's auto-identify effect.
  const multiPhotoRef = useRef<HTMLInputElement>(null)
  const [addingPhotos, setAddingPhotos] = useState(false)

  async function handleMultiPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // reset so the same photos can be picked again
    if (!files.length) return
    setAddingPhotos(true)
    try {
      const drafts: CatchDraft[] = []
      for (const file of files) {
        try {
          // Read EXIF capture time from the ORIGINAL file (before compression
          // strips it) so it can be matched to a Garmin catch pin.
          const capturedAt = await readCaptureTime(file)
          const usable = await ensureJpegIfHeic(file)
          drafts.push({
            species: 'Unknown', length: undefined, time_caught: undefined,
            date, notes: '', sort_order: 0, capturedAt,
            photoFile: usable, photoPreview: URL.createObjectURL(usable),
            _autoIdentify: true, _identifying: true,
          })
        } catch (err) {
          console.warn('Skipping unreadable image in multi-add:', err)
        }
      }
      if (!drafts.length) return
      setCatches(prev => {
        const lastFly = [...prev].reverse().find(c => c.fly)
        return [
          ...prev,
          ...drafts.map((d, k) => ({
            ...d,
            fly: lastFly?.fly || '',
            fly_category: lastFly?.fly_category || 'Dry Flies',
            fly_size: lastFly?.fly_size || '',
            sort_order: prev.length + k,
          })),
        ]
      })
    } finally {
      setAddingPhotos(false)
    }
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

    // Adopt a Garmin pin's GPS onto any photo catch within 5 min of it; pins
    // that don't match a photo stay on the trip as bare map markers.
    const linkedCatches = catches.map(c => ({ ...c }))
    const remainingPins = linkCatchesToPins(linkedCatches, garminPins)

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
        // Only send when there are pins — keeps normal trips saveable before the
        // garmin_pins column migration (007) is applied.
        ...(remainingPins.length ? { garmin_pins: remainingPins } : {}),
        bg_color: `linear-gradient(160deg,${randomDark()},${randomDark()})`,
      }),
    })
    if (!tripResp.ok) {
      const errData = await tripResp.json().catch(() => ({}))
      throw new Error(errData.error || `Save failed (${tripResp.status})`)
    }

    const photoUrls: (string | null)[] = []
    for (let i = 0; i < linkedCatches.length; i++) {
      const c = linkedCatches[i]
      // Non-fish photos (a plant, or a no-fish scene) are still saved so they
      // show in the gallery, but marked via `kind` so they don't count as
      // catches. Plants keep their identified name in `species`.
      const nonFish = c.kind === 'flower' || c.kind === 'none'
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
          length: nonFish ? null : (c.length || null),
          fly: nonFish ? null : (c.fly || null),
          fly_category: nonFish ? null : c.fly_category,
          fly_size: nonFish ? null : c.fly_size,
          time_caught: nonFish ? null : (c.time_caught || null),
          date: c.date || date,
          notes: c.notes,
          photo_url: photoUrl,
          sort_order: i,
          lat: c.lat ?? null,
          lng: c.lng ?? null,
          // Only send when a photo was identified — keeps manual, no-photo
          // catches saveable even before the `kind` column migration is applied.
          ...(c.kind !== undefined ? { kind: c.kind } : {}),
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

    const linkedCatches = catches.map(c => ({ ...c }))
    const remainingPins = linkCatchesToPins(linkedCatches, garminPins)

    for (let i = 0; i < linkedCatches.length; i++) {
      const c = linkedCatches[i]
      const nonFish = c.kind === 'flower' || c.kind === 'none'
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
        length: nonFish ? undefined : c.length,
        fly: nonFish ? undefined : c.fly,
        fly_category: nonFish ? undefined : c.fly_category,
        fly_size: nonFish ? undefined : c.fly_size,
        time_caught: nonFish ? undefined : c.time_caught,
        date: c.date || date,
        notes: c.notes,
        sort_order: i,
        lat: c.lat,
        lng: c.lng,
        photoId,
        kind: c.kind,
        // Already identified as non-fish — don't re-run identify on sync.
        needs_identify: !!photoId && !nonFish,
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
      garmin_pins: remainingPins.length ? remainingPins : undefined,
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

  // Bring in a Garmin fishing activity: set the trip location/date/title and
  // keep its catch GPS as map pins (NOT catch records — catches come only from
  // photos). Adding photos whose capture time is within 5 min of a pin will
  // adopt that pin's GPS at save. Lands on step 2 for review.
  async function handleGarminImport(result: GarminImportResult) {
    if (result.lat != null && result.lng != null) {
      let name = result.title || 'Fishing Trip'
      let state = ''
      try {
        const r = await fetch(`/api/resolve-location?lat=${result.lat}&lng=${result.lng}`).then(res => res.json())
        if (r?.name) { name = r.name; state = r.state || '' }
      } catch { /* fall back to the activity name */ }
      setLocation({ name, lat: result.lat, lng: result.lng, state })
    }
    if (result.title) setTitle(result.title)
    if (result.date) setDate(result.date)
    setGarminPins(result.pins.filter(p => p.lat != null && p.lng != null))
    setStep(2)
  }

  // Any card mid-identify? Save is held until they all settle.
  const identifying = catches.some(c => c._identifying)

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

  if (step === 'garmin') {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button onClick={() => setStep(1)} className={styles.backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
        <div className={styles.stepLabel}>Import from Garmin</div>
        <h1 className={styles.stepTitle}>Pick a fishing activity</h1>
        <GarminActivityPicker onImport={handleGarminImport} />
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

        <button className={styles.batchBtn} style={{ marginTop: 12 }} onClick={() => setStep('garmin')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 7v5l3 2"/>
          </svg>
          Import a fishing activity from Garmin
        </button>
        <p className={styles.batchSub}>Pulls the GPS track and drops your marked catches on the map</p>
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
        <input
          ref={multiPhotoRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleMultiPhotos}
          hidden
        />
        <div className={styles.catchAddRow}>
          <button className={styles.addCatchBtn} onClick={addCatch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Catch
          </button>
          <button className={styles.addCatchBtn} onClick={() => multiPhotoRef.current?.click()} disabled={addingPhotos}>
            {addingPhotos ? 'Adding…' : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Add Photos
              </>
            )}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {/* Save — held while any photo is still identifying so nothing commits as "Unknown". */}
      <button className={styles.saveBtn} onClick={save} disabled={saving || identifying}>
        {saving ? <span className={styles.spinner} /> : identifying ? 'Identifying photos…' : (
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

