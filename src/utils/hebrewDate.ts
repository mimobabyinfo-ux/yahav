// Shared Hebrew date formatter for the journal views.
// Returns "יום שישי · 15 ביולי" — Hebrew weekday + day-month, no year.
// Used by DayView's date-nav label and ListView's date-group headers
// so the two strings stay identical.

const HE_WEEKDAY = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']

export function hebrewDateHeader(iso: string): string {
  // Anchor at midnight in the local zone — toLocaleDateString uses the
  // explicit Israel TZ so the month name is the same regardless of where
  // the device thinks it is.
  const d = new Date(iso + 'T00:00:00')
  const weekday = HE_WEEKDAY[d.getDay()]
  const dm = d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' })
  return `${weekday} · ${dm}`
}
