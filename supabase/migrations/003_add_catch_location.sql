-- Catch-level GPS pin: the spot a specific fish was caught, distinct from
-- the trip's overall location. Nullable — most catches won't have a pin
-- (it's optional, surfaced via a "Drop Pin" action in the catch form).
alter table catches
  add column lat decimal(10, 6),
  add column lng decimal(10, 6);
