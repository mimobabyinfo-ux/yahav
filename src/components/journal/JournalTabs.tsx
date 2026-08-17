// The journal's view identifiers.
//
// The tab strip itself is gone — every view wears JournalHeader instead,
// and the switcher lives in JournalViewSheet, one tap behind the date.
// Brenda 17.8.26 then folded רשימה into שבוע, so three remain. The type
// stays here because most of the journal imports it from this path.
//
// 'list' is kept in the union only so a value persisted by an older build
// can be recognised and mapped to 'week' rather than rendering nothing.

export type JournalTab = 'day' | 'week' | 'summary'
export type LegacyJournalTab = JournalTab | 'list'

export function normalizeTab(tab: LegacyJournalTab): JournalTab {
  return tab === 'list' ? 'week' : tab
}
