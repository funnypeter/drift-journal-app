-- Garmin catch pins: GPS points the watch recorded when you pressed "Log Catch"
-- during a fishing activity. These are NOT catch records — catches only come
-- from photos. Pins render as fish markers on the trip map; when a photo's
-- capture time lands within 5 minutes of a pin, that photo's catch adopts the
-- pin's GPS and the pin is consumed. Stored as a JSON array of
-- { lat, lng, time } where `time` is the catch moment in the trip's local
-- wall-clock (so it can be compared to a photo's EXIF time without a tz lookup).
alter table trips add column garmin_pins jsonb;
