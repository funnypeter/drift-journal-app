'use client'

import { useEffect, useState } from 'react'
import styles from './GarminConnect.module.css'

type Status = 'loading' | 'connected' | 'disconnected'

export default function GarminConnect() {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/garmin/status')
      .then(r => r.json())
      .then(d => {
        setStatus(d.connected ? 'connected' : 'disconnected')
        setConnectedEmail(d.email || null)
      })
      .catch(() => setStatus('disconnected'))
  }, [])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      const resp = await fetch('/api/garmin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Could not connect')
      setStatus('connected')
      setConnectedEmail(data.email)
      setPassword('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await fetch('/api/garmin/disconnect', { method: 'POST' })
      setStatus('disconnected')
      setConnectedEmail(null)
    } catch { /* ignore */ } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') {
    return <p className={styles.hint}>Checking Garmin connection…</p>
  }

  if (status === 'connected') {
    return (
      <div>
        <div className={styles.statusRow}>
          <span className={styles.dot} />
          <div style={{ flex: 1 }}>
            <div className={styles.statusText}>Connected</div>
            {connectedEmail && <div className={styles.statusSub}>{connectedEmail}</div>}
          </div>
          <button className={styles.disconnectBtn} onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        </div>
        <p className={styles.hint}>
          On the New Entry screen, choose <strong>Import from Garmin</strong> to pull a fishing
          activity and drop your marked catches on the map.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className={styles.hint}>
        Connect your Garmin account to import fishing activities. Your password is used once to
        sign in and is never stored — only a session token is kept, encrypted.
      </p>
      <div className={styles.field}>
        <label className={styles.label}>Garmin Email</label>
        <input
          className={styles.input}
          type="email"
          autoComplete="off"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Garmin Password</label>
        <input
          className={styles.input}
          type="password"
          autoComplete="off"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <button className={styles.primaryBtn} onClick={connect} disabled={busy || !email || !password}>
        {busy ? 'Connecting…' : 'Connect Garmin'}
      </button>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
