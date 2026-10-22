import { db } from '@/lib/cf'
import type { Trip, Catch, Profile } from '@/types'

// D1 data layer. Replaces Supabase RLS: every read/write here is scoped to the
// caller's user id, so API routes must pass session.user.id, never a client value.

const TRIP_COLS = [
  'title', 'date', 'location', 'state', 'lat', 'lng', 'flow', 'water_temp',
  'gauge_height', 'air_temp', 'baro', 'weather', 'wind', 'moon', 'notes',
  'bg_color', 'hero_photo_url', 'usgs_site_id', 'is_public', 'garmin_pins',
] as const

const CATCH_COLS = [
  'trip_id', 'species', 'length', 'fly', 'fly_category', 'fly_size',
  'time_caught', 'date', 'notes', 'photo_url', 'photo_path', 'ai_confidence',
  'sort_order', 'lat', 'lng', 'kind',
] as const

const PROFILE_COLS = ['display_name', 'avatar_url', 'net_hole_size'] as const

type Row = Record<string, unknown>

// Keep only whitelisted columns that the client actually sent, encoded for SQLite.
function pick(body: Row, cols: readonly string[]): Row {
  const out: Row = {}
  for (const c of cols) {
    if (!(c in body) || body[c] === undefined) continue
    const v = body[c]
    if (typeof v === 'boolean') out[c] = v ? 1 : 0
    else if (v !== null && typeof v === 'object') out[c] = JSON.stringify(v)
    else out[c] = v
  }
  return out
}

function toTrip(r: Row): Trip {
  return {
    ...(r as any),
    is_public: !!r.is_public,
    garmin_pins: typeof r.garmin_pins === 'string' ? JSON.parse(r.garmin_pins) : null,
  }
}

// Attach catches (ordered like the old `catches(* order by sort_order)` embed).
async function withCatches(rows: Row[]): Promise<Trip[]> {
  const trips = rows.map(toTrip)
  if (!trips.length) return trips
  const ids = trips.map(t => t.id)
  const byTrip = new Map<string, Catch[]>(ids.map(id => [id, []]))
  // D1 caps bound parameters per statement, so chunk the IN list.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const { results } = await db()
      .prepare(`select * from catches where trip_id in (${chunk.map(() => '?').join(',')}) order by sort_order, created_at`)
      .bind(...chunk)
      .all<Catch>()
    for (const c of results) byTrip.get(c.trip_id)?.push(c)
  }
  return trips.map(t => ({ ...t, catches: byTrip.get(t.id) || [] }))
}

// ── TRIPS ────────────────────────────────────────────────────────────────────

export async function listTrips(userId: string, opts: { limit?: number; withLocation?: boolean } = {}) {
  let sql = 'select * from trips where user_id = ?'
  if (opts.withLocation) sql += ' and lat is not null and lng is not null'
  sql += ' order by date desc, created_at desc'
  if (opts.limit) sql += ` limit ${Math.floor(opts.limit)}`
  const { results } = await db().prepare(sql).bind(userId).all<Row>()
  return withCatches(results)
}

/** A trip the viewer may see: their own, or any public one (viewerId null = anonymous). */
export async function getTrip(id: string, viewerId: string | null, opts: { publicOnly?: boolean } = {}) {
  const row = opts.publicOnly || !viewerId
    ? await db().prepare('select * from trips where id = ? and is_public = 1').bind(id).first<Row>()
    : await db().prepare('select * from trips where id = ? and (user_id = ? or is_public = 1)').bind(id, viewerId).first<Row>()
  if (!row) return null
  return (await withCatches([row]))[0]
}

/** Insert or update by id (idempotent for offline replays). Never touches another user's row. */
export async function upsertTrip(userId: string, body: Row) {
  const data = pick(body, TRIP_COLS)
  const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID()
  // A replay of an already-synced trip may carry only changed fields; update it
  // in place rather than tripping NOT NULL checks on the insert half.
  if (await db().prepare('select 1 from trips where id = ? and user_id = ?').bind(id, userId).first()) {
    return (await updateTrip(userId, id, data))!
  }
  const cols = Object.keys(data)
  const sql =
    `insert into trips (id, user_id${cols.map(c => ', ' + c).join('')}) values (?, ?${cols.map(() => ', ?').join('')})` +
    (cols.length
      ? ` on conflict(id) do update set ${cols.map(c => `${c} = excluded.${c}`).join(', ')} where trips.user_id = excluded.user_id`
      : ' on conflict(id) do nothing') +
    ' returning *'
  const row = await db().prepare(sql).bind(id, userId, ...cols.map(c => data[c])).first<Row>()
  if (row) return toTrip(row)
  // "do nothing" / owner mismatch returns no row: hand back the caller's own row if it exists.
  const existing = await db().prepare('select * from trips where id = ? and user_id = ?').bind(id, userId).first<Row>()
  if (!existing) throw new Error('Trip not found')
  return toTrip(existing)
}

export async function updateTrip(userId: string, id: string, body: Row) {
  const data = pick(body, TRIP_COLS)
  const cols = Object.keys(data)
  if (!cols.length) {
    const row = await db().prepare('select * from trips where id = ? and user_id = ?').bind(id, userId).first<Row>()
    return row ? toTrip(row) : null
  }
  const row = await db()
    .prepare(`update trips set ${cols.map(c => `${c} = ?`).join(', ')} where id = ? and user_id = ? returning *`)
    .bind(...cols.map(c => data[c]), id, userId)
    .first<Row>()
  return row ? toTrip(row) : null
}

export async function deleteTrip(userId: string, id: string) {
  await db().prepare('delete from trips where id = ? and user_id = ?').bind(id, userId).run()
}

// ── CATCHES ──────────────────────────────────────────────────────────────────

async function ownsTrip(userId: string, tripId: unknown) {
  if (typeof tripId !== 'string') return false
  return !!(await db().prepare('select 1 from trips where id = ? and user_id = ?').bind(tripId, userId).first())
}

export async function upsertCatch(userId: string, body: Row) {
  const data = pick(body, CATCH_COLS)
  const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID()
  if (data.trip_id !== undefined && !(await ownsTrip(userId, data.trip_id))) throw new Error('Trip not found')
  if (await db().prepare('select 1 from catches where id = ? and user_id = ?').bind(id, userId).first()) {
    return (await updateCatch(userId, id, data))!
  }
  const cols = Object.keys(data)
  const sql =
    `insert into catches (id, user_id${cols.map(c => ', ' + c).join('')}) values (?, ?${cols.map(() => ', ?').join('')})` +
    (cols.length
      ? ` on conflict(id) do update set ${cols.map(c => `${c} = excluded.${c}`).join(', ')} where catches.user_id = excluded.user_id`
      : ' on conflict(id) do nothing') +
    ' returning *'
  const row = await db().prepare(sql).bind(id, userId, ...cols.map(c => data[c])).first<Catch>()
  if (row) return row
  const existing = await db().prepare('select * from catches where id = ? and user_id = ?').bind(id, userId).first<Catch>()
  if (!existing) throw new Error('Catch not found')
  return existing
}

export async function updateCatch(userId: string, id: string, body: Row) {
  const data = pick(body, CATCH_COLS)
  if (data.trip_id !== undefined && !(await ownsTrip(userId, data.trip_id))) throw new Error('Trip not found')
  const cols = Object.keys(data)
  if (!cols.length) {
    return db().prepare('select * from catches where id = ? and user_id = ?').bind(id, userId).first<Catch>()
  }
  return db()
    .prepare(`update catches set ${cols.map(c => `${c} = ?`).join(', ')} where id = ? and user_id = ? returning *`)
    .bind(...cols.map(c => data[c]), id, userId)
    .first<Catch>()
}

export async function deleteCatch(userId: string, id: string) {
  await db().prepare('delete from catches where id = ? and user_id = ?').bind(id, userId).run()
}

// ── PROFILES ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  return db().prepare('select * from profiles where id = ?').bind(userId).first<Profile>()
}

export async function updateProfile(userId: string, body: Row) {
  const data = pick(body, PROFILE_COLS)
  const cols = Object.keys(data)
  if (!cols.length) return getProfile(userId)
  return db()
    .prepare(`update profiles set ${cols.map(c => `${c} = ?`).join(', ')} where id = ? returning *`)
    .bind(...cols.map(c => data[c]), userId)
    .first<Profile>()
}
