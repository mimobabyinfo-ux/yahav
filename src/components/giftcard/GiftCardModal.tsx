import { useMemo, useState } from 'react'
import { X, Gift, CalendarDays, CreditCard, MessageCircle } from 'lucide-react'
import { supabase, type Workshop, type PublicCohort } from '../../lib/supabase'
import { rememberGiftIntent, type GiftCard } from './giftCard'

// Brenda 19.8.26: "להוסיף במוצרים גיפט קארד — אם אופציה לבחירה של סדנת
// עטופים מגלים או פרטני, לרכוש בהתאם לבחירה ובהתאם למחזור שנבחר".
//
// Which products can be gifted is data, not code: workshops.gift_card_enabled,
// a checkbox on the product form. The three she named are on by default.
//
// The cohort is OPTIONAL and is only ever a wish. Nothing is reserved —
// see the note at the top of giftCard.ts.

function cohortLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}${c.label ? ` · ${c.label}` : ''}`
}

export default function GiftCardModal({
  products,
  cohortsByWorkshop,
  ownerWhatsapp,
  onClose,
}: {
  products: Workshop[]
  cohortsByWorkshop: Map<string, PublicCohort[]>
  ownerWhatsapp: string
  onClose: () => void
}) {
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '')
  const [cohortId, setCohortId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const product = useMemo(() => products.find(p => p.id === productId) ?? null, [products, productId])
  const cohorts = product ? (cohortsByWorkshop.get(product.id) ?? []) : []

  async function buy() {
    if (!product) return
    if (!product.payment_link) { setError('אין קישור תשלום למוצר הזה. אפשר לכתוב לברנדה בוואטסאפ'); return }
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('create_gift_card', {
      p_workshop_id: product.id,
      p_cohort_id: cohortId || null,
    })
    if (err || !data) { setBusy(false); setError('משהו השתבש. נסי שוב'); return }
    const card = data as GiftCard
    rememberGiftIntent(card.id)
    // Same tab on purpose: the id already exists, so there is nothing to
    // race, and Morning's success URL brings her straight back to the
    // thank-you page where she names the friend.
    window.location.href = product.payment_link
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[88vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="relative px-6 pt-7 pb-5 rounded-t-3xl text-center" style={{ background: '#F4EDE1' }}>
          <button onClick={onClose} className="absolute top-4 left-4 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow">
            <X className="w-5 h-5 text-sand-700" />
          </button>
          <div className="text-4xl">🎁</div>
          <h2 className="font-bold text-xl mt-2" style={{ color: '#443327' }}>גיפט קארד</h2>
          <p className="text-xs mt-1" style={{ color: '#7B604C' }}>
            מתנה לחברה. היא תקבל מייל ותתאם את המועד שמתאים לה
          </p>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 p-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-sand-700 mb-2 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5" /> אנא בחרי מוצר
            </p>
            <div className="space-y-2">
              {products.map(p => {
                const chosen = p.id === productId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProductId(p.id); setCohortId('') }}
                    className={`w-full text-right p-3 rounded-2xl border-2 transition-all flex items-center gap-2.5 ${
                      chosen ? 'border-mustard-500 bg-white shadow-sm' : 'border-sand-200 bg-white hover:border-mustard-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${chosen ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                      {chosen && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-sand-800 truncate">{p.title}</span>
                    {p.price != null && (
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: '#B98F4E' }}>₪{p.price}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {cohorts.length > 0 && (
            <div>
              <p className="text-xs font-bold text-sand-700 mb-2 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> מחזור מועדף <span className="font-normal text-sand-500">(לא חובה)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {cohorts.slice(0, 4).map(c => {
                  const chosen = cohortId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCohortId(chosen ? '' : c.id)}
                      className={`text-right p-2.5 rounded-xl border-2 text-[13px] font-bold transition-all ${
                        chosen ? 'border-mustard-500 bg-white shadow-sm text-sand-800' : 'border-sand-200 bg-white text-sand-600 hover:border-mustard-300'
                      }`}
                    >
                      {cohortLabel(c)}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#8A7A63' }}>
                המחזור נשמר כהעדפה בלבד ולא תופס מקום. החברה תתאם את המועד המדויק מול ברנדה.
              </p>
            </div>
          )}

          <div className="rounded-2xl p-3.5 text-xs leading-relaxed" style={{ background: '#FAF6EF', border: '1px solid #EFE4D3', color: '#6E5836' }}>
            אחרי התשלום נבקש את השם והמייל של החברה, והמתנה תישלח אליה ישירות ממימו.
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 p-4 pt-3 border-t border-[#F0EAE0] flex-shrink-0">
          <a
            href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי! אני רוצה לקנות גיפט קארד ל${product?.title ?? 'סדנה'} 🎁`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: '#818267' }}
          >
            <MessageCircle className="w-4 h-4" />
          </a>
          <button
            onClick={buy}
            disabled={busy || !product}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-40"
            style={{ background: '#E7C78A' }}
          >
            <CreditCard className="w-4 h-4" />
            {busy ? 'רגע...' : `לרכישה${product?.price != null ? ` · ₪${product.price}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
