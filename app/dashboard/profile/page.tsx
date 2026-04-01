'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks'
import MigrateData from '@/components/journal/MigrateData'
import styles from './profile.module.css'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const { profile, updateProfile } = useProfile()

  const [netSize, setNetSize] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showMigrate, setShowMigrate] = useState(false)

  // Init from profile when loaded
  if (profile && !netSize && !displayName) {
    setNetSize(String(profile.net_hole_size || 0.5))
    setDisplayName(profile.display_name || '')
  }

  async function save() {
    setSaving(true)
    try {
      await updateProfile({
        display_name: displayName,
        net_hole_size: parseFloat(netSize) || 0.5,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          {(profile?.display_name || profile?.email || 'U')[0].toUpperCase()}
        </div>
        <div>
          <div className={styles.name}>{profile?.display_name || 'Angler'}</div>
          <div className={styles.email}>{profile?.email}</div>
        </div>
      </div>

      {/* Profile settings */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <div className={styles.field}>
          <label className={styles.label}>Display Name</label>
          <input
            className={styles.input}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>
      </section>

      {/* Gear */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>My Gear</h2>
        <div className={styles.field}>
          <label className={styles.label}>Net mesh hole size (inches)</label>
          <p className={styles.hint}>Used for AI fish sizing. Measure one hole in your net.</p>
          <div className={styles.netPills}>
            {['0.25','0.5','0.75','1.0','1.25','1.5'].map(size => (
              <button
                key={size}
                className={`${styles.netPill} ${netSize === size ? styles.netPillActive : ''}`}
                onClick={() => setNetSize(size)}
              >
                {size}"
              </button>
            ))}
          </div>
          <input
            type="number"
            className={styles.input}
            value={netSize}
            onChange={e => setNetSize(e.target.value)}
            placeholder="0.5"
            step="0.25"
            style={{ marginTop: 8 }}
          />
        </div>
      </section>

      {/* Save */}
      <button className={styles.saveBtn} onClick={save} disabled={saving}>
        {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Changes'}
      </button>

      {/* Data migration */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Import Data</h2>
        <p className={styles.hint}>Have trips in the old Drift Journal PWA? Import them here.</p>
        <button className={styles.migrateBtn} onClick={() => setShowMigrate(!showMigrate)}>
          {showMigrate ? 'Hide Import' : 'Import from PWA'}
        </button>
        {showMigrate && <MigrateData />}
      </section>

      {/* Sign out */}
      <section className={styles.section}>
        <button className={styles.signOutBtn} onClick={signOut}>Sign Out</button>
      </section>
    </div>
  )
}
