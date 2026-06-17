import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Check, X } from 'lucide-react'
import { supabase, type WorkshopOffer } from '../../lib/supabase'
import ConfirmDialog from './ConfirmDialog'

// Task B: per-workshop "special offer" admin panel. Rendered inside
// the product editor (AdminLargeModal) so admin can manage offers
// without leaving the product edit context.
//
// Behavior:
//   - Lists existing offers with status pill + uses chip + delete +
//     copy-link.
//   - "הצעה חדשה" reveals an inline create form. On save → inserts
//     into workshop_offers, returns the row, and the new link
//     (?offer=<token>) appears with a copy button.
//   - Validation: if discount_value > 0, payment_link is REQUIRED.
//     The whole point of an offer is to charge a different amount,
//     and the only way to "charge differently" in this app is to
//     redirect to a different external link (the brief explicitly
//     says payment is handled externally via payment_link). Without
//     an override link the customer would be charged full price —
//     surface this as a blocking error in the editor.
//
// Public/private separation: offers are never returned by the
// workshops query that the public form / store use. They surface
// only via the ?offer=<token> RPC path.

type Props = {
  workshopId: string
  /** Used in the previewed offer link rendered after creation. */
  origin?: string
}

type Draft = {
  label: string
  discount_type: 'fixed' | 'percent'
  discount_value: string
  payment_link: string
  max_uses: string
  expires_at: string
}

const EMPTY_DRAFT: Draft = {
  label: '',
  discount_type: 'percent',
  discount_value: '',
  payment_link: '',
  max_uses: '',
  expires_at: '',
}

function offerStatus(o: WorkshopOffer): { label: string; tone: 'green' | 'gray' | 'amber' | 'red' } {
  if (!o.is_active) return { label: 'כבוי', tone: 'gray' }
  if (o.expires_at && new Date(o.expires_at) <= new Date()) return { label: 'פג תוקף', tone: 'amber' }
  if (o.max_uses != null && o.uses_count >= o.max_uses) return { label: 'נוצל במלואו', tone: 'amber' }
  return { label: 'פעיל', tone: 'green' }
}

const TONE_CLASSES: Record<'green' | 'gray' | 'amber' | 'red', string> = {
  green: 'bg-green-50 text-green-700',
  gray:  'bg-sand-100 text-sand-500',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-600',
}

export default function WorkshopOffersPanel({ workshopId, origin = window.location.origin }: Props) {
  const [offers, setOffers] = useState<WorkshopOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<WorkshopOffer | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('workshop_offers')
      .select('*')
      .eq('workshop_id', workshopId)
      .order('created_at', { ascending: false })
    setOffers((data ?? []) as WorkshopOffer[])
    setLoading(false)
  }, [workshopId])

  useEffect(() => { load() }, [load])

  function offerLink(token: string) {
    return `${origin}?offer=${token}`
  }

  function copyOfferLink(token: string) {
    navigator.clipboard.writeText(offerLink(token)).then(() => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(prev => (prev === token ? null : prev)), 1500)
    })
  }

  async function save() {
    setFormError(null)
    const label = draft.label.trim()
    const value = parseFloat(draft.discount_value)
    if (!label) { setFormError('יש למלא תווית פנימית להצעה'); return }
    if (Number.isNaN(value) || value < 0) { setFormError('ערך ההנחה חייב להיות מספר חיובי'); return }
    if (draft.discount_type === 'percent' && value > 100) {
      setFormError('אחוז ההנחה לא יכול לעבור 100%'); return
    }
    const link = draft.payment_link.trim()
    if (value > 0 && !link) {
      setFormError('כאשר יש הנחה (>0) חובה להזין לינק תשלום עם המחיר המוזל — אחרת הלקוחה תחויב במחיר המלא')
      return
    }
    const maxUses = draft.max_uses.trim() ? parseInt(draft.max_uses, 10) : null
    if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 1)) {
      setFormError('כמות שימושים מקסימלית חייבת להיות מספר שלם חיובי או ריקה'); return
    }
    const expiresAt = draft.expires_at ? new Date(draft.expires_at).toISOString() : null

    setSaving(true)
    const { data, error } = await supabase
      .from('workshop_offers')
      .insert({
        workshop_id: workshopId,
        label,
        discount_type: draft.discount_type,
        discount_value: value,
        payment_link: link || null,
        max_uses: maxUses,
        expires_at: expiresAt,
        is_active: true,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) {
      setFormError('שגיאה ביצירת ההצעה — נסי שוב')
      return
    }
    setOffers(prev => [data as WorkshopOffer, ...prev])
    setDraft(EMPTY_DRAFT)
    setShowForm(false)
    // Auto-copy the freshly created link — admin's next action is
    // almost always to send it to a customer.
    copyOfferLink((data as WorkshopOffer).token)
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('workshop_offers').delete().eq('id', pendingDelete.id)
    setOffers(prev => prev.filter(o => o.id !== pendingDelete.id))
    setDeletingBusy(false)
    setPendingDelete(null)
  }

  async function toggleActive(offer: WorkshopOffer) {
    const next = !offer.is_active
    await supabase.from('workshop_offers').update({ is_active: next }).eq('id', offer.id)
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, is_active: next } : o))
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-sand-800">💝 הצעות מיוחדות / לינקים ייעודיים</p>
          <p className="text-[11px] text-sand-500 mt-0.5 leading-relaxed">
            לינק מיוחד שמראה מחיר מוזל. לא מופיע בעמוד ההרשמה הרגיל — נשלח רק למי שרוצים לתת לה את ההנחה.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setDraft(EMPTY_DRAFT); setFormError(null) }}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-mustard-500 text-white text-xs font-bold hover:bg-mustard-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            הצעה חדשה
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white border-2 border-mustard-200 rounded-2xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-sand-700">יצירת הצעה חדשה</p>
            <button
              type="button"
              onClick={() => { setShowForm(false); setDraft(EMPTY_DRAFT); setFormError(null) }}
              className="text-sand-400 hover:text-sand-700"
              aria-label="סגירה"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-sand-500 mb-1 block">תווית פנימית (לא נראית ללקוחה)</label>
            <input
              value={draft.label}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              placeholder="לדוגמה: הנחה ל-5 הראשונות"
              className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-sand-500 mb-1 block">סוג הנחה</label>
              <select
                value={draft.discount_type}
                onChange={e => setDraft(d => ({ ...d, discount_type: e.target.value as 'fixed' | 'percent' }))}
                className="w-full px-2 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500 bg-white"
              >
                <option value="percent">אחוז הנחה (%)</option>
                <option value="fixed">מחיר מיוחד (₪)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-sand-500 mb-1 block">
                {draft.discount_type === 'percent' ? 'אחוז' : 'מחיר מיוחד'}
              </label>
              <input
                type="number"
                value={draft.discount_value}
                onChange={e => setDraft(d => ({ ...d, discount_value: e.target.value }))}
                placeholder={draft.discount_type === 'percent' ? '15' : '199'}
                className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-sand-500 mb-1 block">
              לינק תשלום עם המחיר המוזל
              <span className="text-red-500 mr-1">*</span>
            </label>
            <input
              value={draft.payment_link}
              onChange={e => setDraft(d => ({ ...d, payment_link: e.target.value }))}
              placeholder="https://..."
              dir="ltr"
              className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
            />
            <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
              ⚠️ זה הלינק שאליו תועבר הלקוחה אחרי שמילאה את הטופס. צריך להיות לינק תשלום עם המחיר המוזל מהספק (PayPlus / Cardcom וכו'). אם לא תספקי לינק נפרד, הלקוחה תחויב במחיר המלא.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-sand-500 mb-1 block">מספר שימושים מקסימלי (אופציונלי)</label>
              <input
                type="number"
                value={draft.max_uses}
                onChange={e => setDraft(d => ({ ...d, max_uses: e.target.value }))}
                placeholder="ללא הגבלה"
                className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-sand-500 mb-1 block">תאריך פקיעה (אופציונלי)</label>
              <input
                type="date"
                value={draft.expires_at}
                onChange={e => setDraft(d => ({ ...d, expires_at: e.target.value }))}
                dir="ltr"
                className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
              />
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 leading-relaxed">{formError}</div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-mustard-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-mustard-600 transition-colors"
          >
            {saving ? 'יוצרת...' : 'צרי הצעה'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-sand-400 text-center py-3">טוען...</p>
      ) : offers.length === 0 ? (
        <p className="text-xs text-sand-400 text-center py-3 leading-relaxed">
          {showForm ? '' : 'אין הצעות מיוחדות עדיין.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {offers.map(o => {
            const status = offerStatus(o)
            const usesLabel = o.max_uses != null ? `${o.uses_count}/${o.max_uses}` : `${o.uses_count} שימושים`
            return (
              <li key={o.id} className="bg-white border border-sand-200 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-sand-800 flex-1 min-w-0 truncate">{o.label}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${TONE_CLASSES[status.tone]}`}>{status.label}</span>
                  <span className="text-[10px] font-semibold text-sand-500 bg-sand-50 px-1.5 py-0.5 rounded-md">{usesLabel}</span>
                  <span className="text-[10px] text-sand-500">
                    {o.discount_type === 'percent' ? `-${o.discount_value}%` : `₪${o.discount_value}`}
                  </span>
                  {o.expires_at && (
                    <span className="text-[10px] text-sand-400">
                      עד {new Date(o.expires_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyOfferLink(o.token)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-mustard-50 text-mustard-700 hover:bg-mustard-100 text-[11px] font-semibold transition-colors"
                  >
                    {copiedToken === o.token ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedToken === o.token ? 'הלינק הועתק' : 'העתקת לינק'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(o)}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-sand-500 hover:bg-sand-100 transition-colors"
                  >
                    {o.is_active ? 'כיבוי' : 'הפעלה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(o)}
                    className="p-1.5 rounded-lg text-sand-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label="מחיקה"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.label ?? 'ההצעה'}
        title="מחיקת הצעה"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
