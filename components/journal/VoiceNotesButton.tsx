'use client'

import { useRef, useState } from 'react'
import styles from './VoiceNotesButton.module.css'

type Phase = 'idle' | 'recording' | 'processing'

// Records a spoken note, sends it to /api/transcribe (Gemini) for cleanup, and
// hands the tidied text back via onTranscript. The parent decides what to do
// with it (append to the notes field). Recording uses MediaRecorder with
// whatever Opus container the browser supports (webm on Android/Chrome).
export default function VoiceNotesButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function pickMime(): string {
    const types = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  async function start() {
    setError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording not supported on this device')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => finish(rec.mimeType || mime || 'audio/webm')
      recorderRef.current = rec
      rec.start()
      setPhase('recording')
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch (err: any) {
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Could not start recording')
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setPhase('processing')
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  async function finish(mimeType: string) {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (!blob.size) { setPhase('idle'); return }
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
      const fd = new FormData()
      fd.append('audio', blob, `note.${ext}`)
      const resp = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.detail || data.error || 'Transcription failed')
      const text = (data.text || '').trim()
      if (text) onTranscript(text)
      else setError('Nothing was transcribed — try again.')
      setPhase('idle')
    } catch (err: any) {
      setError(err.message || 'Could not process audio')
      setPhase('idle')
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className={styles.wrap}>
      {phase === 'idle' && (
        <button type="button" className={styles.micBtn} onClick={start} aria-label="Narrate notes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Narrate
        </button>
      )}
      {phase === 'recording' && (
        <button type="button" className={styles.stopBtn} onClick={stop}>
          <span className={styles.pulse} />
          Stop · {mmss}
        </button>
      )}
      {phase === 'processing' && (
        <span className={styles.processing}><span className={styles.spinner} /> Cleaning up…</span>
      )}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
