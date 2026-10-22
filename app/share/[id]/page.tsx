import { notFound } from 'next/navigation'
import PublicTripView from '@/components/journal/PublicTripView'
import { formatDate } from '@/lib/dateUtils'
import { getTrip } from '@/lib/db'

// Public share route — bypasses auth (see middleware.ts). Only trips with
// is_public = 1 are returned, so a non-public trip renders notFound().
export default async function PublicTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTrip(id, null, { publicOnly: true })
  if (!trip) notFound()

  return <PublicTripView trip={trip} />
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTrip(id, null, { publicOnly: true })
  if (!trip) return { title: 'Drift Journal' }
  return {
    title: `${trip.title} — Drift Journal`,
    description: `${trip.location || ''} · ${formatDate(trip.date, { year: 'numeric', month: 'numeric', day: 'numeric' })}`.trim(),
    openGraph: {
      title: trip.title,
      description: trip.location || undefined,
      images: trip.hero_photo_url ? [trip.hero_photo_url] : undefined,
    },
  }
}
