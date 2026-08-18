import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, X, XCircle, UserPlus, MessageCircle, CalendarDays, List, ChevronRight, ChevronLeft, ChevronDown, Link2, Copy, RefreshCw, ExternalLink, Check } from 'lucide-react'
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
  { label: 'יוגה',             emoji: '🧘🏼‍♀️' },
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
  payment_link_pair: string
  morning_product_id: string
  morning_product_id_pair: string
  vendor_id: string
  vendor_name: string
  is_active: boolean
}

const EMPTY_DRAFT: Draft = {
  title: '', emoji: '🎉', event_type: '', description: '',
  event_date: '', start_time: '', end_time: '',
  location: '', location_link: '', capacity: '', price: '0',
  payment_link: '', payment_link_pair: '', morning_product_id: '', morning_product_id_pair: '',
  vendor_id: '', vendor_name: '', is_active: true,
}

type OpenCredit = {
  id: string
  user_id: string
  mother_name: string
  phone_number: string | null
  amount: number
  event_title: string | null
  created_at: string
  expires_at: string
}

type RegistrantRow = {
  id: string
  user_id: string
  status: 'pending' | 'registered' | 'cancelled' | 'attended' | 'no_show'
  paid: boolean
  /** What she actually paid. The cancellation credit is this, not price x seats. */
  paid_amount: number | null
  /** She said she paid somewhere we cannot see it (Bit, cross-device).
   *  Needs Brenda's confirmation — it is a claim, not a payment. */
  payment_claimed_at: string | null
  guest_names: string[] | null
  substitute_name: string | null
  created_at: string
  user_profiles: {
    mother_name: string | null; phone_number: string | null; email: string; area: string | null
    baby_name: string | null; baby_dob: string | null; community_bio: string | null
    community_tags: string[] | null; staff_notes: string | null
  } | null
}

// A waiting row in the simple waitlist (event_waitlist, admin RLS).
type WaitlistRow = {
  id: string
  user_id: string
  status: string
  created_at: string
  user_profiles: { mother_name: string | null; phone_number: string | null } | null
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

export default function EventsAdminPanel({ openEditId, openRegsId }: { openEditId?: string; openRegsId?: string } = {}) {
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [vendors, setVendors] = useState<ServicePartner[]>([])
  // Vendor check-in link share modal (Phase 1 of the vendor flow).
  const [checkinEvent, setCheckinEvent] = useState<CommunityEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CommunityEvent | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  // Credits Brenda still owes. Opened automatically when a mother
  // cancels an event she had paid for, closed by hand when she gets a
  // seat somewhere else, because a Morning link cannot discount itself.
  const [credits, setCredits] = useState<OpenCredit[]>([])
  // Registrants drill-down
  // Which registration row is asking "sure?". Deleting a person off a
  // list is not undoable, so it never happens on a single tap.
  const [regToDelete, setRegToDelete] = useState<string | null>(null)
  const [regsEvent, setRegsEvent] = useState<CommunityEvent | null>(null)
  const [regs, setRegs] = useState<RegistrantRow[]>([])
  const [regsWaitlist, setRegsWaitlist] = useState<WaitlistRow[]>([])
  // Waiting count per event — for the "המתנה: N" chip and the
  // freed-spot alert on event rows.
  const [waitCounts, setWaitCounts] = useState<Record<string, number>>({})
  // Phase 6: attended count per event (past-event fill = attended/registered)
  // + which events already have a check-in link (state pill).
  const [attendedCounts, setAttendedCounts] = useState<Record<string, number>>({})
  const [checkinIds, setCheckinIds] = useState<Set<string>>(new Set())
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

  const loadWaitlistCounts = useCallback(async () => {
    const { data } = await supabase.from('event_waitlist').select('event_id').eq('status', 'waiting')
    const m: Record<string, number> = {}
    for (const w of (data ?? []) as { event_id: string }[]) m[w.event_id] = (m[w.event_id] ?? 0) + 1
    setWaitCounts(m)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    loadWaitlistCounts()
    loadCredits()
    const [{ data: evs }, { data: regRows }, { data: partners }, { data: toks }] = await Promise.all([
      supabase.from('community_events').select('*').order('event_date', { ascending: true }),
      supabase.from('event_registrations').select('event_id, status, guest_names'),
      supabase.from('service_partners').select('*').eq('is_active', true).order('display_order'),
      supabase.from('event_checkin_tokens').select('event_id'),
    ])
    setEvents((evs ?? []) as CommunityEvent[])
    // Seats, not rows. A mother who brings someone takes two places,
    // so counting registration rows would show a room as half empty
    // while people stand outside it.
    const counter: Record<string, number> = {}
    const attended: Record<string, number> = {}
    for (const r of (regRows ?? []) as { event_id: string; status: string; guest_names: string[] | null }[]) {
      const seats = 1 + (r.guest_names?.length ?? 0)
      if (r.status === 'registered' || r.status === 'attended') {
        counter[r.event_id] = (counter[r.event_id] ?? 0) + seats
      }
      if (r.status === 'attended') attended[r.event_id] = (attended[r.event_id] ?? 0) + seats
    }
    setCounts(counter)
    setAttendedCounts(attended)
    setCheckinIds(new Set(((toks ?? []) as { event_id: string }[]).map(t => t.event_id)))
    setVendors((partners ?? []) as ServicePartner[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Phase 3 (handoff §4): a home-screen task click opens the event it
  // points at, once per id.
  const openedFromTask = useRef<string | null>(null)
  useEffect(() => {
    if (!openEditId || events.length === 0 || openedFromTask.current === openEditId) return
    const ev = events.find(x => x.id === openEditId)
    if (ev) { openedFromTask.current = openEditId; openEdit(ev) }
  }, [openEditId, events])

  // Brenda 17.8.26: "when I come from the home screen and tap it, it sends
  // me to editing the event and not to the payment-confirmation screen."
  // A payment claim is decided in the registrants list, so that task opens
  // the list rather than the edit form.
  const openedRegsFromTask = useRef<string | null>(null)
  useEffect(() => {
    if (!openRegsId || events.length === 0 || openedRegsFromTask.current === openRegsId) return
    const ev = events.find(x => x.id === openRegsId)
    if (ev) { openedRegsFromTask.current = openRegsId; openRegs(ev) }
  }, [openRegsId, events]) // eslint-disable-line react-hooks/exhaustive-deps

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
      payment_link_pair: ev.payment_link_pair ?? '',
      morning_product_id: ev.morning_product_id ?? '',
      morning_product_id_pair: ev.morning_product_id_pair ?? '',
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
      payment_link_pair: draft.payment_link_pair.trim() || null,
      morning_product_id: draft.morning_product_id.trim() || null,
      morning_product_id_pair: draft.morning_product_id_pair.trim() || null,
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
    if (err) { setError('שגיאה בשמירה. נסי שוב'); return }
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
    const [{ data }, { data: wl }] = await Promise.all([
      supabase
        .from('event_registrations')
        .select('id, user_id, status, paid, paid_amount, payment_claimed_at, guest_names, substitute_name, created_at, user_profiles(mother_name, phone_number, email, area, baby_name, baby_dob, community_bio, community_tags, staff_notes)')
        .eq('event_id', ev.id)
        .order('created_at'),
      supabase
        .from('event_waitlist')
        .select('id, user_id, status, created_at, user_profiles(mother_name, phone_number)')
        .eq('event_id', ev.id)
        .eq('status', 'waiting')
        .order('created_at'),
    ])
    setRegs((data ?? []) as unknown as RegistrantRow[])
    setRegsWaitlist((wl ?? []) as unknown as WaitlistRow[])
    setRegsLoading(false)
  }

  // ── Brenda 18.8.26: "do I have all the control I need? The main thing
  //    in the app, at least at the start, is community registration."
  //
  //    Three things she could not do at all, each of which happens in a
  //    normal week: register a mother who paid by transfer or signed up
  //    over the phone; cancel someone's registration and say where the
  //    money went; and assign a payment the Morning webhook could not
  //    place. Delete was the only tool, and it erased the payment record
  //    without giving anything back. All three go through admin RPCs that
  //    reuse the same invariants as the mother-facing ones.
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<{ id: string; mother_name: string | null; email: string; phone_number: string | null }[]>([])
  const [addPick, setAddPick] = useState<{ id: string; mother_name: string | null; email: string } | null>(null)
  // Unticked by default: a pre-ticked box on a form she just opened is
  // the app asserting a payment nobody confirmed.
  const [addPaid, setAddPaid] = useState(false)
  const [addAmount, setAddAmount] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  // Which registrant is showing the cancel choices, if any.
  const [cancelReg, setCancelReg] = useState<string | null>(null)

  useEffect(() => {
    // PostgREST's .or() is a comma-separated grammar, so a comma or a
    // bracket typed into the box does not search for that character — it
    // ends the clause. "כהן, שרה" returned a 400.
    const q = addSearch.trim().replace(/[,()*\\]/g, ' ').trim()
    if (q.length < 2) { setAddResults([]); return }
    const t = setTimeout(() => {
      supabase.from('user_profiles')
        .select('id, mother_name, email, phone_number')
        .or(`mother_name.ilike.%${q}%,email.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8)
        .then(({ data }) => setAddResults(data ?? []))
    }, 250)
    return () => clearTimeout(t)
  }, [addSearch])

  async function addRegistrant() {
    if (!regsEvent || !addPick || addBusy) return
    setAddBusy(true)
    const { data, error } = await supabase.rpc('admin_register_for_event', {
      p_event_id: regsEvent.id,
      p_user_id: addPick.id,
      p_guest_names: [],
      // A free event renders no checkbox, so it must not carry one.
      p_paid: regsEvent.price > 0 ? addPaid : false,
      p_amount: addAmount.trim() ? Number(addAmount) : null,
      p_note: null,
    })
    setAddBusy(false)
    if (error || data !== 'ok') { alert(`לא הצלחנו להוסיף: ${error?.message ?? data}`); return }
    setAddOpen(false); setAddPick(null); setAddSearch(''); setAddAmount('')
    openRegs(regsEvent); load()
  }

  /** outcome: 'none' | 'credit' | 'refund' — see admin_cancel_registration. */
  async function adminCancel(reg: RegistrantRow, outcome: 'none' | 'credit' | 'refund') {
    if (!regsEvent) return
    const { data, error } = await supabase.rpc('admin_cancel_registration', {
      p_event_id: regsEvent.id, p_user_id: reg.user_id, p_outcome: outcome, p_note: null,
    })
    if (error) { alert(`לא הצלחנו לבטל: ${error.message}`); return }
    setCancelReg(null)
    if (data === 'cancelled_refund_due') alert('ההרשמה בוטלה. נוספה לך משימה להחזיר את הכסף ב-Morning.')
    openRegs(regsEvent); load()
  }

  // Simple waitlist admin actions: remove from line, or convert (adds a
  // registration — the DB trigger flips the waitlist row to converted).
  async function removeFromWaitlist(w: WaitlistRow) {
    await supabase.from('event_waitlist').update({ status: 'removed', updated_at: new Date().toISOString() }).eq('id', w.id)
    if (regsEvent) openRegs(regsEvent)
    loadWaitlistCounts()
  }

  async function convertFromWaitlist(w: WaitlistRow) {
    if (!regsEvent) return
    await supabase.from('event_registrations').upsert(
      { event_id: regsEvent.id, user_id: w.user_id, status: 'registered', paid: false },
      { onConflict: 'event_id,user_id' },
    )
    openRegs(regsEvent)
    load()
    loadWaitlistCounts()
  }

  async function setRegStatus(reg: RegistrantRow, status: RegistrantRow['status']) {
    await supabase.from('event_registrations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reg.id)
    if (regsEvent) openRegs(regsEvent)
    load()
  }

  // A real delete and not a cancel. Yahav 12.8.26: someone registered
  // under the old rules and he wants her off the list, not filed under
  // "cancelled". The seat comes back either way.
  async function deleteReg(reg: RegistrantRow) {
    await supabase.from('event_registrations').delete().eq('id', reg.id)
    setRegToDelete(null)
    if (regsEvent) openRegs(regsEvent)
    load()
  }

  // Cancellation-credit window (global_settings.credit_cancel_hours).
  const [cancelHours, setCancelHours] = useState('48')
  const [savingHours, setSavingHours] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)

  useEffect(() => {
    supabase.from('global_settings').select('setting_value')
      .eq('setting_key', 'credit_cancel_hours').maybeSingle()
      .then(({ data }) => { if (data?.setting_value) setCancelHours(data.setting_value) })
  }, [])

  async function saveCancelHours() {
    const n = Number(cancelHours)
    if (!Number.isFinite(n) || n < 0) return
    setSavingHours(true)
    await supabase.from('global_settings').upsert(
      { setting_key: 'credit_cancel_hours', setting_value: String(Math.round(n)),
        setting_type: 'number', category: 'community',
        description: 'עד כמה שעות לפני האירוע ביטול עדיין מזכה בזיכוי' },
      { onConflict: 'setting_key' },
    )
    setSavingHours(false)
    setHoursSaved(true)
    setTimeout(() => setHoursSaved(false), 2000)
  }

  async function loadCredits() {
    const { data } = await supabase.rpc('get_open_credits')
    setCredits((data ?? []) as OpenCredit[])
  }

  async function closeCredit(c: OpenCredit) {
    await supabase.from('community_credits')
      .update({ used_at: new Date().toISOString(), used_note: 'סומן כמומש בניהול' })
      .eq('id', c.id)
    loadCredits()
  }

  async function togglePaid(reg: RegistrantRow) {
    const nowPaid = !reg.paid
    const seats = 1 + (reg.guest_names?.length ?? 0)
    await supabase.from('event_registrations')
      .update({
        paid: nowPaid,
        // Recording the amount matters: a cancellation refunds paid_amount,
        // so a payment confirmed by hand without one would credit ₪0.
        paid_amount: nowPaid ? (reg.paid_amount ?? (regsEvent?.price ?? 0) * seats) : null,
        paid_at: nowPaid ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id)
    if (regsEvent) openRegs(regsEvent)
  }

  /** Brenda 17.8.26, after paying by Bit and never reaching the thank-you
   *  page: the mother declares the payment, and this is where it becomes
   *  real. Confirming registers her and records the amount; rejecting
   *  clears the claim and drops her back to owing payment. */
  async function resolveClaim(reg: RegistrantRow, confirmed: boolean) {
    const seats = 1 + (reg.guest_names?.length ?? 0)
    await supabase.from('event_registrations')
      .update(confirmed
        ? {
            status: 'registered', paid: true,
            paid_amount: reg.paid_amount ?? (regsEvent?.price ?? 0) * seats,
            paid_at: new Date().toISOString(),
            payment_claimed_at: null, hold_expires_at: null,
            updated_at: new Date().toISOString(),
          }
        : { payment_claimed_at: null, updated_at: new Date().toISOString() })
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
    // Phase 6: check-in state, derived from event_checkin_tokens +
    // attendance. Past links genuinely don't open (the RPC only answers
    // day-before → day-after), so a past event shows a CLOSED state.
    const isPast = ev.event_date < todayLocalIso()
    const attended = attendedCounts[ev.id] ?? 0
    const checkinPill = isPast
      ? (attended > 0
          ? { text: `צ'ק-אין הושלם · ${attended}/${count}`, color: '#4F5040', bg: '#EDEDE6' }
          : count > 0
            ? { text: 'לא סומנה נוכחות', color: '#8B4A30', bg: '#F7EBE4' }
            : null)
      : (checkinIds.has(ev.id)
          ? { text: 'קישור צ\'ק-אין נוצר', color: '#4F5040', bg: '#EDEDE6' }
          : ev.is_active
            ? { text: 'אין קישור צ\'ק-אין', color: '#8B4A30', bg: '#F7EBE4' }
            : null)
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
              {checkinPill && (
                <span className="font-bold rounded-full whitespace-nowrap" style={{ fontSize: 12, padding: '3px 10px', background: checkinPill.bg, color: checkinPill.color }}>
                  {checkinPill.text}
                </span>
              )}
              {isPast && (
                <span className="font-bold rounded-full whitespace-nowrap" style={{ fontSize: 12, padding: '3px 10px', background: '#F1EBE1', color: '#A2937D' }}>
                  הסתיים
                </span>
              )}
              {(waitCounts[ev.id] ?? 0) > 0 && (
                ev.capacity != null && count < ev.capacity && ev.event_date >= todayLocalIso() ? (
                  /* A spot freed while moms are waiting — reach out to the
                     first in line (list inside נרשמות) */
                  <span className="font-bold rounded-full whitespace-nowrap" style={{ fontSize: 12, padding: '3px 10px', background: '#A35C3D', color: '#fff' }}>
                    🔔 התפנה מקום · {waitCounts[ev.id]} ממתינות
                  </span>
                ) : (
                  <span className="font-bold rounded-full whitespace-nowrap" style={{ fontSize: 12, padding: '3px 10px', background: '#E4EBEF', color: '#3E5966' }}>
                    ⏳ המתנה: {waitCounts[ev.id]}
                  </span>
                )
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
            {!isDraft && (
              <button onClick={() => setCheckinEvent(ev)} className="flex items-center justify-center rounded-xl transition-colors hover:brightness-95" style={{ width: 38, height: 38, background: '#F8F4EC' }} title="קישור צ'ק-אין לספק">
                <Link2 className="w-[17px] h-[17px]" style={{ color: '#7B604C' }} />
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
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-bold text-sand-800" style={{ fontSize: 17 }}>אירועי קהילה</h2>
        <div className="flex items-center gap-2">
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold shadow-sm" style={{ background: '#C8A460', color: '#33281B' }}>
            <Plus className="w-4 h-4" /> אירוע חדש
          </button>
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
        </div>
      </div>

      {/* Brenda 17.8.26: "I need control from the admin for these things —
          in the end there are registrations and cancellations here." The
          credit window lives in global_settings so it moves without a
          deploy. Cancelling is always allowed; this only decides how late
          a cancellation still earns the money back. */}
      <div className="bg-white rounded-3xl p-4 shadow-sm">
        <label className="block text-xs font-bold text-sand-700 mb-1.5">
          ⏳ זיכוי על ביטול, עד כמה שעות לפני האירוע
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} inputMode="numeric"
            value={cancelHours}
            onChange={e => setCancelHours(e.target.value)}
            className="w-24 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
          />
          <button
            onClick={saveCancelHours}
            disabled={savingHours}
            className="px-4 py-2 rounded-xl text-sm font-bold text-[#4A3A28] disabled:opacity-40"
            style={{ background: '#E7C78A' }}
          >
            {savingHours ? 'שומר...' : 'שמירה'}
          </button>
          {hoursSaved && <span className="text-xs font-bold text-green-600">נשמר ✓</span>}
        </div>
        <p className="text-[11px] text-sand-400 mt-1.5 leading-relaxed">
          ביטול תמיד אפשרי. אחרי החלון הזה ההרשמה מתבטלת והמקום מתפנה, אבל בלי זיכוי.
        </p>
      </div>

      {credits.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sand-800" style={{ fontSize: 15 }}>זיכויים פתוחים</h3>
            <span className="text-[13px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#EADBDD', color: '#5E4938' }}>
              {credits.length}
            </span>
          </div>
          <p className="text-xs text-sand-500">
            ביטלו אחרי שכבר שילמו. הכסף נשאר אצלנו והן אמורות לקבל מקום באירוע אחר. אין דרך לתת את זה אוטומטית, אז זה יושב כאן עד שתסמן מומש.
          </p>
          {credits.map(c => (
            <div key={c.id} className="flex items-center gap-2 border border-sand-100 rounded-2xl p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sand-800 truncate">{c.mother_name} · ₪{c.amount}</p>
                <p className="text-[13px] text-sand-500 truncate">
                  {c.event_title ?? 'אירוע שנמחק'} · בתוקף עד {ddmm(c.expires_at.slice(0, 10))}
                </p>
              </div>
              {c.phone_number && (
                <a href={`https://wa.me/${c.phone_number.replace(/\D/g, '').replace(/^0/, '972')}`} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="WhatsApp">
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              <button onClick={() => closeCredit(c)}
                className="px-3 py-1.5 rounded-xl text-[13px] font-bold border-2 border-sand-200 text-sand-600 hover:border-green-300 hover:text-green-700 transition-all">
                מומש
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : view === 'list' ? (
        <>
          {upcoming.length === 0 && (
            <div className="bg-white rounded-2xl border border-sand-100 p-8 text-center text-sand-400 text-sm">
              אין אירועים קרובים. צרי את אירוע הקהילה הראשון
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
                  <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="למשל: הרצאה על שינה של תינוקות" className={inputCls} />
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
                <>
                <div>
                  <label className={labelCls}>לינק תשלום *</label>
                  <input value={draft.payment_link} onChange={e => setDraft(d => ({ ...d, payment_link: e.target.value }))} dir="ltr" placeholder="https://..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>קישור תשלום לשתיים</label>
                  <input value={draft.payment_link_pair} onChange={e => setDraft(d => ({ ...d, payment_link_pair: e.target.value }))} dir="ltr" placeholder="https://..." className={inputCls} />
                  <p style={{ fontSize: 12, color: '#A2937D', marginTop: 4 }}>
                    לינק Morning בסכום כפול. אמא שמביאה מישהי איתה תגיע אליו במקום לשלם פעמיים. בלעדיו האפליקציה תגיד לה לעבור בקישור הרגיל פעמיים.
                  </p>
                </div>

                {/* Brenda 17.8.26: this is what lets Bit come back. With the
                    product id here, Morning tells the server directly that
                    the payment happened — the browser no longer has to come
                    home for a seat to be confirmed. Without it the event
                    still works, it just depends on the thank-you page. */}
                <div className="rounded-xl p-3" style={{ background: '#FAF7F1' }}>
                  <label className={labelCls}>מזהה מוצר ב-Morning (productId)</label>
                  <input value={draft.morning_product_id} onChange={e => setDraft(d => ({ ...d, morning_product_id: e.target.value }))} dir="ltr" placeholder="למשל 4f2c…" className={inputCls} />
                  <label className={labelCls} style={{ marginTop: 8 }}>מזהה המוצר של הקישור לשתיים</label>
                  <input value={draft.morning_product_id_pair} onChange={e => setDraft(d => ({ ...d, morning_product_id_pair: e.target.value }))} dir="ltr" placeholder="אם יש קישור לשתיים" className={inputCls} />
                  <p style={{ fontSize: 12, color: '#A2937D', marginTop: 6, lineHeight: 1.5 }}>
                    עם המזהה הזה מורנינג מודיעה לנו ישירות שהתשלום עבר, גם אם האמא סגרה את הדפדפן או שילמה בביט.
                    בלעדיו ההרשמה תאושר רק אם היא חוזרת לדף התודה.
                  </p>
                </div>
                </>
              )}

              <div>
                <label className={labelCls}>ספק / מנחה (מרשימת השירותים)</label>
                <select value={draft.vendor_id} onChange={e => setDraft(d => ({ ...d, vendor_id: e.target.value }))} className={inputCls}>
                  <option value="">ללא</option>
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
              {/* Register a mother by hand. There was no way to do this at
                  all, and it is a normal week: she paid by transfer, or
                  signed up on the phone, or is the friend of someone who
                  already registered. Capacity is not enforced — Brenda
                  adding someone IS the decision to make room. */}
              {!regsLoading && (
                addOpen ? (
                  <div className="rounded-2xl p-3 space-y-2.5 mb-1" style={{ background: '#FAF7F1', border: '1px solid #E8DFCB' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-bold" style={{ color: '#5E4938' }}>הוספת נרשמת</p>
                      <button onClick={() => { setAddOpen(false); setAddPick(null); setAddSearch('') }}>
                        <X className="w-4 h-4 text-sand-400" />
                      </button>
                    </div>
                    {addPick ? (
                      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-sand-200">
                        <span className="flex-1 text-[13px] font-semibold text-sand-800">
                          {addPick.mother_name || addPick.email}
                        </span>
                        <button onClick={() => setAddPick(null)} className="text-[12px] font-bold text-sand-500 underline">
                          החלפה
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={addSearch}
                          onChange={e => setAddSearch(e.target.value)}
                          placeholder="חיפוש לפי שם, מייל או טלפון"
                          className="w-full px-3 py-2 rounded-xl text-[13px] border-2 border-sand-200 focus:outline-none focus:border-mustard-400"
                        />
                        {addResults.length > 0 && (
                          <div className="space-y-1 max-h-44 overflow-y-auto">
                            {addResults.map(u => (
                              <button key={u.id} onClick={() => setAddPick(u)}
                                className="w-full text-right rounded-xl bg-white px-3 py-2 border border-sand-200 hover:border-mustard-300">
                                <span className="block text-[13px] font-semibold text-sand-800">{u.mother_name || '(בלי שם)'}</span>
                                <span className="block text-[12px] text-sand-500">{u.email}{u.phone_number ? ` · ${u.phone_number}` : ''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {addSearch.trim().length >= 2 && addResults.length === 0 && (
                          <p className="text-[12px] text-sand-500">
                            לא נמצאה. אפשר להוסיף רק מישהי שכבר פתחה חשבון באפליקציה.
                          </p>
                        )}
                      </>
                    )}
                    {regsEvent.price > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-[13px] text-sand-700 cursor-pointer">
                          <input type="checkbox" checked={addPaid} onChange={e => setAddPaid(e.target.checked)}
                            className="w-4 h-4 rounded accent-mustard-500" />
                          שילמה
                        </label>
                        {addPaid && (
                          <input
                            value={addAmount}
                            onChange={e => setAddAmount(e.target.value.replace(/[^\d.]/g, ''))}
                            placeholder={`₪${regsEvent.price}`}
                            inputMode="decimal"
                            className="w-24 px-3 py-1.5 rounded-xl text-[13px] border-2 border-sand-200 focus:outline-none focus:border-mustard-400"
                          />
                        )}
                      </div>
                    )}
                    <button onClick={addRegistrant} disabled={!addPick || addBusy}
                      className="w-full py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-40"
                      style={{ background: '#818267' }}>
                      {addBusy ? 'מוסיפה…' : 'הוספה לרשימה'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setAddOpen(true); setAddPick(null); setAddSearch(''); setAddAmount(''); setAddPaid(false) }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-bold mb-1"
                    style={{ background: '#F6ECD8', color: '#8A6A2F' }}>
                    <UserPlus className="w-4 h-4" /> הוספת נרשמת ידנית
                  </button>
                )
              )}
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
                            {r.status === 'pending' && !r.payment_claimed_at && ' · באמצע תשלום'}
                            {r.paid && r.paid_amount != null && ` · שילמה ₪${Number(r.paid_amount)}`}
                            {r.substitute_name && ` · במקומה מגיעה ${r.substitute_name}`}
                          </p>
                          {/* guest_names was fetched, counted into the seat
                              maths, and never shown — so the room was fuller
                              than the list of names and Brenda could not see
                              who the extra person was. */}
                          {(r.guest_names?.length ?? 0) > 0 && (
                            <p className="text-[13px]" style={{ color: '#8A6A2F' }}>
                              מגיעה עם {(r.guest_names ?? []).join(', ')}
                            </p>
                          )}
                          {/* A declared payment we could not observe. It sits
                              here until Brenda confirms it — never auto-
                              approved, or a claim becomes a free seat. */}
                          {r.payment_claimed_at && !r.paid && (
                            <div className="mt-1.5 rounded-xl p-2" style={{ background: '#F6ECD8' }} onClick={e => e.stopPropagation()}>
                              <p className="text-[12px] font-bold" style={{ color: '#8A6A2F' }}>
                                אמרה ששילמה (ביט / העברה) · {new Date(r.payment_claimed_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                              </p>
                              <div className="flex gap-1.5 mt-1.5">
                                <button onClick={() => resolveClaim(r, true)}
                                  className="flex-1 py-1.5 rounded-lg text-[12px] font-bold text-white" style={{ background: '#818267' }}>
                                  אישור התשלום
                                </button>
                                <button onClick={() => resolveClaim(r, false)}
                                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-white text-sand-600 border border-sand-200">
                                  לא התקבל
                                </button>
                              </div>
                            </div>
                          )}
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
                        {!cancelled && (
                          <button onClick={e => { e.stopPropagation(); setCancelReg(cur => cur === r.id ? null : r.id) }}
                            className="p-2 rounded-xl text-sand-400 hover:bg-mustard-50 hover:text-mustard-700 transition-colors"
                            title="ביטול ההרשמה">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); setRegToDelete(cur => cur === r.id ? null : r.id) }}
                          className="p-2 rounded-xl text-sand-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="מחיקת ההרשמה">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Cancelling is not deleting. Deleting erases the fact
                          that she paid; cancelling releases the seat and
                          makes Brenda say where the money went. */}
                      {cancelReg === r.id && (
                        <div className="mt-2 rounded-2xl p-3 space-y-2" onClick={e => e.stopPropagation()} style={{ background: '#FAF7F1' }}>
                          <p className="text-[13px] font-bold" style={{ color: '#5E4938' }}>
                            ביטול ההרשמה של {name}
                            {r.paid && r.paid_amount != null && ` · שילמה ₪${Number(r.paid_amount)}`}
                          </p>
                          {r.paid && Number(r.paid_amount ?? 0) > 0 ? (
                            <>
                              <p className="text-[12px]" style={{ color: '#8C6E63' }}>
                                מה קורה עם הכסף? החזר כספי מגיע לה בביטול כדין; זיכוי הוא מסלול נוח נוסף.
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => adminCancel(r, 'refund')}
                                  className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white" style={{ background: '#A35C3D' }}>
                                  ביטול + החזר כספי
                                </button>
                                <button onClick={() => adminCancel(r, 'credit')}
                                  className="flex-1 py-2 rounded-xl text-[12px] font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
                                  ביטול + זיכוי
                                </button>
                                <button onClick={() => adminCancel(r, 'none')}
                                  className="px-3 py-2 rounded-xl text-[12px] font-bold bg-white text-sand-600 border border-sand-200">
                                  בלי החזר
                                </button>
                              </div>
                            </>
                          ) : (
                            <button onClick={() => adminCancel(r, 'none')}
                              className="w-full py-2 rounded-xl text-[12px] font-bold text-white" style={{ background: '#818267' }}>
                              ביטול ההרשמה
                            </button>
                          )}
                          <button onClick={() => setCancelReg(null)}
                            className="w-full py-1.5 rounded-xl text-[12px] font-semibold text-sand-500">
                            סגירה
                          </button>
                        </div>
                      )}
                      {regToDelete === r.id && (
                        <div className="flex items-center gap-2 mt-2 rounded-2xl px-3 py-2" style={{ background: '#FDF3F1' }}>
                          <p className="flex-1 text-[13px] font-semibold" style={{ color: '#A35C3D' }}>
                            למחוק את {name} מהרשימה? המקום יתפנה ואי אפשר לבטל את זה.
                          </p>
                          <button onClick={e => { e.stopPropagation(); deleteReg(r) }}
                            className="px-3 py-1.5 rounded-xl text-[13px] font-bold text-white"
                            style={{ background: '#A35C3D' }}>
                            מחיקה
                          </button>
                          <button onClick={e => { e.stopPropagation(); setRegToDelete(null) }}
                            className="px-3 py-1.5 rounded-xl text-[13px] font-bold text-sand-600 bg-white border border-sand-200">
                            ביטול
                          </button>
                        </div>
                      )}
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
                              <p>👶🏼 {p?.baby_name ?? 'תינוק/ת'}{p?.baby_dob ? ` · ${getBabyAge(p.baby_dob)}` : ''}</p>
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

              {/* ── Waitlist — ordered by join time. When a spot frees,
                  message the first in line (prefilled WhatsApp) or add
                  her directly; converting/removing keeps the order. ── */}
              {!regsLoading && regsWaitlist.length > 0 && (() => {
                const regCount = regs.filter(r => r.status === 'registered' || r.status === 'attended').length
                const hasFreeSpot = regsEvent.capacity != null && regCount < regsEvent.capacity
                return (
                  <div className="pt-3 mt-3 border-t border-sand-100 space-y-2">
                    <p className="text-sm font-bold text-sand-700">⏳ רשימת המתנה ({regsWaitlist.length})</p>
                    {hasFreeSpot && (
                      <p className="text-[13px] font-bold rounded-xl px-3 py-2" style={{ background: '#F9EDE7', color: '#8B4A30' }}>
                        🔔 יש מקום פנוי. שלחי הודעה לראשונה בתור או הוסיפי אותה ישירות
                      </p>
                    )}
                    {regsWaitlist.map((w, idx) => {
                      const name = w.user_profiles?.mother_name ?? '—'
                      const phone = w.user_profiles?.phone_number
                      const waText = `היי ${name.split(' ')[0]}! התפנה מקום ב"${regsEvent.title}" (${weekdayHe(regsEvent.event_date)} ${ddmm(regsEvent.event_date)}${regsEvent.start_time ? ` בשעה ${regsEvent.start_time.slice(0, 5)}` : ''}) ואת הבאה בתור 🤎 אפשר להירשם עכשיו באפליקציה: https://mimo-baby.co.il`
                      return (
                        <div key={w.id} className="flex items-center gap-2 border border-sand-100 rounded-2xl p-3">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0" style={{ background: '#F4EDE1', color: '#6E5836' }}>{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-sand-800 truncate">{name}</p>
                            <p className="text-[13px] text-sand-500">הצטרפה {ddmm(w.created_at.slice(0, 10))}</p>
                          </div>
                          {phone && (
                            <a href={`https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '972')}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
                              className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="הודעה שהתפנה מקום">
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                          <button onClick={() => convertFromWaitlist(w)}
                            className="text-[13px] font-bold px-2.5 py-1.5 rounded-xl border-2 border-mustard-300 bg-mustard-50 text-mustard-700"
                            title="הוספה כנרשמה">
                            + הוספה
                          </button>
                          <button onClick={() => removeFromWaitlist(w)} className="p-1.5 text-sand-300 hover:text-red-400 transition-colors" title="הסרה מהרשימה">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Vendor check-in link — copy / WhatsApp to vendor / regenerate */}
      {checkinEvent && (
        <CheckinShareModal
          ev={checkinEvent}
          vendors={vendors}
          onClose={() => setCheckinEvent(null)}
        />
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

// ─── Vendor check-in link share ───────────────────────────────────────────────
// Creates (or fetches) the event's secure check-in token and offers:
// copy link, send to the vendor's WhatsApp (or a free-choice WhatsApp
// share when the event has no vendor phone), open the page, and
// regenerate (revokes the old link). The token lives in the admin-only
// event_checkin_tokens table; the public page is /?checkin=<token>.

function normalizeIlWa(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return digits
}

function CheckinShareModal({ ev, vendors, onClose }: { ev: CommunityEvent; vendors: ServicePartner[]; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)

  const load = useCallback(async () => {
    // Create if missing, then read. ignoreDuplicates keeps an existing
    // token stable (so a link already sent to the vendor stays valid).
    await supabase.from('event_checkin_tokens').upsert(
      { event_id: ev.id }, { onConflict: 'event_id', ignoreDuplicates: true },
    )
    const { data } = await supabase.from('event_checkin_tokens').select('token').eq('event_id', ev.id).maybeSingle()
    setToken(data?.token ?? null)
  }, [ev.id])
  useEffect(() => { load() }, [load])

  async function regenerate() {
    setRegenBusy(true)
    await supabase.from('event_checkin_tokens').update({ token: crypto.randomUUID() }).eq('event_id', ev.id)
    await load()
    setRegenBusy(false)
  }

  const link = token ? `${window.location.origin}/?checkin=${token}` : ''
  const vendor = ev.vendor_id ? vendors.find(v => v.id === ev.vendor_id) : undefined
  const vendorPhone = vendor?.whatsapp_number ? normalizeIlWa(vendor.whatsapp_number) : null
  const greetName = ev.vendor_name || vendor?.title || ''
  const waMessage =
    `היי${greetName ? ` ${greetName}` : ''}! מצרפים את קישור הצ'ק-אין לאירוע "${ev.title}" בתאריך ${ddmm(ev.event_date)}` +
    (ev.start_time ? ` בשעה ${ev.start_time.slice(0, 5)}` : '') +
    `. ביום האירוע פשוט פותחים את הקישור ומסמנים מי הגיעה:\n${link}\n\nתודה! 🤍 מימו`
  const waHref = vendorPhone
    ? `https://wa.me/${vendorPhone}?text=${encodeURIComponent(waMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(waMessage)}`

  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-sand-800" style={{ fontSize: 17 }}>קישור צ'ק-אין לספק</h3>
            <p className="text-sm text-sand-500 mt-0.5">{ev.emoji ? `${ev.emoji} ` : ''}{ev.title} · {ddmm(ev.event_date)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-sand-50 flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4 text-sand-600" />
          </button>
        </div>

        <p className="text-[13px] leading-relaxed text-sand-500">
          מי שמקבל את הקישור רואה את רשימת השמות הפרטיים בלבד ומסמן מי הגיעה, בלי חשבון ובלי סיסמה.
          הקישור פעיל מיום לפני האירוע ועד יום אחריו. מי שלא תסומן תיסגר אוטומטית כ"לא הגיעה" למחרת.
        </p>

        {token === null ? (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-sand-50 rounded-xl px-3 py-2.5">
              <span className="flex-1 text-xs text-sand-600 truncate" dir="ltr">{link}</span>
              <button onClick={copyLink} className="flex items-center gap-1 text-xs font-bold flex-shrink-0" style={{ color: '#8A6A2F' }}>
                {copied ? <><Check className="w-3.5 h-3.5" /> הועתק</> : <><Copy className="w-3.5 h-3.5" /> העתקה</>}
              </button>
            </div>

            <div className="flex gap-2">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-musgo-500 hover:bg-musgo-600 text-white font-bold py-3 rounded-2xl text-sm transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                {vendorPhone ? `וואטסאפ ל${greetName || 'ספק'}` : 'שיתוף בוואטסאפ'}
              </a>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 font-bold py-3 px-4 rounded-2xl text-sm"
                style={{ background: '#F6ECD8', color: '#6E5836' }}
              >
                <ExternalLink className="w-4 h-4" /> פתיחה
              </a>
            </div>
            {!vendorPhone && ev.vendor_id && (
              <p className="text-xs text-amber-700">לספק אין מספר וואטסאפ בכרטיס הספק, אז השיתוף ייפתח לבחירת איש קשר.</p>
            )}

            <button
              onClick={regenerate}
              disabled={regenBusy}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-sand-400 hover:text-sand-600 transition-colors disabled:opacity-50 pt-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenBusy ? 'animate-spin' : ''}`} />
              חידוש קישור (הקישור הישן יפסיק לעבוד)
            </button>
          </>
        )}
      </div>
    </div>
  )
}
