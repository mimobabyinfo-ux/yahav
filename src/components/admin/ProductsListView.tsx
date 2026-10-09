import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, ChevronLeft, Copy, CreditCard, FileText, Gift, GraduationCap, KeyRound, MoreHorizontal, Pencil, Plus, Power, Search, Settings2, ArrowUpDown, Trash2, X } from 'lucide-react'
import { supabase, type Workshop } from '../../lib/supabase'

/**
 * The products list (9.10.26, from the approved Lovable mockup).
 *
 * Before: one table, every product the same weight, up to 7 small buttons
 * per row (hover-only on desktop). Now: tabs by kind (סדנאות / שירותים
 * ודיגיטלי / חנות / כבויים), a "כדאי לבדוק" strip only when something
 * blocks a sale, workshop cards with the next cohort and how full it is,
 * ONE primary action (copy the link a mother needs) and the rest in a ⋯
 * menu. Reordering is an explicit "סידור" mode instead of an always-on
 * drag handle.
 *
 * Presentation only: edits, cohorts, access, content and delete are the
 * parent's existing handlers and modals.
 */

type Cohort = { id: string; workshop_id: string; start_date: string; start_time: string | null; capacity: number | null; is_active: boolean }
type Kind = 'workshop' | 'service' | 'store'
type TabId = Kind | 'off'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function when(c: Cohort) {
  const [y, m, d] = c.start_date.split('-').map(Number)
  const wd = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][new Date(y, m - 1, d).getDay()]
  return `יום ${wd} ${d}/${m}${c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''}`
}

export default function ProductsListView({
  workshops, physicalTypes, offersByWorkshop = {},
  onOpenProduct, onCreate, onCategories, onToggle, onDelete, onContent, onCohorts, onAccess, onReorder,
}: {
  workshops: Workshop[]
  /** Category names whose products are physical store items. */
  physicalTypes: string[]
  offersByWorkshop?: Record<string, string[]>
  onOpenProduct: (id: string) => void
  onCreate: () => void
  onCategories: () => void
  onToggle: (w: Workshop) => void
  onDelete: (w: Workshop) => void
  onContent: (w: Workshop) => void
  onCohorts: (w: Workshop) => void
  onAccess: (w: Workshop) => void
  onReorder: (ordered: Workshop[]) => void
}) {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [regs, setRegs] = useState<{ selected_workshop_id: string | null; cohort_id: string | null; status: string }[]>([])
  const [tab, setTab] = useState<TabId>('workshop')
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [sorting, setSorting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('workshop_cohorts').select('id, workshop_id, start_date, start_time, capacity, is_active'),
      supabase.from('registration_leads').select('selected_workshop_id, cohort_id, status'),
    ]).then(([c, r]) => {
      setCohorts((c.data ?? []) as Cohort[])
      setRegs((r.data ?? []) as typeof regs)
    })
  }, [workshops.length])

  const today = todayIso()
  const hasCohorts = useMemo(() => new Set(cohorts.map(c => c.workshop_id)), [cohorts])
  const upcomingBy = useMemo(() => {
    const m = new Map<string, Cohort[]>()
    for (const c of cohorts) {
      if (!c.is_active || c.start_date < today) continue
      m.set(c.workshop_id, [...(m.get(c.workshop_id) ?? []), c])
    }
    for (const list of m.values()) list.sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    return m
  }, [cohorts, today])
  const regsBy = useMemo(() => {
    const byW = new Map<string, number>()
    const takenByCohort = new Map<string, number>()
    for (const r of regs) {
      if (r.selected_workshop_id) byW.set(r.selected_workshop_id, (byW.get(r.selected_workshop_id) ?? 0) + 1)
      // 27.9.26: a registration pending payment does not hold a seat.
      if (r.cohort_id && r.status !== 'pending') takenByCohort.set(r.cohort_id, (takenByCohort.get(r.cohort_id) ?? 0) + 1)
    }
    return { byW, takenByCohort }
  }, [regs])

  const kindOf = (w: Workshop): Kind =>
    physicalTypes.includes(w.workshop_type ?? '') ? 'store' : hasCohorts.has(w.id) ? 'workshop' : 'service'

  // "כדאי לבדוק": only what blocks a sale or a seat.
  const attention = useMemo(() => {
    const out: { w: Workshop; text: string }[] = []
    for (const w of workshops) {
      if (!w.is_active) continue
      if ((w.price ?? 0) > 0 && !w.payment_link) out.push({ w, text: `ל"${w.title}" אין קישור תשלום, אי אפשר לשלם עליו` })
      else if (kindOf(w) === 'workshop' && !(upcomingBy.get(w.id)?.length) && !w.waitlist_enabled)
        out.push({ w, text: `"${w.title}" פעילה בלי מחזור קרוב` })
      else if (kindOf(w) === 'store' && w.stock_quantity === 0) out.push({ w, text: `"${w.title}" אזל מהמלאי` })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshops, upcomingBy, hasCohorts, physicalTypes])

  const q = search.trim()
  const counts = { workshop: 0, service: 0, store: 0, off: 0 } as Record<TabId, number>
  for (const w of workshops) counts[w.is_active ? kindOf(w) : 'off']++
  const shown = workshops.filter(w => q
    ? (w.title.includes(q) || (w.description ?? '').includes(q))
    : (tab === 'off' ? !w.is_active : w.is_active && kindOf(w) === tab))

  function flash(text: string) {
    setToast(text)
    setTimeout(() => setToast(t => (t === text ? null : t)), 2200)
  }
  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => flash(`${label} הועתק`), () => flash('לא הצלחתי להעתיק'))
  }
  const registerLink = (w: Workshop) => `${window.location.origin}?register=${w.id}`
  const giftLink = (w: Workshop) => `${window.location.origin}/?giftcard=${w.id}`

  function primary(w: Workshop) {
    if (w.public_registration) return { label: 'העתקת לינק הרשמה', run: () => copy(registerLink(w), 'לינק ההרשמה') }
    if (w.payment_link) return { label: 'העתקת לינק תשלום', run: () => copy(w.payment_link!, 'לינק התשלום') }
    return { label: 'פתיחת המוצר', run: () => onOpenProduct(w.id) }
  }

  function move(w: Workshop, dir: -1 | 1) {
    const list = workshops.slice()
    const i = list.findIndex(x => x.id === w.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    onReorder(list)
  }

  const renderMenu = (w: Workshop) => {
    const physical = kindOf(w) === 'store'
    const item = (icon: React.ReactNode, label: string, run: () => void, danger = false) => (
      <button type="button" role="menuitem" className={danger ? 'danger' : undefined} onClick={() => { setMenuFor(null); run() }}>{icon}{label}</button>
    )
    return (
      <>
        <span className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
        <span className="pl-menu" role="menu">
          {w.public_registration && item(<Copy className="w-4 h-4" />, 'לינק הרשמה', () => copy(registerLink(w), 'לינק ההרשמה'))}
          {w.payment_link
            ? item(<CreditCard className="w-4 h-4" />, 'לינק תשלום', () => copy(w.payment_link!, 'לינק התשלום'))
            : item(<CreditCard className="w-4 h-4" />, 'הוספת קישור תשלום', () => onOpenProduct(w.id))}
          {w.gift_card_enabled && item(<Gift className="w-4 h-4" />, 'לינק גיפט קארד', () => copy(giftLink(w), 'לינק הגיפט קארד'))}
          {!physical && item(<CalendarDays className="w-4 h-4" />, 'מחזורים', () => onCohorts(w))}
          {!physical && item(<KeyRound className="w-4 h-4" />, 'גישות', () => onAccess(w))}
          {!physical && item(<FileText className="w-4 h-4" />, 'תוכן', () => onContent(w))}
          {item(<Pencil className="w-4 h-4" />, 'עמוד המוצר ועריכה', () => onOpenProduct(w.id))}
          <span className="sep" />
          {item(<Power className="w-4 h-4" />, w.is_active ? 'כיבוי' : 'הפעלה', () => onToggle(w))}
          {item(<Trash2 className="w-4 h-4" />, 'מחיקה', () => onDelete(w), true)}
        </span>
      </>
    )
  }

  const renderCard = (w: Workshop) => {
    const kind = kindOf(w)
    const up = upcomingBy.get(w.id) ?? []
    const next = up[0]
    const cap = next ? (next.capacity ?? w.stock_quantity ?? null) : null
    const taken = next ? regsBy.takenByCohort.get(next.id) ?? 0 : 0
    const full = cap != null && taken >= cap
    const p = primary(w)
    const offers = offersByWorkshop[w.id] ?? []
    return (
      <article key={w.id} className={`pl-card ${kind}${w.is_active ? '' : ' off'}`} aria-label={w.title}>
        <button type="button" className="pl-open" onClick={() => onOpenProduct(w.id)} aria-label={`פתיחת ${w.title}`}>
          {kind === 'store' && (
            <span className="pl-img">
              {w.image_url ? <img src={w.image_url} alt="" /> : <GraduationCap className="w-6 h-6" style={{ color: '#A2937D' }} />}
            </span>
          )}
          <span className="pl-title">
            <span className="min-w-0">
              <h3>{w.title}</h3>
              <span className="pl-price">{w.price != null ? `₪${Number(w.price).toLocaleString('he-IL')}` : 'בלי מחיר'}</span>
            </span>
            <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#BCAE99' }} />
          </span>
          {kind === 'workshop' && (
            <span className="pl-cohort">
              <span className="pl-next"><CalendarDays className="w-3.5 h-3.5" />{next ? when(next) : 'אין מחזור קרוב'}</span>
              {next && (
                <>
                  <span className={`pl-seats${full ? ' full' : ''}`}>
                    {cap != null ? `${taken} מתוך ${cap} נרשמו` : `${taken} נרשמו`}
                    {full && <span className="pl-full"><Check className="w-3 h-3" />מלא</span>}
                  </span>
                  {cap != null && <span className="pl-bar"><span style={{ width: `${Math.min(100, (taken / cap) * 100)}%`, background: full ? '#3F5B39' : '#C8A460' }} /></span>}
                </>
              )}
              {up.length > 1 && <span className="pl-faint">עוד {up.length - 1} מחזורים</span>}
            </span>
          )}
          <span className="pl-meta">
            <span>{regsBy.byW.get(w.id) ?? 0} הרשמות</span>
            {kind === 'store' && w.stock_quantity != null && <span className={`pl-chip ${w.stock_quantity === 0 ? 'rust' : 'green'}`}>{w.stock_quantity === 0 ? 'אזל מהמלאי' : `${w.stock_quantity} במלאי`}</span>}
            {offers.length > 0 && <span className="pl-chip blue" title={offers.join(', ')}>{offers.length === 1 ? `מוזל: ${offers[0]}` : `${offers.length} לינקים מוזלים`}</span>}
            {w.gift_card_enabled && <span className="pl-chip gift"><Gift className="w-3 h-3" />גיפט קארד</span>}
            {!w.is_active && <span className="pl-chip">כבוי</span>}
          </span>
        </button>
        {!w.payment_link && (w.price ?? 0) > 0 && (
          <button type="button" className="pl-missing" onClick={() => onOpenProduct(w.id)}><CreditCard className="w-3.5 h-3.5" />חסר קישור תשלום, להוספה</button>
        )}
        <div className="pl-actions">
          <button type="button" className="pl-btn soft" onClick={p.run}><Copy className="w-3.5 h-3.5" />{p.label}</button>
          <span className="relative">
            <button type="button" className="pl-icon" onClick={() => setMenuFor(menuFor === w.id ? null : w.id)} aria-label={`עוד פעולות ל${w.title}`} aria-expanded={menuFor === w.id} title="עוד"><MoreHorizontal className="w-4 h-4" /></button>
            {menuFor === w.id && renderMenu(w)}
          </span>
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <style>{PL_CSS}</style>
      <header className="pl-header">
        <h1>מוצרים ותשלומים</h1>
        <div className="pl-hactions">
          <button type="button" className="pl-btn plain" onClick={() => setSorting(s => !s)} aria-pressed={sorting}><ArrowUpDown className="w-3.5 h-3.5" />{sorting ? 'סיום סידור' : 'סידור'}</button>
          <button type="button" className="pl-btn plain" onClick={onCategories}><Settings2 className="w-3.5 h-3.5" />קטגוריות</button>
          <button type="button" className="pl-btn primary" onClick={onCreate}><Plus className="w-4 h-4" />מוצר חדש</button>
        </div>
        <div className="pl-search">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#A2937D' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש בכל המוצרים" aria-label="חיפוש מוצר" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="ניקוי"><X className="w-4 h-4" style={{ color: '#A2937D' }} /></button>}
        </div>
      </header>

      {attention.length > 0 && !sorting && (
        <section className="pl-attn" aria-label="כדאי לבדוק">
          <h2><AlertTriangle className="w-4 h-4" />כדאי לבדוק</h2>
          {attention.map(a => (
            <button key={a.w.id} type="button" onClick={() => onOpenProduct(a.w.id)}>
              <span>{a.text}</span><ChevronLeft className="w-4 h-4 flex-shrink-0" />
            </button>
          ))}
        </section>
      )}

      {sorting ? (
        <section className="pl-sort" aria-label="סידור המוצרים">
          <p className="pl-faint">הסדר כאן הוא הסדר בחנות ובעמוד ההרשמה. החצים שומרים מיד.</p>
          {workshops.map((w, i) => (
            <div key={w.id} className={`pl-sort-row${w.is_active ? '' : ' off'}`}>
              <span className="n">{i + 1}</span>
              <span className="t">{w.title}</span>
              <button type="button" className="pl-icon" disabled={i === 0} onClick={() => move(w, -1)} aria-label={`הזזת ${w.title} למעלה`}><ArrowUp className="w-4 h-4" /></button>
              <button type="button" className="pl-icon" disabled={i === workshops.length - 1} onClick={() => move(w, 1)} aria-label={`הזזת ${w.title} למטה`}><ArrowDown className="w-4 h-4" /></button>
            </div>
          ))}
        </section>
      ) : (
        <>
          {!q && (
            <div className="pl-tabs" role="tablist" aria-label="סוג מוצר">
              {([['workshop', 'סדנאות'], ['service', 'שירותים ודיגיטלי'], ['store', 'חנות'], ['off', 'כבויים']] as [TabId, string][]).map(([id, label]) => (
                (id !== 'off' || counts.off > 0) && (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className="pl-tab" onClick={() => setTab(id)}>{label}<small>{counts[id]}</small></button>
                )
              ))}
            </div>
          )}
          {q && <p className="pl-faint">{shown.length === 0 ? 'לא נמצא מוצר' : `${shown.length} תוצאות בכל המוצרים`}</p>}
          <div className={`pl-grid${!q && tab === 'store' ? ' store' : ''}`}>{shown.map(renderCard)}</div>
          {!q && shown.length === 0 && <p className="pl-faint" style={{ padding: 16 }}>אין מוצרים כאן</p>}
        </>
      )}
      {toast && <div className="pl-toast" role="status"><Check className="w-4 h-4" />{toast}</div>}
    </div>
  )
}

const PL_CSS = `
.pl-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
.pl-header h1{font-size:26px;font-weight:700;color:#443327;line-height:1.2}
.pl-hactions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pl-search{grid-column:1/-1;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;padding:0 12px;height:42px;max-width:520px}
.pl-search input{flex:1;min-width:0;background:transparent;outline:none;font-size:14.5px;color:#443327}
.pl-search input::placeholder{color:#A2937D}
.pl-btn{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;border-radius:10px;padding:7px 12px;white-space:nowrap}
.pl-btn.primary{background:#C8A460;color:#33281B;padding:9px 16px;font-size:14px}
.pl-btn.soft{background:#F6ECD8;color:#6E5836}
.pl-btn.plain{color:#8A7A63}
.pl-btn.plain:hover,.pl-btn.plain[aria-pressed="true"]{background:#F1EBE1;color:#443327}
.pl-attn{background:#FBF3EF;border:1px solid #EFD3C6;border-radius:16px;padding:10px 12px}
.pl-attn h2{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;color:#8B4A30;margin:0 4px 6px}
.pl-attn button{display:flex;align-items:center;gap:8px;width:100%;text-align:right;font-size:13.5px;font-weight:600;color:#713924;padding:7px 6px;border-radius:8px}
.pl-attn button span{flex:1}
.pl-attn button:hover{background:#F5E2D8}
.pl-tabs{display:flex;gap:20px;overflow-x:auto;border-bottom:1px solid #E9E2D6;scrollbar-width:none}
.pl-tabs::-webkit-scrollbar{display:none}
.pl-tab{padding:9px 1px;font-size:14px;font-weight:600;color:#8A7A63;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}
.pl-tab[aria-selected="true"]{color:#443327;font-weight:800;border-color:#C8A460}
.pl-tab small{font-size:11.5px;color:#A2937D;margin-inline-start:5px;font-weight:700}
.pl-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));align-items:start}
.pl-grid.store{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.pl-card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid #E9E2D6;border-radius:18px}
.pl-card.off{background:#FBF9F5}
.pl-card.off h3{color:#8A7A63}
.pl-open{display:flex;flex-direction:column;gap:8px;padding:14px 16px 10px;text-align:right;border-radius:18px 18px 0 0}
.pl-open:hover{background:#FCFAF6}
.pl-img{display:flex;align-items:center;justify-content:center;height:110px;border-radius:12px;background:#F6F3ED;overflow:hidden}
.pl-img img{width:100%;height:100%;object-fit:cover}
.pl-title{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.pl-title h3{font-size:15.5px;font-weight:700;color:#443327;line-height:1.3}
.pl-price{display:block;font-size:13px;font-weight:700;color:#8A6A2F;margin-top:2px}
.pl-cohort{display:flex;flex-direction:column;gap:5px;background:#FBF9F5;border-radius:12px;padding:9px 11px}
.pl-next{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:#443327}
.pl-seats{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#6E5836}
.pl-full{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:800;color:#3F5B39;background:#E7F0E4;border-radius:999px;padding:1px 8px}
.pl-bar{display:block;height:5px;background:#EDE5D8;border-radius:999px;overflow:hidden}
.pl-bar span{display:block;height:100%;border-radius:999px}
.pl-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;font-weight:600;color:#8A7A63}
.pl-chip{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;background:#F6F3ED;color:#6E5836;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pl-chip.blue{background:#E4EBEF;color:#35505C}.pl-chip.rust{background:#F5E2D8;color:#8B4A30}.pl-chip.green{background:#E7F0E4;color:#3F5B39}.pl-chip.gift{background:#FBF1DC;color:#8A6A2F}
.pl-faint{font-size:12.5px;font-weight:600;color:#A2937D}
.pl-missing{display:flex;align-items:center;gap:6px;margin:0 12px 4px;padding:6px 9px;border-radius:9px;background:#F5E2D8;color:#8B4A30;font-size:12.5px;font-weight:700;text-align:right}
.pl-actions{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px 12px;margin-top:auto}
.pl-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;color:#8A7A63}
.pl-icon:hover{background:#F6F3ED;color:#443327}
.pl-icon:disabled{opacity:.3}
.pl-menu{position:absolute;bottom:38px;left:0;z-index:40;display:flex;flex-direction:column;min-width:190px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;box-shadow:0 8px 24px rgba(68,51,39,.12);padding:4px}
.pl-menu button{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#443327;padding:8px 10px;border-radius:8px;text-align:right}
.pl-menu button:hover{background:#F6F3ED}
.pl-menu button.danger{color:#8B4A30}
.pl-menu .sep{height:1px;background:#F1EBE1;margin:4px 6px}
.pl-sort{display:flex;flex-direction:column;gap:6px}
.pl-sort-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;padding:6px 10px}
.pl-sort-row.off{opacity:.6}
.pl-sort-row .n{width:22px;font-size:12px;font-weight:700;color:#A2937D;text-align:center}
.pl-sort-row .t{flex:1;min-width:0;font-size:14px;font-weight:700;color:#443327;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:6px;background:#443327;color:#F6F3ED;font-size:13.5px;font-weight:700;border-radius:12px;padding:10px 16px;box-shadow:0 6px 18px rgba(0,0,0,.18)}
@media (max-width:640px){.pl-header{grid-template-columns:1fr}.pl-header h1{font-size:22px}.pl-grid,.pl-grid.store{grid-template-columns:1fr}}
`
