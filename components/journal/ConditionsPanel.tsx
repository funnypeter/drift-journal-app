'use client'

import { useState } from 'react'
import styles from './ConditionsPanel.module.css'

interface Conditions {
  flow: string
  water_temp: string
  air_temp: string
  baro: string
  weather: string
  wind: string
  moon: string
  usgs_site_id: string
}

interface Props {
  location: { name: string; lat: number; lng: number; state: string } | null
  date: string
  conditions: Conditions
  onChange: (c: Conditions) => void
}

export default function ConditionsPanel({ location, date, conditions, onChange }: Props) {
  const [loadingUSGS, setLoadingUSGS] = useState(false)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [usgsStatus, setUsgsStatus] = useState('')
  const [expanded, setExpanded] = useState(false)

  function getMoon(dateStr: string) {
    const synodic = 29.53058867
    const known = new Date('2000-01-06')
    const diff = (new Date(dateStr).getTime() - known.getTime()) / 86400000
    const phase = ((diff % synodic) + synodic) % synodic
    const phases = ['🌑 New Moon','🌒 Waxing Crescent','🌓 First Quarter','🌔 Waxing Gibbous',
                    '🌕 Full Moon','🌖 Waning Gibbous','🌗 Last Quarter','🌘 Waning Crescent']
    return phases[Math.round(phase / synodic * 8) % 8]
  }

  async function fetchUSGS() {
    setLoadingUSGS(true)
    setUsgsStatus('Searching for gauge...')
    try {
      const params = new URLSearchParams({ type: 'usgs' })
      if (conditions.usgs_site_id) params.set('siteId', conditions.usgs_site_id)
      if (location?.name) params.set('location', location.name)
      if (location?.lat) params.set('lat', String(location.lat))
      if (location?.lng) params.set('lng', String(location.lng))

      const resp = await fetch(`/api/conditions?${params}`)
      const data = await resp.json()

      if (data.error) { setUsgsStatus(data.error); return }
      onChange({
        ...conditions,
        flow: data.flow || conditions.flow,
        water_temp: data.waterTemp || conditions.water_temp,
        usgs_site_id: data.siteId || conditions.usgs_site_id,
      })
      setUsgsStatus(`Gauge ${data.siteId} loaded`)
    } catch { setUsgsStatus('Fetch failed') }
    setLoadingUSGS(false)
  }

  async function fetchWeather() {
    if (!location) return
    setLoadingWeather(true)
    try {
      const resp = await fetch(`/api/conditions?type=weather&lat=${location.lat}&lng=${location.lng}`)
      const data = await resp.json()
      if (!data.error) {
        onChange({
          ...conditions,
          air_temp: data.airTemp || conditions.air_temp,
          weather: data.weather || conditions.weather,
          baro: data.baro || conditions.baro,
          wind: data.wind || conditions.wind,
          moon: getMoon(date),
        })
      }
    } catch {}
    setLoadingWeather(false)
  }

  const u = (field: keyof Conditions) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...conditions, [field]: e.target.value })

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setExpanded(!expanded)}>
        <div className={styles.toggleLeft}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          Live Conditions · USGS
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {expanded && (
        <div className={styles.content}>
          {/* USGS fetch */}
          <div className={styles.fetchRow}>
            <input
              className={styles.siteInput}
              value={conditions.usgs_site_id}
              onChange={u('usgs_site_id')}
              placeholder="USGS site ID (optional)"
            />
            <button className={styles.fetchBtn} onClick={fetchUSGS} disabled={loadingUSGS}>
              {loadingUSGS ? '...' : 'Fetch'}
            </button>
          </div>
          {usgsStatus && <p className={styles.usgsStatus}>{usgsStatus}</p>}

          {/* Weather fetch */}
          {location && (
            <button className={styles.weatherBtn} onClick={fetchWeather} disabled={loadingWeather}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
              </svg>
              {loadingWeather ? 'Loading weather...' : 'Fetch weather'}
            </button>
          )}

          {/* Fields grid */}
          <div className={styles.grid}>
            <Field label="Flow (CFS)" value={conditions.flow} onChange={u('flow')} placeholder="—"/>
            <Field label="Water Temp" value={conditions.water_temp} onChange={u('water_temp')} placeholder="°F"/>
            <Field label="Air Temp" value={conditions.air_temp} onChange={u('air_temp')} placeholder="°F"/>
            <Field label="Barometric" value={conditions.baro} onChange={u('baro')} placeholder="inHg"/>
            <Field label="Weather" value={conditions.weather} onChange={u('weather')} placeholder="Sunny..."/>
            <Field label="Wind" value={conditions.wind} onChange={u('wind')} placeholder="10 mph NW"/>
          </div>

          {/* Moon */}
          <div className={styles.moonRow}>
            <span className={styles.moonLabel}>Moon</span>
            <span className={styles.moonVal}>{conditions.moon || getMoon(date)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  return (
    <div>
      <label className="cond-label">{label}</label>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8,
          padding: '8px 10px', fontSize: 14, fontFamily: 'var(--sans)',
          background: 'white', outline: 'none'
        }}
      />
    </div>
  )
}
