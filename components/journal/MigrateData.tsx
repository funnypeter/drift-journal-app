'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './MigrateData.module.css'

interface OldCatch {
  species?: string
  fly?: string
  flyCategory?: string
  size?: string
  length?: string
  time?: string
  notes?: string
  photo?: string // base64
  date?: string
}

interface OldTrip {
  id: number | string
  title?: string
  date?: string
  location?: string
  state?: string
  lat?: number
  lng?: number
  flow?: string
  water?: string
  air?: string
  baro?: string
  weather?: string
  wind?: string
  moon?: string
  notes?: string
  catches_list?: OldCatch[]
  photos?: string[]
}

export default function MigrateData() {
  const [step, setStep] = useState<'idle' | 'preview' | 'migrating' | 'done' | 'error'>('idle')
  const [oldTrips, setOldTrips] = useState<OldTrip[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' })
  const [error, setError] = useState('')
  const supabase = createClient()

  function loadFromPaste(json: string) {
    try {
      const parsed = JSON.parse(json)
      const trips: OldTrip[] = Array.isArray(parsed) ? parsed : []
      // Filter out sample trips
      const real = trips.filter(t =>
        !['Big Wood River Exploration', 'Lost Lake Twilight Hatch', 'Silver Creek Solo Session'].includes(t.title || '')
      )
      setOldTrips(real)
      setStep('preview')
    } catch {
      setError('Invalid JSON — paste your driftjournal_trips localStorage value')
    }
  }

  async function uploadBase64Photo(base64: string, catchId: string): Promise<string | null> {
    try {
      // Convert base64 to blob
      const [header, data] = base64.split(',')
      const mimeMatch = header.match(/data:([^;]+)/)
      const mime = mimeMatch?.[1] || 'image/jpeg'
      const ext = mime.split('/')[1] || 'jpg'
      const bytes = atob(data)
      const arr = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      const blob = new Blob([arr], { type: mime })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const path = `${user.id}/${catchId}.${ext}`
      const { data: uploaded, error } = await supabase.storage
        .from('catch-photos')
        .upload(path, blob, { upsert: true, contentType: mime })

      if (error) return null

      const { data: { publicUrl } } = supabase.storage
        .from('catch-photos')
        .getPublicUrl(uploaded.path)

      return publicUrl
    } catch { return null }
  }

  async function migrate() {
    setStep('migrating')
    const total = oldTrips.length
    setProgress({ done: 0, total, current: '' })

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      for (let i = 0; i < oldTrips.length; i++) {
        const old = oldTrips[i]
        setProgress({ done: i, total, current: old.title || old.location || 'Trip' })

        // Insert trip
        const { data: trip, error: tripErr } = await supabase.from('trips').insert({
          user_id: user.id,
          title: old.title || (old.location ? `${old.location} Trip` : 'Trip'),
          date: old.date || new Date().toISOString().split('T')[0],
          location: old.location,
          state: old.state,
          lat: old.lat,
          lng: old.lng,
          flow: old.flow,
          water_temp: old.water,
          air_temp: old.air,
          baro: old.baro,
          weather: old.weather,
          wind: old.wind,
          moon: old.moon,
          notes: old.notes,
        }).select().single()

        if (tripErr || !trip) continue

        // Insert catches
        const catches = old.catches_list || []
        for (let j = 0; j < catches.length; j++) {
          const c = catches[j]
          const catchId = crypto.randomUUID()

          // Upload photo if base64
          let photoUrl: string | null = null
          if (c.photo && c.photo.startsWith('data:image')) {
            photoUrl = await uploadBase64Photo(c.photo, catchId)
          }

          await supabase.from('catches').insert({
            id: catchId,
            trip_id: trip.id,
            user_id: user.id,
            species: c.species || 'Unknown',
            length: c.length && c.length !== '—' ? parseFloat(c.length) : null,
            fly: c.fly !== '—' ? c.fly : null,
            fly_category: c.flyCategory,
            fly_size: c.size !== '—' ? c.size : null,
            time_caught: c.time && c.time !== '—' ? c.time : null,
            date: c.date || old.date,
            notes: c.notes,
            photo_url: photoUrl,
            sort_order: j,
          })

          // Set hero photo on trip if first catch with photo
          if (photoUrl && !trip.hero_photo_url) {
            await supabase.from('trips').update({ hero_photo_url: photoUrl }).eq('id', trip.id)
          }
        }
      }

      setProgress({ done: total, total, current: '' })
      setStep('done')
    } catch (err: any) {
      setError(err.message)
      setStep('error')
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Import from PWA</h2>
      <p className={styles.desc}>
        Bring your existing trips from the Drift Journal PWA into your account.
      </p>

      {step === 'idle' && (
        <div className={styles.step}>
          <p className={styles.instructions}>
            1. Open the old PWA in your browser<br />
            2. Open DevTools → Application → Local Storage<br />
            3. Copy the value of <code>driftjournal_trips</code><br />
            4. Paste it below
          </p>
          <textarea
            className={styles.textarea}
            placeholder='Paste JSON here...'
            rows={6}
            onChange={e => {
              if (e.target.value.trim().startsWith('[')) loadFromPaste(e.target.value)
            }}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {step === 'preview' && (
        <div className={styles.step}>
          <p className={styles.previewMsg}>
            Found <strong>{oldTrips.length}</strong> trips to import
            ({oldTrips.reduce((n, t) => n + (t.catches_list?.length || 0), 0)} catches total)
          </p>
          <ul className={styles.tripList}>
            {oldTrips.map((t, i) => (
              <li key={i} className={styles.tripItem}>
                <span>{t.title || t.location || 'Untitled'}</span>
                <span className={styles.tripMeta}>{t.date} · {t.catches_list?.length || 0} catches</span>
              </li>
            ))}
          </ul>
          <button className={styles.btn} onClick={migrate}>Import {oldTrips.length} trips</button>
        </div>
      )}

      {step === 'migrating' && (
        <div className={styles.step}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className={styles.progressText}>
            {progress.done} / {progress.total} — {progress.current}
          </p>
          <p className={styles.progressNote}>Uploading photos to cloud storage…</p>
        </div>
      )}

      {step === 'done' && (
        <div className={styles.success}>
          <div className={styles.successIcon}>✓</div>
          <h3>Import complete!</h3>
          <p>{oldTrips.length} trips imported successfully.</p>
          <a href="/dashboard" className={styles.btn}>Go to Dashboard</a>
        </div>
      )}

      {step === 'error' && (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button className={styles.btn} onClick={() => { setStep('idle'); setError('') }}>Try Again</button>
        </div>
      )}
    </div>
  )
}
