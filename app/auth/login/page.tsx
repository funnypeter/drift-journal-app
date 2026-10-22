'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'

type Step = 'email' | 'code'

async function authCall(body: Record<string, string>): Promise<{ error?: string }> {
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => ({}))
    return resp.ok ? {} : { error: data.error || 'Something went wrong' }
  } catch {
    return { error: 'Network error — check your connection' }
  }
}

export default function LoginPage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)

  async function sendCode(targetEmail: string) {
    setError('')
    setLoading(true)
    const { error: sendErr } = await authCall({ action: 'send', email: targetEmail })
    setLoading(false)
    if (sendErr) {
      setError(sendErr)
      return false
    }
    return true
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await sendCode(email)
    if (ok) {
      setCode('')
      setStep('code')
    }
  }

  async function verifyCode(token: string) {
    setError('')
    setLoading(true)
    const { error: verifyErr } = await authCall({ action: 'verify', email, code: token })
    setLoading(false)
    if (verifyErr) {
      setError(verifyErr)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length >= 6) verifyCode(code)
  }

  // Focus the code field when we enter the code step.
  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  async function handleResend() {
    await sendCode(email)
    setCode('')
    codeInputRef.current?.focus()
  }

  function useDifferentEmail() {
    setStep('email')
    setCode('')
    setError('')
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" width={48} height={48} className={styles.logoMark} />
          <span className={styles.logoText}>Drift Journal</span>
        </div>

        {step === 'email' ? (
          <>
            <div className={styles.header}>
              <h1>Welcome back</h1>
              <p>Enter your email and we&apos;ll send you a sign-in code.</p>
            </div>

            <form onSubmit={handleEmailSubmit} className={styles.form}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={styles.input}
                required
                autoFocus
                autoComplete="email"
              />
              {error && <p className={styles.error}>{error}</p>}
              <button
                type="submit"
                className={styles.button}
                disabled={loading || !email}
              >
                {loading ? <span className={styles.spinner} /> : 'Send code'}
              </button>
            </form>

            <p className={styles.note}>
              New here? Just enter your email — we&apos;ll create your account automatically.
            </p>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <h1>Enter your code</h1>
              <p>We sent a sign-in code to <strong>{email}</strong>. It may take a moment to arrive.</p>
            </div>

            <form onSubmit={handleCodeSubmit} className={styles.form}>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                maxLength={10}
                placeholder="Enter code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className={`${styles.input} ${styles.codeInput}`}
                required
              />
              {error && <p className={styles.error}>{error}</p>}
              <button
                type="submit"
                className={styles.button}
                disabled={loading || code.length < 6}
              >
                {loading ? <span className={styles.spinner} /> : 'Verify'}
              </button>
            </form>

            <div className={styles.codeActions}>
              <button type="button" className={styles.resendBtn} onClick={handleResend} disabled={loading}>
                Resend code
              </button>
              <button type="button" className={styles.resendBtn} onClick={useDifferentEmail} disabled={loading}>
                Use a different email
              </button>
            </div>
          </>
        )}
      </div>

      {/* Decorative background */}
      <div className={styles.bg}>
        <div className={styles.wave1} />
        <div className={styles.wave2} />
      </div>
    </div>
  )
}
