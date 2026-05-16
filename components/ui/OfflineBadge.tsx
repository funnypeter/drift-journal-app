'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePendingCount } from '@/hooks/usePendingCount'
import { AUTH_EXPIRED_EVENT, drainQueue } from '@/lib/offline/sync'
import styles from './OfflineBadge.module.css'

export default function OfflineBadge() {
  const path = usePathname()
  const online = useOnlineStatus()
  const pending = usePendingCount()
  const [authExpired, setAuthExpired] = useState(false)
  const [draining, setDraining] = useState(false)

  useEffect(() => {
    const onAuth = () => setAuthExpired(true)
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuth)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuth)
  }, [])

  useEffect(() => {
    if (online && authExpired === false) {
      // If we're online and not flagged as expired, clear stale auth banners.
    }
  }, [online, authExpired])

  if (path.startsWith('/auth')) return null

  // Auth-expired takes top priority — user needs to sign in.
  if (authExpired) {
    return (
      <div className={styles.wrap}>
        <Link href={`/auth/login?next=${encodeURIComponent(path || '/dashboard')}`} className={styles.pill} data-tone="auth">
          <span className={styles.dot} />
          Sign in to sync {pending > 0 ? `${pending} trip${pending === 1 ? '' : 's'}` : ''}
        </Link>
      </div>
    )
  }

  if (!online) {
    return (
      <div className={styles.wrap}>
        <span className={styles.pill} data-tone="offline">
          <span className={styles.dot} />
          Offline{pending > 0 ? ` · ${pending} pending` : ''}
        </span>
      </div>
    )
  }

  if (pending > 0) {
    const onClick = async () => {
      if (draining) return
      setDraining(true)
      try { await drainQueue() } finally { setDraining(false) }
    }
    return (
      <div className={styles.wrap}>
        <button className={styles.pill} data-tone="pending" onClick={onClick} disabled={draining}>
          <span className={styles.dot} />
          {draining ? 'Syncing…' : `${pending} pending · tap to sync`}
        </button>
      </div>
    )
  }

  return null
}
