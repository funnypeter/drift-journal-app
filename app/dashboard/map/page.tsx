import { createServerClient } from '@/lib/supabase/server'
import MapClient from './MapClient'

export default async function MapPage() {
  const supabase = createServerClient()
  const { data: trips } = await supabase
    .from('trips')
    .select('*, catches(*)')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('date', { ascending: false })

  return <MapClient initialTrips={trips || []} />
}
