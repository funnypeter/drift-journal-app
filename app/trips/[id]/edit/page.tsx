import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditTripForm from '@/components/journal/EditTripForm'

export default async function EditTripPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { data: trip, error } = await supabase
    .from('trips')
    .select('*, catches(*)')
    .eq('id', params.id)
    .single()

  if (error || !trip) notFound()

  return <EditTripForm trip={trip} />
}
