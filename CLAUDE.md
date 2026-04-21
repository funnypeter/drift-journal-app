# Drift Journal

Fly fishing journal app for logging trips, catches, and conditions.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database & Auth**: Supabase (auth, PostgreSQL, storage)
- **Maps**: Mapbox GL
- **AI**: Google Gemini 2.5 Flash (fish species identification from photos)
- **Hosting**: Vercel (region: iad1)
- **Styling**: CSS Modules

## Project Structure

```
app/
  api/
    catches/        # CRUD for catch records
    conditions/     # USGS water data + Open-Meteo weather
    identify/       # Gemini AI fish identification
    profile/        # User profile (net hole size, etc.)
    trips/          # CRUD for trip records
    upload/         # Photo upload to Supabase storage
  auth/             # Login, OAuth callback
  dashboard/        # Home feed, map view, profile
  trips/            # Trip detail, edit, new entry
components/
  journal/          # CatchCard, ConditionsPanel, NewTripForm, EditTripForm, TripDetail, LocationSearch
  share/            # Share card generation
  ui/               # Reusable UI components
lib/supabase/       # Supabase client helpers (client, route, server)
types/              # TypeScript interfaces (Trip, Catch, Profile, etc.)
supabase/migrations/ # SQL migrations
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
- **Image handling**: Photos compressed client-side before upload. Supabase storage bucket: `catch-photos`.

## Commands

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run lint    # ESLint
```

## Database Tables

- **profiles**: id, email, display_name, avatar_url, net_hole_size
- **trips**: id, user_id, title, date, location, state, lat, lng, flow, water_temp, gauge_height, air_temp, baro, weather, wind, moon, notes, bg_color, hero_photo_url, usgs_site_id
- **catches**: id, trip_id, user_id, species, length, fly, fly_category, fly_size, time_caught, date, notes, photo_url, photo_path, ai_confidence, sort_order

## Notes

- Supabase CLI is installed (`npx supabase`, v2.89.0) but not logged in locally.
- Deploy is automatic on push to `main` via Vercel.
- The conditions `...conditions` spread is used when saving trips — any new condition field must have a corresponding DB column or the save will fail.
