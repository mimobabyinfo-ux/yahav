// Phase 4 / C2: the 8 preset community tags. Mom picks any subset on
// her profile; CommunityPage filters by a single tag at a time. IDs are
// stored as text in user_profiles.community_tags[]; keep these in sync
// with migration 20260604000000_community_tags.sql.
//
// Single-select filter in v1 — multi-select is deferred until we have
// real usage data on which tag combinations matter.

export type CommunityTagId =
  | 'coffee'
  | 'park'
  | 'workout'
  | 'emotional_support'
  | 'playdate'
  | 'walks'
  | 'advice'
  | 'shabbat_meals'

export type CommunityTagDef = {
  id: CommunityTagId
  label: string
  emoji: string
}

export const COMMUNITY_TAGS: CommunityTagDef[] = [
  { id: 'coffee',            label: 'קפה',           emoji: '☕'     },
  { id: 'park',              label: 'פארק',          emoji: '🌳'     },
  { id: 'workout',           label: 'אימון',         emoji: '🏃‍♀️' },
  { id: 'emotional_support', label: 'תמיכה רגשית',  emoji: '💙'     },
  { id: 'playdate',          label: 'פגישת משחק',   emoji: '🧸'     },
  { id: 'walks',             label: 'הליכות',        emoji: '🚶‍♀️' },
  { id: 'advice',            label: 'התייעצות',      emoji: '💬'     },
  { id: 'shabbat_meals',     label: 'ארוחות שבת',   emoji: '🍷'     },
]

export function tagDef(id: string | null | undefined): CommunityTagDef | null {
  if (!id) return null
  return COMMUNITY_TAGS.find(t => t.id === id) ?? null
}
