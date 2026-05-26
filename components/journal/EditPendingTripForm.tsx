'use client'

import { useState, useEffect, useRef } from 'react'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
import { compressForUpload } from '@/lib/imageUtils'
import { getDB } from '@/lib/offline/db'
import {
  getPendingTrip,
  getCatchesForTrip,
  getPhoto,
  updateTrip,
  updateCatch,
  deleteTripCascade,
} from '@/lib/offline/queueClient'
import { notifyQueueChanged } from '@/hooks/usePendingCount'
import type { PendingCatch, PendingTrip } from '@/lib/offline/db'
import styles from './NewTripForm.module.css'

interface CatchDraft {
  id?: string
  pendingId?: string
  species: string
  length?: number
  fly?: string
  fly_category?: string
  fly_size?: string
  time_caught?: string
  date?: string
  notes?: string
  sort_order: number
  lat?: number
  lng?: number
  photoFile?: File
  photoPreview?: string
  photoId?: string
  kind?: 'fish' | 'flower' | 'none'
  _delete?: boolean
  _isNew?: boolean
}

interface Props {
  pendingId: string
  onClose: () => void
}

export default function EditPendingTripForm({ pendingId, onClose }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [trip, setTrip] = useState<PendingTrip | null>(null)
  const [originalCatches, setOriginalCatches] = useState<PendingCatch[]>([])

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [showLocSearch, setShowLocSearch] = useState(false)
  const [location, setLocation] = useState({ name: '', lat: 0, lng: 0, state: '' })
  const [conditions, setConditions] = useState({
    flow: '', water_temp: '', gauge_height: '', air_temp: '', baro: '',
    weather: '', wind: '', moon: '', usgs_site_id: '',
  })
  const [catches, setCatches] = useState<CatchDraft[]>([])
  const [heroIndex, setHeroIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const objectUrls = useRef<string[]>([])

  useEffect(() => {
    if (!pendingId) { setMissing(true); return }
    let cancelled = false
    ;(async () => {
      try {
        const t = await getPendingTrip(pendingId)
        if (!t) { setMissing(true); return }
        const cs = await getCatchesForTrip(pendingId)
        const drafts: CatchDraft[] = []
        for (const c of cs) {
          let preview: string | undefined
          if (c.photoId) {
            const photo = await getPhoto(c.photoId)
            if (photo) {
              const url = URL.createObjectURL(photo.blob)
              objectUrls.current.push(url)
              preview = url
            }
          }
          drafts.push({
            id: c.id,
            pendingId: c.id,
            species: c.species,
            length: c.length,
            fly: c.fly,
            fly_category: c.fly_category,
            fly_size: c.fly_size,
            time_caught: c.time_caught,
            date: c.date,
            notes: c.notes,
            sort_order: c.sort_order,
            lat: c.lat,
            lng: c.lng,
            photoId: c.photoId,
            photoPreview: preview,
          })
        }
        if (cancelled) return
        setTrip(t)
        setOriginalCatches(cs)
        setTitle(t.title)
        setDate(t.date)
        setNotes(t.notes || '')
        setLocation({ name: t.location, lat: t.lat || 0, lng: t.lng || 0, state: t.state || '' })
        setConditions({
          flow: t.flow || '', water_temp: t.water_temp || '', gauge_height: t.gauge_height || '',
          air_temp: t.air_temp || '', baro: t.baro || '', weather: t.weather || '',
          wind: t.wind || '', moon: t.moon || '', usgs_site_id: t.usgs_site_id || '',
        })
        setCatches(drafts)
        const heroId = t.heroCatchId
        const hIdx = heroId ? drafts.findIndex(d => d.id === heroId) : 0
        setHeroIndex(hIdx >= 0 ? hIdx : 0)
        setLoaded(true)
      } catch (err: any) {
        setError(err?.message || 'Failed to load pending trip')
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
      objectUrls.current.forEach(u => URL.revokeObjectURL(u))
      objectUrls.current = []
    }
  }, [pendingId])

  function addCatch() {
    setCatches(prev => [...prev, {
      species: 'Unknown', fly: '', fly_category: 'Dry Flies', fly_size: '',
      date: date, sort_order: prev.length, _isNew: true,
    }])
  }

  function updateCatchDraft(i: number, updates: Partial<CatchDraft>) {
    setCatches(prev => prev.map((c, idx) => idx === i ? { ...c, ...updates } : c))
  }

  function removeCatch(i: number) {
    const c = catches[i]
    if (c._isNew) {
      setCatches(prev => prev.filter((_, idx) => idx !== i))
    } else {
      setCatches(prev => prev.map((cc, idx) => idx === i ? { ...cc, _delete: true } : cc))
    }
  }

  async function save() {
    if (!trip) return
    setSaving(true)
    setError('')
    try {
      // Update trip fields in IDB. Reset needs_geocode if location was changed
      // away from a placeholder so the sync engine doesn't overwrite it.
      const placeholderNow = /^Pinned location/.test(location.name)
      const updatedTrip: PendingTrip = {
        ...trip,
        title, date, notes,
        location: location.name, state: location.state,
        lat: location.lat, lng: location.lng,
        flow: conditions.flow, water_temp: conditions.water_temp,
        gauge_height: conditions.gauge_height, air_temp: conditions.air_temp,
        baro: conditions.baro, weather: conditions.weather,
        wind: conditions.wind, moon: conditions.moon,
        usgs_site_id: conditions.usgs_site_id,
        needs_geocode: placeholderNow,
        syncState: trip.syncState === 'error' ? 'queued' : trip.syncState,
        lastError: undefined,
      }

      const db = await getDB()
      const existingCatchIds = new Set(originalCatches.map(c => c.id))
      const keptIds = new Set<string>()

      for (let i = 0; i < catches.length; i++) {
        const c = catches[i]
        if (c._delete && c.id) {
          // Delete the pending catch and its photo blob from IDB
          const tx = db.transaction(['pendingCatches', 'pendingPhotos'], 'readwrite')
          const orig = originalCatches.find(o => o.id === c.id)
          if (orig?.photoId) await tx.objectStore('pendingPhotos').delete(orig.photoId)
          await tx.objectStore('pendingCatches').delete(c.id)
          await tx.done
          continue
        }

        // Handle a newly attached photo: compress, queue blob, point catch to it.
        let photoId = c.photoId
        if (c.photoFile) {
          let blob: Blob = c.photoFile
          let mimeType = c.photoFile.type || 'image/jpeg'
          try {
            const compressed = await compressForUpload(c.photoFile, 1600, 0.8)
            blob = compressed
            mimeType = compressed.type || mimeType
          } catch (e) {
            console.warn('Photo compression failed during pending edit, queuing original:', e)
          }
          // Remove the old photo blob if one existed
          if (photoId) {
            await db.delete('pendingPhotos', photoId).catch(() => {})
          }
          photoId = crypto.randomUUID()
          await db.put('pendingPhotos', { id: photoId, blob, mimeType })
        }

        const orig = originalCatches.find(o => o.id === c.id)
        const catchId = c.id || crypto.randomUUID()
        keptIds.add(catchId)
        const pendingCatch: PendingCatch = {
          id: catchId,
          trip_id: pendingId,
          species: c.species || 'Unknown',
          length: c.length,
          fly: c.fly,
          fly_category: c.fly_category,
          fly_size: c.fly_size,
          time_caught: c.time_caught,
          date: c.date,
          notes: c.notes,
          sort_order: i,
          lat: c.lat,
          lng: c.lng,
          photoId,
          needs_identify: orig?.needs_identify ?? !!photoId,
          serverPhotoUrl: orig?.serverPhotoUrl,
          syncState: orig?.syncState === 'synced' ? 'synced' : 'queued',
        }
        await updateCatch(pendingCatch)
      }

      // Hero by id (preserve through reorder/edit)
      const visibleCatches = catches.filter(c => !c._delete)
      const heroCatch = visibleCatches[heroIndex]
      if (heroCatch) {
        updatedTrip.heroCatchId = heroCatch.id || null
      }
      await updateTrip(updatedTrip)

      notifyQueueChanged()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Save failed')
      setSaving(false)
    }
  }

  async function discard() {
    if (!confirm('Discard this pending trip? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteTripCascade(pendingId)
      notifyQueueChanged()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Delete failed')
      setDeleting(false)
    }
  }

  if (missing) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <button onClick={onClose} className={styles.backBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
        <div className={styles.stepLabel}>Pending Sync</div>
        <p style={{ padding: '2rem 0' }}>This pending trip is no longer in the queue (it may have already synced).</p>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.stepLabel}>Pending Sync</div>
        <p style={{ padding: '2rem 0' }}>Loading…</p>
      </div>
    )
  }

  const visibleCatches = catches.filter(c => !c._delete)

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={onClose} className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <button
          onClick={discard}
          disabled={deleting}
          style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#a33', fontSize: '0.85rem', cursor: 'pointer', padding: '0.5rem',
          }}
        >
          {deleting ? 'Discarding…' : 'Discard'}
        </button>
      </div>
      <div className={styles.stepLabel}>Edit Pending Trip</div>
      <h1 className={styles.stepTitle}>{title || trip?.title}</h1>

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

      <ConditionsPanel
        location={location.lat ? location : null}
        date={date}
        conditions={conditions}
        onChange={setConditions}
      />

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
            <CatchCard
              key={c.id || `new-${i}`}
              index={i}
              catch_={c as any}
              onChange={(u) => updateCatchDraft(i, u)}
              onRemove={() => removeCatch(i)}
              isHero={heroIndex === i}
              onSetHero={() => setHeroIndex(i)}
            />
          )
        })}
        <button className={styles.addCatchBtn} onClick={addCatch}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Catch
        </button>
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
    </div>
  )
}
