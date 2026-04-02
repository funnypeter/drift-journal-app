'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Trip, Catch } from '@/types'
import ShareCard from '@/components/share/ShareCard'
import styles from './TripDetail.module.css'

function getMoonPhase(dateStr: string) {
  const date = new Date(dateStr)
  const synodic = 29.53058867
  const known = new Date('2000-01-06')
  const diff = (date.getTime() - known.getTime()) / 86400000
  const phase = ((diff % synodic) + synodic) % synodic
  const phases = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘']
  return phases[Math.round(phase / synodic * 8) % 8]
}

export default function TripDetail({ trip }: { trip: Trip }) {
  const [shareTarget, setShareTarget] = useState<Catch | null>(null)

  const catches = trip.catches || []

  return (
    <div className={styles.container}>
      {/* Back button */}
      <div className={styles.topBar}>
        <Link href="/dashboard" className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Back
        </Link>
        <Link href={`/trips/${trip.id}/edit`} className={styles.editBtn}>Edit</Link>
      </div>

      {/* Title */}
      <div className={styles.titleSection}>
        <h1 className={styles.title}>{trip.title}</h1>
        <div className={styles.meta}>
          {new Date(trip.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {trip.location && <span> · {trip.location}</span>}
        </div>
      </div>

      {/* Conditions */}
      {(trip.air_temp || trip.weather || trip.water_temp || trip.flow || trip.baro || trip.wind) && (
        <div className={styles.conditions}>
          <div className={styles.condLabel}>Live Conditions</div>
          <div className={styles.condGrid}>
            {trip.air_temp && <Cond label="Air Temp" value={trip.air_temp} />}
            {trip.weather && <Cond label="Weather" value={trip.weather} />}
            {trip.water_temp && <Cond label="Water Temp" value={`${trip.water_temp}°F`} />}
            {trip.flow && <Cond label="Flow" value={`${trip.flow} CFS`} />}
            {trip.baro && <Cond label="Barometric" value={`${trip.baro} inHg`} />}
            {trip.wind && <Cond label="Wind" value={trip.wind} />}
            {trip.moon && <Cond label="Moon" value={getMoonPhase(trip.date)} />}
          </div>
        </div>
      )}

      {/* Notes */}
      {trip.notes && (
        <div className={styles.notes}>
          <p>{trip.notes}</p>
        </div>
      )}

      {/* Catches */}
      {catches.length > 0 && (
        <div className={styles.catches}>
          <h2 className={styles.catchTitle}>
            Catch Gallery
            <span className={styles.catchCount}>({catches.length} total)</span>
          </h2>
          <div className={styles.catchGrid}>
            {catches.map(c => (
              <div key={c.id} className={styles.catchCard}>
                {/* Photo */}
                <div className={styles.catchPhoto}>
                  {c.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo_url} alt={c.species} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                  ) : (
                    <div className={styles.catchNoPhoto}>
                      <svg viewBox="0 0 40 28" fill="none"><path d="M3 14Q10 7 17 11Q24 15 31 9Q36 4 39 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </div>
                  )}
                  {/* Share button */}
                  {c.photo_url && (
                    <button className={styles.shareBtn} onClick={() => setShareTarget(c)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                      </svg>
                      Share
                    </button>
                  )}
                </div>

                {/* Info */}
                <div className={styles.catchInfo}>
                  <div className={styles.catchSpecies}>{c.species || 'Unknown'}</div>
                  <div className={styles.catchDetails}>
                    <span><label>Length</label>{c.length ? `${c.length}"` : '—'}</span>
                    <span><label>Fly</label>{c.fly || '—'}</span>
                    <span><label>Size</label>{c.fly_size ? `#${c.fly_size}` : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share Card Modal */}
      {shareTarget && (
        <ShareCard
          trip={trip}
          catch_={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
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
