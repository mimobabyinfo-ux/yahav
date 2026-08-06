import { useEffect, useState, useMemo } from 'react'
import { ExternalLink, MessageCircle, ShoppingBag, Star, X, Sparkles, CreditCard, CalendarDays } from 'lucide-react'
import { supabase, Workshop, type PublicCohort } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { useWorkshopCategories, categoryLabel } from '../hooks/useWorkshopCategories'

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

// ── Product detail modal ──────────────────────────────────────────────────────
function ProductModal({ ws, onClose, ownerWhatsapp, cohorts }: { ws: WorkshopExt; onClose: () => void; ownerWhatsapp: string; cohorts: PublicCohort[] }) {
  // Pre-select the first cohort that still has room, so the register
  // CTA works with zero extra taps.
  const [selectedCohort, setSelectedCohort] = useState<string>(() =>
    cohorts.find(c => c.capacity == null || c.capacity - c.registered_count > 0)?.id ?? ''
  )
  const chosen = cohorts.find(c => c.id === selectedCohort) ?? null
  // Cohort-based products go through the registration page (which
  // records the lead + chosen cohort and then leads to payment).
  const registerFlow = cohorts.length > 0 && ws.public_registration
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
            <h2 className="font-bold text-sand-800 text-xl leading-tight">{ws.title}</h2>
            {ws.price != null && (
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

        {registerFlow ? (
          /* Registration page with the chosen cohort pre-selected —
             records the lead + cohort, then continues to payment */
          <a
            href={registerHref}
            className="flex-1 flex flex-col items-center justify-center font-bold py-2.5 rounded-2xl text-sm transition-all"
            style={{ background: '#C8A460', color: '#33281B' }}
          >
            <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4" /> להרשמה</span>
            {chosen && <span className="text-[12px] font-semibold opacity-80 mt-0.5">למחזור {cohortDateLabel(chosen)}</span>}
          </a>
        ) : ws.payment_link && (
          <a
            href={ws.payment_link}
            target="_blank"
            rel="noopener noreferrer"
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
type PurchasedRow = {
  id: string
  purchase_date: string
  amount_paid: number | null
  workshops: Workshop
}

export default function WorkshopsPage() {
  const { profile, user } = useAuth()
  const { ownerWhatsapp } = useOwnerSettings()
  const { categories } = useWorkshopCategories()
  const isPregnant = profile?.user_mode === 'pregnant'
  const [workshops, setWorkshops] = useState<WorkshopExt[]>([])
  const [purchases, setPurchases] = useState<PurchasedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<WorkshopExt | null>(null)
  const [category, setCategory] = useState(isPregnant ? 'הריון' : 'all')
  const [tab, setTab] = useState<'store' | 'purchases'>('store')
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

  const cohortsByWorkshop = useMemo(() => {
    const m = new Map<string, PublicCohort[]>()
    for (const c of cohorts) {
      const arr = m.get(c.workshop_id) ?? []
      arr.push(c)
      m.set(c.workshop_id, arr)
    }
    return m
  }, [cohorts])

  useEffect(() => {
    if (!user) return
    supabase
      .from('purchased_workshops')
      .select('*, workshops(*)')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
      .then(({ data }) => setPurchases((data ?? []) as PurchasedRow[]))
  }, [user])

  // Only show category chips that have at least one workshop
  const activeCategories = categories.filter(c =>
    workshops.some(w => w.workshop_type === c.name)
  )

  const filtered = category === 'all'
    ? workshops
    : workshops.filter(w => w.workshop_type === category)

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* Brand header — cream, matching the rest of the app */}
      <div className="px-5 pt-8 pb-5">
        <div className="max-w-sm mx-auto flex items-start justify-between">
          <div>
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, color: '#5E4938' }}>מוצרים מיוחדים</h1>
            <p className="text-sm mt-1 font-semibold" style={{ color: '#957860' }}>נבחרו במיוחד עבורך</p>
          </div>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#F6ECD8' }}>
            <Sparkles className="w-5 h-5" style={{ color: '#8A6A2F' }} />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="max-w-sm mx-auto mt-4 flex bg-white rounded-2xl border border-[#F0EAE0] p-1 gap-1">
          <button
            onClick={() => setTab('store')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'store' ? 'shadow-sm' : ''}`}
            style={tab === 'store' ? { background: '#E7C78A', color: '#4A3A28' } : { color: '#7B604C' }}
          >
            החנות
          </button>
          <button
            onClick={() => setTab('purchases')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'purchases' ? 'shadow-sm' : ''}`}
            style={tab === 'purchases' ? { background: '#E7C78A', color: '#4A3A28' } : { color: '#7B604C' }}
          >
            הרכישות שלי {purchases.length > 0 && `(${purchases.length})`}
          </button>
        </div>

        {/* Category filters — store only */}
        {tab === 'store' && (
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
        {tab === 'store' ? (
          <>
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
                return (
                  <div key={ws.id} className="bg-white rounded-3xl shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:shadow-md" onClick={() => setSelected(ws)}>
                    <div className="flex gap-3 p-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {ws.workshop_type && (
                          <span className="inline-block text-[13px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#F4EDE1', color: '#B98F4E' }}>
                            {ws.workshop_type}
                          </span>
                        )}
                        <h3 className="font-bold text-sm leading-snug" style={{ color: '#3D2E20' }}>{ws.title}</h3>
                        {ws.description && (
                          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#818267' }}>{ws.description.split('\n')[0]}</p>
                        )}
                        {ws.price != null && (
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
                      {wsCohorts.length > 0 && ws.public_registration ? (
                        /* Cohort-based product — open the modal to pick a
                           cohort before continuing to registration */
                        <button onClick={() => setSelected(ws)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28]"
                          style={{ background: '#E7C78A' }}>
                          <CalendarDays className="w-4 h-4" /> לבחירת מחזור והרשמה
                        </button>
                      ) : ws.payment_link && (
                        <a href={ws.payment_link} target="_blank" rel="noopener noreferrer"
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
        ) : (
          /* Purchases tab */
          purchases.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <ShoppingBag className="w-12 h-12 text-sand-200 mx-auto" />
              <p className="text-sand-600 text-sm">עדיין אין רכישות</p>
              <p className="text-xs text-sand-500">רכישות שתבצעי יופיעו כאן</p>
            </div>
          ) : (
            purchases.map(p => (
              <div key={p.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                {p.workshops.image_url && (
                  <img src={p.workshops.image_url} alt={p.workshops.title} className="w-full h-32 object-cover" />
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sand-800">{p.workshops.title}</p>
                      <p className="text-xs text-sand-600 mt-0.5">
                        {p.amount_paid != null ? `שולם: ₪${p.amount_paid}` : ''}
                        {' · '}{new Date(p.purchase_date).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                    {p.workshops.price != null && (
                      <span className="text-sm font-bold text-mustard-600">₪{p.workshops.price}</span>
                    )}
                  </div>
                  <a href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי! יש לי שאלה לגבי: ${p.workshops.title}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-musgo-500 hover:bg-musgo-600 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all">
                    <MessageCircle className="w-4 h-4" /> צרי קשר על הסדנה
                  </a>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {selected && <ProductModal ws={selected} onClose={() => setSelected(null)} ownerWhatsapp={ownerWhatsapp} cohorts={cohortsByWorkshop.get(selected.id) ?? []} />}
    </div>
  )
}
