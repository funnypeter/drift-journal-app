-- Non-fish gallery photos. A catch row can now represent a plant/flower or a
-- "no fish" scene (scenery, gear, a hand, an empty net) that the user still
-- wants to keep in the trip's photo gallery. `kind` marks these so they show
-- as photos but are excluded from catch totals:
--   'fish'   -> a normal catch (counted)
--   'flower' -> a plant photo; species holds the plant's common name (uncounted)
--   'none'   -> no fish or plant in frame; species = 'No Fish' (uncounted)
-- Null = a normal fish catch, so existing rows keep counting (backward compatible).
alter table catches add column kind text;
