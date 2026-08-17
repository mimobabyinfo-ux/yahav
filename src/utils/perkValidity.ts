import type { PartnerPerk } from '../lib/supabase'

// Brenda 17.8.26: "in the membership card, add an expiry to a perk — if
// the cafe gives 15% only for the first month after joining the
// community, I want to control that, counted from her signup date."
//
// Two limits live on the perk, either or both, NULL meaning no limit:
//   valid_days_from_join — per mother, from her user_profiles.created_at
//   valid_until          — one fixed end date for everyone
// A perk is live while BOTH hold. One shared helper because three
// surfaces show perks (membership card, benefits page, home strip) and
// they must never disagree about what she can still claim at a counter.

const DAY_MS = 24 * 60 * 60 * 1000

/** Local (Israel) calendar day for a date, as YYYY-MM-DD. */
function isoDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export type PerkValidity = {
  /** Can she still claim it right now? */
  active: boolean
  /** Last valid calendar day, or null when the perk never expires. */
  lastDay: string | null
  /** Whole days left, counting today as one. null when there is no limit. */
  daysLeft: number | null
}

export function perkValidity(perk: PartnerPerk, joinedAt: string | null | undefined): PerkValidity {
  const limits: string[] = []

  if (perk.valid_days_from_join != null && joinedAt) {
    // The join day itself counts as day 1, so a 30-day perk taken out on
    // the 1st is still good on the 30th.
    const end = new Date(new Date(joinedAt).getTime() + (perk.valid_days_from_join - 1) * DAY_MS)
    limits.push(isoDay(end))
  }
  if (perk.valid_until) limits.push(perk.valid_until)

  if (limits.length === 0) return { active: true, lastDay: null, daysLeft: null }

  const lastDay = limits.sort()[0] // the earliest limit wins
  const today = isoDay(new Date())
  const daysLeft = Math.round(
    (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS,
  ) + 1

  return { active: today <= lastDay, lastDay, daysLeft }
}

/** Short Hebrew chip: urgency while it is closing, a plain date otherwise. */
export function perkValidityLabel(v: PerkValidity): string | null {
  if (v.lastDay == null) return null
  if (!v.active) return 'ההטבה הסתיימה'
  if (v.daysLeft != null && v.daysLeft <= 1) return 'היום האחרון!'
  if (v.daysLeft != null && v.daysLeft <= 7) return `עוד ${v.daysLeft} ימים`
  const [y, m, d] = v.lastDay.split('-')
  return `בתוקף עד ${Number(d)}.${Number(m)}.${y.slice(2)}`
}

/** Keep only the perks this mother can still claim. */
export function activePerks<T extends PartnerPerk>(perks: T[], joinedAt: string | null | undefined): T[] {
  return perks.filter(p => perkValidity(p, joinedAt).active)
}
