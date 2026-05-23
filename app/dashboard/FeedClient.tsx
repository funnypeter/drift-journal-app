'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getPendingTrips } from '@/lib/offline/queueClient'
import { SYNC_COMPLETE_EVENT } from '@/lib/offline/sync'
import { nearestWaterway } from '@/lib/offline/geocode'
import type { PendingTrip } from '@/lib/offline/db'
import type { Trip } from '@/types'
import styles from './feed.module.css'

// Trips that synced with a placeholder name (because the geocoder failed at
// creation time, or an older build's sync engine couldn't recover) need a
// chance to resolve on a later visit — once the queue entry is deleted, the
// sync engine never revisits them.
const PLACEHOLDER_RE = /^(Pinned location|Current Location)/

const BG_COLORS = [
  'linear-gradient(160deg,#374a3a,#1a2e1c)',
  'linear-gradient(160deg,#0d2b4e,#1a4a6e)',
  'linear-gradient(160deg,#1a3a2a,#2d5a3d)',
  'linear-gradient(160deg,#2a1a3a,#1a0a2a)',
  'linear-gradient(160deg,#3a2a1a,#2a1a0a)',
]

export default function FeedClient({ initialTrips }: { initialTrips: Trip[] }) {
  const [trips, setTrips] = useState(initialTrips)
  const [pending, setPending] = useState<PendingTrip[]>([])
  const backfillAttempted = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getPendingTrips()
        .then(p => { if (!cancelled) setPending(p) })
        .catch(() => {})
    }
    refresh()
    window.addEventListener(SYNC_COMPLETE_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener(SYNC_COMPLETE_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    let cancelled = false
    ;(async () => {
      const candidates = trips.filter(t =>
        t.location && PLACEHOLDER_RE.test(t.location) &&
        t.lat != null && t.lng != null &&
        !backfillAttempted.current.has(t.id)
      ).slice(0, 5)
      for (const t of candidates) {
        if (cancelled) return
        backfillAttempted.current.add(t.id)
        try {
          const [waterway, revResp] = await Promise.all([
            nearestWaterway(t.lat!, t.lng!),
            fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${t.lat}&lon=${t.lng}&format=json`,
              { headers: { 'User-Agent': 'DriftJournal/2.0' } }
            ).then(r => r.ok ? r.json() : null).catch(() => null),
          ])
          const name = waterway
            || revResp?.address?.river
            || revResp?.address?.natural
            || revResp?.name
            || null
          if (!name) continue
          const state = t.state || revResp?.address?.state || ''
          const fullLocation = state ? `${name}, ${state}` : name
          const newTitle = /^(Pinned location|Current Location)/.test(t.title)
            ? `${name} Trip`
            : t.title
          const resp = await fetch(`/api/trips/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: fullLocation, state, title: newTitle }),
          })
          if (resp.ok && !cancelled) {
            setTrips(prev => prev.map(x =>
              x.id === t.id ? { ...x, location: fullLocation, state, title: newTitle } : x
            ))
          }
        } catch { /* best-effort */ }
      }
    })()
    return () => { cancelled = true }
  }, [trips])

  return (
    <div className={styles.container}>
      {/* App header */}
      <div className={styles.appHeader}>
        <div className={styles.logoRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="Drift Journal" className={styles.logoIcon} />
          <span className={styles.logoText}>Drift Journal</span>
        </div>
      </div>

      {pending.length > 0 && (
        <div className={styles.pendingSection}>
          <div className={styles.pendingHeader}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M18.36 6.64A9 9 0 0 1 20.77 15"/>
              <path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/>
              <line x1="2" y1="2" x2="22" y2="22"/>
            </svg>
            <span>Pending sync · {pending.length}</span>
          </div>
          <div className={styles.pendingList}>
            {pending.map(p => (
              <Link key={p.id} href={`/trips/pending/edit?id=${p.id}`} className={styles.pendingCard}>
                <div className={styles.pendingTitle}>{p.title}</div>
                <div className={styles.pendingMeta}>
                  {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' · '}
                  {p.location?.split(',')[0] || 'No location'}
                  {p.syncState === 'error' && <span className={styles.pendingError}> · failed, will retry</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Section title */}
      <div className={styles.header}>
        <h1 className={styles.title}>Recent Journeys</h1>
        <div className={styles.titleLine} />
      </div>

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
            const bg = trip.bg_color || BG_COLORS[i % BG_COLORS.length]
            const notesPreview = trip.notes ? (trip.notes.length > 120 ? trip.notes.slice(0, 120) + '...' : trip.notes) : null

            return (
              <Link key={trip.id} href={`/trips/${trip.id}`} className={styles.card}>
                {/* Hero image */}
                <div className={styles.heroWrap} style={{ background: bg }}>
                  {heroPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={heroPhoto}
                      alt={trip.title}
                      className={styles.heroImg}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className={styles.heroPlaceholder}>
                      <svg viewBox="0 0 40 28" fill="none">
                        <path d="M3 14 Q10 7 17 11 Q24 15 31 9 Q36 4 39 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.4"/>
                        <path d="M3 20 Q10 13 17 17 Q24 21 31 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
                      </svg>
                    </div>
                  )}
                </div>

                {/* Card info */}
                <div className={styles.cardBody}>
                  <h2 className={styles.tripTitle}>{trip.title}</h2>
                  <div className={styles.tripMeta}>
                    <span className={styles.tripDate}>
                      {new Date(trip.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
                    </span>
                    {trip.location && (
                      <>
                        <span className={styles.dot}>·</span>
                        <span className={styles.tripLoc}>{trip.location.split(',')[0]}</span>
                      </>
                    )}
                  </div>

                  {/* Conditions pills */}
                  {(trip.flow || trip.water_temp || trip.weather) && (
                    <div className={styles.conditions}>
                      {trip.flow && (
                        <span className={styles.pill}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                          {trip.flow} CFS
                        </span>
                      )}
                      {trip.water_temp && (
                        <span className={styles.pill}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
                          {trip.water_temp}°F
                        </span>
                      )}
                      {trip.weather && (
                        <span className={styles.pill}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>
                          {trip.weather}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notes preview */}
                  {notesPreview && (
                    <p className={styles.notesPreview}>
                      {notesPreview}
                      {trip.notes && trip.notes.length > 120 && (
                        <span className={styles.readMore}> — Read more</span>
                      )}
                    </p>
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
