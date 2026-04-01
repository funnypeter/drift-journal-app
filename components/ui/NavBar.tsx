'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './NavBar.module.css'

export default function NavBar() {
  const path = usePathname()

  return (
    <nav className={styles.nav}>
      <Link href="/dashboard" className={`${styles.item} ${path === '/dashboard' ? styles.active : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </Link>

      <Link href="/trips/new" className={styles.logBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </Link>

      <Link href="/dashboard/profile" className={`${styles.item} ${path.includes('profile') ? styles.active : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Profile</span>
      </Link>
    </nav>
  )
}
