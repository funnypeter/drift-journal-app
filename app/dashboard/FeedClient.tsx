'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Trip } from '@/types'
import styles from './feed.module.css'

const BG_COLORS = [
  'linear-gradient(160deg,#374a3a,#1a2e1c)',
  'linear-gradient(160deg,#0d2b4e,#1a4a6e)',
  'linear-gradient(160deg,#1a3a2a,#2d5a3d)',
  'linear-gradient(160deg,#2a1a3a,#1a0a2a)',
  'linear-gradient(160deg,#3a2a1a,#2a1a0a)',
]

export default function FeedClient({ initialTrips }: { initialTrips: Trip[] }) {
  const [trips] = useState(initialTrips)

  const totalCatches = trips.reduce((n, t) => n + (t.catches?.length || 0), 0)

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Recent Journeys</h1>
        <div className={styles.titleLine} />
      </div>

      {/* Stats bar */}
      {trips.length > 0 && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{trips.length}</span>
            <span className={styles.statLabel}>Trips</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statNum}>{totalCatches}</span>
            <span className={styles.statLabel}>Catches</span>
          </div>
        </div>
      )}

      {/* Feed */}
      {trips.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <h3>No journeys yet</h3>
          <p>Tap + to log your first trip</p>
          <Link href="/trips/new" className={styles.emptyBtn}>Log First Trip</Link>
        </div>
      ) : (
        <div className={styles.feed}>
          {trips.map((trip, i) => {
            const heroPhoto = trip.hero_photo_url ||
              trip.catches?.find(c => c.photo_url)?.photo_url || null
            const catchCount = trip.catches?.length || 0
            const bg = trip.bg_color || BG_COLORS[i % BG_COLORS.length]

            return (
              <Link key={trip.id} href={`/trips/${trip.id}`} className={styles.card}>
                {/* Hero image */}
                <div className={styles.heroWrap} style={{ background: bg }}>
                  {heroPhoto ? (
                    <Image
                      src={heroPhoto}
                      alt={trip.title}
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="(max-width: 768px) 100vw, 600px"
                    />
                  ) : (
                    <div className={styles.heroPlaceholder}>
                      <svg viewBox="0 0 40 28" fill="none">
                        <path d="M3 14 Q10 7 17 11 Q24 15 31 9 Q36 4 39 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.4"/>
                        <path d="M3 20 Q10 13 17 17 Q24 21 31 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
                      </svg>
                    </div>
                  )}
                  {catchCount > 0 && (
                    <div className={styles.catchBadge}>{catchCount} catch{catchCount !== 1 ? 'es' : ''}</div>
                  )}
                </div>

                {/* Card info */}
                <div className={styles.cardBody}>
                  <h2 className={styles.tripTitle}>{trip.title}</h2>
                  <div className={styles.tripMeta}>
                    <span className={styles.tripDate}>
                      {new Date(trip.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {trip.location && (
                      <>
                        <span className={styles.dot}>·</span>
                        <span className={styles.tripLoc}>{trip.location.split(',')[0]}</span>
                      </>
                    )}
                  </div>

                  {/* Conditions summary */}
                  {(trip.air_temp || trip.weather || trip.water_temp) && (
                    <div className={styles.conditions}>
                      {trip.air_temp && <span>{trip.air_temp}</span>}
                      {trip.weather && <span>{trip.weather}</span>}
                      {trip.water_temp && <span>Water {trip.water_temp}°F</span>}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
