-- Add gauge_height column to trips
alter table trips add column if not exists gauge_height text;
