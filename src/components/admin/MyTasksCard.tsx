import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Search, Plus, RotateCcw, Clock, ChevronLeft, ListTodo, Pencil, Trash2, X, UserRound, Copy, MessageCircle, AlignRight, Flag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { ManualTask, TaskAssignee } from './adminTasks'
import CustomerPicker, { type TaskCustomer } from './CustomerPicker'
import { useOpenCustomer } from './CustomerCardContext'

/**
 * "המשימות שלי" on the admin home.
 *
 * Brenda 28.9.26: she wants to EDIT the tasks she writes, and wants them
 * separate from "דורש תשומת לב" without loading the home screen.
 * - Her own tasks (admin_tasks with no link_section) live here. Tasks the
 *   system writes (a refund owed, link_section = 'events') stay in
 *   "דורש תשומת לב", they are obligations, not her to-do list.
 * - Folded by default. Folded, it still shows the tasks that are due today
 *   or overdue, so nothing dated is hidden.
 * - 28.9.26: a task can be linked to a customer. Her name shows on the task
 *   and opens her customer card.
 *
 * Yahav 2.10.26: "the tasks are becoming a big part of the admin, I want it
 * tidier". There is ONE admin login shared by Brenda and Yahav, so:
 * - Every task has an assignee (ברנדה / יהב / משותף, or none). Filter: יהב / ברנדה /
 *   משותף / הכל; a shared task also shows under ברנדה and יהב shown as a chip, with a
 *   ברנדה / יהב / הכל filter remembered per browser. Tap the chip to switch.
 * - Opened, the list is grouped by time: היום ובאיחור, השבוע (7 days),
 *   בהמשך (folded, with a count). A task for next month no longer weighs
 *   the same as one for tomorrow.
 * - The detail is no longer squeezed into one truncated line. Tap a task to
 *   open it. Editing uses a real textarea, so multi-line details (a message
 *   and a phone list) keep their line breaks. Before this, saving an edit
 *   through the one-line input flattened them.
 * - A detail with a "נוסח:" line followed by text, and lines with Israeli
 *   mobile numbers, gets a "העתק נוסח" button and a WhatsApp button per
 *   person that opens the chat with the text ready. Who was already sent is
 *   remembered per browser.
 * - "נמוך" severity is shown and kept (it used to be edited into רגיל).
 *
 * Yahav 9.10.26: "המשותף לא צריך להופיע גם ליהב וגם לברנדה" and "איך
 * הקדימות מביאה לידי ביטוי את הדחיפות?". It did not: דחוף was a 8px dot,
 * did not change the order, and a דחוף task with no date or a far date sat
 * folded under "בהמשך". Now:
 * - יהב / ברנדה show only their own tasks. Shared ones live under משותף
 *   (and הכל); a personal view ends with "ועוד N משותפות" to jump there.
 * - דחוף always goes to the first group ("עכשיו"), whatever its date, and is
 *   sorted first inside every group. It has a rust stripe and a flag; the
 *   flag toggles דחוף in one tap.
 * - Groups: עכשיו (overdue, today, דחוף) / השבוע / בהמשך / בלי תאריך.
 * - Done = the round check at the start of the row, like any to-do list.
 */
const OPEN_KEY = 'admin_my_tasks_open'
const WHO_KEY = 'admin_my_tasks_who'
type WhoFilter = 'all' | 'brenda' | 'yahav' | 'both'
type Severity = 'high' | 'mid' | 'low'

const WHO_LABEL: Record<TaskAssignee, string> = { brenda: 'ברנדה', yahav: 'יהב', both: 'משותף' }

const todayIl = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const isDue = (t: ManualTask) => !!t.due_date && t.due_date <= todayIl()

function readLs(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function writeLs(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* private mode */ } }

// ── detail parsing: "נוסח:" block + phone lines ──
const PHONE_RE = /(05\d)[-\s]?(\d{3})[-\s]?(\d{4})/
type ParsedDetail = { message: string | null; people: { name: string; phone: string }[]; rest: string }
export function parseDetail(detail: string | null): ParsedDetail {
  if (!detail) return { message: null, people: [], rest: '' }
  const lines = detail.split('\n')
  let message: string | null = null
  const used = new Set<number>()
  const start = lines.findIndex(l => /^\s*נוסח\s*:?\s*$/.test(l))
  if (start >= 0) {
    used.add(start)
    const body: string[] = []
    for (let i = start + 1; i < lines.length; i++) {
      if (!lines[i].trim()) { if (body.length) break; used.add(i); continue }
      body.push(lines[i]); used.add(i)
    }
    message = body.join('\n').trim() || null
  }
  const people: { name: string; phone: string }[] = []
  lines.forEach((l, i) => {
    if (used.has(i)) return
    const m = l.match(PHONE_RE)
    if (!m) return
    const name = l.replace(m[0], '').replace(/[·,:\-–]+\s*$/, '').trim() || m[0]
    people.push({ name, phone: m[1] + m[2] + m[3] })
    used.add(i)
  })
  const rest = lines.filter((_, i) => !used.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { message, people, rest }
}
const waLink = (phone: string, text: string | null) =>
  `https://wa.me/972${phone.replace(/^0/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export default function MyTasksCard({ tasks: allTasks, reload }: { tasks: ManualTask[]; reload: () => Promise<void> | void }) {
  const { profile } = useAuth()
  const openCustomer = useOpenCustomer()
  const [open, setOpen] = useState<boolean>(() => readLs(OPEN_KEY) === '1')
  function toggle() { setOpen(o => { const n = !o; writeLs(OPEN_KEY, n ? '1' : '0'); return n }) }
  const [who, setWho] = useState<WhoFilter>(() => { const v = readLs(WHO_KEY); return v === 'brenda' || v === 'yahav' || v === 'both' ? v : 'all' })
  function pickWho(w: WhoFilter) { setWho(w); writeLs(WHO_KEY, w) }
  const [laterOpen, setLaterOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // 9.10.26: personal views show only that person's tasks; shared stay under משותף / הכל.
  const tasks = who === 'all' ? allTasks : allTasks.filter(t => t.assignee === who)
  const sharedCount = who === 'brenda' || who === 'yahav' ? allTasks.filter(t => t.assignee === 'both').length : 0

  // ── undo after טופל / מחיקה (one slot, ~10s) ──
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])
  function showUndo(label: string, run: () => Promise<void>) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ label, run })
    undoTimer.current = setTimeout(() => setUndo(null), 10_000)
  }
  const [busy, setBusy] = useState<string | null>(null)

  async function complete(t: ManualTask) {
    setBusy(t.id)
    await supabase.from('admin_tasks').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', t.id)
    await reload()
    setBusy(null)
    showUndo(`טופל: ${t.title}`, async () => {
      await supabase.from('admin_tasks').update({ status: 'open', done_at: null }).eq('id', t.id)
      await reload()
    })
  }

  // Delete = a task written by mistake. Kept undoable by re-inserting the same row.
  async function remove(t: ManualTask) {
    setBusy(t.id)
    await supabase.from('admin_tasks').delete().eq('id', t.id)
    setEditId(null)
    await reload()
    setBusy(null)
    showUndo(`נמחקה: ${t.title}`, async () => {
      await supabase.from('admin_tasks').insert({
        id: t.id, title: t.title, detail: t.detail, severity: t.severity, due_date: t.due_date, assignee: t.assignee ?? null,
        customer_name: t.customer_name ?? null, customer_phone: t.customer_phone ?? null, customer_email: t.customer_email ?? null,
        status: 'open', created_at: t.created_at, created_by: profile?.id ?? null,
      })
      await reload()
    })
  }

  async function toggleUrgent(t: ManualTask) {
    await supabase.from('admin_tasks').update({ severity: t.severity === 'high' ? 'mid' : 'high' }).eq('id', t.id)
    reload()
  }

  async function setDue(id: string, due: string) {
    await supabase.from('admin_tasks').update({ due_date: due || null }).eq('id', id)
    reload()
  }
  // Chip tap: ברנדה → יהב → משותף → none → ברנדה
  async function cycleAssignee(t: ManualTask) {
    const next: TaskAssignee | null = t.assignee === 'brenda' ? 'yahav' : t.assignee === 'yahav' ? 'both' : t.assignee === 'both' ? null : 'brenda'
    await supabase.from('admin_tasks').update({ assignee: next }).eq('id', t.id)
    reload()
  }

  // ── quick add ──
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // 9.10.26 (Yahav): a detail could only be added afterwards, in edit.
  const [newDetail, setNewDetail] = useState('')
  const [newSeverity, setNewSeverity] = useState<Severity>('mid')
  const [newDue, setNewDue] = useState('')
  const [newWho, setNewWho] = useState<TaskAssignee | ''>('')
  const [newCustomer, setNewCustomer] = useState<TaskCustomer | null>(null)
  const [saving, setSaving] = useState(false)
  function startAdd() {
    setAdding(a => !a)
    setNewWho(who === 'all' ? '' : who)
  }
  async function add() {
    if (!newTitle.trim()) return
    setSaving(true)
    await supabase.from('admin_tasks').insert({
      title: newTitle.trim(), detail: newDetail.trim() || null, severity: newSeverity, due_date: newDue || null, assignee: newWho || null,
      created_by: profile?.id ?? null, ...customerCols(newCustomer),
    })
    setSaving(false)
    setNewTitle(''); setNewDetail(''); setNewSeverity('mid'); setNewDue(''); setNewCustomer(null); setAdding(false)
    if (!open) toggle()
    reload()
  }

  // ── edit ──
  const [editId, setEditId] = useState<string | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eDetail, setEDetail] = useState('')
  const [eSeverity, setESeverity] = useState<Severity>('mid')
  const [eDue, setEDue] = useState('')
  const [eWho, setEWho] = useState<TaskAssignee | ''>('')
  const [eCustomer, setECustomer] = useState<TaskCustomer | null>(null)
  function startEdit(t: ManualTask) {
    setEditId(t.id); setETitle(t.title); setEDetail(t.detail ?? '')
    setESeverity(t.severity); setEDue(t.due_date ?? ''); setEWho(t.assignee ?? '')
    setECustomer(t.customer_name ? { name: t.customer_name, phone: t.customer_phone ?? null, email: t.customer_email ?? null } : null)
  }
  async function saveEdit() {
    if (!editId || !eTitle.trim()) return
    setSaving(true)
    await supabase.from('admin_tasks').update({
      title: eTitle.trim(), detail: eDetail.trim() || null, severity: eSeverity, due_date: eDue || null, assignee: eWho || null,
      ...customerCols(eCustomer),
    }).eq('id', editId)
    setSaving(false)
    setEditId(null)
    reload()
  }

  const today = todayIl()
  const weekEnd = addDays(today, 7)
  // דחוף first, then by date (no date last), then oldest first.
  const SEV_RANK: Record<Severity, number> = { high: 0, mid: 1, low: 2 }
  const byUrgency = (a: ManualTask, b: ManualTask) =>
    SEV_RANK[a.severity] - SEV_RANK[b.severity]
    || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
    || String(a.created_at).localeCompare(String(b.created_at))
  const isNow = (t: ManualTask) => isDue(t) || t.severity === 'high'
  const dueNow = tasks.filter(isNow).sort(byUrgency)
  const thisWeek = tasks.filter(t => !isNow(t) && !!t.due_date && t.due_date > today && t.due_date <= weekEnd).sort(byUrgency)
  const later = tasks.filter(t => !isNow(t) && !!t.due_date && t.due_date > weekEnd).sort(byUrgency)
  const noDate = tasks.filter(t => !isNow(t) && !t.due_date).sort(byUrgency)
  const urgentCount = tasks.filter(t => t.severity === 'high').length
  const [noDateOpen, setNoDateOpen] = useState(false)

  // 9.10.26 (Yahav): "חיפוש של משימה כדי לדעת האם הוספתי אותה". Searches every
  // open task (all people, whatever the filter) by title, detail and customer,
  // and the last 20 done ones from the database.
  const [q, setQ] = useState('')
  const [doneHits, setDoneHits] = useState<{ id: string; title: string; done_at: string | null; assignee: TaskAssignee | null }[]>([])
  const qn = q.trim().toLowerCase()
  const openHits = qn ? allTasks.filter(t => [t.title, t.detail, t.customer_name].some(x => (x ?? '').toLowerCase().includes(qn))).sort(byUrgency) : []
  useEffect(() => {
    if (qn.length < 2) { setDoneHits([]); return }
    const h = setTimeout(async () => {
      const like = `"%${qn.replace(/[%_,()"\\]/g, ' ')}%"`
      const { data } = await supabase.from('admin_tasks').select('id, title, done_at, assignee')
        .eq('status', 'done').is('link_section', null)
        .or(`title.ilike.${like},detail.ilike.${like},customer_name.ilike.${like}`)
        .order('done_at', { ascending: false }).limit(20)
      setDoneHits((data ?? []) as typeof doneHits)
    }, 300)
    return () => clearTimeout(h)
  }, [qn])
  const inputStyle = { border: '1px solid #E9E2D6', color: '#443327' }

  function renderTask(t: ManualTask) {
    if (editId === t.id) return (
      <div key={t.id} className="rounded-2xl px-3 py-3 space-y-2" style={{ background: '#F6F3ED' }}>
        <div className="flex flex-wrap items-center gap-2">
          <SeveritySelect value={eSeverity} onChange={setESeverity} style={inputStyle} />
          <input value={eTitle} onChange={e => setETitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }} autoFocus
            className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} aria-label="המשימה" />
          <WhoSelect value={eWho} onChange={setEWho} style={inputStyle} />
          <input type="date" value={eDue} onChange={e => setEDue(e.target.value)} aria-label="תאריך למשימה"
            className="flex-shrink-0 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none" style={{ ...inputStyle, width: 132 }} />
          <CustomerPicker value={eCustomer} onChange={setECustomer} />
        </div>
        <textarea value={eDetail} onChange={e => setEDetail(e.target.value)} rows={Math.min(14, Math.max(3, eDetail.split('\n').length + 1))}
          placeholder={'פרטים (לא חובה)\nלהודעה לשליחה: שורה "נוסח:" ומתחתיה הטקסט. שורות עם שם וטלפון יקבלו כפתור וואטסאפ.'}
          className="w-full rounded-xl px-3 py-2 text-sm bg-white focus:outline-none leading-relaxed" style={{ ...inputStyle, resize: 'vertical' }} />
        <div className="flex items-center gap-2">
          <button onClick={saveEdit} disabled={saving || !eTitle.trim()} className="font-bold rounded-xl disabled:opacity-40"
            style={{ fontSize: 13, padding: '7px 14px', background: '#C8A460', color: '#33281B' }}>{saving ? '...' : 'שמירה'}</button>
          <button onClick={() => setEditId(null)} className="flex items-center gap-1 font-bold rounded-xl"
            style={{ fontSize: 13, padding: '7px 12px', background: '#fff', color: '#6E5836' }}><X className="w-3.5 h-3.5" /> ביטול</button>
          <button onClick={() => remove(t)} disabled={busy === t.id} className="mr-auto flex items-center gap-1 font-bold rounded-xl disabled:opacity-40"
            style={{ fontSize: 13, padding: '7px 12px', background: '#F6E3DA', color: '#8B4A30' }}><Trash2 className="w-3.5 h-3.5" /> מחיקה</button>
        </div>
      </div>
    )
    const isOpen = expanded === t.id
    const urgent = t.severity === 'high'
    // 9.10.26: the row from the approved Lovable mockup. Check circle, title,
    // a line of small chips under it, flag + edit on the far side. Rows are
    // separated by a hairline, urgent ones get a rust edge and a light tint.
    return (
      <div key={t.id} style={{ borderBottom: '1px solid #EFE9DF', borderRight: urgent ? '3px solid #8B4A30' : '3px solid transparent', background: urgent ? '#FBF3EF' : isOpen ? '#FBF9F5' : undefined }}>
        <div className="grid items-start gap-2 px-4 py-3" style={{ gridTemplateColumns: '24px minmax(0,1fr) 24px 24px' }}>
          <button onClick={() => complete(t)} disabled={busy === t.id} title="סימון כבוצע" aria-label={`בוצע: ${t.title}`}
            className="group rounded-full flex items-center justify-center transition-colors disabled:opacity-40 hover:bg-[#E7F0E4]"
            style={{ width: 21, height: 21, marginTop: 2, border: `1.5px solid ${urgent ? '#C99A86' : '#D9CFBF'}`, background: '#fff' }}>
            <Check className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#3F5B39' }} strokeWidth={3} />
          </button>
          <div className="min-w-0">
            <button onClick={() => setExpanded(isOpen ? null : t.id)} className="w-full text-right flex items-start gap-1.5"
              aria-expanded={isOpen} title={t.detail ? 'פתיחת הפרטים' : undefined}>
              <span className="leading-snug" style={{ fontSize: 14, fontWeight: t.severity === 'low' ? 500 : 600, color: t.severity === 'low' ? '#8A7A63' : '#443327', overflowWrap: 'anywhere' }}>{t.title}</span>
              {t.detail && <AlignRight className="w-3 h-3 flex-shrink-0 mt-1" style={{ color: '#C9BBA4' }} />}
            </button>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <button onClick={() => cycleAssignee(t)} className="font-semibold rounded-md"
                style={{ fontSize: 11, padding: '2px 7px', ...(t.assignee === 'both' ? { background: '#E4EBEF', color: '#35505C' } : t.assignee ? { background: '#F6F3ED', color: '#8A7A63' } : { background: '#F6F3ED', color: '#A2937D' }) }}
                title="למי המשימה? (לחיצה מחליפה)">
                {t.assignee ? WHO_LABEL[t.assignee] : 'למי?'}
              </button>
              {t.customer_name && (
                <button onClick={() => openCustomer({ phone: t.customer_phone, email: t.customer_email })}
                  className="flex items-center gap-1 font-semibold rounded-md hover:brightness-95"
                  style={{ fontSize: 11, padding: '2px 7px', background: '#F6ECD8', color: '#6E5836' }} title="פתיחת כרטיס הלקוחה">
                  <UserRound className="w-3 h-3" />{t.customer_name}
                </button>
              )}
              <TaskDueChip due={t.due_date} onChange={d => setDue(t.id, d)} />
              {urgent && <span className="font-semibold rounded-md" style={{ fontSize: 11, padding: '2px 7px', background: '#F5E2D8', color: '#8B4A30' }}>דחוף</span>}
            </div>
          </div>
          <button onClick={() => toggleUrgent(t)} className="flex items-center justify-center rounded-md hover:bg-[#F5E2D8]" style={{ height: 24, marginTop: 1 }}
            title={urgent ? 'ביטול דחיפות' : 'סימון כדחוף'} aria-pressed={urgent} aria-label={urgent ? 'ביטול דחיפות' : 'סימון כדחוף'}>
            <Flag className="w-3.5 h-3.5" style={{ color: urgent ? '#8B4A30' : '#C9BBA4' }} fill={urgent ? '#F5E2D8' : 'none'} />
          </button>
          <button onClick={() => startEdit(t)} className="flex items-center justify-center rounded-md hover:bg-[#F6F3ED]" style={{ height: 24, marginTop: 1 }} title="עריכה" aria-label="עריכה">
            <Pencil className="w-3.5 h-3.5" style={{ color: '#C9BBA4' }} />
          </button>
        </div>
        {isOpen && <div className="pb-3" style={{ paddingInline: 16 }}><TaskDetail task={t} /></div>}
      </div>
    )
  }

  function groupHeading(label: string, n: number, kind: 'now' | 'week' | 'plain') {
    return (
      <div className="flex items-center gap-1.5 px-5 pt-3 pb-2 font-semibold" style={{ fontSize: 12, color: kind === 'now' ? '#8B4A30' : '#8A7A63' }}>
        {kind === 'now' ? <Flag className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
        {label}<span style={{ color: '#A2937D', fontWeight: 400 }}>{n}</span>
      </div>
    )
  }

  function renderGroup(label: string, list: ManualTask[], accent?: boolean) {
    if (!list.length) return null
    return (
      <div>
        {groupHeading(label, list.length, accent ? 'now' : label === 'השבוע' ? 'week' : 'plain')}
        <div>{list.map(renderTask)}</div>
      </div>
    )
  }

  function foldGroup(label: string, list: ManualTask[], isOpen: boolean, toggle: () => void) {
    return (
      <div>
        <button onClick={toggle} aria-expanded={isOpen}
          className="w-full flex items-center gap-1.5 px-5 py-3.5 font-semibold text-right hover:bg-[#FBF9F5]"
          style={{ fontSize: 12, color: '#8A7A63', borderBottom: '1px solid #EFE9DF' }}>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          {label}<span style={{ color: '#A2937D', fontWeight: 400 }}>{list.length}</span>
        </button>
        {isOpen && (list.length ? list.map(renderTask) : <p className="text-center py-4" style={{ fontSize: 13, color: '#A2937D' }}>אין משימות בקבוצה הזו</p>)}
      </div>
    )
  }

  const counts: Record<WhoFilter, number> = {
    yahav: allTasks.filter(t => t.assignee === 'yahav').length,
    brenda: allTasks.filter(t => t.assignee === 'brenda').length,
    both: allTasks.filter(t => t.assignee === 'both').length,
    all: allTasks.length,
  }

  return (
    <div>
      {/* Heading outside the card, like the Lovable mockup */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-1">
        <button onClick={toggle} className="flex items-center gap-2 text-right" aria-expanded={open}>
          <ListTodo className="w-[18px] h-[18px]" style={{ color: '#8A7A63' }} />
          <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>המשימות שלי</h2>
          {dueNow.length > 0 && (
            <span className="font-bold rounded-md" style={{ fontSize: 11, padding: '2px 7px', background: '#F5E2D8', color: '#8B4A30' }}>
              {dueNow.length} עכשיו{urgentCount > 0 ? ` · ${urgentCount} דחופות` : ''}
            </span>
          )}
          <ChevronDown className="w-4 h-4 transition-transform" style={{ color: '#BCAE99', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        <button onClick={startAdd}
          className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
          style={{ fontSize: 13, padding: '7px 14px', background: '#C8A460', color: '#33281B' }}>
          <Plus className="w-3.5 h-3.5" /> משימה חדשה
        </button>
      </div>

      <div className="bg-white rounded-3xl overflow-hidden" style={{ border: '1px solid #E9E2D6' }}>
        <div className="px-5 pt-4">
          <div className="flex gap-5 overflow-x-auto" style={{ borderBottom: '1px solid #EFE9DF' }} role="group" aria-label="סינון לפי אחראי">
            {(['yahav', 'brenda', 'both', 'all'] as WhoFilter[]).map(w => (
              <button key={w} onClick={() => pickWho(w)} aria-pressed={who === w}
                className="relative flex items-center gap-1.5 pb-2.5 flex-shrink-0"
                style={{ fontSize: 13, fontWeight: who === w ? 700 : 500, color: who === w ? '#443327' : '#8A7A63', borderBottom: `2px solid ${who === w ? '#C8A460' : 'transparent'}`, marginBottom: -1 }}>
                {w === 'all' ? 'הכל' : WHO_LABEL[w]}
                <span style={{ fontSize: 11, color: '#A2937D', fontWeight: 400 }}>{counts[w]}</span>
              </button>
            ))}
          </div>
          {open && (
            <div className="relative my-2.5">
              <Search className="w-3.5 h-3.5 absolute right-0 top-1/2 -translate-y-1/2" style={{ color: '#A2937D' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש משימה, גם בכאלה שבוצעו"
                className="w-full pr-6 pl-6 py-1.5 bg-transparent focus:outline-none" style={{ fontSize: 12.5, color: '#443327' }} />
              {q && <button onClick={() => setQ('')} className="absolute left-0 top-1/2 -translate-y-1/2 p-1" aria-label="ניקוי"><X className="w-3.5 h-3.5" style={{ color: '#A2937D' }} /></button>}
            </div>
          )}
        </div>

        {adding && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: '#F6F3ED', borderTop: '1px solid #EFE9DF', borderBottom: '1px solid #EFE9DF' }}>
            <SeveritySelect value={newSeverity} onChange={setNewSeverity} style={inputStyle} />
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} autoFocus
              placeholder="מה צריך לעשות? (Enter לשמירה)"
              className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} />
            <WhoSelect value={newWho} onChange={setNewWho} style={inputStyle} />
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} title="לאיזה תאריך? (לא חובה)" aria-label="תאריך למשימה"
              className="flex-shrink-0 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none" style={{ ...inputStyle, color: newDue ? '#443327' : '#A2937D', width: 132 }} />
            <textarea value={newDetail} onChange={e => setNewDetail(e.target.value)} rows={2}
              placeholder="פירוט (לא חובה): מה בדיוק, נוסח הודעה, טלפון..."
              className="w-full rounded-xl px-3 py-2 text-sm bg-white focus:outline-none resize-y" style={inputStyle} />
            <CustomerPicker value={newCustomer} onChange={setNewCustomer} />
            <button onClick={add} disabled={saving || !newTitle.trim()} className="flex-shrink-0 font-bold rounded-xl disabled:opacity-40"
              style={{ fontSize: 13, padding: '8px 14px', background: '#C8A460', color: '#33281B' }}>
              {saving ? '...' : 'הוספה'}
            </button>
          </div>
        )}

        {undo && (
          <div className="flex items-center gap-2 mx-4 my-2 rounded-xl px-3.5 py-2" style={{ background: '#443327' }}>
            <p className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 13, color: '#fff' }}>{undo.label}</p>
            <button onClick={async () => { const u = undo; setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current); await u.run() }}
              className="flex-shrink-0 flex items-center gap-1 font-bold" style={{ fontSize: 13, color: '#F6ECD8' }}>
              <RotateCcw className="w-3.5 h-3.5" /> ביטול
            </button>
          </div>
        )}

        {open && tasks.length === 0 && !qn && (
          <p className="text-center py-6" style={{ fontSize: 14, color: '#8A7A63' }}>{who === 'all' ? 'הכל מסודר, אין משימות פתוחות' : who === 'both' ? 'אין משימות משותפות פתוחות' : `אין משימות פתוחות ל${WHO_LABEL[who]}`}</p>
        )}

        {!open && (dueNow.length > 0
          ? renderGroup('עכשיו: דחוף, היום ובאיחור', dueNow, true)
          : <p className="text-center py-4" style={{ fontSize: 13, color: '#A2937D' }}>אין משהו דחוף להיום</p>)}

        {open && qn && (
          <div className="pb-2">
            {openHits.length === 0 && doneHits.length === 0 && (
              <p className="text-center py-5" style={{ fontSize: 13, color: '#A2937D' }}>{qn.length < 2 ? 'עוד אות אחת...' : 'לא נמצאה משימה כזו, לא פתוחה ולא שבוצעה.'}</p>
            )}
            {renderGroup('פתוחות', openHits)}
            {doneHits.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-5 pt-3 pb-2 font-semibold" style={{ fontSize: 12, color: '#8A7A63' }}>
                  <Check className="w-3.5 h-3.5" />בוצעו<span style={{ color: '#A2937D', fontWeight: 400 }}>{doneHits.length}</span>
                </div>
                {doneHits.map(d => (
                  <p key={d.id} className="flex items-center gap-2 px-5 py-2" style={{ fontSize: 13.5, color: '#A2937D', borderBottom: '1px solid #EFE9DF' }}>
                    <span className="flex-1 min-w-0 truncate line-through">{d.title}</span>
                    {d.assignee && <span style={{ fontSize: 11 }}>{WHO_LABEL[d.assignee]}</span>}
                    {d.done_at && <span style={{ fontSize: 11 }}>{new Date(d.done_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' })}</span>}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {open && !qn && (
          <>
            {renderGroup('עכשיו: דחוף, היום ובאיחור', dueNow, true)}
            {renderGroup('השבוע', thisWeek)}
            {foldGroup('בהמשך', later, laterOpen, () => setLaterOpen(o => !o))}
            {foldGroup('בלי תאריך', noDate, noDateOpen, () => setNoDateOpen(o => !o))}
            {sharedCount > 0 && (
              <button onClick={() => pickWho('both')} className="w-full py-3 font-semibold hover:bg-[#FBF9F5]" style={{ fontSize: 12.5, color: '#8A7A63' }}>
                ועוד {sharedCount} משימות משותפות ←
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The opened task: free text, the message to send, and a WhatsApp button per person. */
function TaskDetail({ task }: { task: ManualTask }) {
  const { message, people, rest } = parseDetail(task.detail)
  const sentKey = `admin_task_wa_sent_${task.id}`
  const [sent, setSent] = useState<Set<string>>(() => { try { return new Set(JSON.parse(readLs(sentKey) ?? '[]')) } catch { return new Set() } })
  const [copied, setCopied] = useState(false)
  function markSent(phone: string) {
    setSent(prev => { const n = new Set(prev); n.add(phone); writeLs(sentKey, JSON.stringify([...n])); return n })
  }
  async function copy() {
    if (!message) return
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* no clipboard */ }
  }
  if (!task.detail) return <p className="px-5 pb-3 text-sm" style={{ color: '#A2937D' }}>אין פרטים. אפשר להוסיף בעריכה.</p>
  return (
    <div className="px-5 pb-3.5 space-y-2.5" style={{ fontSize: 13.5, color: '#5C4B3B' }}>
      {rest && <p className="whitespace-pre-line leading-relaxed">{rest}</p>}
      {message && (
        <div className="rounded-2xl p-3 bg-white" style={{ border: '1px solid #EFE7DA' }}>
          <p className="whitespace-pre-line leading-relaxed" style={{ color: '#443327' }}>{message}</p>
          <button onClick={copy} className="mt-2 flex items-center gap-1 font-bold rounded-xl"
            style={{ fontSize: 12.5, padding: '5px 10px', background: copied ? '#E3EAE6' : '#F6ECD8', color: copied ? '#3F5A4C' : '#6E5836' }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'הועתק' : 'העתק נוסח'}
          </button>
        </div>
      )}
      {people.length > 0 && (
        <div>
          <p className="font-bold mb-1.5" style={{ fontSize: 12.5, color: '#A2937D' }}>
            {message ? 'שליחה בוואטסאפ, הנוסח כבר בפנים' : 'וואטסאפ'} · נשלח ל-{people.filter(p => sent.has(p.phone)).length} מתוך {people.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {people.map(p => {
              const done = sent.has(p.phone)
              return (
                <a key={p.phone} href={waLink(p.phone, message)} target="_blank" rel="noreferrer" onClick={() => markSent(p.phone)}
                  className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
                  style={{ fontSize: 12.5, padding: '5px 10px', background: done ? '#EDEDE6' : '#E3EAE6', color: done ? '#9A9A8A' : '#3F5A4C', textDecoration: done ? 'line-through' : undefined }}
                  title={p.phone}>
                  {done ? <Check className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}{p.name}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SeveritySelect({ value, onChange, style }: { value: Severity; onChange: (v: Severity) => void; style: React.CSSProperties }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as Severity)} aria-label="דחיפות"
      className="flex-shrink-0 rounded-xl px-2 py-2 text-sm font-semibold bg-white focus:outline-none" style={style}>
      <option value="mid">רגיל</option>
      <option value="high">דחוף</option>
      <option value="low">נמוך</option>
    </select>
  )
}

function WhoSelect({ value, onChange, style }: { value: TaskAssignee | ''; onChange: (v: TaskAssignee | '') => void; style: React.CSSProperties }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as TaskAssignee | '')} aria-label="למי המשימה"
      className="flex-shrink-0 rounded-xl px-2 py-2 text-sm font-semibold bg-white focus:outline-none" style={{ ...style, color: value ? '#443327' : '#A2937D' }}>
      <option value="">למי?</option>
      <option value="brenda">ברנדה</option>
      <option value="yahav">יהב</option>
      <option value="both">משותף</option>
    </select>
  )
}

function customerCols(c: TaskCustomer | null) {
  return { customer_name: c?.name ?? null, customer_phone: c?.phone ?? null, customer_email: c?.email ?? null }
}

/** The date on a task. Tap to set or change it (native picker).
 *  Past = rust, today = gold, later = quiet. No date = a small calendar icon. */
function TaskDueChip({ due, onChange }: { due: string | null; onChange: (d: string) => void }) {
  const today = todayIl()
  let label = ''
  let bg = '#F6F3ED'
  let color = '#8A7A63'
  if (due) {
    const [, m, d] = due.split('-').map(Number)
    if (due < today) { label = `${d}/${m} · עבר`; bg = '#F5E2D8'; color = '#8B4A30' }
    else if (due === today) { label = 'היום'; bg = '#F6ECD8'; color = '#6E5836' }
    else label = `${d}/${m}`
  }
  return (
    <label className="relative flex items-center gap-1 font-semibold rounded-md cursor-pointer"
      style={{ fontSize: 11, padding: '2px 7px', background: bg, color: due ? color : '#A2937D' }} title={due ? 'שינוי תאריך' : 'הוספת תאריך'}>
      {label || 'בלי תאריך'}
      <input type="date" value={due ?? ''} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="תאריך למשימה" />
    </label>
  )
}
