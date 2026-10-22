#!/usr/bin/env node
// One-off: copy Drift Journal's data from Supabase into D1 + R2.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/migrate-from-supabase.mjs [--apply]
//
// Without --apply it only exports: writes .migration/data.sql and downloads every
// photo into .migration/photos/. With --apply it also uploads the photos to the
// R2 bucket and loads the SQL into the remote D1 database (both via wrangler).
// Safe to re-run: rows use INSERT OR REPLACE and photo uploads overwrite.
// User ids are preserved, so a user's first email-code sign-in on Cloudflare
// lands on their existing account.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, '')
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')
const BUCKET = 'catch-photos'
const R2_BUCKET = 'drift-journal-photos'
const NEW_PHOTO_BASE = 'https://driftjournal.pmansour.com/photos'
const OUT = '.migration'

if (!SB_URL || !SB_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

async function sb(path) {
  const r = await fetch(`${SB_URL}${path}`, { headers })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function table(name) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${name}?select=*&order=created_at.asc.nullsfirst`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) {
      // garmin_connections orders by connected_at, not created_at.
      if (r.status === 400 && from === 0) return tableNoOrder(name)
      throw new Error(`${name}: ${r.status} ${await r.text()}`)
    }
    const page = await r.json()
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

async function tableNoOrder(name) {
  const r = await fetch(`${SB_URL}/rest/v1/${name}?select=*`, { headers })
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function authUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const { users: batch } = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`)
    users.push(...batch)
    if (batch.length < 200) return users
  }
}

// Public Supabase storage URL → path inside the bucket (or null if not ours).
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/${BUCKET}/`
function photoPath(url) {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_PREFIX)) return null
  return decodeURIComponent(url.slice(PUBLIC_PREFIX.length).split('?')[0])
}
const rewrite = url => {
  const p = photoPath(url)
  return p ? `${NEW_PHOTO_BASE}/${p.split('/').map(encodeURIComponent).join('/')}` : url
}

const sqlVal = v => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'object') v = JSON.stringify(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function inserts(tableName, rows, cols) {
  return rows.map(r => `INSERT OR REPLACE INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(c => sqlVal(r[c])).join(', ')});`)
}

const TRIP_COLS = ['id', 'user_id', 'title', 'date', 'location', 'state', 'lat', 'lng', 'flow', 'water_temp', 'gauge_height', 'air_temp', 'baro', 'weather', 'wind', 'moon', 'notes', 'bg_color', 'hero_photo_url', 'usgs_site_id', 'is_public', 'garmin_pins', 'created_at', 'updated_at']
const CATCH_COLS = ['id', 'trip_id', 'user_id', 'species', 'length', 'fly', 'fly_category', 'fly_size', 'time_caught', 'date', 'notes', 'photo_url', 'photo_path', 'ai_confidence', 'sort_order', 'lat', 'lng', 'kind', 'created_at', 'updated_at']
const PROFILE_COLS = ['id', 'email', 'display_name', 'avatar_url', 'net_hole_size', 'created_at', 'updated_at']
const GARMIN_COLS = ['user_id', 'garmin_email', 'token_cipher', 'connected_at', 'updated_at']

async function main() {
  console.log('Reading Supabase…')
  const [users, profiles, trips, catches, garmin] = await Promise.all([
    authUsers(), table('profiles'), table('trips'), table('catches'), table('garmin_connections'),
  ])
  console.log(`  ${users.length} users, ${profiles.length} profiles, ${trips.length} trips, ${catches.length} catches, ${garmin.length} garmin connections`)

  // Every referenced user needs a users + profiles row (FKs).
  const userRows = users.filter(u => u.email).map(u => ({ id: u.id, email: u.email.toLowerCase(), created_at: u.created_at }))
  const known = new Set(userRows.map(u => u.id))
  const profileById = new Map(profiles.map(p => [p.id, p]))
  for (const u of userRows) if (!profileById.has(u.id)) profileById.set(u.id, { id: u.id, email: u.email })

  // Photos referenced anywhere, plus everything in the bucket (cheap insurance).
  const photoPaths = new Set()
  for (const c of catches) { const p = photoPath(c.photo_url); if (p) photoPaths.add(p); if (c.photo_path) photoPaths.add(c.photo_path) }
  for (const t of trips) { const p = photoPath(t.hero_photo_url); if (p) photoPaths.add(p) }
  for (const p of profileById.values()) { const q = photoPath(p.avatar_url); if (q) photoPaths.add(q) }

  const fixedTrips = trips.filter(t => known.has(t.user_id)).map(t => ({ ...t, hero_photo_url: rewrite(t.hero_photo_url) }))
  const tripIds = new Set(fixedTrips.map(t => t.id))
  const fixedCatches = catches.filter(c => tripIds.has(c.trip_id) && known.has(c.user_id)).map(c => ({ ...c, photo_url: rewrite(c.photo_url) }))
  const fixedProfiles = [...profileById.values()].filter(p => known.has(p.id)).map(p => ({ ...p, avatar_url: rewrite(p.avatar_url) }))
  const fixedGarmin = garmin.filter(g => known.has(g.user_id))

  const dropped = trips.length - fixedTrips.length + catches.length - fixedCatches.length
  if (dropped) console.warn(`  ! skipping ${dropped} orphaned trip/catch rows`)

  const sql = [
    ...inserts('users', userRows, ['id', 'email', 'created_at']),
    ...inserts('profiles', fixedProfiles, PROFILE_COLS),
    ...inserts('trips', fixedTrips, TRIP_COLS),
    ...inserts('catches', fixedCatches, CATCH_COLS),
    ...inserts('garmin_connections', fixedGarmin, GARMIN_COLS),
  ].join('\n')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'data.sql'), sql + '\n')
  console.log(`Wrote ${OUT}/data.sql`)

  console.log(`Downloading ${photoPaths.size} photos…`)
  let missing = 0
  for (const p of photoPaths) {
    const dest = join(OUT, 'photos', p)
    if (existsSync(dest)) continue
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`, { headers })
    if (!r.ok) { missing++; console.warn(`  ! ${p}: ${r.status}`); continue }
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
    writeFileSync(dest + '.type', r.headers.get('content-type') || 'image/jpeg')
  }
  if (missing) console.warn(`  ! ${missing} photos could not be downloaded`)

  if (!APPLY) {
    console.log('Export done. Re-run with --apply to load D1 and upload photos to R2.')
    return
  }

  const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: process.platform === 'win32' })
  console.log('Uploading photos to R2…')
  for (const p of photoPaths) {
    const src = join(OUT, 'photos', p)
    if (!existsSync(src)) continue
    const type = (await import('node:fs')).readFileSync(src + '.type', 'utf8')
    wrangler('r2', 'object', 'put', `${R2_BUCKET}/${p}`, '--file', src, '--content-type', type, '--remote')
  }
  console.log('Loading D1…')
  wrangler('d1', 'execute', 'DB', '--remote', '--file', join(OUT, 'data.sql'), '--yes')
  console.log('Migration complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
