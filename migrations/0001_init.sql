-- D1 (SQLite) schema. Replaces supabase/migrations/001–007, which are kept for
-- history. Postgres → SQLite mapping: uuid/text/timestamptz/date/time → TEXT
-- (ISO strings), decimal → REAL, boolean → INTEGER 0/1, jsonb → TEXT (JSON).
-- Row-level security is gone: every query in lib/db scopes by user_id.

-- ── AUTH ─────────────────────────────────────────────────────────────────────
create table users (
  id         text primary key,
  email      text not null unique collate nocase,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Session cookie holds a random token; only its SHA-256 is stored here.
create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  expires_at integer not null -- unix ms
);
create index sessions_user_idx on sessions (user_id);

-- One pending sign-in code per email (hashed). attempts caps brute force.
create table login_codes (
  email      text primary key collate nocase,
  code_hash  text not null,
  expires_at integer not null, -- unix ms
  attempts   integer not null default 0
);

-- ── PROFILES ─────────────────────────────────────────────────────────────────
create table profiles (
  id            text primary key references users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  net_hole_size real default 0.5,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── TRIPS ────────────────────────────────────────────────────────────────────
create table trips (
  id             text primary key,
  user_id        text not null references profiles(id) on delete cascade,
  title          text not null,
  date           text not null,
  location       text,
  state          text,
  lat            real,
  lng            real,
  flow           text,
  water_temp     text,
  gauge_height   text,
  air_temp       text,
  baro           text,
  weather        text,
  wind           text,
  moon           text,
  notes          text,
  bg_color       text,
  hero_photo_url text,
  usgs_site_id   text,
  is_public      integer not null default 0,
  garmin_pins    text,
  created_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index trips_user_date_idx on trips (user_id, date desc);

-- ── CATCHES ──────────────────────────────────────────────────────────────────
create table catches (
  id            text primary key,
  trip_id       text not null references trips(id) on delete cascade,
  user_id       text not null references profiles(id) on delete cascade,
  species       text default 'Unknown',
  length        real,
  fly           text,
  fly_category  text,
  fly_size      text,
  time_caught   text,
  date          text,
  notes         text,
  photo_url     text,
  photo_path    text,
  ai_confidence integer,
  sort_order    integer default 0,
  lat           real,
  lng           real,
  kind          text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index catches_trip_idx on catches (trip_id, sort_order);
create index catches_user_idx on catches (user_id);

-- ── GARMIN ───────────────────────────────────────────────────────────────────
create table garmin_connections (
  user_id      text primary key references users(id) on delete cascade,
  garmin_email text,
  token_cipher text not null,
  connected_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────
-- recursive_triggers is off in D1, so the inner UPDATE doesn't re-fire these.
create trigger trips_updated_at after update on trips for each row
  begin update trips set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id; end;
create trigger catches_updated_at after update on catches for each row
  begin update catches set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id; end;
create trigger profiles_updated_at after update on profiles for each row
  begin update profiles set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id; end;
