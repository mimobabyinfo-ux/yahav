const HE_MONTH = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** "16–22 באוגוסט", or "30 באוגוסט – 5 בספטמבר" across a month boundary.
 *  Replaces the raw "2026-08-22 – 2026-08-16" the week header used to
 *  print, which was both unreadable and in the wrong order under RTL. */
export function hebrewWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  return sameMonth
    ? `${weekStart.getDate()}–${end.getDate()} ב${HE_MONTH[end.getMonth()]}`
    : `${weekStart.getDate()} ב${HE_MONTH[weekStart.getMonth()]} – ${end.getDate()} ב${HE_MONTH[end.getMonth()]}`
}
