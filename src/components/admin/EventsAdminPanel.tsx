import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, MessageCircle, CalendarDays, List, ChevronRight, ChevronLeft, ChevronDown } from 'lucide-react'
import { supabase, type CommunityEvent, type ServicePartner } from '../../lib/supabase'
import ConfirmDialog from './ConfirmDialog'
import { getBabyAge } from '../../utils/dateUtils'
import { tagDef } from '../../constants/communityTags'

// Admin panel for community events ("הקהילה של מימו"). Monthly-grouped
// event list with live registration counts, create/edit modal (price,
// capacity, vendor from service_partners or free text), per-event
// registrants view with WhatsApp links, attendance marking
// (attended/no_show) and paid toggle for priced events.

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

const EVENT_TYPE_PRESETS: { label: string; emoji: string }[] = [
  { label: 'הרצאה',            emoji: '🎤' },
  { label: 'אימון אחרי לידה', emoji: '💪' },
  { label: 'קפה ביחד',        emoji: '☕' },
  { label: 'הליכה בפארק',     emoji: '🌳' },
  { label: 'יוגה',             emoji: '🧘‍♀️' },
  { label: 'ערב יין',          emoji: '🍷' },
  { label: 'מעגל אמהות',      emoji: '💬' },
  { label: 'אחר',              emoji: '🎉' },
]

type Draft = {
  title: string
  emoji: string
  event_type: string
  description: string
  event_date: string
  start_time: string
  end_time: string
  location: string
  location_link: string
  capacity: string
  price: string
  payment_link: string
  vendor_id: string
  vendor_name: string
  is_active: boolean
}

const EMPTY_DRAFT: Draft = {
  title: '', emoji: '🎉', event_type: '', description: '',
  event_date: '', start_time: '', end_time: '',
  location: '', location_link: '', capacity: '', price: '0',
  payment_link: '', vendor_id: '', vendor_name: '', is_active: true,
}

type RegistrantRow = {
  id: string
  user_id: string
  status: 'registered' | 'cancelled' | 'attended' | 'no_show'
  paid: boolean
  created_at: string
  user_profiles: {
    mother_name: string | null; phone_number: string | null; email: string; area: string | null
    baby_name: string | null; baby_dob: string | null; community_bio: string | null
    community_tags: string[] | null; staff_notes: string | null
  } | null
}

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

function weekdayHe(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long' })
}

export default function EventsAdminPanel() {
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [vendors, setVendors] = useState<ServicePartner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CommunityEvent | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  // Registrants drill-down
  const [regsEvent, setRegsEvent] = useState<CommunityEvent | null>(null)
  const [regs, setRegs] = useState<RegistrantRow[]>([])
  const [regsLoading, setRegsLoading] = useState(false)
  // Registrant row expanded to full profile details
  const [expandedRegId, setExpandedRegId] = useState<string | null>(null)
  // List vs month-calendar view + which month the calendar shows
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calYm, setCalYm] = useState<{ y: number; m: number }>(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })
  const [calSelected, setCalSelected] = useState<CommunityEvent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: evs }, { data: regRows }, { data: partners }] = await Promise.all([
      supabase.from('community_events').select('*').order('event_date', { ascending: true }),
      supabase.from('event_registrations').select('event_id, status'),
      supabase.from('service_partners').select('*').eq('is_active', true).order('display_order'),
    ])
    setEvents((evs ?? []) as CommunityEvent[])
    const counter: Record<string, number> = {}
    for (const r of (regRows ?? []) as { event_id: string; status: string }[]) {
      if (r.status === 'registered' || r.status === 'attended') {
        counter[r.event_id] = (counter[r.event_id] ?? 0) + 1
      }
    }
    setCounts(counter)
    setVendors((partners ?? []) as ServicePartner[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT, event_date: todayLocalIso() })
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  function openEdit(ev: CommunityEvent) {
    setDraft({
      title: ev.title,
      emoji: ev.emoji ?? '🎉',
      event_type: ev.event_type ?? '',
      description: ev.description ?? '',
      event_date: ev.event_date,
      start_time: ev.start_time ? ev.start_time.slice(0, 5) : '',
      end_time: ev.end_time ? ev.end_time.slice(0, 5) : '',
      location: ev.location ?? '',
      location_link: ev.location_link ?? '',
      capacity: ev.capacity != null ? String(ev.capacity) : '',
      price: String(ev.price ?? 0),
      payment_link: ev.payment_link ?? '',
      vendor_id: ev.vendor_id ?? '',
      vendor_name: ev.vendor_name ?? '',
      is_active: ev.is_active,
    })
    setEditingId(ev.id)
    setError(null)
    setShowForm(true)
  }

  async function saveDraft() {
    if (!draft.title.trim()) { setError('חסרה כותרת לאירוע'); return }
    if (!draft.event_date) { setError('חסר תאריך'); return }
    const price = Number(draft.price) || 0
    if (price > 0 && !draft.payment_link.trim()) {
      setError('אירוע בתשלום חייב לינק תשלום')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      title: draft.title.trim(),
      emoji: draft.emoji.trim() || null,
      event_type: draft.event_type.trim() || null,
      description: draft.description.trim() || null,
      event_date: draft.event_date,
      start_time: draft.start_time || null,
      end_time: draft.end_time || null,
      location: draft.location.trim() || null,
      location_link: draft.location_link.trim() || null,
      capacity: draft.capacity ? Number(draft.capacity) : null,
      price,
      payment_link: draft.payment_link.trim() || null,
      vendor_id: draft.vendor_id || null,
      vendor_name: draft.vendor_name.trim() || null,
      is_active: draft.is_active,
      updated_at: new Date().toISOString(),
    }
    const q = editingId
      ? supabase.from('community_events').update(payload).eq('id', editingId)
      : supabase.from('community_events').insert(payload)
    const { error: err } = await q
    setSaving(false)
    if (err) { setError('שגיאה בשמירה — נסי שוב'); return }
    setShowForm(false)
    load()
  }

  async function reallyDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('community_events').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
  }

  async function publish(ev: CommunityEvent) {
    await supabase.from('community_events').update({ is_active: true }).eq('id', ev.id)
    load()
  }

  function requestDelete(ev: CommunityEvent) {
    if ((counts[ev.id] ?? 0) > 0) setPendingDelete(ev)
    else { setPendingDelete(null); supabase.from('community_events').delete().eq('id', ev.id).then(() => load()) }
  }

  async function openRegs(ev: CommunityEvent) {
    setRegsEvent(ev)
    setExpandedRegId(null)
    setRegsLoading(true)
    const { data } = await supabase
      .from('event_registrations')
      .select('id, user_id, status, paid, created_at, user_profiles(mother_name, phone_number, email, area, baby_name, baby_dob, community_bio, community_tags, staff_notes)')
      .eq('event_id', ev.id)
      .order('created_at')
    setRegs((data ?? []) as unknown as RegistrantRow[])
    setRegsLoading(false)
  }

  async function setRegStatus(reg: RegistrantRow, status: RegistrantRow['status']) {
    await supabase.from('event_registrations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reg.id)
    if (regsEvent) openRegs(regsEvent)
    load()
  }

  async function togglePaid(reg: RegistrantRow) {
    await supabase.from('event_registrations')
      .update({ paid: !reg.paid, updated_at: new Date().toISOString() })
      .eq('id', reg.id)
    if (regsEvent) openRegs(regsEvent)
  }

  const today = todayLocalIso()
  const upcoming = events.filter(e => e.event_date >= today)
  const past = events.filter(e => e.event_date < today).reverse()

  // Group upcoming by month
  const groups: { key: string; items: CommunityEvent[] }[] = []
  for (const ev of upcoming) {
    const [y, m] = ev.event_date.split('-').map(Number)
    const key = `${MONTHS_HE[m - 1]} ${y}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(ev)
    else groups.push({ key, items: [ev] })
  }

  // ── Calendar view helpers ──
  const eventsByDate: Record<string, CommunityEvent[]> = {}
  for (const ev of events) (eventsByDate[ev.event_date] ??= []).push(ev)
  const calFirstDow = new Date(calYm.y, calYm.m - 1, 1).getDay() // 0 = Sunday
  const calDays = new Date(calYm.y, calYm.m, 0).getDate()
  function calDateStr(day: number): string {
    return `${calYm.y}-${String(calYm.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function calMove(delta: number) {
    setCalYm(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
    })
    setCalSelected(null)
  }

  const inputCls = 'w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white'
  const labelCls = 'block text-xs font-semibold text-sand-600 mb-1'

  // Capacity bar — the question this screen answers: which event is
  // next, how many signed up, how many places are left.
  function capacityBlock(ev: CommunityEvent, count: number) {
    if (!ev.is_active) {
      return <p className="font-semibold" style={{ fontSize: 13, color: '#7B604C' }}>לא פורסם</p>
    }
    if (ev.capacity == null) {
      return (
        <div>
          <p style={{ fontSize: 13, color: '#7B604C' }}><span className="font-bold" style={{ color: '#443327', fontSize: 15 }}>{count}</span> נרשמו · ללא הגבלה</p>
          <div className="mt-1 rounded-full" style={{ height: 8, background: '#F0EBE3' }}>
            <div className="rounded-full h-full" style={{ width: '30%', background: '#C6BDA0', opacity: 0.5 }} />
          </div>
        </div>
      )
    }
    const left = ev.capacity - count
    const ratio = Math.min(count / ev.capacity, 1)
    const fill = left <= 0 ? '#A35C3D' : ratio >= 0.5 ? '#C8A460' : '#C6BDA0'
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold" style={{ fontSize: 15, color: '#443327' }}>{count} מתוך {ev.capacity}</p>
          <p className="font-bold whitespace-nowrap" style={{ fontSize: 13, color: left <= 3 ? '#8B4A30' : '#7B604C' }}>
            {left <= 0 ? 'מלא' : `${left} נותרו`}
          </p>
        </div>
        <div className="mt-1 rounded-full overflow-hidden" style={{ height: 8, background: '#F0EBE3' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: fill }} />
        </div>
      </div>
    )
  }

  function eventRow(ev: CommunityEvent, faded: boolean) {
    const count = counts[ev.id] ?? 0
    const d = new Date(ev.event_date + 'T12:00:00')
    const isDraft = !ev.is_active
    const missingLink = ev.is_active && ev.price > 0 && !ev.payment_link
    return (
      <div
        key={ev.id}
        className={faded ? 'opacity-60' : ''}
        style={isDraft
          ? { background: '#F8F4EC', border: '1px dashed #C6BDA0', borderRadius: 20, padding: '16px 18px', opacity: 0.82 }
          : { background: '#fff', border: '1px solid #E4DAD0', borderRadius: 20, padding: '16px 18px' }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          {/* Date block */}
          <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: 62, background: '#F6ECD8', borderRadius: 14, padding: '9px 0' }}>
            <span className="font-bold" style={{ fontSize: 24, lineHeight: 1, color: '#4A3A28' }}>{d.getDate()}</span>
            <span className="font-semibold mt-0.5" style={{ fontSize: 13, color: '#6E5836' }}>{weekdayHe(ev.event_date)}</span>
          </div>

          {/* Title + meta */}
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold" style={{ fontSize: 17, color: '#443327' }}>{ev.emoji ? `${ev.emoji} ` : ''}{ev.title}</p>
              <span className="font-bold rounded-full whitespace-nowrap" style={{ fontSize: 12, padding: '3px 10px', ...(ev.price > 0 ? { background: '#F3E5E7', color: '#7E4E57' } : { background: '#F0EBE3', color: '#6E5836' }) }}>
                {ev.price > 0 ? `₪${ev.price}` : 'חינם'}
              </span>
              {missingLink && (
                <span className="font-semibold whitespace-nowrap" style={{ fontSize: 13, color: '#8B4A30' }}>חסר לינק תשלום</span>
              )}
            </div>
            <p className="font-semibold mt-0.5" style={{ fontSize: 14, color: '#7B604C' }}>
              {ev.start_time && `${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ''}`}
              {ev.location && ` · ${ev.location}`}
              {ev.vendor_name && ` · ${ev.vendor_name}`}
            </p>
          </div>

          {/* Capacity */}
          <div className="flex-shrink-0" style={{ width: 168 }}>
            {capacityBlock(ev, count)}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isDraft ? (
              <button onClick={() => publish(ev)} className="font-bold rounded-xl transition-all hover:brightness-95" style={{ background: '#C8A460', color: '#33281B', padding: '9px 14px', fontSize: 14 }}>
                פרסום
              </button>
            ) : (
              <button onClick={() => openRegs(ev)} className="font-bold rounded-xl transition-all hover:bg-sand-50" style={{ border: '1.5px solid #DCD4C8', color: '#7B604C', padding: '9px 14px', fontSize: 14 }}>
                נרשמות
              </button>
            )}
            <button onClick={() => openEdit(ev)} className="flex items-center justify-center rounded-xl transition-colors hover:brightness-95" style={{ width: 38, height: 38, background: '#F8F4EC' }} title="עריכה">
              <Pencil className="w-[17px] h-[17px]" style={{ color: '#7B604C' }} />
            </button>
            <button onClick={() => requestDelete(ev)} className="flex items-center justify-center rounded-xl text-sand-500 hover:text-red-500 hover:bg-red-50 transition-colors" style={{ width: 38, height: 38 }} title="מחיקה">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-sand-800" style={{ fontSize: 17 }}>אירועי קהילה</h2>
        <div className="flex items-center gap-2">
          {/* רשימה / יומן toggle */}
          <div className="flex bg-white border border-sand-200 rounded-2xl p-1 gap-1">
            {([['list', 'רשימה', List], ['calendar', 'יומן', CalendarDays]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${view === v ? 'shadow-sm' : 'text-sand-500'}`}
                style={view === v ? { background: '#E7C78A', color: '#4A3A28' } : {}}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold shadow-sm" style={{ background: '#C8A460', color: '#33281B' }}>
            <Plus className="w-4 h-4" /> אירוע חדש
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : view === 'list' ? (
        <>
          {upcoming.length === 0 && (
            <div className="bg-white rounded-2xl border border-sand-100 p-8 text-center text-sand-400 text-sm">
              אין אירועים קרובים — צרי את אירוע הקהילה הראשון
            </div>
          )}

          {groups.map(g => (
            <div key={g.key} className="space-y-2">
              <p className="text-xs font-bold text-sand-400">{g.key} · {g.items.length} אירועים</p>
              {g.items.map(ev => eventRow(ev, false))}
            </div>
          ))}

          {past.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowPast(v => !v)} className="text-xs font-semibold text-sand-400 underline">
                {showPast ? 'הסתרת אירועים שהסתיימו' : `הצגת אירועים שהסתיימו (${past.length})`}
              </button>
              {showPast && <div className="space-y-2 mt-2">{past.map(ev => eventRow(ev, true))}</div>}
            </div>
          )}
        </>
      ) : (
        /* ── Month calendar view ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white rounded-2xl border border-sand-100 px-3 py-2">
            <button onClick={() => calMove(-1)} className="p-1.5 rounded-xl text-sand-400 hover:bg-sand-50 transition-colors" title="חודש קודם">
              <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-sand-800">{MONTHS_HE[calYm.m - 1]} {calYm.y}</p>
            <button onClick={() => calMove(1)} className="p-1.5 rounded-xl text-sand-400 hover:bg-sand-50 transition-colors" title="חודש הבא">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-sand-100 p-3">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => (
                <div key={d} className="text-center text-[13px] font-bold text-sand-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calFirstDow }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                const ds = calDateStr(day)
                const dayEvents = eventsByDate[ds] ?? []
                const isToday = ds === todayLocalIso()
                return (
                  <div key={day} className={`min-h-[52px] rounded-xl p-1 text-center border ${isToday ? 'border-mustard-400 bg-mustard-50' : 'border-sand-50'}`}>
                    <p className={`text-[13px] font-bold ${isToday ? 'text-mustard-700' : 'text-sand-400'}`}>{day}</p>
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      {dayEvents.map(ev => (
                        <button key={ev.id} onClick={() => setCalSelected(cur => cur?.id === ev.id ? null : ev)} title={ev.title}
                          className={`w-full text-sm leading-none py-0.5 rounded-lg transition-all ${calSelected?.id === ev.id ? 'bg-mustard-100 ring-2 ring-mustard-300' : 'hover:bg-sand-50'} ${!ev.is_active ? 'opacity-40' : ''}`}>
                          {ev.emoji ?? '🎉'}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {calSelected
            ? eventRow(calSelected, false)
            : <p className="text-center text-xs text-sand-400">לחיצה על אירוע ביומן תציג את הפרטים והפעולות שלו כאן</p>}
        </div>
      )}

      {/* ── Create / edit modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-sand-100 flex items-center justify-between rounded-t-3xl">
              <h3 className="font-bold text-sand-800">{editingId ? 'עריכת אירוע' : 'אירוע חדש'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-sand-400" /></button>
            </div>
            <div className="p-5 space-y-4">

              {/* Type presets — quick fill */}
              {!editingId && (
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TYPE_PRESETS.map(p => (
                    <button key={p.label} type="button"
                      onClick={() => setDraft(d => ({ ...d, event_type: p.label, emoji: p.emoji, title: d.title || (p.label === 'אחר' ? '' : p.label) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${draft.event_type === p.label ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}>
                      {p.emoji} {p.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <div className="w-20">
                  <label className={labelCls}>אימוג'י</label>
                  <input value={draft.emoji} onChange={e => setDraft(d => ({ ...d, emoji: e.target.value }))} className={`${inputCls} text-center`} />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>כותרת האירוע *</label>
                  <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="למשל: הרצאה — שינה של תינוקות" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>תאריך *</label>
                  <input type="date" value={draft.event_date} onChange={e => setDraft(d => ({ ...d, event_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>שעת התחלה</label>
                  <input type="time" value={draft.start_time} onChange={e => setDraft(d => ({ ...d, start_time: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>שעת סיום</label>
                  <input type="time" value={draft.end_time} onChange={e => setDraft(d => ({ ...d, end_time: e.target.value }))} className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>מיקום</label>
                <input value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} placeholder="פארק הירקון / הסטודיו ברמת גן..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>לינק ניווט (Waze / Google Maps)</label>
                <input value={draft.location_link} onChange={e => setDraft(d => ({ ...d, location_link: e.target.value }))} dir="ltr" placeholder="https://..." className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>מקומות (ריק = ללא הגבלה)</label>
                  <input type="number" min="1" value={draft.capacity} onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))} placeholder="12" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>מחיר ₪ (0 = חינם)</label>
                  <input type="number" min="0" value={draft.price} onChange={e => setDraft(d => ({ ...d, price: e.target.value }))} className={inputCls} />
                </div>
              </div>

              {Number(draft.price) > 0 && (
                <div>
                  <label className={labelCls}>לינק תשלום *</label>
                  <input value={draft.payment_link} onChange={e => setDraft(d => ({ ...d, payment_link: e.target.value }))} dir="ltr" placeholder="https://..." className={inputCls} />
                </div>
              )}

              <div>
                <label className={labelCls}>ספק / מנחה (מרשימת השירותים)</label>
                <select value={draft.vendor_id} onChange={e => setDraft(d => ({ ...d, vendor_id: e.target.value }))} className={inputCls}>
                  <option value="">— ללא —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>או שם מנחה חופשי</label>
                <input value={draft.vendor_name} onChange={e => setDraft(d => ({ ...d, vendor_name: e.target.value }))} placeholder="למשל: ד״ר מיכל כהן" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>תיאור</label>
                <textarea rows={3} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="מה הולך להיות, מה להביא, למי זה מתאים..." className={`${inputCls} resize-none`} />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={draft.is_active} onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))} className="w-4 h-4 accent-mustard-500" />
                <span className="text-sm text-sand-700 font-medium">מוצג לאמהות באפליקציה</span>
              </label>

              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}

              <button onClick={saveDraft} disabled={saving} className="w-full py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40" style={{ background: '#E7C78A' }}>
                {saving ? 'שומרת...' : editingId ? 'עדכון האירוע' : 'יצירת האירוע'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Registrants modal ── */}
      {regsEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRegsEvent(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-sand-100 flex items-center justify-between rounded-t-3xl">
              <div>
                <h3 className="font-bold text-sand-800 text-sm">{regsEvent.emoji} {regsEvent.title}</h3>
                <p className="text-xs text-sand-400">{weekdayHe(regsEvent.event_date)} {ddmm(regsEvent.event_date)} · רשימת נרשמות</p>
              </div>
              <button onClick={() => setRegsEvent(null)}><X className="w-5 h-5 text-sand-400" /></button>
            </div>
            <div className="p-5 space-y-2">
              {regsLoading ? (
                <div className="text-center py-8">
                  <div className="w-7 h-7 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
                </div>
              ) : regs.length === 0 ? (
                <p className="text-center text-sand-400 text-sm py-8">עדיין אין נרשמות</p>
              ) : (
                regs.map(r => {
                  const name = r.user_profiles?.mother_name ?? r.user_profiles?.email ?? '—'
                  const phone = r.user_profiles?.phone_number
                  const cancelled = r.status === 'cancelled'
                  return (
                    <div key={r.id} className={`border border-sand-100 rounded-2xl p-3 ${cancelled ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpandedRegId(cur => cur === r.id ? null : r.id)}>
                        <ChevronDown className={`w-4 h-4 text-sand-300 flex-shrink-0 transition-transform ${expandedRegId === r.id ? 'rotate-180' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-sand-800 truncate">{name}</p>
                          <p className="text-[13px] text-sand-600">
                            {r.user_profiles?.baby_name && `${r.user_profiles.baby_name}`}
                            {r.user_profiles?.baby_dob && ` · ${getBabyAge(r.user_profiles.baby_dob)}`}
                            {(r.user_profiles?.baby_name || r.user_profiles?.baby_dob) && r.user_profiles?.area && ' · '}
                            {r.user_profiles?.area}
                            {!r.user_profiles?.baby_name && !r.user_profiles?.baby_dob && !r.user_profiles?.area && (phone ?? 'אין טלפון בפרופיל')}
                            {cancelled && ' · ביטלה'}
                          </p>
                        </div>
                        {regsEvent.price > 0 && !cancelled && (
                          <button onClick={e => { e.stopPropagation(); togglePaid(r) }}
                            className={`text-[13px] font-bold px-2 py-1 rounded-full border-2 transition-all ${r.paid ? 'border-green-300 bg-green-50 text-green-700' : 'border-sand-200 text-sand-400'}`}>
                            {r.paid ? '₪ שולם' : '₪ לא שולם'}
                          </button>
                        )}
                        {phone && (
                          <a href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '972')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      {!cancelled && (
                        <div className="flex gap-1.5 mt-2">
                          {([
                            ['registered', 'רשומה'],
                            ['attended', '✓ הגיעה'],
                            ['no_show', '✗ לא הגיעה'],
                          ] as [RegistrantRow['status'], string][]).map(([s, label]) => (
                            <button key={s} onClick={() => setRegStatus(r, s)}
                              className={`flex-1 py-1.5 rounded-xl text-[13px] font-bold border-2 transition-all ${r.status === s
                                ? s === 'no_show' ? 'border-red-300 bg-red-50 text-red-600' : s === 'attended' ? 'border-green-300 bg-green-50 text-green-700' : 'border-mustard-300 bg-mustard-50 text-mustard-700'
                                : 'border-sand-100 text-sand-400'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Expanded: full mom profile (tap the name to toggle) */}
                      {expandedRegId === r.id && (() => {
                        const p = r.user_profiles
                        const tags = (p?.community_tags ?? []).map(tagDef).filter((t): t is NonNullable<ReturnType<typeof tagDef>> => !!t)
                        return (
                          <div className="mt-2 pt-2 border-t border-sand-100 space-y-1.5 text-xs text-sand-600">
                            {(p?.baby_name || p?.baby_dob) && (
                              <p>👶 {p?.baby_name ?? 'תינוק/ת'}{p?.baby_dob ? ` · ${getBabyAge(p.baby_dob)}` : ''}</p>
                            )}
                            {p?.email && <p className="truncate">✉️ <span dir="ltr">{p.email}</span></p>}
                            {p?.community_bio && <p className="leading-relaxed">💬 {p.community_bio}</p>}
                            {tags.length > 0 && (
                              <p>🏷️ {tags.map(t => `${t.emoji} ${t.label}`).join(' · ')}</p>
                            )}
                            {p?.staff_notes && (
                              <p className="bg-amber-50 rounded-xl px-2.5 py-1.5 text-amber-800">📝 {p.staff_notes}</p>
                            )}
                            {!p?.baby_name && !p?.baby_dob && !p?.community_bio && tags.length === 0 && !p?.staff_notes && (
                              <p className="text-sand-400">היא עדיין לא מילאה פרטים בפרופיל הקהילה שלה</p>
                            )}
                            {phone && (
                              <div className="flex gap-2 pt-1">
                                <a href={`tel:${phone}`} className="flex-1 text-center py-1.5 rounded-xl bg-sand-50 font-bold text-sand-600">📞 חיוג</a>
                                <a href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '972')}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-1.5 rounded-xl bg-green-50 font-bold text-green-700">💬 WhatsApp</a>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm — only when registrations exist */}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete
          ? `האירוע "${pendingDelete.title}" (${counts[pendingDelete.id] ?? 0} הרשמות יימחקו איתו)`
          : 'האירוע'}
        title="מחיקת אירוע"
        busy={deletingBusy}
        onConfirm={reallyDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
