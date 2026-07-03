import type { Catch } from '@/types'

// A non-catch entry (a plant photo, or a "no fish" scene) is still worth keeping
// for its photo and conditions, but shouldn't count toward catch totals. Marked
// either by `kind` ('flower'/'none') or, for older rows saved before the `kind`
// column existed, by the sentinel species "No Fish".
export function isNoFish<T extends Pick<Catch, 'species' | 'kind'>>(c: T): boolean {
  if (c.kind === 'flower' || c.kind === 'none') return true
  return (c.species || '').trim().toLowerCase() === 'no fish'
}

export function realCatches<T extends Pick<Catch, 'species' | 'kind'>>(catches: T[]): T[] {
  return catches.filter(c => !isNoFish(c))
}
