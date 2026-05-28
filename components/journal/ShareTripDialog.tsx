'use client'

import { useEffect, useState } from 'react'
import styles from './ShareTripDialog.module.css'

interface Props {
  tripId: string
  initialIsPublic: boolean
  onClose: () => void
}

// Owner-only dialog. Lets the trip owner toggle is_public and copy / share
// the resulting /share/<id> link. Renders on top of TripDetail; closes on
// background tap.
export default function ShareTripDialog({ tripId, initialIsPublic, onClose }: Props) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/share/${tripId}`)
    }
  }, [tripId])

  async function togglePublic(next: boolean) {
    setUpdating(true)
    setError('')
    try {
      const resp = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: next }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Update failed (${resp.status})`)
      }
      setIsPublic(next)
    } catch (err: any) {
      setError(err.message || 'Failed to update sharing')
    } finally {
      setUpdating(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable on some mobile browsers — fall back to
      // selecting the text so the user can long-press copy.
      const input = document.getElementById('share-url-input') as HTMLInputElement | null
      input?.select()
    }
  }

  async function nativeShare() {
    if (!navigator.share) { copyLink(); return }
    try {
      await navigator.share({ url: shareUrl, title: 'Trip report' })
    } catch {
      // User cancelled — nothing to do
    }
  }

  const canNativeShare = typeof window !== 'undefined' && 'share' in navigator

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share trip">
        <button className={styles.close} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <h2 className={styles.title}>Share this trip</h2>
        <p className={styles.subtitle}>
          {isPublic
            ? 'Anyone with the link can view this trip — including catches, conditions, and the map.'
            : 'Make this trip public to share it with friends. Only you can see it right now.'}
        </p>

        <div className={styles.toggleRow}>
          <div>
            <div className={styles.toggleLabel}>Public link</div>
            <div className={styles.toggleHint}>{isPublic ? 'On — anyone with the link can view' : 'Off — owner-only'}</div>
          </div>
          <button
            type="button"
            className={`${styles.toggle} ${isPublic ? styles.toggleOn : ''}`}
            onClick={() => togglePublic(!isPublic)}
            disabled={updating}
            role="switch"
            aria-checked={isPublic}
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {isPublic && (
          <>
            <div className={styles.urlRow}>
              <input
                id="share-url-input"
                className={styles.urlInput}
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className={styles.copyBtn} onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {canNativeShare && (
              <button className={styles.shareBtn} onClick={nativeShare}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
