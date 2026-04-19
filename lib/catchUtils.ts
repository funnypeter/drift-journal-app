import type { Catch } from '@/types'

// A "No Fish" entry represents a trip log with nothing caught — still useful to
// record conditions/photos, but shouldn't count toward catch totals.
export function isNoFish<T extends Pick<Catch, 'species'>>(c: T): boolean {
  return (c.species || '').trim().toLowerCase() === 'no fish'
}

export function realCatches<T extends Pick<Catch, 'species'>>(catches: T[]): T[] {
  return catches.filter(c => !isNoFish(c))
}
