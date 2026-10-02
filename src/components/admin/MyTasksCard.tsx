import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Plus, RotateCcw, CalendarDays, Pencil, Trash2, X, UserRound, Copy, MessageCircle, AlignRight } from 'lucide-react'
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
 */
const OPEN_KEY = 'admin_my_tasks_open'
const WHO_KEY = 'admin_my_tasks_who'
type WhoFilter = 'all' | 'brenda' | 'yahav' | 'both'
type Severity = 'high' | 'mid' | 'low'

const WHO_LABEL: Record<TaskAssignee, string> = { brenda: 'ברנדה', yahav: 'יהב', both: 'משותף' }
const WHO_CHIP: Record<TaskAssignee, { background: string; color: string }> = {
  brenda: { background: '#F3E1D6', color: '#8B4A30' },
  yahav: { background: '#E3EAE6', color: '#3F5A4C' },
  both: { background: '#F6ECD8', color: '#6E5836' },
}
const SEVERITY_DOT: Record<Severity, string> = { high: '#8B4A30', mid: '#C8A460', low: '#D8CFC0' }
const SEVERITY_LABEL: Record<Severity, string> = { high: 'דחוף', mid: 'רגיל', low: 'נמוך' }

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

  // A shared task (משותף) shows under ברנדה and יהב too; משותף alone shows only shared ones.
  const tasks = who === 'all' ? allTasks : who === 'both' ? allTasks.filter(t => t.assignee === 'both') : allTasks.filter(t => t.assignee === who || t.assignee === 'both')

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
      title: newTitle.trim(), severity: newSeverity, due_date: newDue || null, assignee: newWho || null,
      created_by: profile?.id ?? null, ...customerCols(newCustomer),
    })
    setSaving(false)
    setNewTitle(''); setNewSeverity('mid'); setNewDue(''); setNewCustomer(null); setAdding(false)
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
  const dueNow = tasks.filter(isDue)
  const thisWeek = tasks.filter(t => !!t.due_date && t.due_date > today && t.due_date <= weekEnd)
  const later = tasks.filter(t => !t.due_date || t.due_date > weekEnd)
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
    return (
      <div key={t.id} className="rounded-2xl transition-colors" style={{ background: isOpen ? '#FAF7F1' : undefined }}>
        {/* Phone: the title gets its own line (up to two lines), the chips and
            buttons go under it. From sm up it is one row, as before. */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 px-3.5 py-2.5 rounded-2xl hover:bg-[#FAF7F1]">
          <button onClick={() => setExpanded(isOpen ? null : t.id)} className="w-full sm:w-auto sm:flex-1 min-w-0 flex items-center gap-2 text-right" style={{ fontSize: 14 }}
            aria-expanded={isOpen} title={t.detail ? 'פתיחת הפרטים' : undefined}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEVERITY_DOT[t.severity] }} title={SEVERITY_LABEL[t.severity]} />
            <span className="font-bold line-clamp-2 sm:line-clamp-none sm:truncate" style={{ color: '#443327' }}>{t.title}</span>
            {t.detail && <AlignRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#BCAE99' }} />}
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0 mr-auto sm:mr-0">
          <button onClick={() => cycleAssignee(t)} className="flex-shrink-0 font-bold rounded-xl transition-all hover:brightness-95"
            style={{ fontSize: 12, padding: '4px 9px', ...(t.assignee ? WHO_CHIP[t.assignee] : { background: '#F6F3ED', color: '#A2937D' }) }}
            title="למי המשימה? (לחיצה מחליפה)">
            {t.assignee ? WHO_LABEL[t.assignee] : 'למי?'}
          </button>
          {t.customer_name && (
            <button onClick={() => openCustomer({ phone: t.customer_phone, email: t.customer_email })}
              className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
              style={{ fontSize: 12.5, padding: '5px 9px', background: '#F6ECD8', color: '#6E5836' }} title="פתיחת כרטיס הלקוחה">
              <UserRound className="w-3.5 h-3.5" />{t.customer_name.split(' ')[0]}
            </button>
          )}
          <TaskDueChip due={t.due_date} onChange={d => setDue(t.id, d)} />
          <button onClick={() => startEdit(t)} className="flex-shrink-0 rounded-xl p-1.5 hover:bg-[#F6F3ED]" title="עריכה" aria-label="עריכה">
            <Pencil className="w-3.5 h-3.5" style={{ color: '#8A7A63' }} />
          </button>
          <button onClick={() => complete(t)} disabled={busy === t.id}
            className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95 disabled:opacity-40"
            style={{ fontSize: 13, padding: '6px 12px', background: '#EDEDE6', color: '#4F5040' }} title="סימון כטופל">
            <Check className="w-3.5 h-3.5" /> טופל
          </button>
          </div>
        </div>
        {isOpen && <TaskDetail task={t} />}
      </div>
    )
  }

  function renderGroup(label: string, list: ManualTask[], accent?: boolean) {
    if (!list.length) return null
    return (
      <div className="mt-3">
        <p className="font-bold px-1 mb-1" style={{ fontSize: 12.5, color: accent ? '#8B4A30' : '#A2937D' }}>{label} · {list.length}</p>
        <div className="space-y-1">{list.map(renderTask)}</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={toggle} className="font-bold flex items-center gap-1.5 text-right" style={{ fontSize: 16, color: '#443327' }} aria-expanded={open}>
          המשימות שלי
          {tasks.length > 0 && <span className="font-display" style={{ color: '#8A6A2F' }}>· {tasks.length}</span>}
          {dueNow.length > 0 && (
            <span className="font-bold rounded-full" style={{ fontSize: 11.5, padding: '2px 8px', background: '#F6E3DA', color: '#8B4A30' }}>
              {dueNow.length} להיום
            </span>
          )}
          <ChevronDown className="w-4 h-4 transition-transform" style={{ color: '#BCAE99', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
        <div className="flex items-center gap-1.5 mr-auto">
          <div className="flex rounded-xl p-0.5" style={{ background: '#F6F3ED' }} role="group" aria-label="סינון לפי אחראי">
            {(['yahav', 'brenda', 'both', 'all'] as WhoFilter[]).map(w => (
              <button key={w} onClick={() => pickWho(w)} className="font-bold rounded-lg transition-all"
                style={{ fontSize: 12.5, padding: '4px 10px', background: who === w ? '#fff' : 'transparent', color: who === w ? '#443327' : '#A2937D', boxShadow: who === w ? '0 1px 2px rgba(0,0,0,.06)' : undefined }}
                aria-pressed={who === w}>
                {w === 'all' ? 'הכל' : WHO_LABEL[w]}
              </button>
            ))}
          </div>
          <button onClick={startAdd}
            className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
            style={{ fontSize: 13, padding: '6px 12px', background: '#C8A460', color: '#33281B' }}>
            <Plus className="w-3.5 h-3.5" /> משימה
          </button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 mt-3" style={{ background: '#F6F3ED' }}>
          <SeveritySelect value={newSeverity} onChange={setNewSeverity} style={inputStyle} />
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} autoFocus
            placeholder="מה צריך לעשות? (Enter לשמירה)"
            className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} />
          <WhoSelect value={newWho} onChange={setNewWho} style={inputStyle} />
          <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} title="לאיזה תאריך? (לא חובה)" aria-label="תאריך למשימה"
            className="flex-shrink-0 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none" style={{ ...inputStyle, color: newDue ? '#443327' : '#A2937D', width: 132 }} />
          <CustomerPicker value={newCustomer} onChange={setNewCustomer} />
          <button onClick={add} disabled={saving || !newTitle.trim()} className="flex-shrink-0 font-bold rounded-xl disabled:opacity-40"
            style={{ fontSize: 13, padding: '8px 14px', background: '#C8A460', color: '#33281B' }}>
            {saving ? '...' : 'הוספה'}
          </button>
        </div>
      )}

      {undo && (
        <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 mt-3" style={{ background: '#EDEDE6' }}>
          <p className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 13, color: '#4F5040' }}>{undo.label}</p>
          <button onClick={async () => { const u = undo; setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current); await u.run() }}
            className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl" style={{ fontSize: 13, padding: '5px 10px', background: '#fff', color: '#4F5040' }}>
            <RotateCcw className="w-3.5 h-3.5" /> ביטול
          </button>
        </div>
      )}

      {open && tasks.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: '#A2937D' }}>{who === 'all' ? 'אין משימות פתוחות' : who === 'both' ? 'אין משימות משותפות פתוחות' : `אין משימות פתוחות ל${WHO_LABEL[who]}`}</p>
      )}

      {!open && dueNow.length > 0 && <div className="space-y-1 mt-3">{dueNow.map(renderTask)}</div>}

      {open && (
        <>
          {renderGroup('היום ובאיחור', dueNow, true)}
          {renderGroup('השבוע', thisWeek)}
          {later.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setLaterOpen(o => !o)} className="flex items-center gap-1 font-bold px-1" style={{ fontSize: 12.5, color: '#A2937D' }} aria-expanded={laterOpen}>
                בהמשך · {later.length}
                <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: laterOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {laterOpen && <div className="space-y-1 mt-1">{later.map(renderTask)}</div>}
            </div>
          )}
        </>
      )}
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
    if (due < today) { label = `${d}/${m} · עבר`; bg = '#F6E3DA'; color = '#8B4A30' }
    else if (due === today) { label = 'היום'; bg = '#F6ECD8'; color = '#6E5836' }
    else label = `${d}/${m}`
  }
  return (
    <label className="relative flex-shrink-0 flex items-center gap-1 font-bold rounded-xl cursor-pointer"
      style={{ fontSize: 12.5, padding: '5px 9px', background: bg, color }} title={due ? 'שינוי תאריך' : 'הוספת תאריך'}>
      <CalendarDays className="w-3.5 h-3.5" />
      {label}
      <input type="date" value={due ?? ''} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="תאריך למשימה" />
    </label>
  )
}
