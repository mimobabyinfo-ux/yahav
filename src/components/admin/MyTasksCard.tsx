import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Plus, RotateCcw, CalendarDays, Pencil, Trash2, X, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { ManualTask } from './adminTasks'
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
 *   or overdue, so nothing dated is hidden. Opened, it shows everything,
 *   with edit (text, דחוף/רגיל, date), delete and טופל.
 * - Open/closed is remembered per browser.
 * - 28.9.26: a task can be linked to a customer ("שירלי חייבת 900 ש\"ח במזומן").
 *   Her name shows on the task and opens her customer card, and the card
 *   shows her open tasks.
 */
const OPEN_KEY = 'admin_my_tasks_open'
const todayIl = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const isDue = (t: ManualTask) => !!t.due_date && t.due_date <= todayIl()

export default function MyTasksCard({ tasks, reload }: { tasks: ManualTask[]; reload: () => Promise<void> | void }) {
  const { profile } = useAuth()
  const openCustomer = useOpenCustomer()
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } })
  function toggle() {
    setOpen(o => { const n = !o; try { localStorage.setItem(OPEN_KEY, n ? '1' : '0') } catch { /* private mode */ } return n })
  }

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
        id: t.id, title: t.title, detail: t.detail, severity: t.severity, due_date: t.due_date,
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

  // ── quick add ──
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSeverity, setNewSeverity] = useState<'high' | 'mid'>('mid')
  const [newDue, setNewDue] = useState('')
  const [newCustomer, setNewCustomer] = useState<TaskCustomer | null>(null)
  const [saving, setSaving] = useState(false)
  async function add() {
    if (!newTitle.trim()) return
    setSaving(true)
    await supabase.from('admin_tasks').insert({ title: newTitle.trim(), severity: newSeverity, due_date: newDue || null, created_by: profile?.id ?? null, ...customerCols(newCustomer) })
    setSaving(false)
    setNewTitle(''); setNewSeverity('mid'); setNewDue(''); setNewCustomer(null); setAdding(false)
    if (!open) toggle()
    reload()
  }

  // ── edit ──
  const [editId, setEditId] = useState<string | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eDetail, setEDetail] = useState('')
  const [eSeverity, setESeverity] = useState<'high' | 'mid'>('mid')
  const [eDue, setEDue] = useState('')
  const [eCustomer, setECustomer] = useState<TaskCustomer | null>(null)
  function startEdit(t: ManualTask) {
    setEditId(t.id); setETitle(t.title); setEDetail(t.detail ?? '')
    setESeverity(t.severity === 'high' ? 'high' : 'mid'); setEDue(t.due_date ?? '')
    setECustomer(t.customer_name ? { name: t.customer_name, phone: t.customer_phone ?? null, email: t.customer_email ?? null } : null)
  }
  async function saveEdit() {
    if (!editId || !eTitle.trim()) return
    setSaving(true)
    await supabase.from('admin_tasks').update({
      title: eTitle.trim(), detail: eDetail.trim() || null, severity: eSeverity, due_date: eDue || null,
      ...customerCols(eCustomer),
    }).eq('id', editId)
    setSaving(false)
    setEditId(null)
    reload()
  }

  const dueNow = tasks.filter(isDue)
  const shown = open ? tasks : dueNow
  const inputStyle = { border: '1px solid #E9E2D6', color: '#443327' }

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <div className="flex items-center justify-between gap-2">
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
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
          style={{ fontSize: 13, padding: '6px 12px', background: '#C8A460', color: '#33281B' }}>
          <Plus className="w-3.5 h-3.5" /> משימה
        </button>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 mt-3" style={{ background: '#F6F3ED' }}>
          <select value={newSeverity} onChange={e => setNewSeverity(e.target.value as 'high' | 'mid')}
            className="flex-shrink-0 rounded-xl px-2 py-2 text-sm font-semibold bg-white focus:outline-none" style={inputStyle}>
            <option value="mid">רגיל</option>
            <option value="high">דחוף</option>
          </select>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} autoFocus
            placeholder="מה צריך לעשות? (Enter לשמירה)"
            className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} />
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
        <p className="mt-3 text-sm" style={{ color: '#A2937D' }}>אין משימות פתוחות</p>
      )}

      {shown.length > 0 && (
        <div className="space-y-1.5 mt-3">
          {shown.map(t => editId === t.id ? (
            <div key={t.id} className="rounded-2xl px-3 py-3 space-y-2" style={{ background: '#F6F3ED' }}>
              <div className="flex flex-wrap items-center gap-2">
                <select value={eSeverity} onChange={e => setESeverity(e.target.value as 'high' | 'mid')}
                  className="flex-shrink-0 rounded-xl px-2 py-2 text-sm font-semibold bg-white focus:outline-none" style={inputStyle}>
                  <option value="mid">רגיל</option>
                  <option value="high">דחוף</option>
                </select>
                <input value={eTitle} onChange={e => setETitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }} autoFocus
                  className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} aria-label="המשימה" />
                <input type="date" value={eDue} onChange={e => setEDue(e.target.value)} aria-label="תאריך למשימה"
                  className="flex-shrink-0 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none" style={{ ...inputStyle, width: 132 }} />
                <CustomerPicker value={eCustomer} onChange={setECustomer} />
              </div>
              <input value={eDetail} onChange={e => setEDetail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit() }}
                placeholder="פרטים (לא חובה)" className="w-full rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" style={inputStyle} />
              <div className="flex items-center gap-2">
                <button onClick={saveEdit} disabled={saving || !eTitle.trim()} className="font-bold rounded-xl disabled:opacity-40"
                  style={{ fontSize: 13, padding: '7px 14px', background: '#C8A460', color: '#33281B' }}>{saving ? '...' : 'שמירה'}</button>
                <button onClick={() => setEditId(null)} className="flex items-center gap-1 font-bold rounded-xl"
                  style={{ fontSize: 13, padding: '7px 12px', background: '#fff', color: '#6E5836' }}><X className="w-3.5 h-3.5" /> ביטול</button>
                <button onClick={() => remove(t)} disabled={busy === t.id} className="mr-auto flex items-center gap-1 font-bold rounded-xl disabled:opacity-40"
                  style={{ fontSize: 13, padding: '7px 12px', background: '#F6E3DA', color: '#8B4A30' }}><Trash2 className="w-3.5 h-3.5" /> מחיקה</button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.severity === 'high' ? '#8B4A30' : '#C8A460' }} title={t.severity === 'high' ? 'דחוף' : 'רגיל'} />
              <button onClick={() => startEdit(t)} className="flex-1 min-w-0 truncate text-right" style={{ fontSize: 14 }} title="עריכה">
                <span className="font-bold" style={{ color: '#443327' }}>{t.title}</span>
                {t.detail && <span style={{ color: '#A2937D' }}> · {t.detail}</span>}
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
          ))}
        </div>
      )}
    </div>
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
