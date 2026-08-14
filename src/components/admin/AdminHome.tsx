import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Megaphone, Sparkles, Store, AlertTriangle, CheckCircle2, Users, Check, Plus, RotateCcw, MessageCircle, Baby } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AdminOverview } from './useAdminOverview'
import type { AdminTask, AdminTaskSection } from './adminTasks'
import MimoLeaf from '../MimoLeaf'
import UnclaimedPurchasesCard from './UnclaimedPurchasesCard'

// Admin home ("בית") — answers "what needs me today" (design handoff §3).
// Three blocks: greeting strip with counters, the derived task list
// (one line per task), and the capacity list (cohorts + events, one
// list by date). Right column: live controls over what the user-facing
// app shows right now. Phase 1 — derived tasks only, no persistence.

function greetingByHour(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function weekdayHe(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long' })
}

// "3.5" → "3 וחצי", "4.0" → "4" — reads like a mother talks about her
// baby's age, not like a number in a table.
function ageHe(months: number): string {
  const whole = Math.floor(months)
  const half = months - whole >= 0.5
  const num = half ? `${whole} וחצי` : String(whole)
  return whole === 1 && !half ? 'חודש' : `${num} חודשים`
}

function agoHe(days: number): string {
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 14) return `לפני ${days} ימים`
  if (days < 60) return `לפני ${Math.round(days / 7)} שבועות`
  return `לפני ${Math.round(days / 30.44)} חודשים`
}

function waHref(phone: string, text: string): string {
  const intl = phone.replace(/\D/g, '').replace(/^0/, '972')
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

type Props = {
  overview: AdminOverview
  onSection: (section: AdminTaskSection | 'perks') => void
  /** Phase 3 (handoff §4): open a task's destination WITH its context —
   *  filter pre-applied, object pre-opened, context bar shown. */
  onOpenTask?: (task: AdminTask) => void
}

export default function AdminHome({ overview, onSection, onOpenTask }: Props) {
  const { profile } = useAuth()
  const { loading, tasks, manualTasks, counters, capacity, megalim, announcements, storeProducts, upcomingEvents, eventsMissingVendor, recentPartnerLeads, reload } = overview
  const [showAllMegalim, setShowAllMegalim] = useState(false)
  const [busyToggle, setBusyToggle] = useState<string | null>(null)

  // ── טופל + undo (phase 2). One undo slot, visible ~10 seconds. ──
  const [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  function showUndo(label: string, run: () => Promise<void>) {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ label, run })
    undoTimer.current = setTimeout(() => setUndo(null), 10_000)
  }

  // Dismiss a DERIVED task — persisted by stable key; resurfaces when
  // the source row changes after dismissed_at.
  async function dismissDerived(taskKey: string, label: string) {
    setBusyToggle(taskKey)
    await supabase.from('admin_task_dismissals').upsert(
      { task_key: taskKey, dismissed_at: new Date().toISOString(), dismissed_by: profile?.id ?? null },
      { onConflict: 'task_key' },
    )
    await reload()
    setBusyToggle(null)
    showUndo(label, async () => {
      await supabase.from('admin_task_dismissals').delete().eq('task_key', taskKey)
      await reload()
    })
  }

  // Complete a MANUAL task (admin_tasks row).
  async function completeManual(id: string, label: string) {
    setBusyToggle(id)
    await supabase.from('admin_tasks').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', id)
    await reload()
    setBusyToggle(null)
    showUndo(label, async () => {
      await supabase.from('admin_tasks').update({ status: 'open', done_at: null }).eq('id', id)
      await reload()
    })
  }

  // ── Manual task quick-add ──
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSeverity, setNewSeverity] = useState<'high' | 'mid'>('mid')
  const [savingTask, setSavingTask] = useState(false)

  async function addManualTask() {
    if (!newTitle.trim()) return
    setSavingTask(true)
    await supabase.from('admin_tasks').insert({
      title: newTitle.trim(),
      severity: newSeverity,
      created_by: profile?.id ?? null,
    })
    setSavingTask(false)
    setNewTitle('')
    setNewSeverity('mid')
    setAdding(false)
    reload()
  }

  async function toggleAnnouncement(id: string, isActive: boolean) {
    setBusyToggle(id)
    await supabase.from('home_announcements').update({ is_active: !isActive, updated_at: new Date().toISOString() }).eq('id', id)
    await reload()
    setBusyToggle(null)
  }

  async function toggleEvent(id: string, isActive: boolean) {
    setBusyToggle(id)
    await supabase.from('community_events').update({ is_active: !isActive, updated_at: new Date().toISOString() }).eq('id', id)
    await reload()
    setBusyToggle(null)
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  const firstName = (profile?.mother_name ?? 'ברנדה').split(' ')[0]
  const totalOpen = tasks.length + manualTasks.length

  return (
    <div dir="rtl">
      <style>{`@media (min-width: 1200px) { .admin-home-grid { grid-template-columns: minmax(0, 1fr) 340px !important; } }`}</style>
      <div className="admin-home-grid grid gap-5 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* ── Main column ── */}
        <div className="space-y-5 min-w-0">

          {/* Greeting strip */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <div className="flex items-center gap-3">
              <MimoLeaf variant="sand-1" size={40} rotate={-12} className="flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display" style={{ fontSize: 22, color: '#443327' }}>
                  {greetingByHour()} {firstName}
                  {totalOpen > 0
                    ? `, ${totalOpen === 1 ? 'דבר אחד מחכה' : `${totalOpen} דברים מחכים`} לך`
                    : ', הכול נקי ✨'}
                </h1>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'ממתינות לתשלום', value: String(counters.pendingPayment), sub: null },
                { label: 'נכנס החודש', value: `₪${counters.monthRevenue.toLocaleString()}`, sub: 'לפי מחיר המוצר' },
                { label: 'נרשמות פעילות', value: String(counters.activeRegistrations), sub: null },
              ].map(c => (
                <div key={c.label} className="rounded-2xl px-4 py-3" style={{ background: '#F6F3ED' }}>
                  <p className="font-display" style={{ fontSize: 24, lineHeight: 1.1, color: '#443327' }}>{c.value}</p>
                  <p className="font-semibold mt-0.5" style={{ fontSize: 13, color: '#8A7A63' }}>
                    {c.label}{c.sub && <span style={{ color: '#A2937D' }}> · {c.sub}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Paid but never got in. Renders nothing when the list is empty,
              which is the normal state — it only appears when a mother is
              actually stuck, and then it sits above everything else. */}
          <UnclaimedPurchasesCard />

          {/* דורש תשומת לב — one line per task, טופל persists (phase 2) */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>דורש תשומת לב</h2>
              <button
                onClick={() => setAdding(a => !a)}
                className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
                style={{ fontSize: 13, padding: '6px 12px', background: '#C8A460', color: '#33281B' }}
              >
                <Plus className="w-3.5 h-3.5" /> משימה
              </button>
            </div>

            {/* Quick-add manual task */}
            {adding && (
              <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-2" style={{ background: '#F6F3ED' }}>
                <select
                  value={newSeverity}
                  onChange={e => setNewSeverity(e.target.value as 'high' | 'mid')}
                  className="flex-shrink-0 rounded-xl px-2 py-2 text-sm font-semibold bg-white focus:outline-none"
                  style={{ border: '1px solid #E9E2D6', color: '#5E4938' }}
                >
                  <option value="mid">רגיל</option>
                  <option value="high">דחוף</option>
                </select>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addManualTask() }}
                  autoFocus
                  placeholder="מה צריך לעשות? (Enter לשמירה)"
                  className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-mustard-400"
                  style={{ border: '1px solid #E9E2D6', color: '#443327' }}
                />
                <button onClick={addManualTask} disabled={savingTask || !newTitle.trim()}
                  className="flex-shrink-0 font-bold rounded-xl disabled:opacity-40"
                  style={{ fontSize: 13, padding: '8px 14px', background: '#C8A460', color: '#33281B' }}>
                  {savingTask ? '...' : 'הוספה'}
                </button>
              </div>
            )}

            {/* Undo row — visible ~10s after טופל */}
            {undo && (
              <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 mb-2" style={{ background: '#EDEDE6' }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#4F5040' }} />
                <p className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 13, color: '#4F5040' }}>
                  טופל: {undo.label}
                </p>
                <button
                  onClick={async () => { const u = undo; setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current); await u.run() }}
                  className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl"
                  style={{ fontSize: 13, padding: '5px 10px', background: '#fff', color: '#4F5040' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> ביטול
                </button>
              </div>
            )}

            {totalOpen === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4" style={{ background: '#EDEDE6' }}>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: '#4F5040' }} />
                <p className="font-semibold" style={{ fontSize: 14, color: '#4F5040' }}>אין משימות פתוחות. הכול מטופל</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Manual tasks first — Brenda wrote them herself */}
                {manualTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.severity === 'high' ? '#8B4A30' : '#C8A460' }} />
                    <p className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>
                      <span className="font-bold" style={{ color: '#443327' }}>{t.title}</span>
                      {t.detail && <span style={{ color: '#A2937D' }}> · {t.detail}</span>}
                      <span style={{ color: '#A2937D' }}> · משימה שלך</span>
                    </p>
                    {t.link_section && (
                      <button onClick={() => onSection(t.link_section as AdminTaskSection)}
                        className="flex-shrink-0 flex items-center gap-0.5 font-bold rounded-xl transition-all hover:brightness-95"
                        style={{ fontSize: 13, padding: '6px 12px', background: '#F6ECD8', color: '#6E5836' }}>
                        מעבר <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => completeManual(t.id, t.title)}
                      disabled={busyToggle === t.id}
                      className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95 disabled:opacity-40"
                      style={{ fontSize: 13, padding: '6px 12px', background: '#EDEDE6', color: '#4F5040' }}
                      title="סימון כטופל"
                    >
                      <Check className="w-3.5 h-3.5" /> טופל
                    </button>
                  </div>
                ))}

                {/* Derived tasks — טופל hides until the source changes */}
                {tasks.map(t => (
                  <div key={t.key} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: t.severity === 'high' ? '#8B4A30' : '#C8A460' }}
                      title={t.severity === 'high' ? 'דחוף' : 'בינוני'}
                    />
                    <p className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>
                      <span className="font-bold" style={{ color: '#443327' }}>{t.title}</span>
                      {t.facts.filter(Boolean).length > 0 && (
                        <span style={{ color: '#A2937D' }}> · {t.facts.filter(Boolean).join(' · ')}</span>
                      )}
                    </p>
                    <button
                      onClick={() => (onOpenTask ? onOpenTask(t) : onSection(t.section))}
                      className="flex-shrink-0 flex items-center gap-0.5 font-bold rounded-xl transition-all hover:brightness-95"
                      style={{ fontSize: 13, padding: '6px 12px', background: '#F6ECD8', color: '#6E5836' }}
                    >
                      {t.actionLabel}
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => dismissDerived(t.key, t.title)}
                      disabled={busyToggle === t.key}
                      className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95 disabled:opacity-40"
                      style={{ fontSize: 13, padding: '6px 12px', background: '#EDEDE6', color: '#4F5040' }}
                      title="טופל. יחזור אם משהו ישתנה במקור"
                    >
                      <Check className="w-3.5 h-3.5" /> טופל
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* מועמדות למגלים — graduates whose baby reached the right age.
              The CRM's follow-up is calendar-based (+14 days after
              עטופים); this list is AGE-based, so it catches the mothers
              that message reached too early. */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>
                מועמדות ל{megalim.targetTitle?.includes('מגלים') ? 'מגלים' : (megalim.targetTitle ?? 'סדנת ההמשך')}
                {megalim.candidates.length > 0 && (
                  <span className="font-display" style={{ color: '#8A6A2F' }}> · {megalim.candidates.length}</span>
                )}
              </h2>
              {megalim.candidates.length > 3 && (
                <button onClick={() => setShowAllMegalim(s => !s)} className="flex-shrink-0 font-bold" style={{ fontSize: 12, color: '#8A6A2F' }}>
                  {showAllMegalim ? 'הצגה מקוצרת' : `הצגת כולן (${megalim.candidates.length})`}
                </button>
              )}
            </div>
            <p className="mb-3" style={{ fontSize: 12, color: '#A2937D' }}>
              סיימו עטופים, עוד לא נרשמו למגלים, והתינוק/ת הגיע/ה לגיל {ageHe(megalim.fromMonths)} ומעלה
            </p>

            {megalim.candidates.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4" style={{ background: '#F6F3ED' }}>
                <Baby className="w-5 h-5 flex-shrink-0" style={{ color: '#8A7A63' }} />
                <p className="font-semibold" style={{ fontSize: 14, color: '#8A7A63' }}>
                  אין כרגע בוגרות עטופים בטווח הגיל של מגלים
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {(showAllMegalim ? megalim.candidates : megalim.candidates.slice(0, 3)).map(c => (
                  <div key={c.leadId} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]">
                    <span className="flex flex-col items-center justify-center flex-shrink-0 rounded-xl" style={{ width: 52, padding: '5px 0', background: '#F6ECD8' }}>
                      <span className="font-display" style={{ fontSize: 16, lineHeight: 1, color: '#6E5836' }}>{c.ageMonths}</span>
                      <span className="font-semibold" style={{ fontSize: 11, color: '#8A7A63' }}>חודשים</span>
                    </span>
                    <p className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>
                      <span className="font-bold" style={{ color: '#443327' }}>{c.name}</span>
                      {c.babyName && <span style={{ color: '#A2937D' }}> · {c.babyName}</span>}
                      <span style={{ color: '#A2937D' }}> · סיימה עטופים {agoHe(c.daysSinceFinish)}</span>
                    </p>
                    <a
                      href={waHref(c.phone, `היי ${c.name.split(' ')[0]}! 🐣`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
                      style={{ fontSize: 13, padding: '6px 12px', background: '#E7F0E4', color: '#3F5B39' }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> וואטסאפ
                    </a>
                  </div>
                ))}
                {!showAllMegalim && megalim.candidates.length > 3 && (
                  <button onClick={() => setShowAllMegalim(true)} className="w-full text-right font-bold px-3.5 pt-1" style={{ fontSize: 12, color: '#8A6A2F' }}>
                    ועוד {megalim.candidates.length - 3} ←
                  </button>
                )}
              </div>
            )}

            {megalim.unknownDobCount > 0 && (
              <p className="mt-2.5 px-1" style={{ fontSize: 12, color: '#A2937D' }}>
                ל-{megalim.unknownDobCount} בוגרות נוספות אין תאריך לידה של התינוק/ת בשאלון, והן לא נספרות כאן
              </p>
            )}
          </div>

          {/* כמה נרשמו — cohorts + events, one list by date */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <h2 className="font-bold mb-3" style={{ fontSize: 16, color: '#443327' }}>כמה נרשמו</h2>
            {capacity.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: '#A2937D' }}>אין מחזורים או אירועים קרובים</p>
            ) : (
              <div className="space-y-1">
                {capacity.map(row => {
                  const ratio = row.capacity ? Math.min(1, row.count / row.capacity) : 0
                  const left = row.capacity != null ? Math.max(0, row.capacity - row.count) : null
                  const tight = left != null && left <= 3
                  return (
                    <button
                      key={`${row.kind}:${row.id}`}
                      onClick={() => onSection(row.kind === 'cohort' ? 'registrations' : 'events')}
                      className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-right transition-colors hover:bg-[#FAF7F1]"
                    >
                      <span className="flex flex-col items-center justify-center flex-shrink-0 rounded-xl" style={{ width: 52, padding: '5px 0', background: '#F6F3ED' }}>
                        <span className="font-display" style={{ fontSize: 16, lineHeight: 1, color: '#443327' }}>{ddmm(row.date)}</span>
                        <span className="font-semibold" style={{ fontSize: 11, color: '#8A7A63' }}>{weekdayHe(row.date)}</span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate" style={{ fontSize: 14, color: '#443327' }}>
                          {row.title}
                          <span className="font-semibold" style={{ color: '#A2937D' }}> · {row.kind === 'cohort' ? 'מחזור' : 'אירוע'}{row.time ? ` · ${row.time}` : ''}</span>
                        </span>
                        <span className="block mt-1.5 rounded-full overflow-hidden" style={{ height: 6, background: '#F1EBE1' }}>
                          <span className="block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: tight ? '#8B4A30' : '#C8A460' }} />
                        </span>
                      </span>
                      <span className="flex-shrink-0 text-left" style={{ minWidth: 74 }}>
                        <span className="block font-display" style={{ fontSize: 16, color: '#443327' }}>
                          {row.count}{row.capacity != null && `/${row.capacity}`}
                        </span>
                        <span className="block font-semibold" style={{ fontSize: 12, color: tight ? '#8B4A30' : '#8A7A63' }}>
                          {row.capacity == null ? 'ללא הגבלה' : left === 0 ? 'מלא' : `נותרו ${left}`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column — מה המשתמשת רואה עכשיו ── */}
        <div className="space-y-5 min-w-0">
          <div className="bg-white rounded-3xl p-5 space-y-4" style={{ border: '1px solid #E9E2D6' }}>
            <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>מה המשתמשת רואה עכשיו</h2>

            {/* Home announcements — compact toggles */}
            <div>
              <p className="flex items-center gap-1.5 font-bold mb-1.5" style={{ fontSize: 13, color: '#8A7A63' }}>
                <Megaphone className="w-3.5 h-3.5" /> הודעות בדף הבית
              </p>
              {announcements.length === 0 ? (
                <p style={{ fontSize: 13, color: '#A2937D' }}>אין הודעות · <button onClick={() => onSection('perks')} className="font-bold underline" style={{ color: '#6E5836' }}>ליצירה</button></p>
              ) : (
                <div className="space-y-1">
                  {announcements.map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAnnouncement(a.id, a.is_active)}
                        disabled={busyToggle === a.id}
                        dir="ltr"
                        className="flex-shrink-0 disabled:opacity-50"
                        style={{ width: 34, height: 20, borderRadius: 9999, background: a.is_active ? '#818267' : '#DCD4C8', padding: 2, display: 'flex', alignItems: 'center', justifyContent: a.is_active ? 'flex-end' : 'flex-start', transition: 'background .15s' }}
                        title={a.is_active ? 'מוצג. לחצי לכיבוי' : 'כבוי'}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 9999, background: '#fff', display: 'block' }} />
                      </button>
                      <p className="flex-1 min-w-0 truncate" style={{ fontSize: 13, color: a.is_active ? '#443327' : '#A2937D', fontWeight: 600 }}>
                        {a.emoji && `${a.emoji} `}{a.title}
                      </p>
                    </div>
                  ))}
                  <button onClick={() => onSection('perks')} className="font-bold" style={{ fontSize: 12, color: '#8A6A2F' }}>ניהול מלא ←</button>
                </div>
              )}
            </div>

            {/* Top of store — display_order === first, NOT a featured flag */}
            <div>
              <p className="flex items-center gap-1.5 font-bold mb-1.5" style={{ fontSize: 13, color: '#8A7A63' }}>
                <Store className="w-3.5 h-3.5" /> בראש החנות
              </p>
              {storeProducts.length === 0 ? (
                <p style={{ fontSize: 13, color: '#A2937D' }}>אין מוצרים פעילים בחנות</p>
              ) : (
                <button onClick={() => onSection('workshops')} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-right transition-colors hover:brightness-95" style={{ background: '#F6F3ED' }}>
                  <span className="flex-1 min-w-0 truncate font-bold" style={{ fontSize: 13, color: '#443327' }}>{storeProducts[0].title}</span>
                  <span className="flex-shrink-0 font-semibold" style={{ fontSize: 12, color: '#8A7A63' }}>לשינוי, גרירה במוצרים</span>
                </button>
              )}
            </div>

            {/* Active upcoming community events */}
            <div>
              <p className="flex items-center gap-1.5 font-bold mb-1.5" style={{ fontSize: 13, color: '#8A7A63' }}>
                <Sparkles className="w-3.5 h-3.5" /> אירועי קהילה מוצגים
              </p>
              {upcomingEvents.length === 0 ? (
                <p style={{ fontSize: 13, color: '#A2937D' }}>אין אירועים קרובים</p>
              ) : (
                <div className="space-y-1">
                  {upcomingEvents.slice(0, 5).map(ev => (
                    <div key={ev.id} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleEvent(ev.id, ev.is_active)}
                        disabled={busyToggle === ev.id}
                        dir="ltr"
                        className="flex-shrink-0 disabled:opacity-50"
                        style={{ width: 34, height: 20, borderRadius: 9999, background: ev.is_active ? '#818267' : '#DCD4C8', padding: 2, display: 'flex', alignItems: 'center', justifyContent: ev.is_active ? 'flex-end' : 'flex-start', transition: 'background .15s' }}
                        title={ev.is_active ? 'מוצג. לחצי לכיבוי' : 'טיוטה'}
                      >
                        <span style={{ width: 16, height: 16, borderRadius: 9999, background: '#fff', display: 'block' }} />
                      </button>
                      <p className="flex-1 min-w-0 truncate" style={{ fontSize: 13, color: ev.is_active ? '#443327' : '#A2937D', fontWeight: 600 }}>
                        {ev.emoji && `${ev.emoji} `}{ev.title} · {ddmm(ev.event_date)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ספקים ואירועים */}
          <div className="bg-white rounded-3xl p-5 space-y-3" style={{ border: '1px solid #E9E2D6' }}>
            <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>ספקים ואירועים</h2>
            {eventsMissingVendor.length > 0 && (
              <div className="rounded-2xl px-3.5 py-3" style={{ background: '#F7EBE4' }}>
                <p className="flex items-center gap-1.5 font-bold" style={{ fontSize: 13, color: '#8B4A30' }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {eventsMissingVendor.length === 1 ? 'אירוע קרוב בלי ספק' : `${eventsMissingVendor.length} אירועים קרובים בלי ספק`}
                </p>
                <div className="mt-1 space-y-0.5">
                  {eventsMissingVendor.slice(0, 3).map(ev => (
                    <button key={ev.id} onClick={() => onSection('events')} className="block font-semibold text-right" style={{ fontSize: 13, color: '#6B5842' }}>
                      {ev.title} · {ddmm(ev.event_date)} ←
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => onSection('partners')} className="w-full flex items-center gap-2 rounded-2xl px-3.5 py-3 text-right transition-colors hover:brightness-95" style={{ background: '#EEF2F4' }}>
              <Users className="w-4 h-4 flex-shrink-0" style={{ color: '#35505C' }} />
              <span className="flex-1 font-semibold" style={{ fontSize: 13, color: '#35505C' }}>
                {recentPartnerLeads === 0 ? 'אין לידים חדשים לספקים השבוע' : `${recentPartnerLeads} לידים לספקים בשבוע האחרון`}
              </span>
              <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#35505C' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
