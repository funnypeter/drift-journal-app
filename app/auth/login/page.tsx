'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

type Step = 'email' | 'code'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)

  async function sendCode(targetEmail: string) {
    setError('')
    setLoading(true)
    const { error: sendErr } = await supabase.auth.signInWithOtp({ email: targetEmail })
    setLoading(false)
    if (sendErr) {
      setError(sendErr.message)
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
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    setLoading(false)
    if (verifyErr) {
      setError(verifyErr.message)
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
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="12" fill="#1e4d43"/>
            <path d="M8 28 Q14 22 20 24 Q26 26 32 20" stroke="#f2ede4" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M12 22 Q16 18 20 19 Q24 20 28 16" stroke="#f2ede4" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
          </svg>
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
