import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import TripDetail from '@/components/journal/TripDetail'

export default async function TripPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: trip, error } = await supabase
    .from('trips')
    .select('*, catches(*)')
    .eq('id', params.id)
    .single()

  if (error || !trip) notFound()

  return <TripDetail trip={trip} />
}
