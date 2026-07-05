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
  photoUrl?: string
}

export interface CameraView {
  center: [number, number]
  zoom: number
  bearing?: number
  pitch?: number
}

interface Props {
  lat: number
  lng: number
  catches?: CatchPin[]
  onCatchClick?: (catchId: string) => void
  // Restore a previous camera (so closing a catch returns to the same zoom/pan).
  initialView?: CameraView
  // Reports the camera after any pan/zoom so the parent can persist it.
  onCameraChange?: (view: CameraView) => void
}

// Coerce because Supabase returns numeric / decimal columns as strings at
// runtime — even though our TS types say `number`. Without Number() the
// arithmetic below is string concatenation and the centroid comes back NaN,
// which Mapbox silently maps to [0, 0] (the catch then "always" ends up in
// the upper-left of the visible map).
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

// Center on the catches (not on a bounds-fit framing) so the fish marker is
// the focal point. The trip pin shows wherever it falls — usually nearby. No
// fitBounds, no edge-jamming, and crucially nothing in the effect dep array
// that could re-fire and yank the camera while the user is interacting.
export default function FullMap({ lat, lng, catches, onCatchClick, initialView, onCameraChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const onCatchClickRef = useRef(onCatchClick)
  const onCameraChangeRef = useRef(onCameraChange)

  useEffect(() => { onCatchClickRef.current = onCatchClick }, [onCatchClick])
  useEffect(() => { onCameraChangeRef.current = onCameraChange }, [onCameraChange])

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
      center: initialView ? initialView.center : [focus.lng, focus.lat],
      zoom: initialView ? initialView.zoom : (validCatches.length > 0 ? 14 : 13),
      bearing: initialView?.bearing ?? 0,
      pitch: initialView?.pitch ?? 0,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Report camera after any settle so the parent can restore it on reopen.
    map.on('moveend', () => {
      const c = map.getCenter()
      onCameraChangeRef.current?.({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    })

    new mapboxgl.Marker({ color: '#1e4d43' })
      .setLngLat([tripLng, tripLat])
      .addTo(map)

    const catchMarkers: mapboxgl.Marker[] = []
    for (const c of validCatches) {
      const el = makeCatchMarkerEl(c.species, c.photoUrl)
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
