import { NextRequest, NextResponse } from 'next/server'

// USGS gauge lookup table
const USGS_GAUGES: Record<string, string> = {
  'Middle Fork Snoqualmie River': '12141300',
  'Snoqualmie River': '12149000',
  'Skykomish River': '12134500',
  'Yakima River': '12499000',
  'Cedar River': '12115000',
  'Sammamish River': '12125000',
  'Green River': '12106700',
  'Methow River': '12449950',
  'Skagit River': '12194000',
  'Madison River': '06043500',
  'Gallatin River': '06043000',
  'Yellowstone River': '06191500',
  'Snake River': '13037500',
  'Silver Creek': '13150800',
  'Salmon River': '13302500',
  'Deschutes River': '14076500',
  'Rogue River': '14358000',
  'Beaverkill River': '01421000',
  'Battenkill River': '01362500',
  'South Platte River': '09080000',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const siteId = searchParams.get('siteId')
  const locationName = searchParams.get('location') || ''
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const date = searchParams.get('date')

  if (type === 'usgs') {
    // Find gauge ID: lookup table → API search
    let gaugeId = siteId
    if (!gaugeId) {
      for (const [key, id] of Object.entries(USGS_GAUGES)) {
        if (locationName.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(locationName.split(',')[0].toLowerCase())) {
          gaugeId = id
          break
        }
      }
    }
    if (!gaugeId && lat && lng) {
      gaugeId = await findNearestGauge(parseFloat(lat), parseFloat(lng))
    }
    if (!gaugeId) return NextResponse.json({ error: 'No gauge found' }, { status: 404 })

    try {
      const result: Record<string, string> = { siteId: gaugeId }
      const today = new Date().toISOString().split('T')[0]
      const isHistorical = date && date < today

      if (isHistorical) {
        // Use daily values for past dates
        const url = `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${gaugeId}&parameterCd=00060,00010,00065&startDT=${date}&endDT=${date}`
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!resp.ok) throw new Error(`USGS error ${resp.status}`)
        const data = await resp.json()
        const series = data.value?.timeSeries || []
        for (const s of series) {
          const code = s.variable?.variableCode?.[0]?.value
          const val = s.values?.[0]?.value?.[0]?.value
          if (!val || val === '-999999') continue
          if (code === '00060') result.flow = parseFloat(val).toFixed(0)
          if (code === '00010') result.waterTemp = (parseFloat(val) * 9/5 + 32).toFixed(1)
          if (code === '00065') result.gaugeHeight = parseFloat(val).toFixed(2)
        }
      } else {
        // Use instantaneous values for today/future
        const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${gaugeId}&parameterCd=00060,00010,00065&siteStatus=active`
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!resp.ok) throw new Error(`USGS error ${resp.status}`)
        const data = await resp.json()
        const series = data.value?.timeSeries || []
        for (const s of series) {
          const code = s.variable?.variableCode?.[0]?.value
          const val = s.values?.[0]?.value?.[0]?.value
          if (!val || val === '-999999') continue
          if (code === '00060') result.flow = parseFloat(val).toFixed(0)
          if (code === '00010') result.waterTemp = (parseFloat(val) * 9/5 + 32).toFixed(1)
          if (code === '00065') result.gaugeHeight = parseFloat(val).toFixed(2)
        }
      }
      return NextResponse.json(result)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
  }

  if (type === 'weather' && lat && lng) {
    const wmoDesc = (code: number) => {
      if (code === 0) return 'Clear'
      if (code <= 3) return 'Partly Cloudy'
      if (code <= 9) return 'Overcast'
      if (code <= 19) return 'Foggy'
      if (code <= 29) return 'Drizzle'
      if (code <= 39) return 'Rain'
      if (code <= 49) return 'Snow'
      if (code <= 59) return `Rain / ${(code * 0.01).toFixed(2)}" precip`
      if (code <= 69) return 'Snow'
      if (code <= 79) return 'Sleet'
      if (code <= 89) return 'Rain showers'
      return 'Thunderstorm'
    }
    const windDirs = ['N','NE','E','SE','S','SW','W','NW']

    const today = new Date().toISOString().split('T')[0]
    const isHistorical = date && date < today

    try {
      if (isHistorical) {
        // Use Open-Meteo historical archive for past dates
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean,weather_code,surface_pressure_mean,wind_speed_10m_max,wind_direction_10m_dominant&temperature_unit=fahrenheit&wind_speed_unit=mph`
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!resp.ok) throw new Error(`Weather error ${resp.status}`)
        const data = await resp.json()
        const d = data.daily
        if (!d?.time?.length) throw new Error('No historical weather data')
        const windDir = windDirs[Math.round((d.wind_direction_10m_dominant?.[0] || 0) / 45) % 8]
        return NextResponse.json({
          airTemp: Math.round(d.temperature_2m_mean[0]) + '°F',
          weather: wmoDesc(d.weather_code[0]),
          baro: d.surface_pressure_mean?.[0] ? (d.surface_pressure_mean[0] * 0.02953).toFixed(2) : undefined,
          wind: Math.round(d.wind_speed_10m_max[0]) + ' mph ' + windDir,
        })
      } else {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&pressure_msl=auto&forecast_days=1`
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!resp.ok) throw new Error(`Weather error ${resp.status}`)
        const data = await resp.json()
        const c = data.current
        const windDir = windDirs[Math.round(c.wind_direction_10m / 45) % 8]
        return NextResponse.json({
          airTemp: Math.round(c.temperature_2m) + '°F',
          weather: wmoDesc(c.weather_code),
          baro: (c.surface_pressure * 0.02953).toFixed(2),
          wind: Math.round(c.wind_speed_10m) + ' mph ' + windDir,
        })
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}

async function findNearestGauge(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${(lng-0.5).toFixed(2)},${(lat-0.5).toFixed(2)},${(lng+0.5).toFixed(2)},${(lat+0.5).toFixed(2)}&parameterCd=00060&siteType=ST&siteStatus=active`
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return null
    const text = await resp.text()
    const lines = text.split('\n').filter(l => /^\d/.test(l))
    if (!lines.length) return null
    let best: string | null = null, bestDist = Infinity
    for (const line of lines) {
      const cols = line.split('\t')
      if (cols.length < 6) continue
      const slat = parseFloat(cols[4]), slng = parseFloat(cols[5])
      if (!slat || !slng) continue
      const dist = Math.sqrt((slat-lat)**2 + (slng-lng)**2)
      if (dist < bestDist) { bestDist = dist; best = cols[1] }
    }
    return best
  } catch { return null }
}
