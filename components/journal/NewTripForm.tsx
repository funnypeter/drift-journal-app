'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
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
}

export default function NewTripForm() {
  const router = useRouter()

  // Step 1: Location, Step 2: Log entry
  const [step, setStep] = useState<1 | 2>(1)
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

  // Auto-fetch USGS + weather when location is selected
  useEffect(() => {
    if (!location || conditions.flow) return
    const params = new URLSearchParams({
      type: 'usgs', location: location.name,
      lat: String(location.lat), lng: String(location.lng),
    })
    fetch(`/api/conditions?${params}`).then(r => r.json()).then(data => {
      if (!data.error) {
        setConditions(prev => ({
          ...prev,
          flow: data.flow || prev.flow,
          water_temp: data.waterTemp || prev.water_temp,
          gauge_height: data.gaugeHeight || prev.gauge_height,
          usgs_site_id: data.siteId || prev.usgs_site_id,
        }))
      }
    }).catch(() => {})
    // Also fetch weather
    fetch(`/api/conditions?type=weather&lat=${location.lat}&lng=${location.lng}`)
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
  }, [location])

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

  async function save() {
    if (!location) { setError('Please select a location'); return }
    setSaving(true)
    setError('')

    try {
      // Create trip via API route (handles auth server-side)
      const tripTitle = title || `${location.name.split(',')[0]} Trip`
      const tripResp = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        const errData = await tripResp.json()
        throw new Error(errData.error || `Save failed (${tripResp.status})`)
      }
      const trip = await tripResp.json()

      // Upload catches
      const photoUrls: (string | null)[] = []
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i]
        let photoUrl: string | null = null

        // Upload photo — compress first to stay under Vercel's body limit
        if (c.photoFile) {
          try {
            const compressed = await compressForUpload(c.photoFile, 1600, 0.8)
            const formData = new FormData()
            formData.append('file', compressed)
            const uploadResp = await fetch('/api/upload', { method: 'POST', body: formData })
            if (uploadResp.ok) {
              const uploadData = await uploadResp.json()
              photoUrl = uploadData.url
            } else {
              const errData = await uploadResp.json().catch(() => ({}))
              console.error('Upload failed:', uploadResp.status, errData)
            }
          } catch (e) {
            console.error('Upload error:', e)
          }
        }
        photoUrls.push(photoUrl)

        // Create catch via API route
        const catchResp = await fetch('/api/catches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trip_id: trip.id,
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

      // Update hero photo — use selected hero, fallback to first photo
      const heroPhotoUrl = photoUrls[heroIndex] || photoUrls.find(u => u) || null
      if (heroPhotoUrl) {
        await fetch(`/api/trips/${trip.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hero_photo_url: heroPhotoUrl }),
        })
      }

      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to save')
      setSaving(false)
    }
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

function compressForUpload(file: File, maxDim: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width <= maxDim && height <= maxDim && file.size < 3 * 1024 * 1024) {
        resolve(file) // already small enough
        return
      }
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.src = URL.createObjectURL(file)
  })
}
