import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, AlertCircle, ShoppingBag, CalendarDays, Check } from 'lucide-react'
import { supabase, type Workshop, type WorkshopCohort } from '../../lib/supabase'
import { useWorkshopCategories } from '../../hooks/useWorkshopCategories'
import CohortsModal from './CohortsModal'
import WorkshopOffersPanel from './WorkshopOffersPanel'

// Design handoff phase 4 — "a product is a page". Full-page product
// view: breadcrumb, hero, missing-payment-link banner, user-side
// controls (בראש החנות / מוצג / כבוי), two-column fields, cohorts
// INLINE with a fill bar each (managing still uses CohortsModal — the
// list itself no longer hides behind a modal-over-a-table), linked
// forms and the active offers panel inline. Physical products hide
// cohorts/offers and label stock as "מלאי".

type Props = {
  workshopId: string
  onBack: () => void
}

function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm bg-white focus:outline-none focus:border-mustard-400'
const inputStyle = { border: '1px solid #E9E2D6', color: '#443327' } as const
const labelCls = 'block text-xs font-bold mb-1'
const labelStyle = { color: '#8A7A63' } as const

export default function ProductPage({ workshopId, onBack }: Props) {
  const { categories } = useWorkshopCategories()
  const [workshop, setWorkshop] = useState<Workshop | null>(null)
  const [allWorkshops, setAllWorkshops] = useState<Workshop[]>([])
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  const [regCountByCohort, setRegCountByCohort] = useState<Map<string, number>>(new Map())
  const [formsList, setFormsList] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showCohortsManager, setShowCohortsManager] = useState(false)

  const [form, setForm] = useState({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '', public_registration: false, linked_form_id: '', feedback_form_id: '', age_from: '', age_to: '' })

  const load = useCallback(async () => {
    const [{ data: w }, { data: all }, { data: cs }, { data: leads }, { data: fs }] = await Promise.all([
      supabase.from('workshops').select('*').eq('id', workshopId).maybeSingle(),
      supabase.from('workshops').select('id, title, display_order, is_active, workshop_type').order('display_order'),
      supabase.from('workshop_cohorts').select('*').eq('workshop_id', workshopId).order('start_date'),
      supabase.from('registration_leads').select('cohort_id').eq('selected_workshop_id', workshopId),
      supabase.from('forms').select('id, title').eq('is_active', true).order('title'),
    ])
    const ws = (w ?? null) as Workshop | null
    setWorkshop(ws)
    setAllWorkshops((all ?? []) as Workshop[])
    setCohorts((cs ?? []) as WorkshopCohort[])
    // Reg count per cohort — ALL leads regardless of status (same
    // definition the public RPC uses for capacity).
    const m = new Map<string, number>()
    for (const l of (leads ?? []) as { cohort_id: string | null }[]) {
      if (l.cohort_id) m.set(l.cohort_id, (m.get(l.cohort_id) ?? 0) + 1)
    }
    setRegCountByCohort(m)
    setFormsList((fs ?? []) as { id: string; title: string }[])
    if (ws) {
      setForm({
        title: ws.title, description: ws.description ?? '', summary: ws.summary ?? '',
        price: ws.price?.toString() ?? '', payment_link: ws.payment_link ?? '',
        image_url: ws.image_url ?? '', video_url: ws.video_url ?? '',
        stock_quantity: ws.stock_quantity?.toString() ?? '',
        whatsapp_number: (ws as unknown as { whatsapp_number?: string }).whatsapp_number ?? '',
        next_workshop_id: ws.next_workshop_id ?? '', workshop_type: ws.workshop_type ?? '',
        public_registration: ws.public_registration ?? false,
        linked_form_id: ws.linked_form_id ?? '', feedback_form_id: ws.feedback_form_id ?? '',
        age_from: ws.age_range_start_months?.toString() ?? '', age_to: ws.age_range_end_months?.toString() ?? '',
      })
    }
    setLoading(false)
  }, [workshopId])
  useEffect(() => { load() }, [load])

  const physicalNames = categories.filter(c => c.slug === 'store-products').map(c => c.name)
  const isPhysical = workshop != null && physicalNames.includes(workshop.workshop_type ?? '')

  const upcomingCohorts = useMemo(() => cohorts.filter(c => c.start_date >= todayIso()), [cohorts])
  const nextCohort = upcomingCohorts.find(c => c.is_active) ?? null

  // "בראש החנות" — display_order semantics, never a "featured" flag
  // (handoff §3.4): the top product is the first active store product
  // by display_order.
  const storeSorted = useMemo(
    () => allWorkshops.filter(w => w.is_active && w.workshop_type != null).sort((a, b) => a.display_order - b.display_order),
    [allWorkshops],
  )
  const isTopOfStore = workshop != null && storeSorted[0]?.id === workshop.id

  async function save() {
    if (!workshop || !form.title.trim()) return
    setSaving(true)
    await supabase.from('workshops').update({
      title: form.title,
      description: form.description || null,
      summary: form.summary || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      whatsapp_number: form.whatsapp_number || null,
      next_workshop_id: form.next_workshop_id || null,
      workshop_type: form.workshop_type || null,
      public_registration: form.public_registration,
      linked_form_id: form.linked_form_id || null,
      feedback_form_id: form.feedback_form_id || null,
      age_range_start_months: form.age_from !== '' ? parseFloat(form.age_from) : null,
      age_range_end_months: form.age_to !== '' ? parseFloat(form.age_to) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', workshop.id)
    setSaving(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
    load()
  }

  async function setUserSide(mode: 'top' | 'visible' | 'off') {
    if (!workshop) return
    if (mode === 'off') {
      await supabase.from('workshops').update({ is_active: false }).eq('id', workshop.id)
    } else if (mode === 'visible') {
      await supabase.from('workshops').update({ is_active: true }).eq('id', workshop.id)
    } else {
      const minOrder = storeSorted.length > 0 ? storeSorted[0].display_order : 0
      await supabase.from('workshops').update({ is_active: true, display_order: minOrder - 1 }).eq('id', workshop.id)
    }
    load()
  }

  if (loading) {
    return <div className="text-center py-16"><div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" /></div>
  }
  if (!workshop) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-sm" style={{ color: '#8A7A63' }}>המוצר לא נמצא</p>
        <button onClick={onBack} className="font-bold text-sm" style={{ color: '#6E5836' }}>← חזרה למוצרים</button>
      </div>
    )
  }

  const missingLink = workshop.is_active && (workshop.price ?? 0) > 0 && !form.payment_link.trim()
  const userSideMode: 'top' | 'visible' | 'off' = !workshop.is_active ? 'off' : isTopOfStore ? 'top' : 'visible'

  return (
    <div className="space-y-4" dir="rtl">
      {/* Breadcrumb */}
      <button onClick={onBack} className="flex items-center gap-1 font-bold" style={{ fontSize: 13, color: '#8A7A63' }}>
        <ChevronRight className="w-4 h-4" />
        מוצרים ותשלומים <span style={{ color: '#C8A460' }}>›</span> <span style={{ color: '#443327' }}>{workshop.title}</span>
      </button>

      {/* Missing payment link — the product-level error banner */}
      {missingLink && (
        <div className="flex items-center gap-3" style={{ background: '#F7EBE4', border: '1px solid #E8C3B2', borderRadius: 18, padding: '14px 18px' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#8B4A30' }} />
          <p style={{ fontWeight: 700, fontSize: 14, color: '#713924' }}>
            המוצר פעיל בתשלום (₪{workshop.price}) בלי קישור תשלום — אי אפשר לשלם עליו. הוסיפי קישור בשדה למטה ושמרי.
          </p>
        </div>
      )}

      {/* Hero */}
      <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
        <div className="flex items-center gap-4 flex-wrap">
          {workshop.image_url
            ? <img src={workshop.image_url} alt="" className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" />
            : <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#F4EDE1' }}><ShoppingBag className="w-7 h-7" style={{ color: '#8A6A2F' }} /></div>}
          <div className="flex-1 min-w-[220px]">
            <h1 className="font-display" style={{ fontSize: 24, color: '#443327' }}>{workshop.title}</h1>
            <p className="flex items-center gap-2 flex-wrap font-semibold mt-1" style={{ fontSize: 13, color: '#8A7A63' }}>
              {workshop.workshop_type && <span className="rounded-full px-2.5 py-0.5" style={{ background: '#F4EDE1', color: '#8A6A2F', fontWeight: 700 }}>{workshop.workshop_type}</span>}
              <span className="rounded-full px-2.5 py-0.5" style={workshop.is_active ? { background: '#EDEDE6', color: '#4F5040', fontWeight: 700 } : { background: '#F1EBE1', color: '#A2937D', fontWeight: 700 }}>
                {workshop.is_active ? 'פעיל' : 'כבוי'}
              </span>
              {workshop.price != null && <span>₪{workshop.price}</span>}
              {nextCohort && (
                <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> המחזור הקרוב: {ddmm(nextCohort.start_date)}{nextCohort.start_time ? ` · ${nextCohort.start_time.slice(0, 5)}` : ''}</span>
              )}
            </p>
          </div>

          {/* בצד המשתמשת — writes display_order / is_active only */}
          <div className="flex-shrink-0">
            <p className={labelCls} style={labelStyle}>בצד המשתמשת</p>
            <div className="flex rounded-2xl p-1 gap-1" style={{ background: '#F6F3ED' }}>
              {([['top', 'בראש החנות'], ['visible', 'מוצג'], ['off', 'כבוי']] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setUserSide(mode)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={userSideMode === mode ? { background: '#C8A460', color: '#33281B' } : { color: '#8A7A63' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fields — two columns */}
      <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>פרטי המוצר</h2>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex items-center gap-1.5 font-bold rounded-xl disabled:opacity-40 transition-all"
            style={{ fontSize: 14, padding: '8px 18px', background: savedFlash ? '#818267' : '#C8A460', color: savedFlash ? '#fff' : '#33281B' }}>
            {savedFlash ? <><Check className="w-4 h-4" /> נשמר</> : saving ? '...' : 'שמירה'}
          </button>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="space-y-3">
            <div><label className={labelCls} style={labelStyle}>שם המוצר</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} style={inputStyle} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls} style={labelStyle}>מחיר (₪)</label>
                <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" className={inputCls} style={inputStyle} /></div>
              <div><label className={labelCls} style={labelStyle}>{isPhysical ? 'מלאי' : 'מקסימום נרשמות למחזור'}</label>
                <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} type="number" className={inputCls} style={inputStyle} /></div>
            </div>
            <div><label className={labelCls} style={labelStyle}>קישור תשלום</label>
              <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} dir="ltr" className={inputCls} style={missingLink ? { ...inputStyle, border: '1.5px solid #C97A5A' } : inputStyle} /></div>
            <div><label className={labelCls} style={labelStyle}>קטגוריה בחנות (ריק = סדנה דיגיטלית)</label>
              <select value={form.workshop_type} onChange={e => setForm(f => ({ ...f, workshop_type: e.target.value }))} className={inputCls} style={inputStyle}>
                <option value="">סדנה דיגיטלית (לא בחנות)</option>
                {form.workshop_type && !categories.some(c => c.name === form.workshop_type) && <option value={form.workshop_type}>{form.workshop_type}</option>}
                {categories.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>)}
              </select></div>
            <div><label className={labelCls} style={labelStyle}>טווח גיל מומלץ (חודשים) — להמלצה בדף הבית</label>
              <div className="grid grid-cols-2 gap-2">
                <input value={form.age_from} onChange={e => setForm(f => ({ ...f, age_from: e.target.value }))} placeholder="מגיל" type="number" step="0.5" min="0" className={inputCls} style={inputStyle} />
                <input value={form.age_to} onChange={e => setForm(f => ({ ...f, age_to: e.target.value }))} placeholder="עד גיל" type="number" step="0.5" min="0" className={inputCls} style={inputStyle} />
              </div></div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={form.public_registration} onChange={e => setForm(f => ({ ...f, public_registration: e.target.checked }))} className="w-4 h-4 accent-mustard-500" />
              <span className="text-sm font-semibold" style={{ color: '#5E4938' }}>מופיע בעמוד ההרשמה הציבורי</span>
            </label>
          </div>
          <div className="space-y-3">
            <div><label className={labelCls} style={labelStyle}>תיאור</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={`${inputCls} resize-none`} style={inputStyle} /></div>
            <div><label className={labelCls} style={labelStyle}>סיכום / נקודות מפתח</label>
              <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={2} className={`${inputCls} resize-none`} style={inputStyle} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls} style={labelStyle}>תמונה (URL)</label>
                <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} dir="ltr" className={inputCls} style={inputStyle} /></div>
              <div><label className={labelCls} style={labelStyle}>סרטון (URL)</label>
                <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} dir="ltr" className={inputCls} style={inputStyle} /></div>
            </div>
            <div><label className={labelCls} style={labelStyle}>WhatsApp למוצר</label>
              <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} dir="ltr" className={inputCls} style={inputStyle} /></div>
            {!isPhysical && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls} style={labelStyle}>שאלון פתיחה</label>
                    <select value={form.linked_form_id} onChange={e => setForm(f => ({ ...f, linked_form_id: e.target.value }))} className={inputCls} style={inputStyle}>
                      <option value="">ללא</option>
                      {formsList.map(f2 => <option key={f2.id} value={f2.id}>{f2.title}</option>)}
                    </select></div>
                  <div><label className={labelCls} style={labelStyle}>שאלון משוב (סיום)</label>
                    <select value={form.feedback_form_id} onChange={e => setForm(f => ({ ...f, feedback_form_id: e.target.value }))} className={inputCls} style={inputStyle}>
                      <option value="">ללא</option>
                      {formsList.map(f2 => <option key={f2.id} value={f2.id}>{f2.title}</option>)}
                    </select></div>
                </div>
                <div><label className={labelCls} style={labelStyle}>הסדנה הבאה בסדרה</label>
                  <select value={form.next_workshop_id} onChange={e => setForm(f => ({ ...f, next_workshop_id: e.target.value }))} className={inputCls} style={inputStyle}>
                    <option value="">ללא המשך</option>
                    {allWorkshops.filter(w => w.id !== workshop.id).map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                  </select></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cohorts — INLINE with a fill bar each (not a modal over a table) */}
      {!isPhysical && (
        <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>מחזורים</h2>
            <button onClick={() => setShowCohortsManager(true)}
              className="font-bold rounded-xl transition-all hover:brightness-95"
              style={{ fontSize: 13, padding: '6px 14px', background: '#F6ECD8', color: '#6E5836' }}>
              📅 ניהול מחזורים
            </button>
          </div>
          {cohorts.length === 0 ? (
            <p className="text-sm py-2 text-center" style={{ color: '#A2937D' }}>אין מחזורים עדיין — "ניהול מחזורים" ליצירת הראשון</p>
          ) : (
            <div className="space-y-1.5">
              {cohorts.map(c => {
                // effectiveCapacity: cohort override ?? product per-cohort max
                const cap = c.capacity ?? workshop.stock_quantity ?? null
                const count = regCountByCohort.get(c.id) ?? 0
                const ratio = cap ? Math.min(1, count / cap) : 0
                const left = cap != null ? Math.max(0, cap - count) : null
                const tight = left != null && left <= 3
                const past = c.start_date < todayIso()
                return (
                  <div key={c.id} className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${past || !c.is_active ? 'opacity-55' : ''}`} style={{ border: '1px solid #F1EBE1' }}>
                    <span className="flex-shrink-0 font-display" style={{ fontSize: 15, color: '#443327', minWidth: 46 }}>{ddmm(c.start_date)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate" style={{ fontSize: 13, color: '#6B5842' }}>
                        {c.start_time ? c.start_time.slice(0, 5) : 'ללא שעה'}
                        {c.label && ` · ${c.label}`}
                        {!c.is_active && ' · כבוי'}
                        {past && ' · הסתיים'}
                      </span>
                      <span className="block mt-1.5 rounded-full overflow-hidden" style={{ height: 6, background: '#F1EBE1' }}>
                        <span className="block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: tight ? '#8B4A30' : '#C8A460' }} />
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-left" style={{ minWidth: 70 }}>
                      <span className="block font-display" style={{ fontSize: 15, color: '#443327' }}>{count}{cap != null && `/${cap}`}</span>
                      <span className="block font-semibold" style={{ fontSize: 12, color: tight ? '#8B4A30' : '#8A7A63' }}>
                        {past ? '—' : cap == null ? 'ללא הגבלה' : left === 0 ? 'מלא' : `נותרו ${left}`}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Discounted offer links — inline, same panel the modal used */}
      {!isPhysical && (
        <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
          <h2 className="font-bold mb-3" style={{ fontSize: 16, color: '#443327' }}>לינקים מוזלים</h2>
          <WorkshopOffersPanel workshopId={workshop.id} />
        </div>
      )}

      {showCohortsManager && (
        <CohortsModal workshop={workshop} onClose={() => { setShowCohortsManager(false); load() }} />
      )}
    </div>
  )
}
