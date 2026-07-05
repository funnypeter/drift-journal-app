'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { Trip, Catch } from '@/types'
import { realCatches, isNoFish } from '@/lib/catchUtils'
import { formatDate } from '@/lib/dateUtils'
import styles from './TripDetail.module.css'

const LocationMiniMap = dynamic(() => import('./LocationMiniMap'), { ssr: false })
const FullMap = dynamic(() => import('./FullMap'), { ssr: false })

function getMoonPhase(dateStr: string) {
  const date = new Date(dateStr)
  const synodic = 29.53058867
  const known = new Date('2000-01-06')
  const diff = (date.getTime() - known.getTime()) / 86400000
  const phase = ((diff % synodic) + synodic) % synodic
  const phases = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘']
  return phases[Math.round(phase / synodic * 8) % 8]
}

// Read-only public view rendered at /share/<id>. No Edit / Delete / Share /
// owner-only affordances — anyone with the link sees just the trip story.
// Otherwise mirrors TripDetail's display so the public report and the
// owner's private view look the same.
export default function PublicTripView({ trip }: { trip: Trip }) {
  const [expandedCatch, setExpandedCatch] = useState<Catch | null>(null)
  const [showFullMap, setShowFullMap] = useState(false)
  const [returnToFullMap, setReturnToFullMap] = useState(false)

  const catches = trip.catches || []

  const mapCatches = useMemo(
    () => [
      ...catches
        .filter(c => c.lat != null && c.lng != null)
        .map(c => ({ id: c.id, lat: c.lat as number, lng: c.lng as number, species: c.species, photoUrl: c.photo_url || undefined })),
      ...(trip.garmin_pins || [])
        .filter(p => p.lat != null && p.lng != null)
        .map((p, i) => ({ id: `pin-${i}`, lat: p.lat, lng: p.lng, species: undefined as string | undefined, photoUrl: undefined as string | undefined })),
    ],
    [catches, trip.garmin_pins]
  )

  const openCatchById = useCallback((id: string) => {
    const c = catches.find(x => x.id === id)
    if (c) setExpandedCatch(c)
  }, [catches])

  const handleFullMapCatchClick = useCallback((id: string) => {
    const c = catches.find(x => x.id === id)
    if (!c) return // bare Garmin pin — stay on the map
    setShowFullMap(false)
    setReturnToFullMap(true)
    setExpandedCatch(c)
  }, [catches])

  const closeCatch = useCallback(() => {
    setExpandedCatch(null)
    if (returnToFullMap) {
      setShowFullMap(true)
      setReturnToFullMap(false)
    }
  }, [returnToFullMap])

  const handleExpand = useCallback(() => setShowFullMap(true), [])

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.backBtn} aria-label="Drift Journal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M3 12l2-2 7-7 7 7 2 2"/>
            <path d="M5 10v10h14V10"/>
          </svg>
        </Link>
        <div className={styles.topActions}>
          <span style={{ fontSize: 11, color: '#888', fontFamily: 'var(--sans)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Shared trip report
          </span>
        </div>
      </div>

      <div className={styles.dateLabel}>
        {formatDate(trip.date).toUpperCase()}
      </div>
      <h1 className={styles.title}>{trip.title}</h1>
      <div className={styles.locationLine}>
        {trip.location}
        {trip.state && <span className={styles.stateLink}> • {trip.state}</span>}
      </div>

      {trip.lat && trip.lng && (
        <div className={styles.mapWrap}>
          <LocationMiniMap
            lat={trip.lat}
            lng={trip.lng}
            catches={mapCatches}
            onCatchClick={openCatchById}
            onExpand={handleExpand}
          />
        </div>
      )}

      <div className={styles.condGrid}>
        <Cond label="Water Flow" value={trip.flow ? `${trip.flow} cfs` : 'N/A'} />
        <Cond label="Water Temp" value={trip.water_temp ? `${trip.water_temp}°F` : 'N/A'} />
        <Cond label="Gauge Ht" value={trip.gauge_height ? `${trip.gauge_height} ft` : 'N/A'} />
        <Cond label="Barometric" value={trip.baro ? `${trip.baro} inHg` : 'N/A'} />
        <Cond label="Air Temp" value={trip.air_temp || 'N/A'} />
        <Cond label="Weather" value={trip.weather || 'N/A'} />
        <Cond label="Moon" value={getMoonPhase(trip.date)} />
      </div>

      {trip.notes && (
        <div className={styles.notes}>
          <p>{trip.notes}</p>
        </div>
      )}

      {catches.length > 0 && (
        <div className={styles.catches}>
          <div className={styles.catchHeader}>
            <h2 className={styles.catchTitle}>Catch Gallery</h2>
            <span className={styles.catchCount}>({realCatches(catches).length} total)</span>
          </div>
          <div className={styles.catchGrid}>
            {catches.map(c => (
              <div key={c.id} className={styles.catchCard} onClick={() => setExpandedCatch(c)}>
                <div className={styles.catchPhoto}>
                  {c.photo_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.photo_url} alt="" aria-hidden="true" className={styles.catchImgBlur} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.photo_url} alt={c.species} className={styles.catchImg} />
                    </>
                  ) : (
                    <div className={styles.catchNoPhoto}>
                      <svg viewBox="0 0 40 28" fill="none">
                        <path d="M3 14Q10 7 17 11Q24 15 31 9Q36 4 39 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className={styles.catchInfo}>
                  <div className={styles.catchInfoGrid}>
                    <div>
                      <div className={styles.catchLabel}>Species</div>
                      <div className={styles.catchValue}>{c.species || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className={styles.catchLabel}>Fly</div>
                      <div className={styles.catchValue}>{c.fly || '—'}</div>
                    </div>
                    <div>
                      <div className={styles.catchLabel}>Length</div>
                      <div className={styles.catchValue}>{c.length ? `${c.length} in` : '—'}</div>
                    </div>
                    <div>
                      <div className={styles.catchLabel}>Fly Size</div>
                      <div className={styles.catchValue}>{c.fly_size ? `#${c.fly_size}` : '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedCatch && (() => {
        const real = realCatches(catches)
        const realIdx = real.findIndex(c => c.id === expandedCatch.id)
        return (
          <div className={styles.overlay} onClick={closeCatch}>
            <div className={styles.expandedCard} onClick={e => e.stopPropagation()}>
              {expandedCatch.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={expandedCatch.photo_url} alt={expandedCatch.species} className={styles.expandedImg} />
              ) : (
                <div className={styles.expandedNoPhoto} />
              )}
              <div className={styles.expandedOverlay}>
                <div className={styles.expandedLine} />
                <h3 className={styles.expandedSpecies}>{expandedCatch.species || 'Unknown'}</h3>
                <div className={styles.expandedStats}>
                  {expandedCatch.length && <div><span className={styles.expandedStatLabel}>Length</span><span className={styles.expandedStatVal}>{expandedCatch.length}&quot;</span></div>}
                  {expandedCatch.fly_size && <div><span className={styles.expandedStatLabel}>Size</span><span className={styles.expandedStatVal}>#{expandedCatch.fly_size}</span></div>}
                  {expandedCatch.fly && <div><span className={styles.expandedStatLabel}>Fly</span><span className={styles.expandedStatVal}>{expandedCatch.fly}</span></div>}
                </div>
                {!isNoFish(expandedCatch) && realIdx >= 0 && (
                  <div className={styles.expandedMeta}>{realIdx + 1} of {real.length} catches</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {showFullMap && trip.lat && trip.lng && (
        <div className={styles.overlay} onClick={() => setShowFullMap(false)}>
          <div className={styles.fullMapCard} onClick={e => e.stopPropagation()}>
            <button className={styles.fullMapClose} onClick={() => setShowFullMap(false)} aria-label="Close map">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className={styles.fullMapTitle}>{trip.location}</div>
            <FullMap
              lat={trip.lat}
              lng={trip.lng}
              catches={mapCatches}
              onCatchClick={handleFullMapCatchClick}
            />
          </div>
        </div>
      )}

      {/* Footer attribution — gives the visitor a way back to the app */}
      <div style={{ textAlign: 'center', marginTop: 32, padding: '24px 0', borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: 12, color: '#888', fontFamily: 'var(--sans)' }}>
        Logged with <Link href="/" style={{ color: 'var(--teal, #1e4d43)', fontWeight: 600, textDecoration: 'none' }}>Drift Journal</Link>
      </div>
    </div>
  )
}

function Cond({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.condItem}>
      <div className={styles.condItemLabel}>{label}</div>
      <div className={styles.condItemValue}>{value}</div>
    </div>
  )
}
