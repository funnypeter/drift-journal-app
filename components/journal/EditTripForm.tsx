'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Trip, Catch } from '@/types'
import CatchCard from './CatchCard'
import LocationSearch from './LocationSearch'
import ConditionsPanel from './ConditionsPanel'
import styles from './NewTripForm.module.css'

interface CatchDraft extends Partial<Catch> {
  photoFile?: File
  photoPreview?: string
  _delete?: boolean
}

export default function EditTripForm({ trip }: { trip: Trip }) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(trip.title)
  const [date, setDate] = useState(trip.date)
  const [notes, setNotes] = useState(trip.notes || '')
  const [showLocSearch, setShowLocSearch] = useState(false)
  const [location, setLocation] = useState({
    name: trip.location || '', lat: trip.lat || 0, lng: trip.lng || 0, state: trip.state || ''
  })
  const [conditions, setConditions] = useState({
    flow: trip.flow || '', water_temp: trip.water_temp || '', air_temp: trip.air_temp || '',
    baro: trip.baro || '', weather: trip.weather || '', wind: trip.wind || '',
    moon: trip.moon || '', usgs_site_id: trip.usgs_site_id || ''
  })
  const [catches, setCatches] = useState<CatchDraft[]>(
    (trip.catches || []).map(c => ({
      ...c,
      photoPreview: c.photo_url || undefined,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addCatch() {
    setCatches(prev => [...prev, {
      species: 'Unknown', fly: '', fly_category: 'Dry Flies', fly_size: '16',
      date: date, sort_order: prev.length,
    }])
  }

  function updateCatch(i: number, updates: Partial<CatchDraft>) {
    setCatches(prev => prev.map((c, idx) => idx === i ? { ...c, ...updates } : c))
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // Update trip
      await supabase.from('trips').update({
        title, date, notes,
        location: location.name, state: location.state,
        lat: location.lat, lng: location.lng,
        ...conditions,
      }).eq('id', trip.id)

      // Handle catches
      let heroUrl = trip.hero_photo_url || null
      for (let i = 0; i < catches.length; i++) {
        const c = catches[i]

        if (c._delete && c.id) {
          await supabase.from('catches').delete().eq('id', c.id)
          continue
        }

        let photoUrl = c.photo_url || null
        if (c.photoFile) {
          const catchId = c.id || crypto.randomUUID()
          const ext = c.photoFile.name.split('.').pop() || 'jpg'
          const path = `${user.id}/${catchId}.${ext}`
          const { data: uploaded } = await supabase.storage
            .from('catch-photos').upload(path, c.photoFile, { upsert: true, contentType: c.photoFile.type })
          if (uploaded) {
            const { data: { publicUrl } } = supabase.storage.from('catch-photos').getPublicUrl(uploaded.path)
            photoUrl = publicUrl
            if (!heroUrl) heroUrl = photoUrl
          }
        }

        const catchData = {
          trip_id: trip.id, user_id: user.id,
          species: c.species || 'Unknown',
          length: c.length || null,
          fly: c.fly || null, fly_category: c.fly_category, fly_size: c.fly_size,
          time_caught: c.time_caught || null, date: c.date || date,
          notes: c.notes, photo_url: photoUrl, sort_order: i,
        }

        if (c.id) {
          await supabase.from('catches').update(catchData).eq('id', c.id)
        } else {
          await supabase.from('catches').insert({ ...catchData, id: crypto.randomUUID() })
        }
      }

      if (heroUrl && heroUrl !== trip.hero_photo_url) {
        await supabase.from('trips').update({ hero_photo_url: heroUrl }).eq('id', trip.id)
      }

      router.push(`/trips/${trip.id}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const visibleCatches = catches.filter(c => !c._delete)

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <button onClick={() => router.back()} className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <h1 className={styles.stepTitle}>Edit Entry</h1>
      </div>

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
        {catches.map((c, i) => !c._delete && (
          <CatchCard key={c.id || i} index={i} catch_={c as any}
            onChange={(u) => updateCatch(i, u)} onRemove={() => removeCatch(i)} />
        ))}
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
