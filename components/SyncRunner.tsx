'use client'

import { useEffect } from 'react'
import { drainQueue } from '@/lib/offline/sync'

const FOCUS_INTERVAL_MS = 5 * 60 * 1000

export default function SyncRunner() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let timer: ReturnType<typeof setInterval> | null = null

    const run = () => { drainQueue().catch(() => {}) }

    run()
    window.addEventListener('online', run)

    const startTimer = () => {
      if (timer) return
      timer = setInterval(run, FOCUS_INTERVAL_MS)
    }
    const stopTimer = () => {
      if (timer) { clearInterval(timer); timer = null }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { run(); startTimer() }
      else stopTimer()
    }
    if (document.visibilityState === 'visible') startTimer()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisibility)
      stopTimer()
    }
  }, [])

  return null
}
