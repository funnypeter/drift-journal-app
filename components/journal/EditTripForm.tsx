'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Trip, Catch } from '@/types'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
import { compressForUpload, ensureJpegIfHeic } from '@/lib/imageUtils'
import styles from './NewTripForm.module.css'

interface CatchDraft extends Partial<Catch> {
  photoFile?: File
  photoPreview?: string
  // `kind` is inherited from Catch ('fish' | 'flower' | 'none' | null).
  _delete?: boolean
  _autoIdentify?: boolean
}

export default function EditTripForm({ trip }: { trip: Trip }) {
  const router = useRouter()

  const [title, setTitle] = useState(trip.title)
  const [date, setDate] = useState(trip.date)
  const [notes, setNotes] = useState(trip.notes || '')
  const [showLocSearch, setShowLocSearch] = useState(false)
  const [location, setLocation] = useState({
    name: trip.location || '', lat: trip.lat || 0, lng: trip.lng || 0, state: trip.state || ''
  })
  const [conditions, setConditions] = useState({
    flow: trip.flow || '', water_temp: trip.water_temp || '', gauge_height: trip.gauge_height || '',
    air_temp: trip.air_temp || '', baro: trip.baro || '', weather: trip.weather || '',
    wind: trip.wind || '', moon: trip.moon || '', usgs_site_id: trip.usgs_site_id || ''
  })
  const [catches, setCatches] = useState<CatchDraft[]>(
    (trip.catches || []).map(c => ({
      ...c,
      photoPreview: c.photo_url || undefined,
    }))
  )
  // Find current hero index
  const initialHero = (trip.catches || []).findIndex(c => c.photo_url === trip.hero_photo_url)
  const [heroIndex, setHeroIndex] = useState<number>(initialHero >= 0 ? initialHero : 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialLocation = useRef(location.name)

  // Auto-fetch conditions when location changes
  useEffect(() => {
    if (!location.lat || location.name === initialLocation.current) return
    initialLocation.current = location.name
    // Clear stale readings right away so the panel doesn't show the previous
    // location's numbers while the new fetch is in flight (especially jarring
    // when crossing US⇄UK unit systems).
    setConditions(prev => ({ ...prev, flow: '', water_temp: '', gauge_height: '', usgs_site_id: '' }))
    const params = new URLSearchParams({
      type: 'usgs', location: location.name,
      lat: String(location.lat), lng: String(location.lng), date,
    })
    fetch(`/api/conditions?${params}`).then(r => r.json()).then(data => {
      if (!data.error) {
        setConditions(prev => ({
          ...prev,
          flow: data.flow || '', water_temp: data.waterTemp || '',
          gauge_height: data.gaugeHeight || '', usgs_site_id: data.siteId || '',
        }))
      }
    }).catch(() => {})
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
    // Per-trip carry-over: default to the most recent catch that has a fly.
    setCatches(prev => {
      const lastFly = [...prev].reverse().find(c => c.fly && !c._delete)
      return [...prev, {
        species: 'Unknown',
        fly: lastFly?.fly || '',
        fly_category: lastFly?.fly_category || 'Dry Flies',
        fly_size: lastFly?.fly_size || '',
        date: date, sort_order: prev.length,
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
          const usable = await ensureJpegIfHeic(file)
          drafts.push({
            species: 'Unknown', date, sort_order: 0,
            photoFile: usable, photoPreview: URL.createObjectURL(usable),
            _autoIdentify: true,
          })
        } catch (err) {
          console.warn('Skipping unreadable image in multi-add:', err)
        }
      }
      if (!drafts.length) return
      setCatches(prev => {
        const lastFly = [...prev].reverse().find(c => c.fly && !c._delete)
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

  // When a fly is (re)chosen on an existing catch, offer to apply it to every
  // catch after it — you rarely switch flies for one fish then switch back.
  const [flyPrompt, setFlyPrompt] = useState<
    { index: number; fly: string; fly_category: string; fly_size: string; count: number } | null
  >(null)

  function onFlyChosen(i: number, sel: { fly: string; fly_category: string; fly_size: string }) {
    const laterDiffer = catches.filter(
      (c, idx) => idx > i && !c._delete &&
        ((c.fly || '') !== sel.fly || (c.fly_size || '') !== sel.fly_size)
    ).length
    if (laterDiffer > 0) setFlyPrompt({ index: i, ...sel, count: laterDiffer })
  }

  function applyFlyToSubsequent() {
    if (!flyPrompt) return
    const { index, fly, fly_category, fly_size } = flyPrompt
    setCatches(prev => prev.map((c, idx) =>
      idx > index && !c._delete ? { ...c, fly, fly_category, fly_size } : c
    ))
    setFlyPrompt(null)
  }

  function removeCatch(i: number) {
    const c = catches[i]
    if (c.id) {
      setCatches(prev => prev.map((cc, idx) => idx === i ? { ...cc, _delete: true } : cc))
    } else {
      setCatches(prev => prev.filter((_, idx) => idx !== i))
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      // Update trip via API
      const tripResp = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, date, notes,
          location: location.name, state: location.state,
          lat: location.lat, lng: location.lng,
          ...conditions,
        }),
      })
      if (!tripResp.ok) {
        const errData = await tripResp.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to update trip')
      }

      // Handle catches
      const photoUrls: (string | null)[] = []
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i]

        if (c._delete && c.id) {
          const delResp = await fetch('/api/catches', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: c.id }),
          })
          if (!delResp.ok) {
            const errData = await delResp.json().catch(() => ({}))
            throw new Error(errData.error || `Failed to delete catch #${i + 1}`)
          }
          photoUrls.push(null)
          continue
        }

        // Non-fish photos (a plant, or a no-fish scene) are still saved so they
        // show in the gallery, but marked via `kind` so they don't count as
        // catches. Plants keep their identified name in `species`.
        const nonFish = c.kind === 'flower' || c.kind === 'none'

        let photoUrl = c.photo_url || null
        if (c.photoFile) {
          const compressed = await compressForUpload(c.photoFile, 1600, 0.8)
          const formData = new FormData()
          formData.append('file', compressed)
          const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData })
          if (!uploadResp.ok) {
            const errData = await uploadResp.json().catch(() => ({}))
            throw new Error(errData.error || `Photo upload failed for catch #${i + 1}`)
          }
          const uploadData = await uploadResp.json()
          photoUrl = uploadData.url
        }
        photoUrls.push(photoUrl)

        const catchData = {
          trip_id: trip.id,
          species: c.species || 'Unknown',
          length: nonFish ? null : (c.length || null),
          fly: nonFish ? null : (c.fly || null),
          fly_category: nonFish ? null : c.fly_category,
          fly_size: nonFish ? null : c.fly_size,
          time_caught: nonFish ? null : (c.time_caught || null),
          date: c.date || date,
          notes: c.notes, photo_url: photoUrl, sort_order: i,
          lat: c.lat ?? null,
          lng: c.lng ?? null,
          // Only send when identified — keeps manual, no-photo catches saveable
          // even before the `kind` column migration is applied.
          ...(c.kind !== undefined ? { kind: c.kind } : {}),
        }

        const catchResp = c.id
          ? await fetch('/api/catches', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: c.id, ...catchData }),
            })
          : await fetch('/api/catches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(catchData),
            })
        if (!catchResp.ok) {
          const errData = await catchResp.json().catch(() => ({}))
          throw new Error(errData.error || `Failed to save catch #${i + 1}`)
        }
      }

      // Update hero photo
      const heroPhotoUrl = photoUrls[heroIndex] || photoUrls.find(u => u) || null
      if (heroPhotoUrl) {
        const heroResp = await fetch(`/api/trips/${trip.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hero_photo_url: heroPhotoUrl }),
        })
        if (!heroResp.ok) {
          const errData = await heroResp.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to update hero photo')
        }
      }

      router.push(`/trips/${trip.id}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const visibleCatches = catches.filter(c => !c._delete)
  // Map visible index to actual index for hero
  const visibleToActual = catches.reduce<number[]>((acc, c, i) => {
    if (!c._delete) acc.push(i)
    return acc
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
      <div className={styles.stepLabel}>Edit Entry</div>
      <h1 className={styles.stepTitle}>{title || trip.title}</h1>

      {/* Location */}
      <div className={styles.locBadge}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span>{location.name || 'No location'}</span>
        <button onClick={() => setShowLocSearch(!showLocSearch)} className={styles.changeBtn}>Change</button>
      </div>

      {showLocSearch && (
        <LocationSearch
          defaultValue={location.name}
          onSelect={(loc) => { setLocation(loc); setShowLocSearch(false) }}
        />
      )}

      <div className={styles.field}>
        <label className={styles.label}>Title</label>
        <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <ConditionsPanel location={location.lat ? location : null} date={date} conditions={conditions} onChange={setConditions} />

      <div className={styles.field}>
        <label className={styles.label}>Notes</label>
        <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
      </div>

      <div className={styles.catchSection}>
        <div className={styles.catchHeader}>
          <h2 className={styles.catchTitle}>Catches</h2>
          <span className={styles.catchCount}>{visibleCatches.length}</span>
        </div>
        {catches.map((c, i) => {
          if (c._delete) return null
          return (
            <CatchCard key={c.id || i} index={i} catch_={c as any}
              onChange={(u) => updateCatch(i, u)} onRemove={() => removeCatch(i)}
              isHero={heroIndex === i}
              onSetHero={() => setHeroIndex(i)}
              onFlyChosen={(sel) => onFlyChosen(i, sel)}
            />
          )
        })}
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
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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

      <button className={styles.saveBtn} onClick={save} disabled={saving}>
        {saving ? <span className={styles.spinner} /> : (
          <><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="18" height="18">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>Save Changes</>
        )}
      </button>

      {flyPrompt && (
        <div className={styles.flyPromptOverlay} onClick={() => setFlyPrompt(null)}>
          <div className={styles.flyPrompt} onClick={e => e.stopPropagation()}>
            <p className={styles.flyPromptText}>
              Use <strong>{flyPrompt.fly}{flyPrompt.fly_size ? ` #${flyPrompt.fly_size}` : ''}</strong> for the {flyPrompt.count} catch{flyPrompt.count > 1 ? 'es' : ''} after this one too?
            </p>
            <div className={styles.flyPromptBtns}>
              <button className={styles.flyPromptNo} onClick={() => setFlyPrompt(null)}>No</button>
              <button className={styles.flyPromptYes} onClick={applyFlyToSubsequent}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
