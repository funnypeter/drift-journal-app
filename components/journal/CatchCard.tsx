'use client'

import { useRef, useState, useEffect } from 'react'
import { useIdentify, useProfile } from '@/hooks'
import { compressForIdentify, ensureJpegIfHeic } from '@/lib/imageUtils'
import { getCustomFlies, addCustomFly } from '@/lib/prefs'
import { FLY_DATA, FLY_SIZES } from '@/types'
import SpeciesSelect from './SpeciesSelect'
import styles from './CatchCard.module.css'

interface CatchDraft {
  species: string
  fly?: string
  fly_category?: string
  fly_size?: string
  length?: number
  time_caught?: string
  date?: string
  notes?: string
  lat?: number
  lng?: number
  photoFile?: File
  photoPreview?: string
  kind?: 'fish' | 'flower' | 'none'
  // Set when the card is created with a photo already attached (multi-photo
  // add). Tells the card to run identify itself on mount, once.
  _autoIdentify?: boolean
}

interface Props {
  index: number
  catch_: CatchDraft
  onChange: (updates: Partial<CatchDraft>) => void
  onRemove: () => void
  isHero?: boolean
  onSetHero?: () => void
  // Fired when a fly is definitively chosen (pill tap or committed custom entry),
  // not on every keystroke. Lets the parent offer to apply it to later catches.
  onFlyChosen?: (sel: { fly: string; fly_category: string; fly_size: string }) => void
}

export default function CatchCard({ index, catch_, onChange, onRemove, isHero, onSetHero, onFlyChosen }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)   // gallery / files
  const cameraRef = useRef<HTMLInputElement>(null) // live camera capture
  const { identify, loading: identifying } = useIdentify()
  const { profile } = useProfile()
  const [flyCategory, setFlyCategory] = useState(catch_.fly_category || 'Dry Flies')
  const [aiResult, setAiResult] = useState('')
  // Flies the user typed by hand, remembered per category so they show up as
  // quick-select pills on future catches.
  const [customFlies, setCustomFlies] = useState<string[]>([])
  useEffect(() => { setCustomFlies(getCustomFlies(flyCategory)) }, [flyCategory])

  // Keep the local category pills in sync if the parent changes fly_category
  // (e.g. when applying a fly across subsequent catches on edit).
  useEffect(() => {
    if (catch_.fly_category && catch_.fly_category !== flyCategory) setFlyCategory(catch_.fly_category)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catch_.fly_category])

  // Pick a fly, then let the parent know it was chosen.
  function chooseFly(fly: string) {
    onChange({ fly })
    onFlyChosen?.({ fly_category: flyCategory, fly, fly_size: catch_.fly_size || '' })
  }

  // Commit a hand-typed fly: remember it in the quick-select list and signal the choice.
  function saveCustomFly(value: string) {
    const v = value.trim()
    if (!v) return
    if (!allFlyOptions.includes(v)) setCustomFlies(addCustomFly(flyCategory, v))
    onFlyChosen?.({ fly_category: flyCategory, fly: v, fly_size: catch_.fly_size || '' })
  }

  async function runIdentify(base64: string, mimeType: string) {
    try {
      const result = await identify(base64, mimeType, profile?.net_hole_size)
      if ((result as any).kind === 'none') {
        // No fish and no flower in the photo — treat the same way as flowers:
        // keep the photo visible but skip saving as a counted catch.
        onChange({ kind: 'none', species: 'No Fish', length: undefined, fly: '', fly_category: '', fly_size: '' })
        setFlyCategory('Dry Flies')
        setAiResult('No fish or flower detected')
        return
      }
      if (result.species) {
        if (result.kind === 'flower') {
          onChange({ kind: 'flower', species: result.species, length: undefined, fly: '', fly_category: '', fly_size: '' })
          setFlyCategory('Dry Flies')
          setAiResult(`${result.species} · ${result.confidence}% confidence`)
        } else {
          onChange({ kind: 'fish', species: result.species, length: result.length ? parseFloat(result.length) : undefined })
          setAiResult(`${result.species} · ${result.length}" · ${result.confidence}% confidence`)
        }
      } else if (result.error) {
        setAiResult(`ID failed: ${result.error}`)
      }
    } catch (err: any) {
      setAiResult(`ID failed: ${err.message}`)
    }
  }

  // When this card was spawned from a multi-photo add, the photo is already
  // attached but hasn't been identified yet — kick off identify once on mount.
  const autoIdRan = useRef(false)
  useEffect(() => {
    if (!catch_._autoIdentify || autoIdRan.current || !catch_.photoFile) return
    autoIdRan.current = true
    onChange({ _autoIdentify: false })
    ;(async () => {
      try {
        const compressed = await compressForIdentify(catch_.photoFile!, 1200, 0.7)
        runIdentify(compressed.base64, compressed.mimeType)
      } catch (err: any) {
        setAiResult(`Photo error: ${err.message}`)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catch_._autoIdentify, catch_.photoFile])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // Convert HEIC → JPEG up-front so the preview renders and save() doesn't re-convert.
      const usable = await ensureJpegIfHeic(file)
      const preview = URL.createObjectURL(usable)
      onChange({ photoFile: usable, photoPreview: preview })
      const compressed = await compressForIdentify(usable, 1200, 0.7)
      runIdentify(compressed.base64, compressed.mimeType)
    } catch (err: any) {
      setAiResult(`Photo error: ${err.message}`)
      onChange({ photoFile: undefined, photoPreview: undefined })
    }
  }

  async function reIdentify() {
    const src = catch_.photoPreview
    if (!src) return
    try {
      // If it's a local blob, re-compress from the file
      if (catch_.photoFile) {
        const compressed = await compressForIdentify(catch_.photoFile, 1200, 0.7)
        return runIdentify(compressed.base64, compressed.mimeType)
      }
      // Otherwise fetch the existing photo URL and convert to base64
      const resp = await fetch(src)
      const blob = await resp.blob()
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })
      const compressed = await compressForIdentify(file, 1200, 0.7)
      runIdentify(compressed.base64, compressed.mimeType)
    } catch (err: any) {
      setAiResult(`ID failed: ${err.message || 'could not load photo'}`)
    }
  }

  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')

  function dropPin() {
    if (!navigator.geolocation) {
      setPinError('GPS not available on this device')
      return
    }
    setPinLoading(true)
    setPinError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPinLoading(false)
      },
      err => {
        setPinError(err.message || 'Could not get GPS')
        setPinLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }

  function clearPin() {
    onChange({ lat: undefined, lng: undefined })
    setPinError('')
  }

  const flyOptions = FLY_DATA[flyCategory] || FLY_DATA['Dry Flies']
  // Built-in flies first, then the user's remembered custom flies for this category.
  const allFlyOptions = [...flyOptions, ...customFlies.filter(f => !flyOptions.includes(f))]

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.num}>#{index + 1}</span>
        <button className={styles.removeBtn} onClick={onRemove}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          Remove
        </button>
      </div>

      {/* Photo */}
      <div className={styles.photoArea}>
        {/* Two inputs: `capture` opens the live camera, the other the gallery/files. */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} hidden />
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} hidden />
        {catch_.photoPreview ? (
          <>
            <img src={catch_.photoPreview} alt="catch" className={styles.photo} />
            <div className={styles.photoActions}>
              {onSetHero && (
                <button
                  className={`${styles.heroBtn} ${isHero ? styles.heroBtnActive : ''}`}
                  onClick={e => { e.stopPropagation(); onSetHero() }}
                >
                  ★ Hero
                </button>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={styles.replaceBtn} onClick={e => { e.stopPropagation(); reIdentify() }} disabled={identifying}>
                  {identifying ? '...' : 'Re-ID'}
                </button>
                <button className={styles.replaceBtn} onClick={e => { e.stopPropagation(); cameraRef.current?.click() }}>
                  Camera
                </button>
                <button className={styles.replaceBtn} onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
                  Gallery
                </button>
              </div>
            </div>
            {identifying && (
              <div className={styles.identifying}>
                <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                Identifying…
              </div>
            )}
          </>
        ) : (
          <div className={styles.photoPlaceholder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="30" height="30">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div className={styles.photoChoices}>
              <button className={styles.choiceBtn} onClick={() => cameraRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                Take Photo
              </button>
              <button className={styles.choiceBtn} onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Gallery
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI result banner */}
      {aiResult && (
        <div className={styles.aiBanner}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          {aiResult}
        </div>
      )}

      {catch_.kind === 'flower' && (
        <div className={styles.aiBanner} style={{ background: '#fef3c7', color: '#92400e' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          No fish detected — this photo won&apos;t be saved as a catch.
        </div>
      )}

      {catch_.kind === 'none' && (
        <div className={styles.aiBanner} style={{ background: '#fef3c7', color: '#92400e' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          No fish or flower in this photo — this entry won&apos;t be saved as a catch.
        </div>
      )}

      {/* Species - full width above grid */}
      <div className={styles.speciesField}>
        <label className={styles.label}>Species</label>
        <SpeciesSelect
          value={catch_.species}
          onChange={species => onChange({ species })}
        />
      </div>

      <div className={styles.fields}>
        {/* Length */}
        <div className={styles.field}>
          <label className={styles.label}>Length (in)</label>
          <input
            type="number"
            className={styles.input}
            value={catch_.length || ''}
            onChange={e => onChange({ length: e.target.value ? parseFloat(e.target.value) : undefined })}
            placeholder="—"
            step="0.5"
          />
        </div>

        {/* Time */}
        <div className={styles.field}>
          <label className={styles.label}>Time Caught</label>
          <input
            type="time"
            className={styles.input}
            value={catch_.time_caught || ''}
            onChange={e => onChange({ time_caught: e.target.value })}
          />
        </div>
      </div>

      {/* Fly category */}
      <div className={styles.flySection}>
        <label className={styles.label}>Fly Used</label>
        <div className={styles.catPills}>
          {Object.keys(FLY_DATA).map(cat => (
            <button
              key={cat}
              className={`${styles.catPill} ${flyCategory === cat ? styles.catPillActive : ''}`}
              onClick={() => { setFlyCategory(cat); onChange({ fly_category: cat, fly: '' }) }}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className={styles.flyPills}>
          {allFlyOptions.map(fly => (
            <button
              key={fly}
              className={`${styles.flyPill} ${catch_.fly === fly ? styles.flyPillActive : ''}`}
              onClick={() => chooseFly(fly)}
            >
              {fly}
            </button>
          ))}
        </div>
        <input
          className={styles.customFly}
          value={!allFlyOptions.includes(catch_.fly || '') ? (catch_.fly || '') : ''}
          onChange={e => onChange({ fly: e.target.value })}
          onBlur={e => saveCustomFly(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCustomFly((e.target as HTMLInputElement).value) } }}
          placeholder="Or type a custom fly..."
        />
      </div>

      {/* Fly size */}
      <div className={styles.sizeRow}>
        <label className={styles.label}>Fly Size</label>
        <div className={styles.sizePills}>
          {FLY_SIZES.map(sz => (
            <button
              key={sz}
              className={`${styles.sizePill} ${catch_.fly_size === sz ? styles.sizePillActive : ''}`}
              onClick={() => onChange({ fly_size: sz })}
            >
              #{sz}
            </button>
          ))}
        </div>
      </div>

      {/* Catch pin */}
      <div className={styles.pinRow}>
        <label className={styles.label}>Catch Location</label>
        {catch_.lat != null && catch_.lng != null ? (
          <div className={styles.pinDisplay}>
            <svg viewBox="0 0 24 24" fill="#1e4d43" stroke="white" strokeWidth="1.5" width="14" height="14">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3" fill="white" stroke="none"/>
            </svg>
            <span className={styles.pinCoords}>
              {catch_.lat.toFixed(5)}, {catch_.lng.toFixed(5)}
            </span>
            <button type="button" className={styles.pinClear} onClick={clearPin}>Clear</button>
          </div>
        ) : (
          <button type="button" className={styles.pinBtn} onClick={dropPin} disabled={pinLoading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            {pinLoading ? 'Locating…' : 'Drop Pin'}
          </button>
        )}
        {pinError && <div className={styles.pinError}>{pinError}</div>}
      </div>

      {/* Notes */}
      <textarea
        className={styles.notes}
        value={catch_.notes || ''}
        onChange={e => onChange({ notes: e.target.value })}
        placeholder="Notes about this catch..."
        rows={2}
      />
    </div>
  )
}

