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

// Supabase returns numeric/decimal columns as strings at runtime. Without
// this coercion, the centroid arithmetic becomes string concatenation,
// centroid returns NaN, and Mapbox lands the map at [0, 0] — which is what
// was making the fish marker appear in the upper-left corner regardless of
// where it was actually pinned.
function n(x: number | string | null | undefined): number {
  return typeof x === 'number' ? x : Number(x ?? NaN)
}

function centroid(catches: CatchPin[], fallbackLat: number, fallbackLng: number) {
  if (!catches.length) return { lat: fallbackLat, lng: fallbackLng }
  const sum = catches.reduce(
    (acc, c) => ({ lat: acc.lat + n(c.lat), lng: acc.lng + n(c.lng) }),
    { lat: 0, lng: 0 }
  )
  return { lat: sum.lat / catches.length, lng: sum.lng / catches.length }
}

// Mounts once; effect deps are empty, callbacks read from refs. The map
// centers on the catches centroid (or the trip if there are no pins). This
// keeps the fish marker visually centered rather than tucked into a corner
// the way fitBounds did, and avoids any camera reset on click.
export default function LocationMiniMap({ lat, lng, catches, onCatchClick, onExpand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onCatchClickRef = useRef(onCatchClick)
  const onExpandRef = useRef(onExpand)

  useEffect(() => { onCatchClickRef.current = onCatchClick }, [onCatchClick])
  useEffect(() => { onExpandRef.current = onExpand }, [onExpand])

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const tripLat = n(lat)
    const tripLng = n(lng)
    const validCatches = (catches || []).filter(c => c.lat != null && c.lng != null)
    const focus = centroid(validCatches, tripLat, tripLng)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [focus.lng, focus.lat],
      zoom: validCatches.length > 0 ? 13 : 12,
      interactive: false,
      attributionControl: false,
    })
    mapRef.current = map

    map.once('load', () => {
      if (validCatches.length > 0) {
        map.jumpTo({ center: [focus.lng, focus.lat], zoom: 13 })
      }
    })

    if (typeof window !== 'undefined') {
      console.log('[LocationMiniMap]', {
        focus,
        tripLat, tripLng,
        validCatches: validCatches.map(c => ({ id: c.id, lat: c.lat, lng: c.lng, typeofLat: typeof c.lat })),
      })
    }

    new mapboxgl.Marker({ color: '#1e4d43' })
      .setLngLat([tripLng, tripLat])
      .addTo(map)

    const catchMarkers: mapboxgl.Marker[] = []
    for (const c of validCatches) {
      const el = makeCatchMarkerEl(c.species)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onCatchClickRef.current?.(c.id)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([n(c.lng), n(c.lat)])
        .addTo(map)
      catchMarkers.push(marker)
    }

    return () => {
      catchMarkers.forEach(m => m.remove())
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
      {onExpand && (
        <button
          type="button"
          aria-label="Expand map"
          onClick={(e) => { e.stopPropagation(); onExpandRef.current?.() }}
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
