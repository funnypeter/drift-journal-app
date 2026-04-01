import { createServerClient } from '@/lib/supabase/server'
import FeedClient from './FeedClient'

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: trips } = await supabase
    .from('trips')
    .select('*, catches(*)')
    .order('date', { ascending: false })
    .limit(20)

  return <FeedClient initialTrips={trips || []} />
}
