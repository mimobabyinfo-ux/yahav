import { tx } from '../i18n'
// Buying-list subcategories. Used by PregnancyDashboard's buying tab to
// render collapsible groups. The `id` values match the SQL CHECK constraint
// on pregnancy_checklist_items.subcategory and user_pregnancy_items.subcategory
// (see migration 20260520120000_pregnancy_buying_subcategory.sql).
//
// 'other' is also the fallback bucket for rows with NULL subcategory.
export type BuyingSubcategoryId =
  | 'furniture' | 'safety' | 'feeding' | 'hygiene' | 'clothing' | 'accessories' | 'other'

export const BUYING_SUBCATEGORIES: { id: BuyingSubcategoryId; emoji: string; label: string }[] = [
  { id: 'furniture',   emoji: '🛏️', label: tx('ריהוט') },
  { id: 'safety',      emoji: '🛡️', label: tx('בטיחות') },
  { id: 'feeding',     emoji: '🍼', label: tx('האכלה') },
  { id: 'hygiene',     emoji: '🧼', label: tx('היגיינה') },
  { id: 'clothing',    emoji: '👕', label: tx('ביגוד') },
  { id: 'accessories', emoji: '🧸', label: tx('אבזרים') },
  { id: 'other',       emoji: '📋', label: tx('שונות') },
]
