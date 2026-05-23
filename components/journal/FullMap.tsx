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

export default function FullMap({ lat, lng, catches, onCatchClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [lng, lat],
      zoom: 13,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

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
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 })
    }

    mapRef.current = map
    return () => {
      catchMarkers.forEach(m => m.remove())
      map.remove()
    }
  }, [lat, lng, catches, onCatchClick])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
