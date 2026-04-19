'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Trip, Catch, Platform } from '@/types'
import { PLATFORMS } from '@/types'
import styles from './ShareCard.module.css'

// Tier 1 = large italic title line (usually location)
// Tier 2 = medium inline details line (species · length · fly · fly size)
// Tier 3 = pill tags at the bottom (date, weather, moon, water temp, flow, pressure)
type Tier = 1 | 2 | 3
interface Tag { key: string; label: string; on: boolean; tier: Tier }

function buildTags(trip: Trip, catch_: Catch): Tag[] {
  const tags: Tag[] = []

  // Tier 1 — title
  if (trip.location) tags.push({ key: 'location', label: trip.location.split(',')[0], on: true, tier: 1 })

  // Tier 2 — inline details
  if (catch_.species) tags.push({ key: 'species', label: catch_.species, on: true, tier: 2 })
  if (catch_.length) tags.push({ key: 'length', label: `${catch_.length}"`, on: true, tier: 2 })
  if (catch_.fly) tags.push({ key: 'fly', label: catch_.fly, on: true, tier: 2 })
  if (catch_.fly_size) tags.push({ key: 'fly_size', label: `#${catch_.fly_size}`, on: true, tier: 2 })

  // Tier 3 — conditions pills
  if (trip.date) {
    const d = new Date(trip.date)
    tags.push({ key: 'date', label: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase(), on: false, tier: 3 })
  }
  if (trip.weather) tags.push({ key: 'weather', label: trip.weather, on: false, tier: 3 })
  if (trip.moon) tags.push({ key: 'moon', label: trip.moon, on: false, tier: 3 })
  if (trip.water_temp) tags.push({ key: 'water_temp', label: `${trip.water_temp}°F water`, on: false, tier: 3 })
  if (trip.flow) tags.push({ key: 'flow', label: `${trip.flow} CFS`, on: true, tier: 3 })
  if (trip.baro) tags.push({ key: 'baro', label: `${trip.baro} inHg`, on: false, tier: 3 })

  return tags
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

interface ShareCardProps {
  trip: Trip
  catch_: Catch
  onClose: () => void
  // Caller passes the index/total it already computed for the trip-detail view
  // so the share card never has to recount and can never disagree with what's
  // shown elsewhere on the page.
  catchNumber?: number
  catchTotal?: number
}

export default function ShareCard({ trip, catch_, onClose, catchNumber, catchTotal }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [downloading, setDownloading] = useState(false)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [tags, setTags] = useState<Tag[]>(() => buildTags(trip, catch_))
  const [tagOffset, setTagOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ mode: 'image' | 'tags' | null; startX: number; startY: number; origX: number; origY: number }>({
    mode: null, startX: 0, startY: 0, origX: 0, origY: 0,
  })
  const tagBoundsRef = useRef({ x: 0, y: 0, w: 0, h: 0 }) // in canvas pixel coords
  const imgRef = useRef<HTMLImageElement | null>(null)
  const showCount = typeof catchNumber === 'number' && typeof catchTotal === 'number' && catchTotal > 0

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = platform.w
    const H = platform.h
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const PAD = W * 0.05

    // Background
    ctx.fillStyle = '#1e4d43'
    ctx.fillRect(0, 0, W, H)

    // Draw image with offset and zoom
    if (imgRef.current) {
      const img = imgRef.current
      const iw = img.width, ih = img.height
      const baseScale = Math.max(W / iw, H / ih)
      const scale = baseScale * zoom
      const sw = iw * scale, sh = ih * scale
      const ox = (W - sw) / 2 + imgOffset.x * (W / 400)
      const oy = (H - sh) / 2 + imgOffset.y * (H / 400)
      ctx.drawImage(img, ox, oy, sw, sh)
    }

    // Split active tags by tier.
    const tier1 = tags.find(t => t.on && t.tier === 1)
    const tier2 = tags.filter(t => t.on && t.tier === 2)
    const tier3 = tags.filter(t => t.on && t.tier === 3)

    // Font sizes per tier.
    const tier1Size = Math.round(W * 0.062) // large italic title
    const tier2Size = Math.round(W * 0.036) // medium inline details
    const tagFontSize = Math.round(W * 0.024)
    const tagPadX = Math.round(W * 0.018)
    const tagPadY = Math.round(W * 0.01)
    const tagGap = Math.round(W * 0.01)
    const tagH = tagFontSize + tagPadY * 2
    const tagLineH = tagH + tagGap
    const countSize = Math.round(W * 0.02)
    const lineGap = Math.round(W * 0.014)

    // Wrap tier-3 pills into rows (needs measureText, so set font first).
    ctx.font = `600 ${tagFontSize}px "Inter", system-ui, sans-serif`
    const rows: Array<Array<{ label: string; w: number }>> = [[]]
    let rowW = 0
    const maxRowW = W - PAD * 2
    tier3.forEach(tag => {
      const tw = ctx.measureText(tag.label).width + tagPadX * 2
      if (rowW + tw + tagGap > maxRowW && rows[rows.length - 1].length > 0) {
        rows.push([]); rowW = 0
      }
      rows[rows.length - 1].push({ label: tag.label, w: tw })
      rowW += tw + tagGap
    })
    const showTier3 = tier3.length > 0 && rows[0].length > 0
    const pillsH = showTier3 ? rows.length * tagLineH : 0

    // Compute stacked block height (only lines that are on contribute).
    const tier1H = tier1 ? tier1Size * 1.15 : 0
    const tier2H = tier2.length > 0 ? tier2Size * 1.35 : 0
    const countH = showCount ? countSize * 2 : 0
    const gapsH = [tier1H, tier2H, pillsH, countH].filter(h => h > 0).length > 1
      ? ([tier1H, tier2H, pillsH, countH].filter(h => h > 0).length - 1) * lineGap
      : 0
    const totalH = tier1H + tier2H + pillsH + countH + gapsH

    const blockTop = H - PAD - totalH
    tagBoundsRef.current = {
      x: PAD + tagOffset.x,
      y: blockTop + tagOffset.y,
      w: W - PAD * 2,
      h: totalH,
    }

    // Translate the entire tag block by tagOffset so the user can drag it.
    ctx.save()
    ctx.translate(tagOffset.x, tagOffset.y)

    // Heavier drop shadow keeps the text readable over any photo now that
    // the full-width bottom gradient is gone.
    const enableTextShadow = () => {
      ctx.shadowColor = 'rgba(0,0,0,0.75)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 1
    }
    const disableShadow = () => {
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }

    let y = blockTop

    // Line 1 — large italic title (usually location)
    if (tier1) {
      enableTextShadow()
      ctx.font = `italic 700 ${tier1Size}px "Playfair Display", Georgia, serif`
      ctx.fillStyle = 'white'
      ctx.fillText(tier1.label, PAD, y + tier1Size)
      y += tier1H + lineGap
    }

    // Line 2 — medium inline details (species · length · fly · fly size)
    if (tier2.length > 0) {
      enableTextShadow()
      ctx.font = `600 ${tier2Size}px "Inter", system-ui, sans-serif`
      ctx.fillStyle = 'white'
      ctx.fillText(tier2.map(t => t.label).join('  ·  '), PAD, y + tier2Size)
      y += tier2H + lineGap
    }

    // Line 3 — pill tags (conditions). Draw backgrounds without shadow, then text with shadow.
    if (showTier3) {
      ctx.font = `600 ${tagFontSize}px "Inter", system-ui, sans-serif`

      disableShadow()
      let rowY = y
      rows.forEach(row => {
        let tx = PAD
        row.forEach(tag => {
          roundRect(ctx, tx, rowY, tag.w, tagH, tagH / 2)
          ctx.fillStyle = 'rgba(0,0,0,0.45)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'
          ctx.lineWidth = 1
          ctx.stroke()
          tx += tag.w + tagGap
        })
        rowY += tagLineH
      })

      enableTextShadow()
      rowY = y
      rows.forEach(row => {
        let tx = PAD
        row.forEach(tag => {
          ctx.fillStyle = 'white'
          ctx.fillText(tag.label, tx + tagPadX, rowY + tagFontSize + tagPadY * 0.55)
          tx += tag.w + tagGap
        })
        rowY += tagLineH
      })
      y += pillsH + lineGap
    }

    // Catch count — hidden for No Fish entries (not a real catch)
    if (showCount) {
      enableTextShadow()
      ctx.font = `500 ${countSize}px "Inter", system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(`${catchNumber} of ${catchTotal} catches`, PAD, y + countSize)
    }

    disableShadow()

    // End tag-block translate
    ctx.restore()

    // Logo watermark — top right
    const wmSize = Math.round(W * 0.025)
    ctx.font = `italic 700 ${wmSize}px "Playfair Display", Georgia, serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'right'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 6
    const logoY = PAD * 1.2
    ctx.fillText('Drift Journal', W - PAD, logoY + wmSize * 0.35)
    ctx.textAlign = 'left'
    ctx.shadowBlur = 0

    // Logo icon
    const logoSize = Math.round(W * 0.04)
    const textW = (() => { ctx.font = `italic 700 ${wmSize}px "Playfair Display", Georgia, serif`; return ctx.measureText('Drift Journal').width })()
    const logoX = W - PAD - textW - logoSize - 8
    if (typeof window !== 'undefined') {
      const logoImg = new Image()
      logoImg.crossOrigin = 'anonymous'
      logoImg.onload = () => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(logoX + logoSize / 2, logoY - logoSize * 0.15, logoSize / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(logoImg, logoX, logoY - logoSize * 0.65, logoSize, logoSize)
        ctx.restore()
      }
      logoImg.src = '/icon-192.png'
    }
  }, [platform, imgOffset, tagOffset, zoom, tags, catch_, catchNumber, catchTotal, showCount])

  // Load image
  useEffect(() => {
    if (!catch_.photo_url) { draw(); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; draw() }
    img.onerror = () => draw()
    img.src = catch_.photo_url
  }, [catch_.photo_url, draw])

  useEffect(() => { draw() }, [draw])

  // Drag handlers — hit-test to decide whether the user is grabbing the
  // tag/info block or the background image.
  function onPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY
    const b = tagBoundsRef.current
    const inTags = cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h
    const mode: 'image' | 'tags' = inTags ? 'tags' : 'image'
    const origX = inTags ? tagOffset.x : imgOffset.x
    const origY = inTags ? tagOffset.y : imgOffset.y
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, origX, origY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.mode) return
    const dxScreen = e.clientX - dragRef.current.startX
    const dyScreen = e.clientY - dragRef.current.startY
    if (dragRef.current.mode === 'tags') {
      // Convert screen delta → canvas pixels so tag drag tracks the cursor 1:1.
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      setTagOffset({
        x: dragRef.current.origX + dxScreen * scaleX,
        y: dragRef.current.origY + dyScreen * scaleY,
      })
    } else {
      setImgOffset({ x: dragRef.current.origX + dxScreen, y: dragRef.current.origY + dyScreen })
    }
  }
  function onPointerUp() { dragRef.current.mode = null }

  function toggleTag(i: number) {
    setTags(prev => prev.map((t, idx) => idx === i ? { ...t, on: !t.on } : t))
  }

  function download() {
    setDownloading(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const name = `${(catch_.species || 'catch').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_drift.jpg`
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
        <div className={styles.header}>
          <span className={styles.headerTitle}>Share Card</span>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        {/* Canvas preview — draggable */}
        <div
          className={styles.previewWrap}
          style={{ aspectRatio: `${platform.w}/${platform.h}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.dragHint}>Drag image or tags to reposition</div>
        </div>

        {/* Zoom slider */}
        <div className={styles.section}>
          <div className={styles.zoomRow}>
            <span className={styles.zoomLabel}>Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className={styles.zoomSlider}
            />
            <span className={styles.zoomVal}>{Math.round(zoom * 100)}%</span>
          </div>
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

        {/* Tag toggles — grouped by which line they render on */}
        {([
          { tier: 1 as const, label: 'Line 1 — Title' },
          { tier: 2 as const, label: 'Line 2 — Details' },
          { tier: 3 as const, label: 'Line 3 — Conditions' },
        ]).map(({ tier, label }) => {
          const tierTags = tags.map((tag, i) => ({ tag, i })).filter(({ tag }) => tag.tier === tier)
          if (tierTags.length === 0) return null
          return (
            <div key={tier} className={styles.section}>
              <div className={styles.sectionLabel}>{label}</div>
              <div className={styles.pills}>
                {tierTags.map(({ tag, i }) => (
                  <button
                    key={i}
                    className={`${styles.pill} ${tag.on ? styles.pillActive : ''}`}
                    onClick={() => toggleTag(i)}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}

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
