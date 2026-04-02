'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Trip } from '@/types'
import styles from './map.module.css'

export default function MapClient({ initialTrips }: { initialTrips: Trip[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map())
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || initialTrips.length === 0) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [initialTrips[0].lng!, initialTrips[0].lat!],
      zoom: 6,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    // Fit bounds to all trips
    const bounds = new mapboxgl.LngLatBounds()
    initialTrips.forEach(t => bounds.extend([t.lng!, t.lat!]))
    map.fitBounds(bounds, { padding: 60, maxZoom: 12 })

    // Add markers
    initialTrips.forEach(t => {
      const catchCount = t.catches?.length || 0
      const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false, className: 'drift-popup', maxWidth: '260px' })
        .setHTML(`
          <div style="padding:14px 16px;font-family:Inter,system-ui,sans-serif">
            <div style="font-weight:800;font-size:15px;color:#1a1a1a;margin-bottom:4px">${t.title}</div>
            <div style="font-size:12px;color:#8a8a7a;margin-bottom:8px">${t.location || ''} · ${dateStr}</div>
            <div style="display:flex;gap:12px;font-size:12px;color:#4a4a4a;margin-bottom:10px">
              <span>💧 ${t.flow ? t.flow + ' cfs' : 'N/A'}</span>
              <span>🌡 ${t.water_temp ? t.water_temp + '°F' : 'N/A'}</span>
            </div>
            <div style="font-size:12px;color:#4a4a4a;margin-bottom:12px">🐟 ${catchCount} catch${catchCount !== 1 ? 'es' : ''}</div>
            <a href="/trips/${t.id}" style="display:block;text-align:center;background:#1e4d43;color:white;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none">View Entry →</a>
          </div>
        `)

      const marker = new mapboxgl.Marker({ color: '#1e4d43' })
        .setLngLat([t.lng!, t.lat!])
        .setPopup(popup)
        .addTo(map)

      marker.getElement().addEventListener('click', () => {
        setSelectedId(t.id)
        const card = cardRefs.current.get(t.id)
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })

      markersRef.current.set(t.id, marker)
      popupsRef.current.set(t.id, popup)
    })

    return () => { map.remove() }
  }, [initialTrips])

  function flyToTrip(tripId: string) {
    const trip = initialTrips.find(t => t.id === tripId)
    if (!trip || !mapRef.current) return
    setSelectedId(tripId)
    mapRef.current.flyTo({ center: [trip.lng!, trip.lat!], zoom: 13 })
    // Open popup
    popupsRef.current.forEach(p => p.remove())
    const popup = popupsRef.current.get(tripId)
    const marker = markersRef.current.get(tripId)
    if (popup && marker) popup.addTo(mapRef.current)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Trip Map</h1>
        <div className={styles.titleLine} />
      </div>

      <div ref={containerRef} className={styles.map}>
        {initialTrips.length === 0 && (
          <div className={styles.empty}>No trips with locations yet</div>
        )}
      </div>

      <div className={styles.list}>
        {initialTrips.map(t => (
          <div
            key={t.id}
            ref={el => { if (el) cardRefs.current.set(t.id, el) }}
            className={`${styles.card} ${selectedId === t.id ? styles.cardActive : ''}`}
            onClick={() => flyToTrip(t.id)}
          >
            <div className={styles.cardLeft}>
              <div className={styles.cardTitle}>{t.title}</div>
              <div className={styles.cardMeta}>
                {t.location && <span>{t.location}</span>}
              </div>
            </div>
            <div className={styles.cardRight}>
              <div className={styles.cardDate}>
                {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className={styles.cardCatches}>
                {t.catches?.length || 0} catch{(t.catches?.length || 0) !== 1 ? 'es' : ''}
              </div>
              <Link href={`/trips/${t.id}`} className={styles.cardLink} onClick={e => e.stopPropagation()}>
                View &rarr;
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
