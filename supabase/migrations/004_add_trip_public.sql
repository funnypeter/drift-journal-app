-- Allow users to mark a trip as public so it can be shared via a /share/<id>
-- link without requiring the viewer to be logged in.
alter table trips
  add column is_public boolean not null default false;

create index if not exists trips_is_public_idx on trips (is_public) where is_public = true;

-- Anyone (including anon role) can read a trip when is_public = true. Existing
-- "Users can CRUD own trips" policy still applies for the owner, so this is
-- additive — non-owners can only see public trips.
create policy "Anyone can view public trips"
  on trips for select
  using (is_public = true);

-- Catches inherit visibility: public trips → all their catches readable. Joined
-- via exists() against the trips table; the trip's is_public check there
-- substitutes for an auth check.
create policy "Anyone can view catches of public trips"
  on catches for select
  using (
    exists (
      select 1 from trips
      where trips.id = catches.trip_id
        and trips.is_public = true
    )
  );
