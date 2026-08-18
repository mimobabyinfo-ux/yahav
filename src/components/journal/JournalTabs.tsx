// The journal's view identifiers.
//
// The tab strip itself is gone — every view wears JournalHeader instead,
// and the switcher lives in JournalViewSheet, one tap behind the date.
// Brenda 17.8.26 then folded רשימה into שבוע, so three remain. The type
// stays at this path because most of the journal imports it from here.

export type JournalTab = 'day' | 'week' | 'summary'
