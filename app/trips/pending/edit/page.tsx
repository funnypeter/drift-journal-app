import { Suspense } from 'react'
import EditPendingTripForm from '@/components/journal/EditPendingTripForm'

// Statically prerendered so the service-worker precache covers it. A dynamic
// [id] segment or `force-dynamic` would require a server round-trip per visit,
// which fails when the user is offline. The pending id is passed as ?id= and
// read from useSearchParams inside the client component, which is the reason
// the form is wrapped in Suspense.
export default function EditPendingTripPage() {
  return (
    <Suspense fallback={null}>
      <EditPendingTripForm />
    </Suspense>
  )
}
