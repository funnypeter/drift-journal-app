'use client'

import { useRef, useState } from 'react'
import { useIdentify, useProfile } from '@/hooks'
import { FLY_DATA, FLY_SIZES, SPECIES } from '@/types'
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
  photoFile?: File
  photoPreview?: string
}

interface Props {
  index: number
  catch_: CatchDraft
  onChange: (updates: Partial<CatchDraft>) => void
  onRemove: () => void
}

export default function CatchCard({ index, catch_, onChange, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { identify, loading: identifying } = useIdentify()
  const { profile } = useProfile()
  const [flyCategory, setFlyCategory] = useState(catch_.fly_category || 'Dry Flies')
  const [aiResult, setAiResult] = useState('')

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    onChange({ photoFile: file, photoPreview: preview })

    // Auto-identify via Gemini
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      try {
        const result = await identify(base64, file.type, profile?.net_hole_size)
        if (result.species) {
          onChange({ species: result.species, length: result.length ? parseFloat(result.length) : undefined })
          setAiResult(`${result.species} · ${result.length}" · ${result.confidence}% confidence`)
        } else if (result.error) {
          setAiResult(`ID failed: ${result.error}`)
        }
      } catch (err: any) {
        setAiResult(`ID failed: ${err.message}`)
      }
    }
    reader.readAsDataURL(file)
  }

  const flyOptions = FLY_DATA[flyCategory] || FLY_DATA['Dry Flies']

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
      <div className={styles.photoArea} onClick={() => !catch_.photoPreview && fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} hidden />
        {catch_.photoPreview ? (
          <>
            <img src={catch_.photoPreview} alt="catch" className={styles.photo} />
            <button className={styles.replaceBtn} onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
              Replace
            </button>
            {identifying && (
              <div className={styles.identifying}>
                <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                Identifying…
              </div>
            )}
          </>
        ) : (
          <div className={styles.photoPlaceholder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Tap to add photo</span>
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

      <div className={styles.fields}>
        {/* Species */}
        <div className={styles.field}>
          <label className={styles.label}>Species</label>
          <select
            className={styles.select}
            value={catch_.species}
            onChange={e => onChange({ species: e.target.value })}
          >
            <option value="Unknown">Unknown</option>
            {SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

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
          {flyOptions.map(fly => (
            <button
              key={fly}
              className={`${styles.flyPill} ${catch_.fly === fly ? styles.flyPillActive : ''}`}
              onClick={() => onChange({ fly })}
            >
              {fly}
            </button>
          ))}
        </div>
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
