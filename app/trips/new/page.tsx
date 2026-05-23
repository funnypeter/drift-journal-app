import NewTripForm from '@/components/journal/NewTripForm'

// Statically prerendered so Serwist precaches the page shell. The previous
// `force-dynamic` directive forced a server round-trip per visit, which
// silently broke offline trip creation once the SW's runtime page cache
// expired the entry (defaultCache pageCache TTL ~24h). NewTripForm is a
// client component with no server-loaded data, so static is correct here.
export default function NewTripPage() {
  return <NewTripForm />
}
