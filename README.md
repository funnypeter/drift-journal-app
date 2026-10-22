# Drift Journal

Fly fishing trip journal — Next.js 15 on Cloudflare Workers (D1 + R2), live at https://driftjournal.pmansour.com.

## Stack
- **Framework**: Next.js 15 App Router, deployed with `@opennextjs/cloudflare`
- **Database**: Cloudflare D1 (`migrations/`)
- **Photos**: Cloudflare R2, served at `/photos/<key>`
- **Auth**: email sign-in codes (Cloudflare Email Service) + cookie sessions in D1
- **AI**: Gemini 2.5 Flash (fish ID, voice-note cleanup)
- **Maps**: Mapbox GL

## Setup
```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply DB --local
cp .env.local.example .dev.vars   # fill in secrets for local runs
npm run preview                    # build + run in workerd at http://localhost:8787
```

## Deploy
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GARMIN_TOKEN_KEY
echo NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxx > .env.production.local
npm run deploy
```

Bindings and plain vars live in `wrangler.jsonc`. See `CLAUDE.md` for architecture notes.
