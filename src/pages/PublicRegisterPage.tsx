import { useEffect, useState, useMemo } from 'react'
import { supabase, Workshop, type WorkshopOffer, type PublicCohort } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'
import { initPixel, pixelTrack } from '../utils/metaPixel'
import { Instagram, Facebook } from 'lucide-react'

// Mimo social profiles — shown as quiet icons at the bottom of the
// public registration page (both the general form and per-product
// links). Leave empty to hide an icon.
const SOCIAL_INSTAGRAM = 'https://www.instagram.com/mimo.brenlevin/'
const SOCIAL_FACEBOOK = 'https://www.facebook.com/mimo.brenlevin'

// Cohort chip label: DD/MM + optional HH:MM. Compact — the year is
// implied (only upcoming cohorts are ever returned by the RPC).
function cohortDateLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}`
}

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
  // Cohort pre-selection from the in-app store (?register=<id>&cohort=<id>)
  // — the mom already picked a cohort in the product modal.
  const preCohort = params.get('cohort') || ''
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
  // Upcoming cohorts for ALL displayed workshops (one RPC call). The
  // RPC only returns active cohorts whose start_date hasn't passed, so
  // past cohorts never surface here. selectedCohort is the chosen
  // cohort for the currently-selected workshop; picking a different
  // workshop resets it.
  const [cohorts, setCohorts] = useState<PublicCohort[]>([])
  const [selectedCohort, setSelectedCohort] = useState<string>('')
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

  // Load upcoming cohorts for every displayed workshop in one call.
  // Runs in both modes (regular list / locked offer workshop).
  useEffect(() => {
    const ids = offerWorkshop ? [offerWorkshop.id] : workshops.map(w => w.id)
    if (ids.length === 0) return
    let cancelled = false
    supabase.rpc('get_public_cohorts', { p_workshop_ids: ids }).then(({ data }) => {
      if (cancelled) return
      const list = (data ?? []) as PublicCohort[]
      setCohorts(list)
      // Apply the URL cohort pre-selection once, if it's a valid,
      // non-full cohort of the pre-selected workshop.
      if (preCohort && preselect) {
        const c = list.find(x => x.id === preCohort && x.workshop_id === preselect)
        if (c && (c.capacity == null || c.capacity - c.registered_count > 0)) {
          setSelectedCohort(prev => prev || c.id)
        }
      }
    })
    return () => { cancelled = true }
  }, [workshops, offerWorkshop]) // eslint-disable-line react-hooks/exhaustive-deps

  const cohortsByWorkshop = useMemo(() => {
    const m = new Map<string, PublicCohort[]>()
    for (const c of cohorts) {
      const list = m.get(c.workshop_id)
      if (list) list.push(c); else m.set(c.workshop_id, [c])
    }
    return m
  }, [cohorts])

  function selectWorkshop(id: string) {
    setSelected(prev => {
      if (prev !== id) setSelectedCohort('')
      return id
    })
  }

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

  // A digital course has no cohort, no meeting, nothing to wait for — and
  // the copy on this page should say so. Detected from the content itself
  // (module names), so a future course needs no flag.
  const [isDigitalCourse, setIsDigitalCourse] = useState(false)
  useEffect(() => {
    const id = lockedWorkshop?.id
    if (!id) { setIsDigitalCourse(false); return }
    let cancelled = false
    supabase.from('workshop_content')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_id', id)
      .not('section', 'is', null)
      .then(({ count }) => { if (!cancelled) setIsDigitalCourse((count ?? 0) > 0) })
    return () => { cancelled = true }
  }, [lockedWorkshop?.id])

  // Campaign measurement. ViewContent when she lands, InitiateCheckout the
  // moment she is sent to payment; Purchase fires later on ?thanks. All
  // three are needed for a Sales campaign to optimise on buyers.
  useEffect(() => {
    if (!lockedWorkshop) return
    initPixel().then(ready => {
      if (!ready) return
      pixelTrack('ViewContent', {
        content_name: lockedWorkshop.title,
        content_ids: [lockedWorkshop.id],
        content_type: 'product',
        value: lockedWorkshop.price ?? 0,
        currency: 'ILS',
      })
    })
  }, [lockedWorkshop])

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
    // Cohort is required only when the chosen workshop actually has
    // upcoming cohorts with room; otherwise the field doesn't render.
    if (selected) {
      const list = cohortsByWorkshop.get(selected) ?? []
      const hasAvailable = list.some(c => c.capacity == null || c.registered_count < c.capacity)
      if (hasAvailable && !selectedCohort) e.cohort = 'יש לבחור מחזור'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Auto-paid flow: the lead id is generated client-side and stashed in
  // localStorage right before redirecting to the payment page. The
  // thank-you page (?thanks — where the payment provider redirects
  // after a successful charge) picks it up and calls mark_lead_paid,
  // flipping the lead from 'pending' to 'paid' automatically.
  function rememberPendingLead(leadId: string) {
    try { localStorage.setItem('mimo_pending_lead_id', leadId) } catch { /* private mode — skip */ }
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
      const { data: claimed, error: claimError } = await supabase.rpc('claim_workshop_offer', { p_token: offer.token })
      // Distinguish RPC failure (network / permission / unexpected)
      // from a successful RPC that returned NULL (= offer was no
      // longer claimable when the UPDATE ran). The original code
      // collapsed both into "ההצעה הסתיימה", which hid genuine
      // backend errors during a real outage.
      if (claimError) {
        console.error('[offer-submit] claim_workshop_offer RPC error:', claimError)
        setSubmitting(false)
        setErrors({ submit: 'שגיאה בתקשורת עם השרת. נסי שוב' })
        return
      }
      if (!claimed) {
        console.warn('[offer-submit] claim returned null — offer no longer claimable')
        setSubmitting(false)
        setErrors({ submit: 'ההצעה הסתיימה כרגע. ייתכן שהמספר המוגבל של השימושים מולא.' })
        return
      }
      const leadId = crypto.randomUUID()
      const { error } = await supabase.from('registration_leads').insert({
        id: leadId,
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim().toLowerCase(),
        selected_workshop_id: offerWorkshop.id,
        cohort_id: selectedCohort || null,
        offer_id: offer.id,
        offer_token: offer.token,
        source: source || 'offer',
      })
      if (error) {
        console.error('[offer-submit] registration_leads insert error:', error)
        setSubmitting(false)
        setErrors({ submit: 'שגיאה בשמירה. נסי שוב או צרי קשר ישירות' })
        return
      }
      const url = offer.payment_link ?? offerWorkshop.payment_link
      if (url) {
        rememberPendingLead(leadId)
        window.location.href = url
      } else {
        // Neither the offer nor the workshop has a payment_link. The
        // lead is already saved + the offer claim already ran, so
        // we tell the user her submission was received and the owner
        // will follow up. This path is rare (admin would normally
        // require payment_link when discount_value > 0) but worth a
        // clear message instead of silently doing nothing.
        console.warn('[offer-submit] no payment_link on offer or workshop — falling through to manual-followup message')
        setSubmitting(false)
        setErrors({ submit: 'ההרשמה התקבלה. ניצור איתך קשר בהקדם להמשך התשלום.' })
      }
      return
    }

    // Regular mode (unchanged from Phase 5 / B).
    const workshop = workshops.find(w => w.id === selected)
    const leadId = crypto.randomUUID()
    const { error } = await supabase.from('registration_leads').insert({
      id: leadId,
      name: name.trim(),
      phone: normalizePhone(phone),
      email: email.trim().toLowerCase(),
      selected_workshop_id: selected,
      cohort_id: selectedCohort || null,
      ...(source ? { source } : {}),
    })
    if (error) {
      setSubmitting(false)
      setErrors({ submit: 'שגיאה בשמירה. נסי שוב או צרי קשר ישירות' })
      return
    }
    if (workshop?.payment_link) {
      rememberPendingLead(leadId)
      // Fire before navigating away. Not awaited — a blocked pixel must
      // never stand between a woman and the payment page.
      pixelTrack('Lead', {
        content_name: workshop.title,
        content_ids: [workshop.id],
        value: workshop.price ?? 0,
        currency: 'ILS',
      })
      pixelTrack('InitiateCheckout', {
        content_name: workshop.title,
        content_ids: [workshop.id],
        value: workshop.price ?? 0,
        currency: 'ILS',
        num_items: 1,
      })
      window.location.href = workshop.payment_link
    } else {
      setSubmitting(false)
      setErrors({ submit: 'ההרשמה התקבלה. ניצור איתך קשר בהקדם.' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F4EC' }}>
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
      <div className="min-h-screen px-4 py-8 flex items-center justify-center" dir="rtl" style={{ background: '#F8F4EC' }}>
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
            <p className="text-sand-500 text-sm">{subtitle}</p>
          </div>
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center space-y-3">
            <p className="text-3xl">💝</p>
            <h2 className="text-lg font-bold text-sand-800">ההצעה הסתיימה</h2>
            <p className="text-sm text-sand-600 leading-relaxed">
              לינק ההצעה המיוחדת שקיבלת כבר לא תקף. ייתכן שהמספר המוגבל מולא או שההצעה פגה.
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
    <div className="min-h-screen px-4 py-8" dir="rtl" style={{ background: '#F8F4EC' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <p className="text-sand-500 text-sm">{subtitle}</p>
        </div>

        {/* A campaign lands here with ?register=<product>. The global
            "ברוכה הבאה לסדנאות מימו" is the wrong promise for a digital
            course bought off an ad — name the thing she clicked on. */}
        <h1 className="text-center text-xl font-bold text-sand-800 mb-1">
          {lockedWorkshop ? lockedWorkshop.title : hero}
        </h1>
        {lockedWorkshop?.price != null && (
          <p className="text-center text-sand-500 text-sm mb-6">
            ₪{lockedWorkshop.price}
            {isDigitalCourse && ' · גישה מיידית · שלך לתמיד'}
          </p>
        )}
        {!lockedWorkshop?.price && <div className="mb-6" />}

        {/* Task B: special-offer banner — only when the form is in
            offer mode. Shows the offer label so the user can verify
            she's getting what was advertised. */}
        {offer && (
          <div className="bg-gradient-to-l from-mustard-50 to-white border-2 border-mustard-300 rounded-2xl p-4 mb-4 text-center space-y-1">
            <p className="text-sm font-bold text-mustard-700">💝 הצעה מיוחדת לך</p>
            <p className="text-xs text-sand-600">{offer.label}</p>
          </div>
        )}

        <form onSubmit={submit} className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
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
              <p className="text-xs text-sand-600 mb-2">את כל המוצרים ניתן לקנות גם כמתנת לידה</p>
            )}
            {!lockedWorkshop && orderedWorkshops.length === 0 && (
              <div className="text-center text-sand-600 text-sm py-6">אין סדנאות זמינות כרגע</div>
            )}
            <div className="space-y-2">
              {(lockedWorkshop ? [lockedWorkshop] : orderedWorkshops).map(w => {
                const active = selected === w.id
                const isExpanded = expanded.has(w.id) || (!!lockedWorkshop && !!w.description)
                const locked = !!lockedWorkshop
                return (
                  <div
                    key={w.id}
                    onClick={locked ? undefined : () => selectWorkshop(w.id)}
                    role={locked ? undefined : 'button'}
                    tabIndex={locked ? undefined : 0}
                    onKeyDown={locked ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWorkshop(w.id) } }}
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
                              <span className="text-xs text-sand-600 line-through">₪{w.price}</span>
                            )}
                            <span className="text-sm font-bold text-mustard-700">₪{offerPrice}</span>
                            <span className="text-[13px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">
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
                          className="flex-shrink-0 text-[13px] text-mustard-600 hover:text-mustard-700 px-2 py-1 rounded-lg hover:bg-mustard-50 transition-colors"
                        >
                          {isExpanded ? 'פחות ↑' : 'פרטים ↓'}
                        </button>
                      )}
                    </div>
                    {isExpanded && w.description && (
                      <p className="mt-2 pt-2 border-t border-sand-100 text-xs text-sand-500 leading-relaxed whitespace-pre-line">{w.description}</p>
                    )}
                    {/* Cohort picker — renders inside the SELECTED (or
                        locked) workshop card only, when upcoming cohorts
                        exist. Full cohorts show disabled with a "מלא"
                        badge; the rest show spots left when capacity is
                        known. Choosing one attaches cohort_id to the
                        lead, so it lands pre-classified in the admin. */}
                    {(active || locked) && (() => {
                      // Only the next 3 upcoming cohorts — a longer list
                      // overwhelms the form (the RPC already returns them
                      // sorted by start date, past cohorts excluded). A
                      // cohort pre-chosen in the app store may be further
                      // out — append it so the selection stays visible.
                      const all = cohortsByWorkshop.get(w.id) ?? []
                      const list = all.slice(0, 3)
                      const chosenExtra = selectedCohort && !list.some(c => c.id === selectedCohort)
                        ? all.find(c => c.id === selectedCohort)
                        : undefined
                      if (chosenExtra) list.push(chosenExtra)
                      if (list.length === 0) return null
                      return (
                        <div className="mt-3 pt-3 border-t border-mustard-200/60" onClick={e => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-sand-700 mb-2">באיזה מחזור תרצי להשתתף?</p>
                          <div className="grid grid-cols-2 gap-2">
                            {list.map(c => {
                              const spotsLeft = c.capacity != null ? c.capacity - c.registered_count : null
                              const full = spotsLeft != null && spotsLeft <= 0
                              const chosen = selectedCohort === c.id
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={full}
                                  onClick={() => setSelectedCohort(c.id)}
                                  className={`text-right p-2.5 rounded-xl border-2 transition-all ${
                                    full
                                      ? 'border-sand-200 bg-sand-50 opacity-50 cursor-not-allowed'
                                      : chosen
                                        ? 'border-mustard-500 bg-white shadow-sm'
                                        : 'border-sand-200 bg-white hover:border-mustard-300'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${chosen ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                                      {chosen && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </span>
                                    <span className="text-sm font-bold text-sand-800">{cohortDateLabel(c)}</span>
                                  </span>
                                  <span className="block mt-1 text-[13px] leading-tight">
                                    {c.label && <span className="text-sand-500">{c.label} · </span>}
                                    {full ? (
                                      <span className="font-bold text-red-500">המחזור מלא</span>
                                    ) : spotsLeft === 1 ? (
                                      <span className="font-bold text-amber-600">נותר מקום אחרון!</span>
                                    ) : spotsLeft != null && spotsLeft <= 3 ? (
                                      <span className="font-bold text-amber-600">נותרו {spotsLeft} מקומות</span>
                                    ) : (
                                      <span className="text-green-700 font-semibold">יש מקום 🤍</span>
                                    )}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          {errors.cohort && <p className="text-xs text-red-500 mt-1.5">{errors.cohort}</p>}
                        </div>
                      )
                    })()}
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
            // Task B fix: in offer mode the regular workshops loader
            // is intentionally skipped (we have offerWorkshop instead),
            // so `workshops` stays []. The original `workshops.length === 0`
            // gate was for the bare ?register flow where nothing's
            // available; in offer mode there's always exactly one
            // (locked) workshop, so the gate must NOT fire.
            disabled={submitting || (!offer && workshops.length === 0)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: '#C8A460', color: '#33281B' }}
          >
            {submitting ? 'שולח...' : 'המשך לתשלום'}
          </button>
        </form>

        <p className="text-center text-[13px] text-sand-600 mt-4">
          {isDigitalCourse
            ? 'מיד אחרי התשלום נפתחת לך הגישה ונשלח מייל עם קישור ישיר לקורס'
            : 'לאחר שליחת הטופס תועברי לעמוד התשלום'}
        </p>

        {/* Social footer */}
        {(SOCIAL_INSTAGRAM || SOCIAL_FACEBOOK) && (
          <div className="flex items-center justify-center gap-3 mt-6 pb-2">
            {SOCIAL_INSTAGRAM && (
              <a href={SOCIAL_INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                className="rounded-full flex items-center justify-center transition-all hover:brightness-95"
                style={{ width: 40, height: 40, background: '#F6ECD8' }}>
                <Instagram style={{ width: 19, height: 19, color: '#8A6A2F' }} />
              </a>
            )}
            {SOCIAL_FACEBOOK && (
              <a href={SOCIAL_FACEBOOK} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                className="rounded-full flex items-center justify-center transition-all hover:brightness-95"
                style={{ width: 40, height: 40, background: '#F6ECD8' }}>
                <Facebook style={{ width: 19, height: 19, color: '#8A6A2F' }} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
