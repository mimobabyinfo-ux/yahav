import { useEffect, useState, useMemo } from 'react'
import { supabase, Workshop, type WorkshopOffer } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, '')
}

// Task B: compute the displayed special price from the offer + the
// regular workshop price. fixed = special price IS discount_value;
// percent = price * (1 - discount_value/100), rounded to whole ₪.
function computeOfferPrice(offer: WorkshopOffer, workshop: Workshop | null): number | null {
  if (offer.discount_type === 'fixed') return offer.discount_value
  if (offer.discount_type === 'percent' && workshop?.price != null) {
    return Math.round(workshop.price * (1 - offer.discount_value / 100))
  }
  return null
}

export default function PublicRegisterPage() {
  const params = new URLSearchParams(window.location.search)
  const preselect = params.get('register') || ''
  const offerToken = params.get('offer') || ''
  const source = params.get('source') || ''

  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [loading, setLoading] = useState(true)
  const [subtitle, setSubtitle] = useState('בית עוטף ומלטף')
  const [hero, setHero] = useState('ברוכה הבאה לסדנאות מימו')

  // Task B: offer mode. `offer` + `offerWorkshop` populated when the
  // ?offer=<token> link points to a still-claimable offer; otherwise
  // `offerUnavailable` is set and we render a friendly fallback. The
  // two states are mutually exclusive — never both at once.
  const [offer, setOffer] = useState<WorkshopOffer | null>(null)
  const [offerWorkshop, setOfferWorkshop] = useState<Workshop | null>(null)
  const [offerUnavailable, setOfferUnavailable] = useState<{ workshopId: string | null } | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    document.title = 'הרשמה לסדנאות מימו'
  }, [])

  // Settings (subtitle + hero) are needed in both modes.
  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['app_subtitle', 'landing_hero_text'])
      .then(({ data }) => {
        const sub = data?.find(r => r.setting_key === 'app_subtitle')?.setting_value
        const h = data?.find(r => r.setting_key === 'landing_hero_text')?.setting_value
        if (sub) setSubtitle(sub)
        if (h) setHero(h)
      })
  }, [])

  // Task B: offer mode loader — runs only when ?offer=<token> is set.
  // Uses get_workshop_offer (SECURITY DEFINER, RLS-bypassing) so the
  // anon path can read the row without table-level grant.
  useEffect(() => {
    if (!offerToken) return
    let cancelled = false
    ;(async () => {
      const { data: offerData } = await supabase.rpc('get_workshop_offer', { p_token: offerToken })
      if (cancelled) return
      if (!offerData) {
        setOfferUnavailable({ workshopId: null })
        setLoading(false)
        return
      }
      const o = offerData as WorkshopOffer
      const now = new Date()
      const expired = o.expires_at != null && new Date(o.expires_at) <= now
      const maxed = o.max_uses != null && o.uses_count >= o.max_uses
      const inactive = !o.is_active

      // Workshop fetch ignores public_registration on purpose — an
      // offer link is its own surface, the admin can use it even for
      // workshops they don't want in the public list.
      const { data: w } = await supabase.from('workshops').select('*').eq('id', o.workshop_id).single()
      if (cancelled) return
      const ws = w as Workshop | null
      if (expired || maxed || inactive || !ws || !ws.is_active) {
        setOfferUnavailable({ workshopId: ws?.id ?? o.workshop_id })
        setLoading(false)
        return
      }
      setOffer(o)
      setOfferWorkshop(ws)
      setSelected(ws.id)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [offerToken])

  // Regular ?register or bare visit — skipped when an offer is in play
  // (the offer effect owns its workshop fetch + loading state).
  useEffect(() => {
    if (offerToken) return
    supabase
      .from('workshops')
      .select('*')
      .eq('public_registration', true)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        const list = data ?? []
        setWorkshops(list)
        if (preselect && list.some(w => w.id === preselect)) {
          setSelected(preselect)
        } else if (list.length === 1) {
          setSelected(list[0].id)
        }
        setLoading(false)
      })
  }, [preselect, offerToken])

  const orderedWorkshops = useMemo(() => {
    if (!selected) return workshops
    const sel = workshops.find(w => w.id === selected)
    if (!sel) return workshops
    return [sel, ...workshops.filter(w => w.id !== selected)]
  }, [workshops, selected])

  // Phase 5 / B + Task B: per-workshop dedicated links. The offer
  // mode's offerWorkshop takes precedence — when present, the form
  // locks to that workshop and shows the special-price banner.
  const lockedWorkshop = useMemo(() => {
    if (offerWorkshop) return offerWorkshop
    if (!preselect) return null
    return workshops.find(w => w.id === preselect) ?? null
  }, [workshops, preselect, offerWorkshop])

  const offerPrice = useMemo(() => {
    if (!offer) return null
    return computeOfferPrice(offer, offerWorkshop)
  }, [offer, offerWorkshop])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'שם מלא נדרש'
    const cleanPhone = normalizePhone(phone)
    if (!cleanPhone) e.phone = 'מספר טלפון נדרש'
    else if (!/^05\d{8}$/.test(cleanPhone)) e.phone = 'מספר טלפון ישראלי לא תקין (05X-XXXXXXX)'
    if (!email.trim()) e.email = 'אימייל נדרש'
    else if (!isValidEmail(email.trim())) e.email = 'כתובת אימייל לא תקינה'
    if (!selected) e.workshop = 'יש לבחור סדנה'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    // Task B: offer mode — atomically claim the offer BEFORE inserting
    // the lead. If two registrations race, the second one's
    // claim_workshop_offer RPC returns null and we bail with a
    // friendly message. The offer's own payment_link (or a fallback
    // to the workshop's) is what we redirect to.
    if (offer && offerWorkshop) {
      const { data: claimed } = await supabase.rpc('claim_workshop_offer', { p_token: offer.token })
      if (!claimed) {
        setSubmitting(false)
        setErrors({ submit: 'ההצעה הסתיימה כרגע — אם זו הייתה הצעה מוגבלת בכמות, מספר השימושים מולא.' })
        return
      }
      const { error } = await supabase.from('registration_leads').insert({
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim().toLowerCase(),
        selected_workshop_id: offerWorkshop.id,
        offer_id: offer.id,
        offer_token: offer.token,
        source: source || 'offer',
      })
      if (error) {
        setSubmitting(false)
        setErrors({ submit: 'שגיאה בשמירה — נסי שוב או צרי קשר ישירות' })
        return
      }
      const url = offer.payment_link ?? offerWorkshop.payment_link
      if (url) {
        window.location.href = url
      } else {
        setSubmitting(false)
        setErrors({ submit: 'ההרשמה התקבלה. ניצור איתך קשר בהקדם.' })
      }
      return
    }

    // Regular mode (unchanged from Phase 5 / B).
    const workshop = workshops.find(w => w.id === selected)
    const { error } = await supabase.from('registration_leads').insert({
      name: name.trim(),
      phone: normalizePhone(phone),
      email: email.trim().toLowerCase(),
      selected_workshop_id: selected,
      ...(source ? { source } : {}),
    })
    if (error) {
      setSubmitting(false)
      setErrors({ submit: 'שגיאה בשמירה — נסי שוב או צרי קשר ישירות' })
      return
    }
    if (workshop?.payment_link) {
      window.location.href = workshop.payment_link
    } else {
      setSubmitting(false)
      setErrors({ submit: 'ההרשמה התקבלה. ניצור איתך קשר בהקדם.' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  // Task B: offer link is dead (expired / maxed / disabled / unknown).
  // Block the offer flow with a friendly message + link to the
  // regular product page if we know which workshop it pointed at.
  if (offerUnavailable) {
    const fallback = offerUnavailable.workshopId
      ? `?register=${offerUnavailable.workshopId}`
      : '?register'
    return (
      <div className="min-h-screen px-4 py-8 flex items-center justify-center" dir="rtl" style={{ background: '#FFFFFF' }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
            <p className="text-sand-500 text-sm">{subtitle}</p>
          </div>
          <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-6 text-center space-y-3">
            <p className="text-3xl">💝</p>
            <h2 className="text-lg font-bold text-sand-800">ההצעה הסתיימה</h2>
            <p className="text-sm text-sand-600 leading-relaxed">
              לינק ההצעה המיוחדת שקיבלת כבר לא תקף — ייתכן שהמספר המוגבל מולא או שההצעה פגה.
            </p>
            <a
              href={fallback}
              className="block mt-2 py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background: '#E7C78A' }}
            >
              להרשמה במחיר הרגיל ←
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <p className="text-sand-500 text-sm">{subtitle}</p>
        </div>

        <h1 className="text-center text-xl font-bold text-sand-800 mb-6">{hero}</h1>

        {/* Task B: special-offer banner — only when the form is in
            offer mode. Shows the offer label so the user can verify
            she's getting what was advertised. */}
        {offer && (
          <div className="bg-gradient-to-l from-mustard-50 to-white border-2 border-mustard-300 rounded-2xl p-4 mb-4 text-center space-y-1">
            <p className="text-sm font-bold text-mustard-700">💝 הצעה מיוחדת לך</p>
            <p className="text-xs text-sand-600">{offer.label}</p>
          </div>
        )}

        <form onSubmit={submit} className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם מלא</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">מספר טלפון</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              dir="ltr"
              placeholder="050-1234567"
              autoComplete="tel"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              dir="ltr"
              autoComplete="email"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-0.5">
              {lockedWorkshop ? 'המוצר שנבחר עבורך' : 'בחירת מוצר'}
            </label>
            {!lockedWorkshop && (
              <p className="text-xs text-sand-400 mb-2">את כל המוצרים ניתן לקנות גם כמתנת לידה</p>
            )}
            {!lockedWorkshop && orderedWorkshops.length === 0 && (
              <div className="text-center text-sand-400 text-sm py-6">אין סדנאות זמינות כרגע</div>
            )}
            <div className="space-y-2">
              {(lockedWorkshop ? [lockedWorkshop] : orderedWorkshops).map(w => {
                const active = selected === w.id
                const isExpanded = expanded.has(w.id) || (!!lockedWorkshop && !!w.description)
                const locked = !!lockedWorkshop
                return (
                  <div
                    key={w.id}
                    onClick={locked ? undefined : () => setSelected(w.id)}
                    role={locked ? undefined : 'button'}
                    tabIndex={locked ? undefined : 0}
                    onKeyDown={locked ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(w.id) } }}
                    className={`w-full text-right p-3 rounded-2xl border-2 transition-all ${
                      locked
                        ? 'border-mustard-400 bg-mustard-50'
                        : active
                          ? 'border-mustard-400 bg-mustard-50 cursor-pointer'
                          : 'border-sand-200 bg-white hover:border-mustard-200 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {!locked && (
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                          {active && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      )}
                      {w.image_url && <img src={w.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sand-800 text-sm">{w.title}</p>
                        {/* Task B: when an offer is in play, show
                            the regular price struck through and the
                            special price prominently. Otherwise the
                            regular price as before. */}
                        {offer && offerPrice != null ? (
                          <p className="mt-0.5 flex items-center gap-2 flex-wrap">
                            {w.price != null && (
                              <span className="text-xs text-sand-400 line-through">₪{w.price}</span>
                            )}
                            <span className="text-sm font-bold text-mustard-700">₪{offerPrice}</span>
                            <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">
                              {offer.discount_type === 'percent' ? `-${offer.discount_value}%` : 'מחיר מיוחד'}
                            </span>
                          </p>
                        ) : (
                          w.price != null && <p className="text-xs font-bold text-mustard-600 mt-0.5">₪{w.price}</p>
                        )}
                      </div>
                      {!locked && w.description && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleExpand(w.id) }}
                          className="flex-shrink-0 text-[11px] text-mustard-600 hover:text-mustard-700 px-2 py-1 rounded-lg hover:bg-mustard-50 transition-colors"
                        >
                          {isExpanded ? 'פחות ↑' : 'פרטים ↓'}
                        </button>
                      )}
                    </div>
                    {isExpanded && w.description && (
                      <p className="mt-2 pt-2 border-t border-sand-100 text-xs text-sand-500 leading-relaxed whitespace-pre-line">{w.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
            {errors.workshop && <p className="text-xs text-red-500 mt-1">{errors.workshop}</p>}
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{errors.submit}</div>
          )}

          <button
            type="submit"
            disabled={submitting || workshops.length === 0}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: '#E7C78A' }}
          >
            {submitting ? 'שולח...' : 'המשך לתשלום'}
          </button>
        </form>

        <p className="text-center text-[11px] text-sand-400 mt-4">
          לאחר שליחת הטופס תועברי לעמוד התשלום
        </p>
      </div>
    </div>
  )
}
