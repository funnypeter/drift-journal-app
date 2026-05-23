'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import styles from './LocationMiniMap.module.css'
import { makeCatchMarkerEl } from './catchMarker'

interface CatchPin {
  id: string
  lat: number
  lng: number
  species?: string
}

interface Props {
  lat: number
  lng: number
  catches?: CatchPin[]
  onCatchClick?: (catchId: string) => void
  onExpand?: () => void
}

export default function LocationMiniMap({ lat, lng, catches, onCatchClick, onExpand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [lng, lat],
      zoom: 12,
      // Mini map: pan/zoom disabled (parent wraps it in a "tap to expand"
      // handler). DOM marker elements still receive clicks regardless.
      interactive: false,
      attributionControl: false,
    })

    new mapboxgl.Marker({ color: '#1e4d43' })
      .setLngLat([lng, lat])
      .addTo(map)

    const catchMarkers: mapboxgl.Marker[] = []
    if (catches && catches.length > 0) {
      const bounds = new mapboxgl.LngLatBounds([lng, lat], [lng, lat])
      for (const c of catches) {
        if (c.lat == null || c.lng == null) continue
        const el = makeCatchMarkerEl(c.species)
        if (onCatchClick) {
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            onCatchClick(c.id)
          })
        }
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.lng, c.lat])
          .addTo(map)
        catchMarkers.push(marker)
        bounds.extend([c.lng, c.lat])
      }
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
    }

    mapRef.current = map
    return () => {
      catchMarkers.forEach(m => m.remove())
      map.remove()
    }
  }, [lat, lng, catches, onCatchClick])

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      {onExpand && (
        <button
          type="button"
          aria-label="Expand map"
          onClick={(e) => { e.stopPropagation(); onExpand() }}
          className={styles.expandBtn}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
      )}
    </div>
  )
}
