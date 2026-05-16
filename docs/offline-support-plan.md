# Offline support for Drift Journal

## Context

Today every step of creating a trip — location lookup (Nominatim/Overpass), photo upload (Supabase Storage), fish ID (Gemini), trip+catch inserts — requires connectivity. The user wants to log full trips streamside where signal is unreliable: capture GPS coords, take photos, fill in flies/notes, then have everything sync automatically when the phone is back on a network.

Scope chosen by the user:
- **Full trip offline** — entire trip + catches authored offline, synced on reconnect.
- **Coords now, name later** — store raw lat/lng with placeholder name; resolve nearest waterway on sync.
- **Full PWA shell** — service worker so cold-launching the app while offline still works.

## Approach

Three foundations:
1. **PWA shell** via Serwist — caches HTML/JS/CSS so the app loads offline; `NetworkOnly` for `/api/*` so we never serve stale mutations or auth.
2. **IndexedDB queue** via `idb` — three stores (`pendingTrips`, `pendingCatches`, `pendingPhotos`) hold everything until sync.
3. **Client-supplied UUIDs** — change `POST /api/trips` and `POST /api/catches` to accept an `id` from the client and `upsert` idempotently. This eliminates temp-ID remapping entirely; PKs are already UUIDs and RLS still enforces `user_id`.

Sync drains on `online` event, app mount, and a 5-minute focus timer. On 401 it stops cleanly, surfaces a "sign in to sync" banner, and preserves the queue.

## Phases

### 1. PWA shell
- `npm i @serwist/next serwist idb`
- `app/sw.ts` — precache build manifest; `NetworkFirst` for navigations; **`NetworkOnly` for `/api/*`**; `CacheFirst` for icons and Mapbox static tiles.
- `next.config.js` — wrap with `withSerwist({ swSrc: 'app/sw.ts', swDest: 'public/sw.js' })`.
- `components/ServiceWorkerRegister.tsx` registers `/sw.js`; mount in `app/layout.tsx`.
- Verify `public/manifest.json` has `start_url`, `display: standalone`, `theme_color`.

### 2. IndexedDB layer — `lib/offline/db.ts`
Database `drift-offline` v1:
- **`pendingTrips`** (keyPath `id`) — full trip payload plus flags: `needs_geocode`, `needs_conditions`, `syncState` (`queued | syncing | synced | error`), `lastError`, `createdAt`, `heroCatchId`.
- **`pendingCatches`** (keyPath `id`, index on `trip_id`) — catch fields plus `photoId`, `needs_identify`, `syncState`, `serverPhotoUrl`.
- **`pendingPhotos`** (keyPath `id`) — `{ blob, mimeType }` storing the *already HEIC-converted, compressed* JPEG so we never need to re-decode HEIC offline.

### 3. Trip creation rewrite — `components/journal/NewTripForm.tsx`
- Generate `tripId = crypto.randomUUID()` and per-catch `catchId`s up front.
- Run existing `ensureJpegIfHeic` + `compressForUpload` immediately on photo selection; stash the Blob in `pendingPhotos`.
- If `navigator.onLine` and the network path succeeds, sync inline as today.
- On failure or `!navigator.onLine`, write trip+catches+photos to IDB, set the appropriate `needs_*` flags, navigate to dashboard with a "Saved offline" toast.
- Location offline → name `"Pinned location"`, `needs_geocode: true`.
- Conditions effect skipped → `needs_conditions: true`.
- Identify skipped → `needs_identify: true`.

`EditTripForm.tsx` stays online-only for v1 (editing requires a server-side record). Document this in the UI.

### 4. API contract changes
- `app/api/trips/route.ts` and `app/api/catches/route.ts`: accept optional `id` from body; switch insert to `.upsert({...}, { onConflict: 'id', ignoreDuplicates: true })` so retries are idempotent.
- `app/api/upload/route.ts` already takes `catchId` and uses `upsert: true` on Supabase Storage — safe for replay; path is `{user_id}/{catchId}.jpg`.
- No DB migration required; PKs are already UUID.

### 5. Sync engine — `lib/offline/sync.ts`
`drainQueue()`:
```
for each pendingTrip ordered by createdAt where syncState != 'synced':
  mark 'syncing'
  POST /api/trips with id (idempotent upsert)
  for each pendingCatch where trip_id matches:
    if has photoId and no serverPhotoUrl: POST /api/upload (multipart, catchId)
    POST /api/catches with id, trip_id, photo_url=serverPhotoUrl (idempotent upsert)
    if needs_identify and photo present:
      compressForIdentify on blob → POST /api/identify → PATCH /api/catches
  PATCH /api/trips/{id} hero_photo_url from heroCatchId's serverPhotoUrl
  if needs_geocode: nearestWaterway(lat,lng) → PATCH trip name
  if needs_conditions: GET /api/conditions/* → PATCH trip with flow/temp/etc.
  on full success: delete records from all 3 stores
  on 401: stop drain; broadcast 'auth-expired' → banner with link to /auth/login
  on other error: store lastError; mark 'error'; leave for next drain
```

Triggers: `window` `online` event, app mount in `app/layout.tsx`, `setInterval(5*60_000)` while tab is focused, and SW `'sync'` event where Background Sync is supported.

### 6. UI signaling
- `hooks/useOnlineStatus.ts` — `useSyncExternalStore` over `online`/`offline` events.
- `hooks/usePendingCount.ts` — reactive count from IDB.
- `components/ui/OfflineBadge.tsx` — pill in nav bar showing connectivity + pending count.
- Dashboard feed: merge `pendingTrips` from IDB into a "Pending sync" section with reduced opacity and a cloud-off icon. Pending trips are non-clickable until synced.
- Toast on successful drain ("3 trips synced").

### 7. Auth offline
Supabase auto-refreshes tokens while online; middleware refreshes the SSR cookie on the first request after returning. If the cookie has expired (>1h offline), the 401 path in the drain surfaces a clear "Sign in to sync N trips" banner. The queue is never dropped on auth failure.

## Critical files

**Create**
- `app/sw.ts`
- `components/ServiceWorkerRegister.tsx`
- `components/ui/OfflineBadge.tsx`
- `lib/offline/db.ts`, `lib/offline/queueClient.ts`, `lib/offline/sync.ts`
- `lib/offline/geocode.ts` (extract `nearestWaterway` from `LocationSearch.tsx` for reuse on sync)
- `hooks/useOnlineStatus.ts`, `hooks/usePendingCount.ts`

**Modify**
- `next.config.js` — wrap with Serwist
- `package.json` — add `@serwist/next`, `serwist`, `idb`
- `app/layout.tsx` — mount SW register, OfflineBadge, kick off initial drain
- `components/journal/NewTripForm.tsx` — UUIDs + IDB fallback path
- `components/journal/CatchCard.tsx` — skip identify when offline, set `needs_identify`
- `components/journal/LocationSearch.tsx` — export `nearestWaterway`, fall back to coords offline
- `app/api/trips/route.ts`, `app/api/catches/route.ts` — accept client `id`, upsert idempotently
- `app/dashboard/page.tsx` (or its client child) — render pending section
- `public/manifest.json` — verify `start_url`, `scope`, icons present

## Risks
- **iOS Safari Background Sync is not supported** — drain only runs on foreground/online; acceptable, document it. (User is primarily Android, which supports background sync.)
- **IDB quota on iOS** (~50MB soft) — compressed JPEGs are ~300KB so <100 queued catches is safe; surface `navigator.storage.estimate()` warning when usage > 80%.
- **Auth cookie expires past 1h offline** — unavoidable; mitigation is the "sign in to sync" banner, queue persists.
- **Edit flow offline** — out of scope for v1; documented in UI.

## Verification
- **DevTools offline**: Application → Service Workers → Offline. Create trip with 2 catches+photos. Toggle online. Watch `drainQueue` POSTs hit `/api/trips`, `/api/upload`, `/api/catches`, `/api/identify`. Confirm rows + Storage objects appear in Supabase.
- **Cold launch offline**: close tab, DevTools offline, reload app URL → shell loads, "Pending sync" section visible.
- **Android Airplane Mode** (primary target): install PWA to home screen, enable airplane mode, create a full trip (location via GPS, photo, fly, notes), disable airplane mode → background sync drains the queue automatically.
- **Partial failure**: block `/api/catches` mid-drain via DevTools; confirm synced rows are removed from IDB and failed ones retain `syncState: 'error'` for next attempt.
- **Idempotency**: trigger `drainQueue()` twice on the same queue after success → no duplicate rows (upsert is the safety net).
- **Auth expiry**: clear Supabase session cookie before draining → expect 401 → banner appears → queue intact → re-login resumes drain.
