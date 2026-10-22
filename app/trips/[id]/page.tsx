import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getTrip } from '@/lib/db'
import TripDetail from '@/components/journal/TripDetail'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  const trip = await getTrip(id, session?.user.id ?? null)
  if (!trip) notFound()

  return <TripDetail trip={trip} />
}
