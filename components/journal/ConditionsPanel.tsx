'use client'

import { useState } from 'react'
import styles from './ConditionsPanel.module.css'

interface Conditions {
  flow: string
  water_temp: string
  gauge_height: string
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
  const [loadingRefresh, setLoadingRefresh] = useState(false)
  const [usgsStatus, setUsgsStatus] = useState('')

  function getMoon(dateStr: string) {
    const synodic = 29.53058867
    const known = new Date('2000-01-06')
    const diff = (new Date(dateStr).getTime() - known.getTime()) / 86400000
    const phase = ((diff % synodic) + synodic) % synodic
    const phases = ['🌑 New Moon','🌒 Waxing Crescent','🌓 First Quarter','🌔 Waxing Gibbous',
                    '🌕 Full Moon','🌖 Waning Gibbous','🌗 Last Quarter','🌘 Waning Crescent']
    return phases[Math.round(phase / synodic * 8) % 8]
  }

  async function refresh() {
    if (!location) return
    setLoadingRefresh(true)
    try {
      // Fetch USGS
      const usgsParams = new URLSearchParams({ type: 'usgs', location: location.name, lat: String(location.lat), lng: String(location.lng), date })
      if (conditions.usgs_site_id) usgsParams.set('siteId', conditions.usgs_site_id)
      const usgsResp = await fetch(`/api/conditions?${usgsParams}`)
      const usgsData = await usgsResp.json()
      if (!usgsData.error) {
        onChange({
          ...conditions,
          flow: usgsData.flow || conditions.flow,
          water_temp: usgsData.waterTemp || conditions.water_temp,
          gauge_height: usgsData.gaugeHeight || conditions.gauge_height,
          usgs_site_id: usgsData.siteId || conditions.usgs_site_id,
        })
      }
      // Fetch weather
      const wxResp = await fetch(`/api/conditions?type=weather&lat=${location.lat}&lng=${location.lng}&date=${date}`)
      const wxData = await wxResp.json()
      if (!wxData.error) {
        onChange({
          ...conditions,
          flow: usgsData.flow || conditions.flow,
          water_temp: usgsData.waterTemp || conditions.water_temp,
          gauge_height: usgsData.gaugeHeight || conditions.gauge_height,
          usgs_site_id: usgsData.siteId || conditions.usgs_site_id,
          air_temp: wxData.airTemp || conditions.air_temp,
          weather: wxData.weather || conditions.weather,
          baro: wxData.baro || conditions.baro,
          wind: wxData.wind || conditions.wind,
          moon: getMoon(date),
        })
      }
    } catch {}
    setLoadingRefresh(false)
  }

  async function fetchOverride() {
    if (!conditions.usgs_site_id) return
    setLoadingRefresh(true)
    setUsgsStatus('Fetching...')
    try {
      const resp = await fetch(`/api/conditions?type=usgs&siteId=${conditions.usgs_site_id}&date=${date}`)
      const data = await resp.json()
      if (data.error) { setUsgsStatus(data.error) }
      else {
        onChange({ ...conditions, flow: data.flow || conditions.flow, water_temp: data.waterTemp || conditions.water_temp, gauge_height: data.gaugeHeight || conditions.gauge_height, usgs_site_id: data.siteId || conditions.usgs_site_id })
        setUsgsStatus(`Gauge ${data.siteId} loaded`)
      }
    } catch { setUsgsStatus('Fetch failed') }
    setLoadingRefresh(false)
  }

  const u = (field: keyof Conditions) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...conditions, [field]: e.target.value })

  const hasUSGS = conditions.flow || conditions.water_temp

  return (
    <div className={styles.panel}>
      {/* USGS Section */}
      <div className={styles.sectionLabel}>
        <div className={styles.sectionLabelLeft}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          Live Conditions · USGS
        </div>
        <button className={styles.refreshBtn} onClick={refresh} disabled={loadingRefresh}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loadingRefresh ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Big data cells */}
      <div className={styles.dataRow}>
        <div className={styles.dataCell}>
          <div className={styles.dataCellLabel}>Flow (CFS)</div>
          <div className={styles.dataCellValue}>{conditions.flow ? `${conditions.flow} cfs` : 'N/A'}</div>
          {conditions.flow && <div className={styles.dataCellSub}>saved</div>}
        </div>
        <div className={styles.dataCell}>
          <div className={styles.dataCellLabel}>Water Temp</div>
          <div className={styles.dataCellValue}>{conditions.water_temp ? `${conditions.water_temp}°F` : 'N/A'}</div>
          {conditions.water_temp && <div className={styles.dataCellSub}>°C ↔ °F</div>}
        </div>
        <div className={styles.dataCell}>
          <div className={styles.dataCellLabel}>Gauge Ht</div>
          <div className={styles.dataCellValue}>{conditions.gauge_height ? `${conditions.gauge_height} ft` : 'N/A'}</div>
          {conditions.gauge_height && <div className={styles.dataCellSub}>saved</div>}
        </div>
      </div>

      {/* Override USGS site ID */}
      <div className={styles.overrideRow}>
        <input
          className={styles.siteInput}
          value={conditions.usgs_site_id}
          onChange={u('usgs_site_id')}
          placeholder="Override: USGS site ID (optional)"
        />
        <button className={styles.overrideFetchBtn} onClick={fetchOverride} disabled={loadingRefresh}>
          Fetch
        </button>
      </div>
      {usgsStatus && <p className={styles.usgsStatus}>{usgsStatus}</p>}

      {/* Other conditions */}
      <div className={styles.otherLabel}>Other Conditions</div>
      <div className={styles.grid}>
        <div>
          <label className={styles.condLabel}>Air Temp (°F)</label>
          <input className={styles.condInput} value={conditions.air_temp} onChange={u('air_temp')} placeholder="—" />
        </div>
        <div>
          <label className={styles.condLabel}>Barometric (inHg)</label>
          <input className={styles.condInput} value={conditions.baro} onChange={u('baro')} placeholder="—" />
        </div>
        <div>
          <label className={styles.condLabel}>Weather</label>
          <input className={styles.condInput} value={conditions.weather} onChange={u('weather')} placeholder="—" />
        </div>
        <div>
          <label className={styles.condLabel}>Wind</label>
          <input className={styles.condInput} value={conditions.wind} onChange={u('wind')} placeholder="—" />
        </div>
      </div>

      {/* Moon */}
      <div className={styles.moonRow}>
        <span className={styles.moonLabel}>Moon</span>
        <span className={styles.moonVal}>{conditions.moon || getMoon(date)}</span>
      </div>
    </div>
  )
}
