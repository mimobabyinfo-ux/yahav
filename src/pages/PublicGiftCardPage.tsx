import { useEffect, useMemo, useState } from 'react'
import { Gift, CalendarDays, MessageCircle } from 'lucide-react'
import { supabase, type PublicCohort } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { rememberPublicGiftIntent } from '../components/giftcard/giftCard'

// ?giftcard[=<workshop id>] — buying a gift card WITHOUT an account.
//
// Yahav 5.9.26: "מי שתקנה גיפט קארד בדרך כלל לא תהיה מישהי שצריכה
// להירשם לאפליקציה." A friend or a grandmother buying a present has no
// reason to create a Mimo account, sit through onboarding, and be asked
// for a due date. So this page asks for the three things a receipt needs
// (name, email, phone), the product, and — optionally — the friend, and
// sends her to Morning. The in-app גיפט קארד button is untouched: a
// signed-in mother still buys from the store as before.
//
// Same rules as the in-app flow (see giftCard.ts): a gift card is not a
// registration, no seat is held, nothing is emailed before the money is
// confirmed. The card is created pending, its claim token is kept in
// localStorage, and the thank-you page turns it into a paid one — and
// mails the friend if she was named here.

type GiftableProduct = {
  id: string
  title: string
  description: string | null
  summary: string | null
  price: number | null
  image_url: string | null
  has_payment_link: boolean
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, '')
}
function cohortLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}${c.label ? ` · ${c.label}` : ''}`
}

const inputCls = 'w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400'
const labelCls = 'block text-xs font-semibold text-sand-600 mb-1.5'

export default function PublicGiftCardPage() {
  const preselect = new URLSearchParams(window.location.search).get('giftcard') || ''
  const { ownerName, ownerWhatsapp } = useOwnerSettings()

  const [products, setProducts] = useState<GiftableProduct[]>([])
  const [cohorts, setCohorts] = useState<PublicCohort[]>([])
  const [loading, setLoading] = useState(true)

  const [productId, setProductId] = useState('')
  const [cohortId, setCohortId] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [nameFriend, setNameFriend] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.rpc('get_giftable_products').then(({ data }) => {
      // numeric comes back as a string ("800.00") through PostgREST.
      const list = ((data ?? []) as GiftableProduct[]).map(p => ({ ...p, price: p.price == null ? null : Number(p.price) }))
      setProducts(list)
      setLoading(false)
      // A ?giftcard=<id> link lands on that product; otherwise the first.
      const first = list.find(p => p.id === preselect) ?? list[0]
      if (first) setProductId(first.id)
      const ids = list.map(p => p.id)
      if (ids.length === 0) return
      supabase.rpc('get_public_cohorts', { p_workshop_ids: ids }).then(({ data: cs }) => {
        setCohorts((cs ?? []) as PublicCohort[])
      })
    })
  }, [preselect])

  const product = useMemo(() => products.find(p => p.id === productId) ?? null, [products, productId])
  const productCohorts = useMemo(() => cohorts.filter(c => c.workshop_id === productId), [cohorts, productId])

  // Switching product drops the cohort: it belongs to the other one.
  useEffect(() => { setCohortId('') }, [productId])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!buyerName.trim()) e.buyerName = 'איך קוראים לך?'
    if (!isValidEmail(buyerEmail)) e.buyerEmail = 'צריך מייל תקין, לשם נשלח את האישור'
    const p = normalizePhone(buyerPhone)
    if (!p) e.buyerPhone = 'מספר טלפון נדרש'
    else if (!/^05\d{8}$/.test(p)) e.buyerPhone = 'מספר טלפון ישראלי לא תקין (05X-XXXXXXX)'
    if (!product) e.product = 'צריך לבחור מוצר'
    else if (!product.has_payment_link) e.product = `למוצר הזה אין כרגע קישור תשלום. אפשר לכתוב ל${ownerName} בוואטסאפ`
    if (nameFriend && recipientEmail.trim() && !isValidEmail(recipientEmail)) e.recipientEmail = 'המייל של החברה לא נראה תקין'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate() || !product) return
    setSubmitting(true)
    const { data, error } = await supabase.rpc('create_public_gift_card', {
      p_workshop_id: product.id,
      p_cohort_id: cohortId || null,
      p_buyer_name: buyerName.trim(),
      p_buyer_email: buyerEmail.trim(),
      p_buyer_phone: normalizePhone(buyerPhone),
      p_recipient_name: nameFriend ? recipientName : null,
      p_recipient_email: nameFriend ? recipientEmail : null,
      p_message: nameFriend ? message : null,
    })
    const created = data as { id: string; claim_token: string; payment_link: string | null } | null
    if (error || !created?.claim_token || !created.payment_link) {
      setSubmitting(false)
      setErrors({ submit: 'משהו השתבש. נסי שוב, ואם זה חוזר אפשר לכתוב בוואטסאפ' })
      return
    }
    rememberPublicGiftIntent(created.claim_token)
    // Same tab on purpose: Morning's success URL (?thanks) brings her
    // straight back here, where the token in localStorage is waiting.
    window.location.href = created.payment_link
  }

  const waHref = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! אני רוצה לקנות גיפט קארד למימו ויש לי שאלה`)}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F4EC' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="min-h-screen px-4 py-8 flex items-center justify-center" dir="rtl" style={{ background: '#F8F4EC' }}>
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6"><MimoLogo size={120} /></div>
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center space-y-3">
            <p className="text-3xl">🎁</p>
            <h2 className="text-lg font-bold text-sand-800">אין כרגע גיפט קארד לרכישה</h2>
            <p className="text-sm text-sand-600 leading-relaxed">אפשר לכתוב ל{ownerName} ונמצא יחד את המתנה המתאימה.</p>
            <a href={waHref} className="block mt-2 py-3 rounded-2xl text-sm font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
              לכתוב בוואטסאפ
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8" dir="rtl" style={{ background: '#F8F4EC' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <h1 className="text-xl font-bold text-sand-800 flex items-center justify-center gap-2">
            <Gift className="w-5 h-5" style={{ color: '#B98F4E' }} /> גיפט קארד ממימו
          </h1>
          <p className="text-sand-500 text-sm mt-1 leading-relaxed">
            מתנה לאמא שאוהבים: סדנה או ליווי. היא מקבלת מייל עם המתנה ומתאמת את המועד ישירות עם {ownerName}.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-3xl shadow-sm p-6 space-y-5">
          {/* The gift */}
          <div>
            <label className={labelCls}>מה לתת במתנה?</label>
            <div className="space-y-2">
              {products.map(p => {
                const chosen = p.id === productId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductId(p.id)}
                    className="w-full text-right rounded-2xl p-3 flex items-center gap-3 transition-all"
                    style={{ background: chosen ? '#F6ECD8' : '#FAF7F1', border: `2px solid ${chosen ? '#E7C78A' : '#EFE8DA'}` }}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: '#FFFFFF' }}>🎁</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-sand-800">{p.title}</p>
                      {(p.summary || p.description) && (
                        <p className="text-xs text-sand-500 mt-0.5 line-clamp-2">{p.summary || p.description}</p>
                      )}
                    </div>
                    {p.price != null && <span className="font-bold text-sm whitespace-nowrap" style={{ color: '#8A6A2F' }}>₪{p.price}</span>}
                  </button>
                )
              })}
            </div>
            {errors.product && <p className="text-xs text-red-500 mt-1.5">{errors.product}</p>}
          </div>

          {/* Optional cohort — a wish, not a reservation */}
          {productCohorts.length > 0 && (
            <div>
              <label className={labelCls}>
                <CalendarDays className="w-3.5 h-3.5 inline ml-1" />
                יש מחזור שמתאים לה? (לא חובה)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {productCohorts.slice(0, 6).map(c => {
                  const chosen = c.id === cohortId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCohortId(chosen ? '' : c.id)}
                      className="rounded-xl px-3 py-2 text-xs font-semibold text-right transition-all"
                      style={{ background: chosen ? '#F6ECD8' : '#FAF7F1', border: `2px solid ${chosen ? '#E7C78A' : '#EFE8DA'}`, color: '#5E4938' }}
                    >
                      {cohortLabel(c)}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-sand-500 mt-1.5">המקום לא נשמר עדיין. המועד הסופי נקבע עם {ownerName} כשהיא מממשת.</p>
            </div>
          )}

          {/* The buyer */}
          <div className="space-y-3 pt-1">
            <p className="text-sm font-bold text-sand-800">הפרטים שלך</p>
            <div>
              <label className={labelCls}>שם מלא</label>
              <input value={buyerName} onChange={e => setBuyerName(e.target.value)} autoComplete="name" className={inputCls} />
              {errors.buyerName && <p className="text-xs text-red-500 mt-1">{errors.buyerName}</p>}
            </div>
            <div>
              <label className={labelCls}>אימייל</label>
              <input type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} dir="ltr" autoComplete="email" className={inputCls} />
              {errors.buyerEmail && <p className="text-xs text-red-500 mt-1">{errors.buyerEmail}</p>}
            </div>
            <div>
              <label className={labelCls}>מספר טלפון</label>
              <input type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} dir="ltr" placeholder="050-1234567" autoComplete="tel" className={inputCls} />
              {errors.buyerPhone && <p className="text-xs text-red-500 mt-1">{errors.buyerPhone}</p>}
            </div>
          </div>

          {/* The friend — optional now, always possible after payment */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#FAF6EF', border: '1px solid #EFE4D3' }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={nameFriend} onChange={e => setNameFriend(e.target.checked)} className="w-4 h-4 accent-mustard-500" />
              <span className="text-sm font-bold" style={{ color: '#8A6A2F' }}>לשלוח לה את המתנה במייל מיד אחרי התשלום</span>
            </label>
            {nameFriend ? (
              <>
                <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="השם שלה (לא חובה)" className={inputCls} />
                <div>
                  <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="המייל שלה" dir="ltr" className={`${inputCls} text-right`} />
                  {errors.recipientEmail && <p className="text-xs text-red-500 mt-1">{errors.recipientEmail}</p>}
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="ברכה אישית (לא חובה)" rows={2} className={`${inputCls} resize-none`} />
                <p className="text-[11px]" style={{ color: '#8A7A63' }}>בלי מייל שלה, המתנה תחכה לך ותוכלי לשלוח אותה מיד אחרי התשלום.</p>
              </>
            ) : (
              <p className="text-[11px]" style={{ color: '#8A7A63' }}>אפשר גם למלא את הפרטים שלה אחרי התשלום.</p>
            )}
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{errors.submit}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: '#C8A460', color: '#33281B' }}
          >
            {submitting ? 'רגע...' : product?.price != null ? `לתשלום · ₪${product.price}` : 'המשך לתשלום'}
          </button>
        </form>

        <p className="text-center text-[13px] text-sand-600 mt-4">אחרי התשלום תחזרי לכאן לאישור ולשליחת המתנה</p>

        <a href={waHref} target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: '#5E7A3A' }}>
          <MessageCircle className="w-4 h-4" /> יש שאלה? לכתוב ל{ownerName} בוואטסאפ
        </a>
      </div>
    </div>
  )
}
