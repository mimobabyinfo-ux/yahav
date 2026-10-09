import { tx } from '../i18n'
// Static reminder templates surfaced inside the pregnancy dashboard.
// Tapping a template just pre-fills the regular CustomRemindersPanel form;
// the saved row goes into user_reminders like any other reminder. No special
// schema, no template-tracking table. Easy to edit here without migrations.
export type PregnancyReminderTemplate = {
  id: string                      // stable key, used internally for dedup
  label: string                   // exact text saved to user_reminders.label
  description: string             // shown on the card for context
  emoji: string
  weekFrom: number
  weekTo: number
  weekToShown?: number             // override "show until" — e.g. 13 for folic acid
  recommendedTime?: string         // "HH:MM" for daily reminders; undefined for one-time
}

export const PREGNANCY_REMINDER_TEMPLATES: PregnancyReminderTemplate[] = [
  { id: 'folic_acid',    label: tx('חומצה פולית'), description: tx('יומית להתפתחות הצינור העצבי'),
    emoji: '💊', weekFrom: 1, weekTo: 12, weekToShown: 13, recommendedTime: '08:00' },
  { id: 'nuchal',        label: tx('בדיקת שקיפות עורפית'), description: tx('בדיקת סקר למומי כרומוזומליים'),
    emoji: '🩺', weekFrom: 11, weekTo: 13 },
  { id: 'genetic',       label: tx('בדיקה גנטית (NIPT/CVS)'), description: tx('בדיקת DNA לא פולשנית או סיסי שליה'),
    emoji: '🧬', weekFrom: 10, weekTo: 13 },
  { id: 'early_scan',    label: tx('סקירה מוקדמת'), description: tx('בדיקת מבנה מוקדמת'),
    emoji: '📝', weekFrom: 14, weekTo: 16 },
  { id: 'detailed_scan', label: tx('סקירה מורחבת'), description: tx('בדיקת מבנה מקיפה של כל האיברים'),
    emoji: '🔍', weekFrom: 19, weekTo: 23 },
  { id: 'gtt',           label: tx('בדיקת סוכר הריון (GTT)'), description: tx('איתור סוכרת הריונית'),
    emoji: '🩸', weekFrom: 24, weekTo: 28 },
  { id: 'gbs',           label: tx('תרבית GBS'), description: tx('תרבית סטרפטוקוקוס מקבוצה B'),
    emoji: '🧪', weekFrom: 35, weekTo: 37 },
  { id: 'bag',           label: tx('אריזת תיק לידה'), description: tx('להכין תיק לבית החולים'),
    emoji: '🎒', weekFrom: 35, weekTo: 39 },
]
