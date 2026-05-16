// Canonical list of suggested milestone chips. Used by MilestonePage and
// (legacy) LogEntryModal. Future admin / analytics surfaces should reference
// this constant rather than duplicate the array.
//
// Not stored in the DB — these are UI suggestions only. Mom is free to
// type a custom milestone via the "custom" textarea on MilestonePage; the
// chosen / typed text lands in daily_log_entries.notes.

export const MILESTONE_CHIPS: readonly string[] = [
  'חיוך ראשון 😊',
  'שינה כל הלילה 🌙',
  'הפיכה מבטן לגב',
  'הפיכה מגב לבטן',
  'ישיבה עצמאית',
  'זחילה ראשונה',
  'עמידה ראשונה',
  'צעד ראשון 👣',
  'מילה ראשונה 🗣️',
  'שן ראשונה 🦷',
  'אוכל מוצקים 🥣',
  'פה פה / ביי ביי 👋',
  'מחיאות כפיים 👏',
  'חיבוק ראשון 🤗',
]
