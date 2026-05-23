'use client'

import { useEffect, useState } from 'react'
import { countPending } from '@/lib/offline/queueClient'
import { SYNC_COMPLETE_EVENT } from '@/lib/offline/sync'

const QUEUE_CHANGED_EVENT = 'drift-offline-queue-changed'

export function notifyQueueChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT))
}

export function usePendingCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      countPending().then(n => { if (!cancelled) setCount(n) }).catch(() => {})
    }
    refresh()
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh)
    window.addEventListener(SYNC_COMPLETE_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh)
      window.removeEventListener(SYNC_COMPLETE_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return count
}
