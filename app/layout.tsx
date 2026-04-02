import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import NavBarWrapper from '@/components/ui/NavBarWrapper'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Drift Journal',
  description: 'Fly fishing trip journal with live USGS conditions and AI fish identification',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Drift Journal' },
}

export const viewport: Viewport = {
  themeColor: '#1e4d43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <div style={{ minHeight: '100vh', paddingBottom: 'var(--nav-h)' }}>
          {children}
        </div>
        <NavBarWrapper />
      </body>
    </html>
  )
}
