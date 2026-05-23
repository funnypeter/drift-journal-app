import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type SyncState = 'queued' | 'syncing' | 'synced' | 'error'

export interface PendingTrip {
  id: string
  title: string
  date: string
  location: string
  state: string
  lat?: number
  lng?: number
  notes?: string
  bg_color?: string
  usgs_site_id?: string
  flow?: string
  water_temp?: string
  gauge_height?: string
  air_temp?: string
  baro?: string
  weather?: string
  wind?: string
  moon?: string
  heroCatchId?: string | null
  needs_geocode?: boolean
  needs_conditions?: boolean
  syncState: SyncState
  lastError?: string
  createdAt: number
}

export interface PendingCatch {
  id: string
  trip_id: string
  species: string
  length?: number
  fly?: string
  fly_category?: string
  fly_size?: string
  time_caught?: string
  date?: string
  notes?: string
  sort_order: number
  photoId?: string
  needs_identify?: boolean
  serverPhotoUrl?: string | null
  syncState: SyncState
  lastError?: string
}

export interface PendingPhoto {
  id: string
  blob: Blob
  mimeType: string
}

interface DriftOfflineDB extends DBSchema {
  pendingTrips: {
    key: string
    value: PendingTrip
    indexes: { byCreatedAt: number }
  }
  pendingCatches: {
    key: string
    value: PendingCatch
    indexes: { byTripId: string }
  }
  pendingPhotos: {
    key: string
    value: PendingPhoto
  }
}

const DB_NAME = 'drift-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<DriftOfflineDB>> | null = null

export function getDB(): Promise<IDBPDatabase<DriftOfflineDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }
  if (!dbPromise) {
    dbPromise = openDB<DriftOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingTrips')) {
          const trips = db.createObjectStore('pendingTrips', { keyPath: 'id' })
          trips.createIndex('byCreatedAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('pendingCatches')) {
          const catches = db.createObjectStore('pendingCatches', { keyPath: 'id' })
          catches.createIndex('byTripId', 'trip_id')
        }
        if (!db.objectStoreNames.contains('pendingPhotos')) {
          db.createObjectStore('pendingPhotos', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}
