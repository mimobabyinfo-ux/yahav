import { tx } from '../i18n'
// Canonical list of suggested milestone chips. Used by MilestonePage and
// (legacy) LogEntryModal. Future admin / analytics surfaces should reference
// this constant rather than duplicate the array.
//
// Not stored in the DB — these are UI suggestions only. Mom is free to
// type a custom milestone via the "custom" textarea on MilestonePage; the
// chosen / typed text lands in daily_log_entries.notes.

export const MILESTONE_CHIPS: readonly string[] = [
  tx('חיוך ראשון 😊'),
  tx('שינה כל הלילה 🌙'),
  tx('הפיכה מבטן לגב'),
  tx('הפיכה מגב לבטן'),
  tx('ישיבה עצמאית'),
  tx('זחילה ראשונה'),
  tx('עמידה ראשונה'),
  tx('צעד ראשון 👣'),
  tx('מילה ראשונה 🗣️'),
  tx('שן ראשונה 🦷'),
  tx('אוכל מוצקים 🥣'),
  tx('פה פה / ביי ביי 👋🏼'),
  tx('מחיאות כפיים 👏🏼'),
  tx('חיבוק ראשון 🤗'),
]
