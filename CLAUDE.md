# Drift Journal

Fly fishing journal app for logging trips, catches, and conditions.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database & Auth**: Supabase (auth, PostgreSQL, storage)
- **Maps**: Mapbox GL
- **AI**: Google Gemini 2.5 Flash (fish species identification from photos)
- **Hosting**: Vercel (region: iad1)
- **Styling**: CSS Modules
- **PWA / Offline**: Serwist (`@serwist/next`) for service worker + IndexedDB (`idb`) for the offline queue

## Project Structure

```
app/
  api/
    catches/          # CRUD for catch records
    conditions/       # USGS water data + Open-Meteo weather
    identify/         # Gemini AI fish identification
    profile/          # User profile (net hole size, etc.)
    resolve-location/ # Server-side waterway resolver (Overpass + Mapbox + Nominatim)
    trips/            # CRUD for trip records
    upload/           # Photo upload to Supabase storage (uses service-role bypass)
  auth/               # Login, OAuth callback
  dashboard/          # Home feed (incl. Pending sync overlay), map view, profile
  trips/              # Trip detail, edit, new entry
  sw.ts               # Serwist service worker source (built to public/sw.js)
components/
  journal/            # CatchCard, ConditionsPanel, NewTripForm, EditTripForm,
                      #   EditPendingTripForm, TripDetail, LocationSearch
  share/              # Share card generation
  ui/                 # Reusable UI components (incl. OfflineBadge)
  ServiceWorkerRegister.tsx  # SW registration + update-available banner
  SyncRunner.tsx             # Background drainQueue runner
hooks/                # useOnlineStatus, usePendingCount
lib/offline/          # IndexedDB queue (db, queueClient), sync engine, geocode helper
lib/supabase/         # Supabase client helpers (client, route, server)
types/                # TypeScript interfaces (Trip, Catch, Profile, etc.)
supabase/migrations/  # SQL migrations
```

## Environment Variables (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase server-side
- `GEMINI_API_KEY` — Google Gemini AI (server-only)
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Mapbox GL
- `NEXT_PUBLIC_APP_URL` — App base URL

No `.env.local` file exists locally — all env vars are set in Vercel.

## Key Patterns

- **Auth**: Supabase SSR via middleware.ts. Redirects unauthenticated users to /auth/login.
- **API routes**: Use `createRouteClient()` from `lib/supabase/route` for auth.
- **Fish ID flow**: Photo -> compress to 1200px -> base64 -> POST /api/identify -> Gemini 2.5 Flash -> returns `{species, length, confidence}`.
- **Conditions flow**: Location selected -> auto-fetch river data (USGS for US, Environment Agency for UK with NRFA fallback) + Open-Meteo (air temp, weather, baro, wind) -> displayed in ConditionsPanel.
- **USGS gauge lookup**: Hardcoded table of ~20 rivers -> fallback to nearest gauge search by lat/lng.
- **UK conditions routing**: `lib/geoUtils.ts` `isUK(lat, lng)` bounding-box check. UK trips fetch from Environment Agency real-time API (`environment.data.gov.uk/flood-monitoring`), falling back to NRFA (`nrfa.ceh.ac.uk/api`) for Scotland/Wales/NI or older trip dates. UK conditions display in metric (m³/s, m, °C); US in imperial. Both APIs are free with no auth.
- **Image handling**: Photos compressed client-side before upload. Supabase storage bucket: `catch-photos`. `/api/upload` runs the storage write under the service-role key (path is forced to `${session.user.id}/...`, so RLS at the bucket level becomes redundant for this route — auth is enforced at route entry). This sidesteps an SSR/JWT propagation edge case where the cookie-bound client occasionally tripped storage RLS on deferred offline-sync uploads.
- **Offline trip flow**: A trip created while `navigator.onLine === false` (or saved-online that fails partway through) is enqueued to IndexedDB (`lib/offline/db.ts`: `pendingTrips`, `pendingCatches`, `pendingPhotos`). The service worker (`app/sw.ts`) is `NetworkOnly` for `/api/*` so cached mutations are never served stale. `SyncRunner` drains the queue on mount, on `online`, on tab visibility, and every 5 min while visible. Upserts on `/api/trips` and `/api/catches` use `onConflict: 'id'` so replays are idempotent. The `OfflineBadge` shows `Offline`, `N pending · tap to sync` (with a spinner while draining), or `Sign in to sync` if the session expires mid-drain.
- **Waterway name resolution**: When a GPS-only trip is saved offline, the location starts as "Pinned location" and `needs_geocode` flags the IDB entry. `/api/resolve-location?lat=&lng=` chains Overpass (relation queries first across two radii with one retry on empty — major water bodies beat creek/stream ways) → Mapbox (`mapbox.places` with anchored regex ranking, lake/reservoir/bay beats river/creek/stream) → Nominatim (reverse, for state + minor water fields). The sync engine calls this on the way to PATCHing the trip, and the dashboard has a second-chance backfill effect that retries any trip in the loaded feed whose name still matches `/^(Pinned location|Current Location)/` and has lat/lng. Backfill is capped at 5 trips per page load with an in-memory dedup set.
- **Pending edit UI**: The Pending sync card on the dashboard opens an in-page overlay (`EditPendingTripForm`) — not a separate route — so editing a queued trip works offline regardless of SW cache state. Save writes back to IDB; the next `drainQueue` replays the edited values. A Discard button removes the trip from the queue.
- **Service worker update flow**: `ServiceWorkerRegister` listens for `controllerchange` (after ignoring the first install) and surfaces a small "New version available · Refresh" pill. The user decides when to reload — auto-reload would risk wiping an in-progress form. After a deploy, *tap the pill before testing* so the page picks up the new JS bundle (the SW activates immediately via `skipWaiting + clientsClaim`, but the tab keeps its in-memory bundle until reload).
- **Static-route requirement for offline pages**: Routes that must load offline (e.g. `/trips/new`) must NOT use `export const dynamic = 'force-dynamic'` — they need to render as `○ Static` in `next build` to land in Serwist's `__SW_MANIFEST` precache. Anything dynamic relies on `cacheOnNavigation` and only works after a prior online visit.

## Commands

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run lint    # ESLint
```

## Database Tables

- **profiles**: id, email, display_name, avatar_url, net_hole_size
- **trips**: id, user_id, title, date, location, state, lat, lng, flow, water_temp, gauge_height, air_temp, baro, weather, wind, moon, notes, bg_color, hero_photo_url, usgs_site_id, is_public
- **catches**: id, trip_id, user_id, species, length, fly, fly_category, fly_size, time_caught, date, notes, photo_url, photo_path, ai_confidence, sort_order, lat, lng

`catches.lat` / `catches.lng` are optional per-catch GPS pins (distinct from the trip's overall location) — added in `003_add_catch_location.sql`. They drive the fish-icon markers on the journal-entry map; tapping a marker opens the expanded catch view. Set via a "Drop Pin" button on the catch form (captures current GPS; works offline since GPS is hardware).

**Mapbox custom-marker footgun**: `mapboxgl.Marker({ element })` positions the marker by writing `transform: translate3d(x, y, 0)` on the element you pass in. If any CSS / JS sets `transform` on that same element (e.g. `:hover { transform: scale(1.15) }` or `el.style.transform = 'scale(...)'`), it **clobbers the translate** and the marker teleports to (0, 0) of the map container — i.e. the top-left corner. Apply hover/press transforms to a child element instead, never to the wrap Mapbox owns. See `components/journal/catchMarker.ts`.

**Public share links**: A trip can be made shareable by setting `trips.is_public = true` (toggle lives in `ShareTripDialog` on the trip detail page). The public route is `/share/[id]` — server-rendered with the anon Supabase client, bypassed in `middleware.ts` so unauthenticated visitors can view it. RLS in migration `004` is additive: owners keep their existing CRUD policy; an additional `select`-only policy permits anyone (including anon) when `is_public = true`, plus a join-via-exists policy on `catches` so the trip's catches come along.

## Notes

- Supabase CLI is installed (`npx supabase`, v2.89.0) but not logged in locally.
- Deploy is automatic on push to `main` via Vercel.
- The conditions `...conditions` spread is used when saving trips — any new condition field must have a corresponding DB column or the save will fail.
