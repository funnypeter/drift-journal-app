// Rough lat/lng bounding box for the UK (incl. Northern Ireland).
// Used to decide whether to route a trip's water conditions to UK-specific
// data sources (Environment Agency / NRFA) instead of USGS.
export function isUK(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false
  return lat >= 49.8 && lat <= 60.9 && lng >= -8.6 && lng <= 1.8
}
