import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { listTrips } from '@/lib/db'
import FeedClient from './FeedClient'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const trips = await listTrips(session.user.id, { limit: 20 })

  return <FeedClient initialTrips={trips} />
}
