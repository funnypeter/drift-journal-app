import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import PublicTripView from '@/components/journal/PublicTripView'
import { formatDate } from '@/lib/dateUtils'
import type { Trip } from '@/types'

// Public share route — bypasses auth (see middleware.ts) and queries with the
// anon role. RLS allows the row through only when trips.is_public = true, so a
// non-public trip simply yields no rows and we render notFound().
export default async function PublicTripPage({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: trip, error } = await supabase
    .from('trips')
    .select('*, catches(*)')
    .eq('id', params.id)
    .eq('is_public', true)
    .single()

  if (error || !trip) notFound()

  return <PublicTripView trip={trip as Trip} />
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: trip } = await supabase
    .from('trips')
    .select('title, location, hero_photo_url, date')
    .eq('id', params.id)
    .eq('is_public', true)
    .single()
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
