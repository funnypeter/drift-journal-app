'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
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
}

function centroid(catches: CatchPin[], fallbackLat: number, fallbackLng: number) {
  if (!catches.length) return { lat: fallbackLat, lng: fallbackLng }
  const sum = catches.reduce(
    (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
    { lat: 0, lng: 0 }
  )
  return { lat: sum.lat / catches.length, lng: sum.lng / catches.length }
}

// Center on the catches (not on a bounds-fit framing) so the fish marker is
// the focal point. The trip pin shows wherever it falls — usually nearby. No
// fitBounds, no edge-jamming, and crucially nothing in the effect dep array
// that could re-fire and yank the camera while the user is interacting.
export default function FullMap({ lat, lng, catches, onCatchClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onCatchClickRef = useRef(onCatchClick)

  useEffect(() => { onCatchClickRef.current = onCatchClick }, [onCatchClick])

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const validCatches = (catches || []).filter(c => c.lat != null && c.lng != null)
    const focus = centroid(validCatches, lat, lng)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [focus.lng, focus.lat],
      zoom: validCatches.length > 0 ? 14 : 13,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    new mapboxgl.Marker({ color: '#1e4d43' })
      .setLngLat([lng, lat])
      .addTo(map)

    const catchMarkers: mapboxgl.Marker[] = []
    for (const c of validCatches) {
      const el = makeCatchMarkerEl(c.species)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onCatchClickRef.current?.(c.id)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([c.lng, c.lat])
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
