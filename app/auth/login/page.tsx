'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
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

        {sent ? (
          <div className={styles.sentState}>
            <div className={styles.sentIcon}>✉️</div>
            <h2>Check your email</h2>
            <p>We sent a magic link to <strong>{email}</strong>. Tap it to sign in — no password needed.</p>
            <button className={styles.resendBtn} onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h1>Welcome back</h1>
              <p>Enter your email to receive a magic sign-in link.</p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={styles.input}
                required
                autoFocus
              />
              {error && <p className={styles.error}>{error}</p>}
              <button
                type="submit"
                className={styles.button}
                disabled={loading || !email}
              >
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  'Send magic link'
                )}
              </button>
            </form>

            <p className={styles.note}>
              New here? Just enter your email — we'll create your account automatically.
            </p>
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
