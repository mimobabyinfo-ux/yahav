import { CITIES, CITY_ALIASES, EXTRA_LOCALITIES, POPULAR_CITIES } from '../data/cities'

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
// them: קריית אונו vs קרית אונו, פתח תקווה vs פתח תקוה. So the comparison
// folds ktiv male / ktiv haser as well, and there is a last-resort pass
// that ignores word order and spacing entirely.
//
// Brenda 7.10.26: a campaign is bringing mothers from everywhere, moshavim
// included, and the city is how she decides where to open the next
// workshop. Three changes:
//  - the list is now the full CBS settlement list (~1,270 places), see
//    data/cities.ts
//  - CITY_ALIASES: what people actually type (תל אביב, מודיעין, פ"ת,
//    נצרת עילית) lifts the official name to the top of the list
//  - a place that is still not in the list is no longer a dead end. The
//    old screen let her type it, showed לא נמצאו תוצאות, and then refused
//    to submit ("אנא בחרי עיר מגורים"), so the only ways forward were to
//    lie or to leave. Now she can keep what she typed (freeTextCity), and
//    the admin sees the real name instead of "אחר".
//
// Rules, in order:
//  1. an exact match wins outright — the list collapses to that one row
//  2. otherwise: the alias target (if what she typed is a known alias)
//  3. then names that START with what she typed
//  4. then names where any WORD starts with it (גן → רמת גן)
//  5. then anything else containing it
//  6. and if all of that is empty: every name containing all her words,
//     in any order, spacing ignored
// Inside each tier the familiar cities (POPULAR_CITIES) come first, so
// "רמת" shows רמת גן before רמת דוד. The tail is capped so the dropdown
// never becomes a wall of text.

const MAX_RESULTS = 8

/** Every selectable place, once. */
const ALL: string[] = Array.from(new Set([...CITIES, ...EXTRA_LOCALITIES]))

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

// Precomputed once: 1,270 names folded on every keystroke is wasted work
// on an old phone.
const FOLDED = ALL.map(name => ({ name, f: foldHebrew(name), s: squash(name) }))
const ALIAS_BY_KEY = new Map(
  Object.entries(CITY_ALIASES).map(([k, v]) => [squash(k), v] as const),
)

/** The city whose name is exactly what she typed, or null. Aliases are
 *  deliberately NOT exact: "מודיעין" must still let her see מודיעין עילית. */
export function findExactCity(query: string): string | null {
  const q = foldHebrew(query)
  if (!q) return null
  const sq = q.replace(/\s/g, '')
  return (
    FOLDED.find(c => c.f === q)?.name ??
    // "תל אביב-יפו" typed as "תלאביב יפו", "בית שמש" as "ביתשמש".
    FOLDED.find(c => c.s === sq)?.name ??
    null
  )
}

/** Best official name for what she typed: exact, else a known alias. */
export function resolveCity(query: string): string | null {
  return findExactCity(query) ?? ALIAS_BY_KEY.get(squash(query)) ?? null
}

/** What gets saved when the place is not in the list: her own words,
 *  tidied. Null when there is nothing worth saving. */
export function freeTextCity(query: string): string | null {
  const t = query.replace(/\s+/g, ' ').trim()
  return t.length >= 2 ? t : null
}

/** The value to save for a city field: the picked city if there is one,
 *  otherwise whatever she typed, resolved if possible. Used on submit so
 *  that typing without tapping a row never loses the answer. */
export function cityToSave(picked: string, typed: string): string | null {
  return picked.trim() || resolveCity(typed) || freeTextCity(typed)
}

const he = (a: string, b: string) => {
  const pa = POPULAR_CITIES.has(a) ? 0 : 1
  const pb = POPULAR_CITIES.has(b) ? 0 : 1
  return pa - pb || a.localeCompare(b, 'he')
}

/** Shown on focus before she types anything: the familiar cities only.
 *  Rendering all 1,270 buttons on an empty field helps no one. */
const POPULAR_SORTED = ALL.filter(c => POPULAR_CITIES.has(c)).sort((a, b) => a.localeCompare(b, 'he'))

export function rankCities(query: string, limit = MAX_RESULTS): string[] {
  const q = foldHebrew(query)
  if (!q) return POPULAR_SORTED

  const exact = findExactCity(query)
  if (exact) return [exact]

  const alias = ALIAS_BY_KEY.get(q.replace(/\s/g, ''))

  const starts: string[] = []
  const wordStarts: string[] = []
  const contains: string[] = []

  for (const { name, f } of FOLDED) {
    if (f.startsWith(q)) starts.push(name)
    else if (f.split(' ').some(w => w.startsWith(q))) wordStarts.push(name)
    else if (f.includes(q)) contains.push(name)
  }

  const ranked = [...starts.sort(he), ...wordStarts.sort(he), ...contains.sort(he)]
  const withAlias = alias ? [alias, ...ranked.filter(c => c !== alias)] : ranked
  if (withAlias.length) return withAlias.slice(0, limit)

  // Nothing matched in order. Before telling her לא נמצאו תוצאות about a
  // city that exists, try once more ignoring word order and spacing:
  // "יפו תל אביב", "מכבים רעות מודיעין", "רמתגן".
  const words = q.split(' ').filter(Boolean)
  const loose = FOLDED.filter(c => words.every(w => c.s.includes(w))).map(c => c.name)
  return loose.sort(he).slice(0, limit)
}
