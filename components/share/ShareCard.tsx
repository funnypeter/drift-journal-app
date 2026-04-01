'use client'

import { useEffect, useRef, useState } from 'react'
import type { Trip, Catch, Platform } from '@/types'
import { PLATFORMS } from '@/types'
import styles from './ShareCard.module.css'

interface Tag { key: string; label: string; on: boolean }

function buildTags(trip: Trip, catch_: Catch): Tag[] {
  const tags: Tag[] = []
  if (trip.location) tags.push({ key: 'location', label: trip.location.split(',')[0], on: true })
  if (catch_.length) tags.push({ key: 'size', label: `${catch_.length}"`, on: true })
  if (trip.flow) tags.push({ key: 'flow', label: `${trip.flow} CFS`, on: true })
  if (trip.water_temp) tags.push({ key: 'watertemp', label: `${trip.water_temp}°F`, on: true })
  if (trip.moon) tags.push({ key: 'moon', label: trip.moon, on: true })
  if (trip.date) {
    const d = new Date(trip.date)
    tags.push({ key: 'date', label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(), on: true })
  }
  if (catch_.fly) tags.push({ key: 'fly', label: catch_.fly, on: true })
  if (catch_.fly_size) tags.push({ key: 'flysize', label: `#${catch_.fly_size}`, on: true })
  if (trip.baro) tags.push({ key: 'baro', label: `${trip.baro} inHg`, on: true })
  return tags
}

function drawCard(canvas: HTMLCanvasElement, trip: Trip, catch_: Catch, tags: Tag[], platform: Platform) {
  const W = platform.w
  const H = platform.h
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const PAD = W * 0.06
  const activeTags = tags.filter(t => t.on && t.key !== 'location' && t.key !== 'date')
  const locationTag = tags.find(t => t.key === 'location')
  const dateTag = tags.find(t => t.key === 'date')
  const location = locationTag?.on ? (trip.location || '').split(',')[0] : ''

  function render() {
    // Minimal top vignette for text legibility only
    const topH = H * 0.22
    const topGrad = ctx.createLinearGradient(0, 0, 0, topH)
    topGrad.addColorStop(0, 'rgba(0,0,0,0.52)')
    topGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, W, topH)

    // Bottom vignette only if there are tags
    if (activeTags.length > 0) {
      const botH = H * 0.30
      const botGrad = ctx.createLinearGradient(0, H - botH, 0, H)
      botGrad.addColorStop(0, 'rgba(0,0,0,0)')
      botGrad.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = botGrad
      ctx.fillRect(0, H - botH, W, botH)
    }

    // Location — Playfair italic top left
    if (location) {
      const locSize = Math.round(W * 0.048)
      ctx.font = `italic 600 ${locSize}px "Playfair Display", Georgia, serif`
      ctx.fillStyle = 'white'
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10
      ctx.fillText(location, PAD, PAD * 1.4 + locSize)

      // Date below location
      if (dateTag?.on) {
        const dtSize = Math.round(W * 0.028)
        ctx.font = `500 ${dtSize}px "Inter", system-ui, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.shadowBlur = 6
        ctx.fillText(dateTag.label, PAD, PAD * 1.4 + locSize + dtSize * 1.6)
      }
    }

    // Drift Journal watermark — top right
    const wmSize = Math.round(W * 0.03)
    ctx.font = `italic 700 ${wmSize}px "Playfair Display", Georgia, serif`
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.textAlign = 'right'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8
    ctx.fillText('Drift Journal', W - PAD, PAD * 1.4 + wmSize)
    ctx.textAlign = 'left'
    ctx.shadowBlur = 0

    // Tag pills — bottom
    if (activeTags.length > 0) {
      const tagFontSize = Math.round(W * 0.026)
      const tagPadX = Math.round(W * 0.022)
      const tagPadY = Math.round(W * 0.012)
      const tagGap = Math.round(W * 0.011)
      const tagH = tagFontSize + tagPadY * 2
      const tagLineH = tagH + tagGap
      ctx.font = `600 ${tagFontSize}px "Inter", system-ui, sans-serif`

      // Wrap tags into rows
      const rows: Array<Array<{ label: string; w: number }>> = [[]]
      let rowW = 0
      const maxRowW = W - PAD * 2
      activeTags.forEach(tag => {
        const tw = ctx.measureText(tag.label).width + tagPadX * 2
        if (rowW + tw + tagGap > maxRowW && rows[rows.length - 1].length > 0) {
          rows.push([]); rowW = 0
        }
        rows[rows.length - 1].push({ label: tag.label, w: tw })
        rowW += tw + tagGap
      })

      const totalTagH = rows.length * tagLineH
      let rowY = H - PAD * 1.0 - totalTagH

      rows.forEach(row => {
        let tx = PAD
        row.forEach(tag => {
          ctx.fillStyle = 'rgba(255,255,255,0.15)'
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'
          ctx.lineWidth = 1.2
          roundRect(ctx, tx, rowY, tag.w, tagH, tagH / 2)
          ctx.fill(); ctx.stroke()
          ctx.fillStyle = 'white'
          ctx.shadowBlur = 0
          ctx.fillText(tag.label, tx + tagPadX, rowY + tagFontSize + tagPadY * 0.65)
          tx += tag.w + tagGap
        })
        rowY += tagLineH
      })
    }
  }

  // Draw photo first
  ctx.fillStyle = '#1e4d43'
  ctx.fillRect(0, 0, W, H)

  if (catch_.photo_url) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const iw = img.width, ih = img.height
      const scale = Math.max(W / iw, H / ih)
      const sw = iw * scale, sh = ih * scale
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
      render()
    }
    img.onerror = render
    img.src = catch_.photo_url
  } else {
    render()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export default function ShareCard({ trip, catch_, onClose }: { trip: Trip; catch_: Catch; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tags, setTags] = useState<Tag[]>(() => buildTags(trip, catch_))
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [customTag, setCustomTag] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, trip, catch_, tags, platform)
  }, [tags, platform])

  function toggleTag(i: number) {
    setTags(prev => prev.map((t, idx) => idx === i ? { ...t, on: !t.on } : t))
  }

  function addCustomTag() {
    if (!customTag.trim()) return
    setTags(prev => [...prev, { key: 'custom', label: customTag.trim(), on: true }])
    setCustomTag('')
  }

  function download() {
    setDownloading(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const name = `${(trip.location || 'drift').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_share.jpg`
    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      setDownloading(false)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.sheet}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Create Share Card</span>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        {/* Canvas preview */}
        <div className={styles.previewWrap} style={{ aspectRatio: `${platform.w}/${platform.h}` }}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>

        {/* Platform pills */}
        <div className={styles.section}>
          <div className={styles.pills}>
            {PLATFORMS.map(p => (
              <button
                key={p.label}
                className={`${styles.pill} ${platform.label === p.label ? styles.pillActive : ''}`}
                onClick={() => setPlatform(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tag toggles */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>TAGS — tap to toggle</div>
          <div className={styles.pills}>
            {tags.map((tag, i) => (
              <button
                key={i}
                className={`${styles.pill} ${tag.on ? styles.pillActive : ''}`}
                onClick={() => toggleTag(i)}
              >
                {tag.label}
              </button>
            ))}
          </div>
          <div className={styles.customRow}>
            <input
              className={styles.customInput}
              value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              placeholder="Add custom tag..."
              onKeyDown={e => e.key === 'Enter' && addCustomTag()}
            />
            <button className={styles.addBtn} onClick={addCustomTag}>+ Add</button>
          </div>
        </div>

        {/* Download */}
        <button className={styles.downloadBtn} onClick={download} disabled={downloading}>
          {downloading ? (
            <span className={styles.spinner} />
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save to Camera Roll
            </>
          )}
        </button>
      </div>
    </div>
  )
}
