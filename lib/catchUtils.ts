import type { Catch } from '@/types'

// Entries flagged as non-catches (no fish caught, scenery photo, skunked, or
// the auto-default 'Unknown' that was never updated) shouldn't count toward
// catch totals. Useful for trip logs with no fish but a photo / conditions.
const NON_CATCH_SPECIES = new Set([
  '', 'no fish', 'no catch', 'none', 'scenery', 'skunked',
])

export function isNoFish<T extends Pick<Catch, 'species'>>(c: T): boolean {
  return NON_CATCH_SPECIES.has((c.species || '').trim().toLowerCase())
}

export function realCatches<T extends Pick<Catch, 'species'>>(catches: T[]): T[] {
  return catches.filter(c => !isNoFish(c))
}
