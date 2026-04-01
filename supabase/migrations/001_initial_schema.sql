-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ─────────────────────────────────────────────────────────────────
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  net_hole_size decimal(4,2) default 0.5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── TRIPS ────────────────────────────────────────────────────────────────────
create table trips (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  date date not null,
  location text,
  state text,
  lat decimal(10,6),
  lng decimal(10,6),
  flow text,
  water_temp text,
  air_temp text,
  baro text,
  weather text,
  wind text,
  moon text,
  notes text,
  bg_color text,
  hero_photo_url text,
  usgs_site_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table trips enable row level security;
create policy "Users can CRUD own trips" on trips for all using (auth.uid() = user_id);

-- ── CATCHES ──────────────────────────────────────────────────────────────────
create table catches (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  species text default 'Unknown',
  length decimal(5,2),
  fly text,
  fly_category text,
  fly_size text,
  time_caught time,
  date date,
  notes text,
  photo_url text,
  photo_path text,
  ai_confidence integer,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table catches enable row level security;
create policy "Users can CRUD own catches" on catches for all using (auth.uid() = user_id);

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_updated_at before update on trips for each row execute procedure update_updated_at();
create trigger catches_updated_at before update on catches for each row execute procedure update_updated_at();
create trigger profiles_updated_at before update on profiles for each row execute procedure update_updated_at();

-- ── STORAGE BUCKETS ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('catch-photos', 'catch-photos', true);

create policy "Users can upload own catch photos"
  on storage.objects for insert
  with check (bucket_id = 'catch-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view catch photos"
  on storage.objects for select
  using (bucket_id = 'catch-photos');

create policy "Users can delete own catch photos"
  on storage.objects for delete
  using (bucket_id = 'catch-photos' and auth.uid()::text = (storage.foldername(name))[1]);
