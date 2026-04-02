'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { Trip, Catch } from '@/types'
import ShareCard from '@/components/share/ShareCard'
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

export default function TripDetail({ trip }: { trip: Trip }) {
  const router = useRouter()
  const [shareTarget, setShareTarget] = useState<Catch | null>(null)
  const [expandedCatch, setExpandedCatch] = useState<Catch | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFullMap, setShowFullMap] = useState(false)

  const catches = trip.catches || []

  async function handleDelete() {
    setDeleting(true)
    try {
      const resp = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' })
      if (resp.ok) {
        router.push('/dashboard')
      } else {
        const data = await resp.json()
        alert(data.error || 'Failed to delete')
        setDeleting(false)
      }
    } catch {
      alert('Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <Link href="/dashboard" className={styles.backBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>
        <div className={styles.topActions}>
          <Link href={`/trips/${trip.id}/edit`} className={styles.editBtn}>Edit</Link>
          <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Date & Title */}
      <div className={styles.dateLabel}>
        {new Date(trip.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
      </div>
      <h1 className={styles.title}>{trip.title}</h1>
      <div className={styles.locationLine}>
        {trip.location}
        {trip.state && <span className={styles.stateLink}> • {trip.state}</span>}
      </div>

      {/* Map */}
      {trip.lat && trip.lng && (
        <div className={styles.mapWrap} onClick={() => setShowFullMap(true)} style={{ cursor: 'pointer' }}>
          <LocationMiniMap lat={trip.lat} lng={trip.lng} />
        </div>
      )}

      {/* Conditions grid */}
      <div className={styles.condGrid}>
        <Cond label="Water Flow" value={trip.flow ? `${trip.flow} cfs` : 'N/A'} />
        <Cond label="Water Temp" value={trip.water_temp ? `${trip.water_temp}°F` : 'N/A'} />
        <Cond label="Barometric" value={trip.baro ? `${trip.baro} inHg` : 'N/A'} />
        <Cond label="Air Temp" value={trip.air_temp || 'N/A'} />
        <Cond label="Weather" value={trip.weather || 'N/A'} />
        <Cond label="Moon" value={getMoonPhase(trip.date)} />
      </div>

      {/* Notes */}
      {trip.notes && (
        <div className={styles.notes}>
          <p>{trip.notes}</p>
        </div>
      )}

      {/* Catches */}
      {catches.length > 0 && (
        <div className={styles.catches}>
          <div className={styles.catchHeader}>
            <h2 className={styles.catchTitle}>Catch Gallery</h2>
            <span className={styles.catchCount}>({catches.length} total)</span>
          </div>
          <div className={styles.catchGrid}>
            {catches.map(c => (
              <div key={c.id} className={styles.catchCard} onClick={() => setExpandedCatch(c)}>
                <div className={styles.catchPhoto}>
                  {c.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo_url} alt={c.species} className={styles.catchImg} />
                  ) : (
                    <div className={styles.catchNoPhoto}>
                      <svg viewBox="0 0 40 28" fill="none"><path d="M3 14Q10 7 17 11Q24 15 31 9Q36 4 39 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
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

      {/* Expanded catch modal */}
      {expandedCatch && (() => {
        const idx = catches.findIndex(c => c.id === expandedCatch.id)
        return (
          <div className={styles.overlay} onClick={() => setExpandedCatch(null)}>
            <div className={styles.expandedCard} onClick={e => e.stopPropagation()}>
              {expandedCatch.photo_url && (
                <button className={styles.expandedShare} onClick={() => { setExpandedCatch(null); setShareTarget(expandedCatch) }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  Share
                </button>
              )}
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
                <div className={styles.expandedMeta}>{idx + 1} of {catches.length} catches</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Full map modal */}
      {showFullMap && trip.lat && trip.lng && (
        <div className={styles.overlay} onClick={() => setShowFullMap(false)}>
          <div className={styles.fullMapCard} onClick={e => e.stopPropagation()}>
            <button className={styles.fullMapClose} onClick={() => setShowFullMap(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className={styles.fullMapTitle}>{trip.location}</div>
            <FullMap lat={trip.lat} lng={trip.lng} />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className={styles.overlay} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <h3>Delete this trip?</h3>
            <p>This will permanently delete &ldquo;{trip.title}&rdquo; and all its catches.</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className={styles.confirmDeleteBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Card Modal */}
      {shareTarget && (
        <ShareCard trip={trip} catch_={shareTarget} onClose={() => setShareTarget(null)} />
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
