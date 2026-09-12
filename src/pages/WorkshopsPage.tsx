import { useEffect, useState, useMemo } from 'react'
import { ExternalLink, MessageCircle, ShoppingBag, Star, X, CreditCard, CalendarDays, Gift, Bell, Check, ChevronLeft } from 'lucide-react'
import { supabase, Workshop, type PublicCohort } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { useTracker } from '../hooks/useTracker'
import { useWorkshopCategories, categoryLabel } from '../hooks/useWorkshopCategories'
import {
  useGraduateOffers,
  graduateOfferPrice,
  graduateOfferLink,
  graduateOfferDaysLeft,
  graduateOfferDeadline,
  type GraduateOffer,
} from '../hooks/useGraduateOffers'
import GiftCardModal from '../components/giftcard/GiftCardModal'
import type { Page } from '../App'

type WorkshopExt = Workshop & { whatsapp_number?: string }

// ── Cohorts (מחזורים) ─────────────────────────────────────────────────────────
// Same data source as the public registration page: the SECURITY DEFINER
// get_public_cohorts RPC returns only upcoming, active cohorts (sorted by
// start date, past cohorts excluded) with effective capacity + live count.

// Cohort chip label: DD/MM + optional HH:MM. Year implied (upcoming only).
function cohortDateLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}`
}

function CohortSpots({ c }: { c: PublicCohort }) {
  const spotsLeft = c.capacity != null ? c.capacity - c.registered_count : null
  const full = spotsLeft != null && spotsLeft <= 0
  if (full) return <span className="font-bold text-red-500">המחזור מלא</span>
  if (spotsLeft === 1) return <span className="font-bold text-amber-600">נותר מקום אחרון!</span>
  if (spotsLeft != null && spotsLeft <= 3) return <span className="font-bold text-amber-600">נותרו {spotsLeft} מקומות</span>
  return <span className="text-green-700 font-semibold">יש מקום 🤍</span>
}

// Selectable list of upcoming cohorts — used inside the product modal.
// Same radio-chip pattern as the public registration page; the chosen
// cohort is carried into ?register=<id>&cohort=<id> so it arrives
// pre-selected on the registration form.
function CohortList({ list, selected, onSelect }: { list: PublicCohort[]; selected: string; onSelect: (id: string) => void }) {
  if (list.length === 0) return null
  return (
    <div>
      <p className="text-xs font-bold text-sand-700 mb-2 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5" /> באיזה מחזור תרצי להשתתף?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {list.slice(0, 4).map(c => {
          const spotsLeft = c.capacity != null ? c.capacity - c.registered_count : null
          const full = spotsLeft != null && spotsLeft <= 0
          const chosen = selected === c.id
          return (
            <button
              key={c.id}
              type="button"
              disabled={full}
              onClick={() => onSelect(c.id)}
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
                <CohortSpots c={c} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── In-store purchase → a registration, before the payment page ───────────────
// Products that don't go through the public registration page (physical
// add-ons, and cohort products with public_registration off) used to link
// straight to Morning: no lead, no cohort, nothing for Brenda to see, and
// nothing for the thank-you page to flip to שילמה. She is logged in and we
// already hold her details, so record the registration on the way out and
// stash its id exactly like PublicRegisterPage does.
//
// Deliberately NOT awaited: awaiting before window.open would let the
// popup blocker eat the payment tab. The insert lands while she is still
// typing her card details.
function recordStorePurchase(
  ws: WorkshopExt,
  profile: { id: string; mother_name: string | null; email: string | null; phone_number?: string | null } | null,
  cohortId?: string | null,
) {
  if (!profile) return
  const leadId = crypto.randomUUID()
  try { localStorage.setItem('mimo_pending_lead_id', leadId) } catch { /* private mode */ }
  void supabase.from('registration_leads').insert({
    id: leadId,
    name: profile.mother_name ?? 'לקוחה מהאפליקציה',
    phone: profile.phone_number ?? '',
    email: profile.email ?? '',
    selected_workshop_id: ws.id,
    cohort_id: cohortId || null,
    source: 'store',
  }).then(({ error }) => {
    if (error) console.error('[store-purchase] lead insert failed:', error)
  })
}

// ── "Tell me when a new cohort opens" ─────────────────────────────────────────
// A product whose cohorts have all run used to keep its buy button. Mothers
// pressed it and became registration_leads with source='store' — people who
// looked like they owed money for a workshop that did not exist yet. Three
// in two days. Now the button asks to be told instead, and the interest
// lands in workshop_waitlist where Brenda can actually act on it.
//
// waitlist_enabled gates this per product, because "no upcoming cohort" is
// not the same as "cannot be bought".
function WaitlistButton({ ws, compact = false }: { ws: WorkshopExt; compact?: boolean }) {
  const { profile } = useAuth()
  const { track } = useTracker()
  const [state, setState] = useState<'idle' | 'saving' | 'joined'>('idle')

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    supabase.from('workshop_waitlist')
      .select('id').eq('workshop_id', ws.id).eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setState('joined') })
    return () => { cancelled = true }
  }, [ws.id, profile])

  async function join() {
    if (!profile || state !== 'idle') return
    setState('saving')
    const { error } = await supabase.from('workshop_waitlist').insert({
      workshop_id: ws.id,
      user_id: profile.id,
      name: profile.mother_name ?? 'לקוחה מהאפליקציה',
      phone: profile.phone_number ?? null,
      email: profile.email ?? null,
    })
    // A duplicate means she is already on the list, which is the state she
    // wanted. Only a real failure goes back to idle.
    if (error && error.code !== '23505') { setState('idle'); return }
    track('waitlist_join', { workshop_id: ws.id, title: ws.title })
    setState('joined')
  }

  if (state === 'joined') {
    return (
      <div className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl text-sm font-bold ${compact ? 'py-2.5' : 'py-3.5'}`}
        style={{ background: '#F0EAE0', color: '#7B604C' }}>
        <Check className="w-4 h-4" /> נעדכן אותך
      </div>
    )
  }
  return (
    <button onClick={join} disabled={state === 'saving' || !profile}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-60 ${compact ? 'py-2.5' : 'py-3.5'}`}
      style={{ background: '#E7C78A' }}>
      <Bell className="w-4 h-4" />
      {state === 'saving' ? 'רגע...' : 'עדכנו אותי כשייפתח'}
    </button>
  )
}

// ── Graduate discount ─────────────────────────────────────────────
// Brenda 27.8.26: a mother who finished עטופים sees the משפחת מימו
// price on מגלים here, and the buy button carries HER link. The token is
// personal (max_uses 1) and dies a week after her last meeting, so the
// price on the shelf and the price at checkout are the same number.

function GraduateBadge({ offer }: { offer: GraduateOffer }) {
  const days = graduateOfferDaysLeft(offer)
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-full"
      style={{ background: '#F6E3DA', color: '#A35C3D' }}>
      <Gift className="w-3 h-3" />
      משפחת מימו · {days <= 1 ? 'יום אחרון' : `עד ${graduateOfferDeadline(offer)}`}
    </span>
  )
}

/** List price struck through next to what she actually pays. */
function GraduatePrice({ ws, offer, size }: { ws: WorkshopExt; offer: GraduateOffer; size: 'card' | 'modal' }) {
  const price = graduateOfferPrice(offer)
  if (price == null) return null
  const big = size === 'modal' ? 'text-xl' : 'text-lg'
  return (
    <span className="flex items-baseline gap-2">
      {ws.price != null && ws.price !== price && (
        <span className="text-sm line-through" style={{ color: '#A79684' }}>₪{ws.price}</span>
      )}
      <span className={`${big} font-black`} style={{ color: '#A35C3D' }}>₪{price}</span>
    </span>
  )
}

// ── Product detail modal ──────────────────────────────────────────────────────
function ProductModal({ ws, onClose, ownerWhatsapp, cohorts, offer }: { ws: WorkshopExt; onClose: () => void; ownerWhatsapp: string; cohorts: PublicCohort[]; offer: GraduateOffer | null }) {
  const { profile } = useAuth()
  const { track } = useTracker()
  // Pre-select the first cohort that still has room, so the register
  // CTA works with zero extra taps.
  const [selectedCohort, setSelectedCohort] = useState<string>(() =>
    cohorts.find(c => c.capacity == null || c.capacity - c.registered_count > 0)?.id ?? ''
  )
  const chosen = cohorts.find(c => c.id === selectedCohort) ?? null
  // Cohort-based products go through the registration page (which
  // records the lead + chosen cohort and then leads to payment).
  const registerFlow = cohorts.length > 0 && ws.public_registration
  // get_public_cohorts only ever returns cohorts starting after today, so an
  // empty list here means exactly "nothing to sign up to".
  const showWaitlist = cohorts.length === 0 && ws.waitlist_enabled
  const registerHref = `${window.location.origin}/?register=${ws.id}${selectedCohort ? `&cohort=${selectedCohort}` : ''}`
  const waText = `היי! אני מעוניינת ב: ${ws.title}${chosen ? ` (מחזור ${cohortDateLabel(chosen)})` : ''}`
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[88vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
      {/* Scrollable body — image + details. The CTA footer below stays
          pinned so הרשמה / וואטסאפ are always visible without scrolling. */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {/* Image or placeholder */}
        {ws.image_url ? (
          <div className="relative">
            <img src={ws.image_url} alt={ws.title} className="w-full h-52 object-cover rounded-t-3xl" />
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow"
            >
              <X className="w-5 h-5 text-sand-700" />
            </button>
          </div>
        ) : (
          <div className="relative w-full h-24 flex items-center justify-center rounded-t-3xl" style={{ background: '#F4EDE1' }}>
            <ShoppingBag className="w-10 h-10 text-sand-500" />
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow"
            >
              <X className="w-5 h-5 text-sand-700" />
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Title + price */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="font-bold text-sand-800 text-xl leading-tight">{ws.title}</h2>
              {offer && <GraduateBadge offer={offer} />}
            </div>
            {offer ? (
              <span className="flex-shrink-0"><GraduatePrice ws={ws} offer={offer} size="modal" /></span>
            ) : ws.price != null && (
              <span className="text-xl font-bold text-mustard-600 flex-shrink-0">
                {ws.price === 0 ? 'חינם' : `₪${ws.price}`}
              </span>
            )}
          </div>

          {/* Full description — preserve newlines */}
          {ws.description && (
            <div className="text-sm text-sand-600 leading-relaxed whitespace-pre-line">
              {ws.description}
            </div>
          )}

          {/* Upcoming cohorts — pick the one to register to */}
          <CohortList list={cohorts} selected={selectedCohort} onSelect={setSelectedCohort} />

        </div>
      </div>

      {/* Pinned CTA footer — always visible */}
      <div className="flex gap-3 p-4 pt-3 border-t border-[#F0EAE0] bg-white rounded-b-none sm:rounded-b-3xl flex-shrink-0">
        <a
          href={`https://wa.me/${ws.whatsapp_number ?? ownerWhatsapp}?text=${encodeURIComponent(waText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-musgo-500 hover:bg-musgo-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>

        {offer ? (
          /* Her own discount link. It opens the registration page in offer
             mode, where the cohort is picked and the discounted payment
             link takes over. */
          <a
            href={graduateOfferLink(offer)}
            onClick={() => track('product_pay_click', { workshop_id: ws.id, title: ws.title, route: 'graduate_offer' })}
            className="flex-1 flex flex-col items-center justify-center font-bold py-2.5 rounded-2xl text-sm transition-all"
            style={{ background: '#A35C3D', color: '#FFFFFF' }}
          >
            <span className="flex items-center gap-2"><Gift className="w-4 h-4" /> להרשמה בהנחה</span>
            <span className="text-[12px] font-semibold opacity-90 mt-0.5">המחיר שלך כבר מעודכן בקישור</span>
          </a>
        ) : registerFlow ? (
          /* Registration page with the chosen cohort pre-selected —
             records the lead + cohort, then continues to payment */
          <a
            href={registerHref}
            onClick={() => track('product_pay_click', { workshop_id: ws.id, title: ws.title, route: 'register' })}
            className="flex-1 flex flex-col items-center justify-center font-bold py-2.5 rounded-2xl text-sm transition-all"
            style={{ background: '#C8A460', color: '#33281B' }}
          >
            <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" /> להרשמה</span>
            {chosen && <span className="text-[12px] font-semibold opacity-80 mt-0.5">למחזור {cohortDateLabel(chosen)}</span>}
          </a>
        ) : showWaitlist ? (
          <WaitlistButton ws={ws} />
        ) : ws.payment_link && (
          <a
            href={ws.payment_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { track('product_pay_click', { workshop_id: ws.id, title: ws.title, route: 'payment_link' }); recordStorePurchase(ws, profile, selectedCohort) }}
            className="flex-1 flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm transition-all"
            style={{ background: '#C8A460', color: '#33281B' }}
          >
            <ExternalLink className="w-4 h-4" />
            להרשמה
          </a>
        )}
      </div>
      </div>
    </div>
  )
}

// Store categories are admin-managed (content_categories via
// useWorkshopCategories) — edit them in the admin מוצרים tab.

// ── Main page ─────────────────────────────────────────────────────────────────

// onNavigate is still accepted (App passes it) but unused since הרכישות שלי
// moved to settings (12.9.26).
export default function WorkshopsPage({ onNavigate: _onNavigate }: { onNavigate?: (page: Page) => void } = {}) {
  void _onNavigate
  const { profile } = useAuth()
  const { track } = useTracker()
  const { ownerName, ownerWhatsapp } = useOwnerSettings()
  const { categories } = useWorkshopCategories()
  // Discounts she earned by finishing a workshop, keyed by the product
  // they apply to. Empty for almost everyone.
  const { byWorkshop: graduateOffers } = useGraduateOffers()
  const isPregnant = profile?.user_mode === 'pregnant'
  const [workshops, setWorkshops] = useState<WorkshopExt[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<WorkshopExt | null>(null)

  /** Opening a product sheet is the store's real signal — a page_view on
   *  מוצרים only says she walked past the shelf. */
  function openProduct(ws: WorkshopExt) {
    setSelected(ws)
    track('product_open', { workshop_id: ws.id, title: ws.title, price: ws.price ?? null })
  }

  // Deep link from the home screen's age-matched card: it stashes the
  // product id, we open that product's sheet instead of dropping her
  // into the whole store to find it again.
  // ?product=<workshop id> (Brenda 12.9.26) does the same from a link she
  // sends: the product's page inside the app, not the public sale page.
  // Read once and stripped, like ?gift below.
  const [pendingProductId, setPendingProductId] = useState<string | null>(() => {
    try {
      const url = new URL(window.location.href)
      const fromLink = url.searchParams.get('product')
      if (fromLink) {
        url.searchParams.delete('product')
        window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)
        return fromLink
      }
      const id = sessionStorage.getItem('mimo_open_product')
      sessionStorage.removeItem('mimo_open_product')
      return id
    } catch { return null }
  })
  const [category, setCategory] = useState(isPregnant ? 'הריון' : 'all')
  // גיפט קארד — the buy sheet. The cards she already bought live in
  // settings → הרכישות שלי (MyPurchasesSection) since 12.9.26.
  const [giftOpen, setGiftOpen] = useState(false)
  // ?gift=<workshop id> — Brenda 5.9.26: a link she can send, like the
  // registration link, that opens the gift sheet on one product. Read
  // once and stripped from the URL so a refresh does not reopen it.
  const [pendingGiftId, setPendingGiftId] = useState<string | null>(() => {
    try {
      const url = new URL(window.location.href)
      const id = url.searchParams.get('gift')
      if (!id) return null
      url.searchParams.delete('gift')
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)
      return id
    } catch { return null }
  })
  const [giftInitialId, setGiftInitialId] = useState<string | null>(null)
  // Upcoming cohorts for ALL displayed products (one RPC call).
  const [cohorts, setCohorts] = useState<PublicCohort[]>([])

  useEffect(() => {
    supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .not('workshop_type', 'is', null)
      .order('display_order')
      .then(({ data }) => {
        const ws = (data ?? []) as WorkshopExt[]
        setWorkshops(ws)
        setLoading(false)
        const ids = ws.map(w => w.id)
        if (ids.length === 0) return
        supabase.rpc('get_public_cohorts', { p_workshop_ids: ids }).then(({ data: cs }) => {
          setCohorts((cs ?? []) as PublicCohort[])
        })
      })
  }, [])

  // Once the products are loaded, open the one the home card asked for.
  useEffect(() => {
    if (!pendingProductId || workshops.length === 0) return
    const ws = workshops.find(w => w.id === pendingProductId)
    if (ws) openProduct(ws)
    setPendingProductId(null)
  }, [pendingProductId, workshops])

  // Gift link: open the gift sheet on that product. If the product is no
  // longer giftable (checkbox off since the link was sent), fall back to
  // its own sheet rather than a picker with the wrong product selected.
  useEffect(() => {
    if (!pendingGiftId || workshops.length === 0) return
    const ws = workshops.find(w => w.id === pendingGiftId)
    if (ws?.gift_card_enabled) {
      setGiftInitialId(ws.id)
      setGiftOpen(true)
      track('gift_card_open', { source: 'link', workshop_id: ws.id })
    } else if (ws) {
      openProduct(ws)
    }
    setPendingGiftId(null)
  }, [pendingGiftId, workshops])

  const cohortsByWorkshop = useMemo(() => {
    const m = new Map<string, PublicCohort[]>()
    for (const c of cohorts) {
      const arr = m.get(c.workshop_id) ?? []
      arr.push(c)
      m.set(c.workshop_id, arr)
    }
    return m
  }, [cohorts])

  // Only show category chips that have at least one workshop
  const activeCategories = categories.filter(c =>
    workshops.some(w => w.workshop_type === c.name)
  )

  // Whatever Brenda ticked on the product form. No products ticked = no
  // gift card entry at all, rather than an empty picker.
  const giftableProducts = workshops.filter(w => w.gift_card_enabled)

  const filtered = category === 'all'
    ? workshops
    : workshops.filter(w => w.workshop_type === category)

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* Brand header — cream, matching the rest of the app */}
      <div className="px-5 pt-8 pb-5">
        {/* Brenda 17.8.26: plain "מוצרים" — "מיוחדים" and "נבחרו במיוחד
            עבורך" both promise a curation the page does not do. Then, on
            seeing it: "take out the star on the left." With the subtitle
            gone the badge was decorating an empty row. */}
        <div className="max-w-sm mx-auto">
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, color: '#5E4938' }}>מוצרים</h1>
        </div>

        {/* Category filters. Brenda 12.9.26: the חנות / הרכישות שלי switcher
            is gone; הרכישות שלי lives in settings under ניהול שיתופים. */}
        {(
          <div className="max-w-sm mx-auto flex gap-2 mt-4 overflow-x-auto scroll-hide pb-1">
            {[{ key: 'all', label: 'הכל' }, ...activeCategories.map(cat => ({ key: cat.name, label: categoryLabel(cat) }))].map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all"
                style={category === c.key
                  ? { background: '#E7C78A', color: '#4A3A28', fontWeight: 700 }
                  : { background: '#FFFFFF', color: '#7B604C', border: '1px solid #E4DAD0' }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-sm mx-auto px-4 pt-4 space-y-3">
        {(
          <>
            {/* גיפט קארד — Brenda 19.8.26. Sits above the products because
                it is a different intent: buying for someone else, not for
                yourself, and nobody goes looking for it inside a category. */}
            {giftableProducts.length > 0 && (
              <button
                onClick={() => { setGiftOpen(true); track('gift_card_open') }}
                className="w-full text-right rounded-3xl shadow-sm p-4 flex items-center gap-3 active:scale-[0.98] transition-all hover:shadow-md"
                style={{ background: '#F6ECD8', border: '1px solid #E7C78A' }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: '#FFFFFF' }}>
                  🎁
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: '#3D2E20' }}>גיפט קארד</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#7B604C' }}>
                    מתנה לחברה: סדנה או ליווי, נשלח אליה במייל
                  </p>
                </div>
                <Gift className="w-5 h-5 flex-shrink-0" style={{ color: '#B98F4E' }} />
              </button>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sand-600">
                <p className="text-4xl mb-3">🛍️</p>
                <p className="text-sm">אין מוצרים בקטגוריה זו</p>
              </div>
            ) : (
              filtered.map(ws => {
                const isFeatured = ws.display_order === 1
                const wsCohorts = cohortsByWorkshop.get(ws.id) ?? []
                const gradOffer = graduateOffers.get(ws.id) ?? null
                return (
                  <div key={ws.id} className="bg-white rounded-3xl shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:shadow-md" onClick={() => openProduct(ws)}>
                    <div className="flex gap-3 p-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Brenda 12.9.26: no category badge and no blurb on
                            the card. Title, price, cohorts, and a way in.
                            The category is a filter, not a label. */}
                        <h3 className="font-bold text-sm leading-snug" style={{ color: '#3D2E20' }}>{ws.title}</h3>
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{ color: '#8A6A2F' }}>
                          לפרטים נוספים <ChevronLeft className="w-3.5 h-3.5" />
                        </span>
                        {gradOffer ? (
                          <div className="space-y-1.5">
                            <GraduatePrice ws={ws} offer={gradOffer} size="card" />
                            <GraduateBadge offer={gradOffer} />
                          </div>
                        ) : ws.price != null && (
                          <p className="text-lg font-black" style={{ color: '#D9B978' }}>{ws.price === 0 ? 'חינם' : `₪${ws.price}`}</p>
                        )}
                      </div>
                      <div className="relative flex-shrink-0">
                        {ws.image_url ? (
                          <img src={ws.image_url} alt={ws.title} className="w-24 h-24 object-cover rounded-2xl" />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl flex items-center justify-center" style={{ background: '#F4EDE1' }}>
                            <ShoppingBag className="w-8 h-8 text-sand-500" />
                          </div>
                        )}
                        {isFeatured && (
                          <div className="absolute -top-2 -right-2 flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[13px] font-bold text-white" style={{ background: '#A35C3D' }}>
                            <Star className="w-2.5 h-2.5" /> מומלץ
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Upcoming cohorts — compact chips, same data as the
                        registration page. Tapping the card opens the modal
                        with the full list. */}
                    {wsCohorts.length > 0 && (
                      <div className="flex items-center gap-1.5 px-4 pb-3 -mt-1 overflow-x-auto scroll-hide">
                        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8A6A2F' }} />
                        {wsCohorts.slice(0, 3).map(c => {
                          const spotsLeft = c.capacity != null ? c.capacity - c.registered_count : null
                          const full = spotsLeft != null && spotsLeft <= 0
                          return (
                            <span
                              key={c.id}
                              className={`flex-shrink-0 text-[12px] font-bold px-2.5 py-1 rounded-full ${full ? 'line-through opacity-50' : ''}`}
                              style={{ background: '#F6ECD8', color: '#6E5836' }}
                            >
                              {cohortDateLabel(c)}
                              {!full && spotsLeft != null && spotsLeft <= 3 && (
                                <span className="mr-1" style={{ color: '#A35C3D' }}>
                                  · {spotsLeft === 1 ? 'מקום אחרון!' : `נותרו ${spotsLeft}`}
                                </span>
                              )}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex gap-2 px-4 pb-4" onClick={e => e.stopPropagation()}>
                      <a href={`https://wa.me/${ws.whatsapp_number ?? ownerWhatsapp}?text=${encodeURIComponent(`היי! אני מעוניינת ב: ${ws.title}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white"
                        style={{ background: '#818267' }}>
                        <MessageCircle className="w-4 h-4" /> וואטסאפ
                      </a>
                      {gradOffer ? (
                        <a href={graduateOfferLink(gradOffer)}
                          onClick={() => track('product_pay_click', { workshop_id: ws.id, title: ws.title, route: 'graduate_offer' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white"
                          style={{ background: '#A35C3D' }}>
                          <Gift className="w-4 h-4" /> להרשמה בהנחה
                        </a>
                      ) : wsCohorts.length > 0 && ws.public_registration ? (
                        /* Cohort-based product — open the modal to pick a
                           cohort before continuing to registration */
                        <button onClick={() => openProduct(ws)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28]"
                          style={{ background: '#E7C78A' }}>
                          <CalendarDays className="w-4 h-4" /> להרשמה
                        </button>
                      ) : wsCohorts.length === 0 && ws.waitlist_enabled ? (
                        <WaitlistButton ws={ws} compact />
                      ) : ws.payment_link && (
                        <a href={ws.payment_link} target="_blank" rel="noopener noreferrer"
                          onClick={() => recordStorePurchase(ws, profile, null)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28]"
                          style={{ background: '#E7C78A' }}>
                          <CreditCard className="w-4 h-4" /> רכישה
                        </a>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      {giftOpen && (
        <GiftCardModal
          products={giftableProducts}
          cohortsByWorkshop={cohortsByWorkshop}
          ownerName={ownerName}
          ownerWhatsapp={ownerWhatsapp}
          onClose={() => { setGiftOpen(false); setGiftInitialId(null) }}
          initialProductId={giftInitialId}
        />
      )}

      {selected && <ProductModal ws={selected} onClose={() => setSelected(null)} ownerWhatsapp={ownerWhatsapp} cohorts={cohortsByWorkshop.get(selected.id) ?? []} offer={graduateOffers.get(selected.id) ?? null} />}
    </div>
  )
}
