'use client'

import { useState, useRef } from 'react'
import styles from './LocationSearch.module.css'

interface LocationResult {
  name: string
  lat: number
  lng: number
  state: string
  display: string
}

interface Props {
  onSelect: (loc: { name: string; lat: number; lng: number; state: string }) => void
  defaultValue?: string
}

export default function LocationSearch({ onSelect, defaultValue = '' }: Props) {
  const [query, setQuery] = useState(defaultValue)
  const [results, setResults] = useState<LocationResult[]>([])
  const [loading, setLoading] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const timerRef = useRef<NodeJS.Timeout>()

  function handleInput(value: string) {
    setQuery(value)
    clearTimeout(timerRef.current)
    if (!value.trim() || value.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(() => search(value), 400)
  }

  async function search(q: string) {
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`
      const resp = await fetch(url, { headers: { 'User-Agent': 'DriftJournal/2.0' } })
      const data = await resp.json()
      setResults(data.map((p: any) => ({
        name: `${p.name || q}${p.address?.state ? ', ' + p.address.state : ''}`,
        lat: parseFloat(p.lat),
        lng: parseFloat(p.lon),
        state: p.address?.state || '',
        display: [p.address?.county, p.address?.state].filter(Boolean).join(', '),
      })))
    } catch { setResults([]) }
    setLoading(false)
  }

  async function useGPS() {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'User-Agent': 'DriftJournal/2.0' } }
          )
          const data = await resp.json()
          const name = data.name || data.address?.river || data.address?.natural || 'Current Location'
          const state = data.address?.state || ''
          onSelect({ name: name + (state ? `, ${state}` : ''), lat, lng, state })
        } catch {
          onSelect({ name: 'Current Location', lat, lng, state: '' })
        }
        setGpsLoading(false)
      },
      () => setGpsLoading(false)
    )
  }

  return (
    <div className={styles.container}>
      {/* GPS */}
      <button className={styles.gpsBtn} onClick={useGPS} disabled={gpsLoading}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" opacity="0.2"/>
        </svg>
        {gpsLoading ? 'Detecting...' : 'Use my current location'}
      </button>

      <div className={styles.divider}><span>or search</span></div>

      {/* Search input */}
      <div className={styles.inputWrap}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          className={styles.input}
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Search rivers, lakes, streams..."
          autoFocus
        />
        {loading && <div className={styles.spinner} />}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((r, i) => (
            <button key={i} className={styles.result} onClick={() => onSelect(r)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" className={styles.pin}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <div>
                <div className={styles.resultName}>{r.name}</div>
                {r.display && <div className={styles.resultSub}>{r.display}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
