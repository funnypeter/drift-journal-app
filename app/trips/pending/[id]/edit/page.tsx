export const dynamic = 'force-dynamic'

import EditPendingTripForm from '@/components/journal/EditPendingTripForm'

export default function EditPendingTripPage({ params }: { params: { id: string } }) {
  return <EditPendingTripForm pendingId={params.id} />
}
