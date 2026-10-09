// Shared date header for the journal views.
// Returns "יום שישי · 15 ביולי" (Hebrew) or "viernes · 15 de julio"
// (Spanish interface) — weekday + day-month, no year.
// Used by DayView's date-nav label and ListView's date-group headers
// so the two strings stay identical.
import { LANG, LOCALE } from '../i18n'

const HE_WEEKDAY = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']

export function hebrewDateHeader(iso: string): string {
  // Anchor at midnight in the local zone — toLocaleDateString uses the
  // explicit Israel TZ so the month name is the same regardless of where
  // the device thinks it is.
  const d = new Date(iso + 'T00:00:00')
  const weekday = LANG === 'he'
    ? HE_WEEKDAY[d.getDay()]
    : d.toLocaleDateString(LOCALE, { timeZone: 'Asia/Jerusalem', weekday: 'long' })
  const dm = d.toLocaleDateString(LOCALE, { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' })
  return `${weekday} · ${dm}`
}
