import { CITIES } from '../data/cities'

// Shared ranking for the city comboboxes (onboarding + community
// profile).
//
// Brenda 17.8.26: "if I typed רמת גן I want to see only רמת גן". The old
// filter was a plain `includes` with a sort, so a fully typed city still
// sat in a list next to every other locality that happened to contain
// the same letters, and the exact answer was not obviously the answer.
//
// Brenda 18.8.26: "the cities still don't work well — you type the city
// all the way to the end and it doesn't find it." Both times she was
// typing a real city and getting לא נמצאו תוצאות, because Hebrew has two
// accepted spellings of the same name and the list only holds one of
// them: קריית אונו vs קרית אונו, פתח תקווה vs פתח תקוה. A mother types
// the one she writes; the list disagreed by a single yod and the answer
// disappeared. So the comparison now folds ktiv male / ktiv haser as
// well, and there is a last-resort pass that ignores word order and
// spacing entirely — better a slightly loose list than an empty one.
//
// Rules now, in order:
//  1. an exact match wins outright — the list collapses to that one row
//  2. otherwise: names that START with what she typed
//  3. then names where any WORD starts with it (גן → רמת גן)
//  4. then anything else containing it
//  5. and if all of that is empty: every name containing all her words,
//     in any order, spacing ignored
// and the tail is capped so the dropdown never becomes a wall of text.

const MAX_RESULTS = 8

/** Fold away the spelling noise that makes a real match look like a miss:
 *  maqaf/hyphen variants, geresh/quote marks, doubled spaces, and the
 *  ktiv male / ktiv haser difference (קריית↔קרית, תקווה↔תקוה). */
export function foldHebrew(value: string): string {
  return value
    .replace(/[־\-–—]/g, ' ')
    .replace(/['"`׳״]/g, '')
    // Doubled yod/vav are a spelling convention, not a different name.
    // Collapsing both sides means either spelling finds the other.
    .replace(/יי/g, 'י')
    .replace(/וו/g, 'ו')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The city-picker name for the same fold. Neighbourhood search uses
 *  foldHebrew directly — a שכונה has exactly the same spelling problem
 *  (קריית שרת / קרית שרת, נוה שרת / נווה שרת). */
export const normalizeCityName = foldHebrew

/** Same, with spacing removed as well — used only for the loose passes. */
function squash(value: string): string {
  return foldHebrew(value).replace(/\s/g, '')
}

/** The city whose name is exactly what she typed, or null. */
export function findExactCity(query: string): string | null {
  const q = foldHebrew(query)
  if (!q) return null
  return (
    CITIES.find(c => foldHebrew(c) === q) ??
    // "תל אביב-יפו" typed as "תלאביב יפו", "בית שמש" as "ביתשמש".
    CITIES.find(c => squash(c) === squash(q)) ??
    null
  )
}

export function rankCities(query: string, limit = MAX_RESULTS): string[] {
  const q = foldHebrew(query)
  if (!q) return CITIES

  const exact = CITIES.filter(c => foldHebrew(c) === q)
  if (exact.length) return exact

  const starts: string[] = []
  const wordStarts: string[] = []
  const contains: string[] = []

  for (const c of CITIES) {
    const n = foldHebrew(c)
    if (n.startsWith(q)) starts.push(c)
    else if (n.split(' ').some(w => w.startsWith(q))) wordStarts.push(c)
    else if (n.includes(q)) contains.push(c)
  }

  const he = (a: string, b: string) => a.localeCompare(b, 'he')
  const ranked = [...starts.sort(he), ...wordStarts.sort(he), ...contains.sort(he)]
  if (ranked.length) return ranked.slice(0, limit)

  // Nothing matched in order. Before telling her לא נמצאו תוצאות about a
  // city that exists, try once more ignoring word order and spacing:
  // "יפו תל אביב", "מכבים רעות מודיעין", "רמתגן".
  const words = q.split(' ').filter(Boolean)
  const loose = CITIES.filter(c => {
    const s = squash(c)
    return words.every(w => s.includes(w))
  })
  return loose.sort(he).slice(0, limit)
}
