-- Garmin Connect link. One row per user, holding the encrypted Garmin session
-- token (OAuth1 + OAuth2) so we can pull fishing activities without re-asking
-- for the password. We never store the password itself — only the token blob,
-- AES-256-GCM encrypted at the app layer (see lib/garmin/crypto.ts). RLS keeps
-- each row readable only by its owner; API routes decrypt server-side.
create table if not exists garmin_connections (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  garmin_email text,
  token_cipher text not null,
  connected_at timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table garmin_connections enable row level security;

create policy "own garmin connection"
  on garmin_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
