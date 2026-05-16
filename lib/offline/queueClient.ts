import { getDB, type PendingCatch, type PendingPhoto, type PendingTrip } from './db'

export interface EnqueueTripArgs {
  trip: PendingTrip
  catches: PendingCatch[]
  photos: PendingPhoto[]
}

export async function enqueueTrip({ trip, catches, photos }: EnqueueTripArgs): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['pendingTrips', 'pendingCatches', 'pendingPhotos'], 'readwrite')
  await Promise.all([
    tx.objectStore('pendingTrips').put(trip),
    ...catches.map(c => tx.objectStore('pendingCatches').put(c)),
    ...photos.map(p => tx.objectStore('pendingPhotos').put(p)),
  ])
  await tx.done
}

export async function getPendingTrips(): Promise<PendingTrip[]> {
  const db = await getDB()
  return db.getAllFromIndex('pendingTrips', 'byCreatedAt')
}

export async function getPendingTrip(id: string): Promise<PendingTrip | undefined> {
  const db = await getDB()
  return db.get('pendingTrips', id)
}

export async function getCatchesForTrip(tripId: string): Promise<PendingCatch[]> {
  const db = await getDB()
  return db.getAllFromIndex('pendingCatches', 'byTripId', tripId)
}

export async function getPhoto(id: string): Promise<PendingPhoto | undefined> {
  const db = await getDB()
  return db.get('pendingPhotos', id)
}

export async function updateTrip(trip: PendingTrip): Promise<void> {
  const db = await getDB()
  await db.put('pendingTrips', trip)
}

export async function updateCatch(c: PendingCatch): Promise<void> {
  const db = await getDB()
  await db.put('pendingCatches', c)
}

export async function deleteTripCascade(tripId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['pendingTrips', 'pendingCatches', 'pendingPhotos'], 'readwrite')
  const catches = await tx.objectStore('pendingCatches').index('byTripId').getAll(tripId)
  for (const c of catches) {
    if (c.photoId) await tx.objectStore('pendingPhotos').delete(c.photoId)
    await tx.objectStore('pendingCatches').delete(c.id)
  }
  await tx.objectStore('pendingTrips').delete(tripId)
  await tx.done
}

export async function countPending(): Promise<number> {
  const db = await getDB()
  return db.count('pendingTrips')
}
