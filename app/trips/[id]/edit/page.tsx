import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getTrip } from '@/lib/db'
import EditTripForm from '@/components/journal/EditTripForm'

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  const trip = session ? await getTrip(id, session.user.id) : null
  if (!trip || trip.user_id !== session?.user.id) notFound()

  return <EditTripForm trip={trip} />
}
