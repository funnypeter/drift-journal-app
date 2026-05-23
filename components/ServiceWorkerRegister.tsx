'use client'

import { useEffect, useRef, useState } from 'react'

export default function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // Track whether we've already seen one controller for this tab. The very
  // first SW takeover (first install on a previously-unregistered page) also
  // fires controllerchange, and we don't want to spam users with a refresh
  // banner on their first visit.
  const seenInitialController = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    seenInitialController.current = !!navigator.serviceWorker.controller

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(err => console.warn('SW registration failed:', err))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    const onControllerChange = () => {
      if (!seenInitialController.current) {
        seenInitialController.current = true
        return
      }
      // A new SW has taken control. Page is still running the previous JS
      // bundle in memory — show a banner so the user can refresh on their
      // own terms (not mid-form-edit).
      setUpdateAvailable(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e2a1f',
        color: '#f5efe2',
        padding: '10px 16px',
        borderRadius: 999,
        fontSize: 13,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>New version available.</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#f5efe2',
          color: '#1e2a1f',
          border: 'none',
          borderRadius: 999,
          padding: '4px 12px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  )
}
