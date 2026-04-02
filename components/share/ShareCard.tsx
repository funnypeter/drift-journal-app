'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Trip, Catch, Platform } from '@/types'
import { PLATFORMS } from '@/types'
import styles from './ShareCard.module.css'

export default function ShareCard({ trip, catch_, onClose }: { trip: Trip; catch_: Catch; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [platform, setPlatform] = useState(PLATFORMS[0])
  const [downloading, setDownloading] = useState(false)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const catches = trip.catches || []
  const catchIndex = catches.findIndex(c => c.id === catch_.id)

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

    // Draw image with offset
    if (imgRef.current) {
      const img = imgRef.current
      const iw = img.width, ih = img.height
      const scale = Math.max(W / iw, H / ih)
      const sw = iw * scale, sh = ih * scale
      const ox = (W - sw) / 2 + imgOffset.x * (W / 400)
      const oy = (H - sh) / 2 + imgOffset.y * (H / 400)
      ctx.drawImage(img, ox, oy, sw, sh)
    }

    // Bottom gradient
    const botH = H * 0.35
    const botGrad = ctx.createLinearGradient(0, H - botH, 0, H)
    botGrad.addColorStop(0, 'rgba(0,0,0,0)')
    botGrad.addColorStop(0.6, 'rgba(0,0,0,0.5)')
    botGrad.addColorStop(1, 'rgba(0,0,0,0.75)')
    ctx.fillStyle = botGrad
    ctx.fillRect(0, H - botH, W, botH)

    // Species name
    const speciesSize = Math.round(W * 0.06)
    ctx.font = `italic 700 ${speciesSize}px "Playfair Display", Georgia, serif`
    ctx.fillStyle = 'white'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 10
    const speciesY = H - PAD - speciesSize * 2.8
    ctx.fillText(catch_.species || 'Unknown', PAD, speciesY)
    ctx.shadowBlur = 0

    // Stats row
    const labelSize = Math.round(W * 0.022)
    const valSize = Math.round(W * 0.035)
    let sx = PAD
    const statsY = speciesY + labelSize * 1.5

    const stats: { label: string; value: string }[] = []
    if (catch_.length) stats.push({ label: 'LENGTH', value: `${catch_.length}"` })
    if (catch_.fly_size) stats.push({ label: 'SIZE', value: `#${catch_.fly_size}` })
    if (catch_.fly) stats.push({ label: 'FLY', value: catch_.fly })

    stats.forEach(s => {
      ctx.font = `700 ${labelSize}px "Inter", system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText(s.label, sx, statsY)
      ctx.font = `700 ${valSize}px "Inter", system-ui, sans-serif`
      ctx.fillStyle = 'white'
      ctx.fillText(s.value, sx, statsY + valSize * 1.2)
      sx += ctx.measureText(s.value).width + W * 0.04
    })

    // Catch count
    const countSize = Math.round(W * 0.022)
    ctx.font = `500 ${countSize}px "Inter", system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText(`${catchIndex + 1} of ${catches.length} catches`, PAD, H - PAD * 0.8)

    // Logo watermark — top right
    const wmSize = Math.round(W * 0.025)
    ctx.font = `italic 700 ${wmSize}px "Playfair Display", Georgia, serif`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'right'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 6

    // Draw logo icon
    const logoSize = Math.round(W * 0.04)
    const logoX = W - PAD - ctx.measureText('Drift Journal').width - logoSize - 8
    const logoY = PAD * 1.2

    ctx.fillText('Drift Journal', W - PAD, logoY + wmSize * 0.35)
    ctx.textAlign = 'left'
    ctx.shadowBlur = 0

    // Logo icon (circle placeholder)
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
  }, [platform, imgOffset, catch_, catches.length, catchIndex])

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

  // Drag handlers
  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: imgOffset.x, origY: imgOffset.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setImgOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy })
  }
  function onPointerUp() { dragRef.current.dragging = false }

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
        {/* Header */}
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
          <div className={styles.dragHint}>Drag to reposition photo</div>
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
