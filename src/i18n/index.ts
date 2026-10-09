// ── Interface language (Hebrew / Spanish) ─────────────────────────────
//
// Brenda 9.10.26: the interface and the baby tracker should work in
// Spanish too. Content (workshops, tips, guides, events, WhatsApp, mails)
// stays in Hebrew for now, and so does the admin panel.
//
// How it works:
//   - The Hebrew text itself is the key. `tx('יומן')` returns 'יומן' in
//     Hebrew and es['יומן'] in Spanish. No separate Hebrew dictionary to
//     keep in sync, and the screens stay readable in Hebrew.
//   - Anything missing from es.ts falls back to the Hebrew, so a new
//     string never breaks a screen, it just shows in Hebrew until it is
//     translated. CHANGING a Hebrew string drops its translation the same
//     way, so update the key in es.ts too.
//   - Placeholders: tx('צופה ביומן של {name}', { name }) — the same
//     {name} must appear in the Spanish value.
//   - The language is read ONCE at startup. Switching reloads the page
//     (setLang). It changes rarely, and this keeps every screen, util and
//     date formatter in step without threading a context through them.
//
// Where the choice lives: localStorage (works before login) and
// user_profiles.language (follows her to another phone). First visit with
// nothing saved: Spanish if the phone is set to Spanish, Hebrew otherwise.

import { es } from './es'

export type Lang = 'he' | 'es'

const LS_KEY = 'mimo_lang'

function readSaved(): Lang | null {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s === 'he' || s === 'es') return s
  } catch { /* storage blocked */ }
  return null
}

function detect(): Lang {
  const saved = readSaved()
  if (saved) return saved
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    const first = (langs[0] || '').toLowerCase()
    if (first.startsWith('es')) return 'es'
  } catch { /* */ }
  return 'he'
}

export const LANG: Lang = detect()
export const IS_RTL = LANG === 'he'
export const DIR: 'rtl' | 'ltr' = IS_RTL ? 'rtl' : 'ltr'
/** Locale for toLocaleDateString / Intl. */
export const LOCALE = LANG === 'he' ? 'he-IL' : 'es'

/** True when she has explicitly picked a language on this device. */
export function hasSavedLang(): boolean {
  return readSaved() !== null
}

type Vars = Record<string, string | number | null | undefined>

function fill(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m))
}

/** Translate. The Hebrew text is the key. */
export function tx(he: string, vars?: Vars): string {
  const s = LANG === 'es' ? (es[he] ?? he) : he
  return fill(s, vars)
}

/** Save the choice on this device and reload into it. */
export function setLang(lang: Lang, opts: { reload?: boolean } = {}) {
  try { localStorage.setItem(LS_KEY, lang) } catch { /* */ }
  if (opts.reload !== false && lang !== LANG) window.location.reload()
}

/** Called once from main.tsx before the first render. */
export function applyDocumentLang() {
  document.documentElement.lang = LANG
  document.documentElement.dir = DIR
}

/** Tummy-time notes are STORED as "משך: N דקות" / "משך: N שניות" (parsed
 *  back by regex elsewhere), so the stored prefix stays Hebrew. This
 *  translates just that prefix for display. */
export function localizeStoredNotes(notes: string): string {
  if (LANG === 'he') return notes
  return notes.replace(/^משך:\s*(\d+(?:\.\d+)?)\s*(דקות|שניות)/, (_m, n, unit) =>
    unit === 'דקות' ? tx('משך: {n} דקות', { n }) : tx('משך: {n} שניות', { n }))
}
