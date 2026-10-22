import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { listTrips } from '@/lib/db'
import MapClient from './MapClient'

export default async function MapPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const trips = await listTrips(session.user.id, { withLocation: true })

  return <MapClient initialTrips={trips} />
}
