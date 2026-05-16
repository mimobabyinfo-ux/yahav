// Pregnancy-week math, extracted from PregnancyDashboard so both the
// pregnancy guide AND the daily-tip targeting can share one source of
// truth.
//
// pregnancyWeek(dueDate)
//   Returns 1..42 — clamped. Computes by subtracting days-remaining
//   from the canonical 280-day gestation length and floor-dividing by
//   7. The exact value at the start of week N is shown as N (e.g. day
//   281 - 7 = 274 days-since-conception → week ((280 - daysLeft)/7) = 1).
//
// daysUntilDue(dueDate)
//   Non-negative days-to-go. 0 if the due date has passed.

export function pregnancyWeek(dueDate: string): number {
  const daysLeft = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000)
  return Math.max(1, Math.min(42, Math.floor((280 - daysLeft) / 7)))
}

export function daysUntilDue(dueDate: string): number {
  return Math.max(0, Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000))
}
