import { CITIES } from '../data/cities'

// Shared ranking for the city comboboxes (onboarding + community
// profile).
//
// Brenda 17.8.26: "if I typed רמת גן I want to see only רמת גן". The old
// filter was a plain `includes` with a sort, so a fully typed city still
// sat in a list next to every other locality that happened to contain
// the same letters, and the exact answer was not obviously the answer.
//
// Rules now, in order:
//  1. an exact match wins outright — the list collapses to that one row
//  2. otherwise: names that START with what she typed
//  3. then names where any WORD starts with it (גן → רמת גן)
//  4. then anything else containing it
// and the tail is capped so the dropdown never becomes a wall of text.

const MAX_RESULTS = 8

/** Fold away the spelling noise that makes a real match look like a miss:
 *  maqaf/hyphen variants, geresh/quote marks, and doubled spaces. */
export function normalizeCityName(value: string): string {
  return value
    .replace(/[־\-–—]/g, ' ')
    .replace(/['"`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The city whose name is exactly what she typed, or null. */
export function findExactCity(query: string): string | null {
  const q = normalizeCityName(query)
  if (!q) return null
  return CITIES.find(c => normalizeCityName(c) === q) ?? null
}

export function rankCities(query: string, limit = MAX_RESULTS): string[] {
  const q = normalizeCityName(query)
  if (!q) return CITIES

  const exact = CITIES.filter(c => normalizeCityName(c) === q)
  if (exact.length) return exact

  const starts: string[] = []
  const wordStarts: string[] = []
  const contains: string[] = []

  for (const c of CITIES) {
    const n = normalizeCityName(c)
    if (n.startsWith(q)) starts.push(c)
    else if (n.split(' ').some(w => w.startsWith(q))) wordStarts.push(c)
    else if (n.includes(q)) contains.push(c)
  }

  const he = (a: string, b: string) => a.localeCompare(b, 'he')
  return [...starts.sort(he), ...wordStarts.sort(he), ...contains.sort(he)].slice(0, limit)
}
