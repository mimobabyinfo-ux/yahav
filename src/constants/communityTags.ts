// The community preference tags. Mom picks any subset at signup and on
// her profile; the members directory filters on them (multi-select, AND).
// IDs are stored as text in user_profiles.community_tags[] — there is no
// DB constraint on the values, so this file is the only source of truth.
//
// Brenda 17.8.26 settled both the purpose and the list. The purpose is
// SOCIAL FILTERING and nothing else: this is how one mother finds another
// mother to actually meet. It is not an input to the event calendar and
// not a CRM tag — what mothers want Mimo to RUN comes from the WhatsApp
// survey, and mixing the two makes both worse.
//
// Her list, and what changed from the first eight:
//  · פארק and הליכות were the same outing — merged into 'park'.
//  · תמיכה רגשית and התייעצות were the same ask — merged into the warmer
//    'אוזן קשבת', keeping the emotional_support id so stored data holds.
//  · ארוחות שבת dropped: no demand in the survey, and it quietly excludes.
//  · 'יציאה בערב, בלי תינוקות' added — the one social need with real
//    signal that nothing on the old list covered.
// The retired ids ('walks', 'advice', 'shabbat_meals') simply stop
// resolving in tagDef and vanish from the UI; nothing breaks if one is
// still stored on an old profile.

export type CommunityTagId =
  | 'coffee'
  | 'park'
  | 'workout'
  | 'playdate'
  | 'emotional_support'
  | 'night_out'

export type CommunityTagDef = {
  id: CommunityTagId
  label: string
  /** Filter chips sit on one scrolling line, so a long label gets a short
   *  form there while the profile form keeps the full wording. */
  shortLabel?: string
  emoji: string
}

export const COMMUNITY_TAGS: CommunityTagDef[] = [
  { id: 'coffee',            label: 'קפה ביחד',    emoji: '☕'     },
  { id: 'park',              label: 'הליכה בפארק', emoji: '🌳'     },
  { id: 'workout',           label: 'אימון',       emoji: '🏃‍♀️' },
  { id: 'playdate',          label: 'פליי דייט',   emoji: '🧸'     },
  { id: 'emotional_support', label: 'אוזן קשבת',   emoji: '💙'     },
  { id: 'night_out',         label: 'יציאה בערב, בלי תינוקות', shortLabel: 'יציאה בערב', emoji: '🌙' },
]

export function tagDef(id: string | null | undefined): CommunityTagDef | null {
  if (!id) return null
  return COMMUNITY_TAGS.find(t => t.id === id) ?? null
}
