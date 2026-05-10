// Buying-list subcategories. Used by PregnancyDashboard's buying tab to
// render collapsible groups. The `id` values match the SQL CHECK constraint
// on pregnancy_checklist_items.subcategory and user_pregnancy_items.subcategory
// (see migration 20260520120000_pregnancy_buying_subcategory.sql).
//
// 'other' is also the fallback bucket for rows with NULL subcategory.
export type BuyingSubcategoryId =
  | 'furniture' | 'safety' | 'feeding' | 'hygiene' | 'clothing' | 'accessories' | 'other'

export const BUYING_SUBCATEGORIES: { id: BuyingSubcategoryId; emoji: string; label: string }[] = [
  { id: 'furniture',   emoji: '🛏️', label: 'ריהוט' },
  { id: 'safety',      emoji: '🛡️', label: 'בטיחות' },
  { id: 'feeding',     emoji: '🍼', label: 'האכלה' },
  { id: 'hygiene',     emoji: '🧼', label: 'היגיינה' },
  { id: 'clothing',    emoji: '👕', label: 'ביגוד' },
  { id: 'accessories', emoji: '🧸', label: 'אבזרים' },
  { id: 'other',       emoji: '📋', label: 'שונות' },
]
