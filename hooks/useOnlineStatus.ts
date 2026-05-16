'use client'

import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

function getSnapshot(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

function getServerSnapshot(): boolean {
  return true
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
