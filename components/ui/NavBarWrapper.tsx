'use client'

import { usePathname } from 'next/navigation'
import NavBar from './NavBar'

export default function NavBarWrapper() {
  const path = usePathname()
  if (path.startsWith('/auth')) return null
  return <NavBar />
}
