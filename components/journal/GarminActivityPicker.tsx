'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './GarminActivityPicker.module.css'

export interface GarminImportResult {
  activityId: number
  title: string
  date: string
  lat: number | null
  lng: number | null
  pins: { lat: number; lng: number; time?: string }[]
}

interface Activity {
  activityId: number
  name: string
  date: string
  startTime: string
  lat: number | null
  lng: number | null
}

type Phase = 'checking' | 'disconnected' | 'loading' | 'list' | 'importing'

export default function GarminActivityPicker({
  onImport,
}: {
  onImport: (result: GarminImportResult) => void
}) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [activities, setActivities] = useState<Activity[]>([])
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<number | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const status = await fetch('/api/garmin/status').then(r => r.json())
        if (!status.connected) { setPhase('disconnected'); return }
        setPhase('loading')
        const resp = await fetch('/api/garmin/activities')
        const data = await resp.json()
        if (!resp.ok) {
          if (data.code === 'reconnect') { setPhase('disconnected'); return }
          throw new Error(data.detail || data.error || 'Could not load activities')
        }
        setActivities(data.activities || [])
        setPhase('list')
      } catch (err: any) {
        setError(err.message || 'Could not load Garmin activities')
        setPhase('list')
      }
    })()
  }, [])

  async function pick(activityId: number) {
    setImportingId(activityId)
    setPhase('importing')
    setError('')
    try {
      const resp = await fetch('/api/garmin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || data.error || 'Import failed')
      onImport(data as GarminImportResult)
    } catch (err: any) {
      setError(err.message || 'Import failed')
      setPhase('list')
      setImportingId(null)
    }
  }

  if (phase === 'checking' || phase === 'loading') {
    return <div className={styles.spinner} />
  }

  if (phase === 'disconnected') {
    return (
      <div className={styles.msg}>
        Garmin isn&apos;t connected yet. Connect your account in{' '}
        <Link href="/dashboard/profile" className={styles.link}>Settings → Garmin Connect</Link>,
        then come back here.
      </div>
    )
  }

  if (phase === 'importing') {
    return (
      <div>
        <div className={styles.spinner} />
        <div className={styles.msg}>Importing activity and reading catches…</div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.error}>{error}</div>}
      {activities.length === 0 ? (
        <div className={styles.msg}>No fishing activities found on your Garmin account.</div>
      ) : (
        <div className={styles.list}>
          {activities.map(a => (
            <button
              key={a.activityId}
              className={styles.item}
              onClick={() => pick(a.activityId)}
              disabled={importingId != null}
            >
              <svg className={styles.icon} viewBox="0 0 40 28" width="34" height="24" fill="none">
                <path d="M3 14Q10 7 17 11Q24 15 31 9Q36 4 39 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div className={styles.itemBody}>
                <div className={styles.itemName}>{a.name}</div>
                <div className={styles.itemMeta}>{a.date}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
