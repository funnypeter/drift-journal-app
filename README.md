# Drift Journal

Fly fishing trip journal — Next.js 14, Supabase, Vercel.

## Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Vercel
- **AI**: Gemini 2.5 Flash (server-side API route — key never exposed to client)
- **Maps**: Mapbox GL JS
- **Conditions**: USGS Water Services + Open-Meteo

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Copy your project URL and keys from **Settings → API**

### 2. Environment variables
Copy `.env.local.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Local development
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel
1. Push to GitHub
2. Import repo in [vercel.com](https://vercel.com)
3. Add all env vars from `.env.local` in Vercel project settings
4. Deploy

### 5. Supabase Auth callback URL
In Supabase → **Authentication → URL Configuration**, add:
```
https://your-vercel-url.vercel.app/auth/callback
```

### 6. Import existing data
1. Go to Profile → Import from PWA
2. Open the old PWA → DevTools → Application → Local Storage
3. Copy `driftjournal_trips` value and paste it in the importer
4. Photos are automatically uploaded to Supabase Storage

## Features
- 🎣 Trip logging with catches, conditions, photos
- 🤖 AI fish identification via Gemini (server-side — API key secure)
- 🌊 Live USGS streamflow + Open-Meteo weather
- 📱 PWA installable on iOS/Android
- 📸 Social media share cards (canvas-generated)
- 🔐 Magic link auth (no passwords)
- ☁️ Full cloud sync across devices
