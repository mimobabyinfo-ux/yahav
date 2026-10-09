import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronDown, Megaphone, Sparkles, Store, CheckCircle2, Check, RotateCcw, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AdminOverview, MorningPayment } from './useAdminOverview'
import type { AdminTask, AdminTaskSection } from './adminTasks'
import MimoLeaf from '../MimoLeaf'
import UnclaimedPurchasesCard from './UnclaimedPurchasesCard'
import WaitlistHomeCard from './WaitlistHomeCard'
import MyTasksCard from './MyTasksCard'
import WhatsNewCard from './WhatsNewCard'
import AssignPaymentModal from './AssignPaymentModal'
import type { UnmatchedPayment } from './adminTasks'

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




type Props = {
  overview: AdminOverview
  onSection: (section: AdminTaskSection | 'perks' | 'leads' | 'users' | 'makeups') => void
  /** Phase 3 (handoff §4): open a task's destination WITH its context —
   *  filter pre-applied, object pre-opened, context bar shown. */
  onOpenTask?: (task: AdminTask) => void
  /** Jump straight to a product page from the home screen. */
  onOpenProduct?: (workshopId: string) => void
}

export default function AdminHome({ overview, onSection, onOpenTask, onOpenProduct }: Props) {
  const { profile } = useAuth()
  const { loading, tasks, manualTasks, counters, monthPayments, capacity, recentRegistrations, announcements, storeProducts, upcomingEvents, reload } = overview
  // The הכנסות number opens into the payments behind it.
  const [showPayments, setShowPayments] = useState(false)
  // 6.10.26: "למי שייך התשלום?" for an unmatched Morning payment.
  const [assigning, setAssigning] = useState<UnmatchedPayment | null>(null)

  // Yahav 26.8.26: he asked for open/close on the home cards. The admin
  // home has grown into a column of tall lists and he does not need all of
  // them at once; the ones he has dealt with should get out of the way.
  // Brenda 14.9.26: "שיהיה בדיפולט סגור ואם אני רוצה אני אפתח".
  const [openCapacity, setOpenCapacity] = useState(true)
  // Yahav 2.10.26: the right column is reference, not action. Folded by
  // default, remembered per browser.
  const [openUserView, setOpenUserView] = useState<boolean>(() => { try { return localStorage.getItem('admin_home_user_view_open') === '1' } catch { return false } })
  function toggleRemembered(key: string, set: (f: (v: boolean) => boolean) => void) {
    set(v => { const n = !v; try { localStorage.setItem(key, n ? '1' : '0') } catch { /* private mode */ } return n })
  }
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
  // Brenda 28.9.26: her own tasks moved to "המשימות שלי" (MyTasksCard), with
  // editing. Tasks the system writes (a refund owed, link_section set) stay
  // here, they are obligations. Her own tasks count in the greeting only
  // when due today or overdue.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const myTasks = manualTasks.filter(t => !t.link_section)
  const systemTasks = manualTasks.filter(t => !!t.link_section)
  const myDueNow = myTasks.filter(t => !!t.due_date && t.due_date <= today).length
  const attentionCount = tasks.length + systemTasks.length
  const totalOpen = attentionCount + myDueNow
  // Yahav 2.10.26: the October goal is to fill every workshop cohort to the
  // end of the year, so that is the number on top. Same count as "כמה
  // נרשמו" (every registration, any status), cohorts with a capacity only.
  const yearEnd = `${today.slice(0, 4)}-12-31`
  const cohortsToYearEnd = capacity.filter(r => r.kind === 'cohort' && r.date <= yearEnd && r.capacity != null)
  const openSeats = cohortsToYearEnd.reduce((sum, r) => sum + Math.max(0, (r.capacity ?? 0) - r.count), 0)

  return (
    <div dir="rtl">
      <div className="admin-home-grid grid gap-5 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* ── Main column ── */}
        <div className="space-y-5 min-w-0">

          {/* Greeting strip */}
          {/* 9.10.26 (Lovable mockup, approved by Yahav): one quiet line, not a card. */}
          <div className="px-1">
            <div className="flex items-center gap-2.5">
              <MimoLeaf variant="sand-1" size={30} rotate={-12} className="flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display" style={{ fontSize: 20, color: '#443327' }}>
                  {greetingByHour()} {firstName}
                  {totalOpen > 0
                    ? `, ${totalOpen === 1 ? 'דבר אחד מחכה' : `${totalOpen} דברים מחכים`} לך`
                    : ', הכול נקי ✨'}
                </h1>
              </div>
            </div>
            {assigning && (
              <AssignPaymentModal payment={assigning} onClose={() => setAssigning(null)} onDone={reload} />
            )}
            {showPayments && (
              <MonthPaymentsModal payments={monthPayments} total={counters.monthRevenue} onClose={() => setShowPayments(false)} onAssign={p => { setShowPayments(false); setAssigning({ id: p.id, received_at: p.received_at, total: p.total, payer_name: p.payer_name, payer_email: p.payer_email, description: p.description, detail: p.detail, outcome: p.outcome }) }} />
            )}
          </div>

          {/* 9.10.26: "מה חדש" replaced the three tiles in the greeting and
              the "נרשמו לאחרונה" card. What happened today (or yesterday,
              7 days, since the last visit), every number opens the names. */}
          <WhatsNewCard
            recentRegistrations={recentRegistrations}
            monthRevenue={counters.monthRevenue}
            onSection={onSection}
            onOpenTask={onOpenTask}
            onOpenMonthPayments={() => setShowPayments(true)}
            onAssignPayment={p => setAssigning(p)}
            onTaskAdded={reload}
          />

          {/* Paid but never got in. Renders nothing when the list is empty,
              which is the normal state — it only appears when a mother is
              actually stuck, and then it sits above everything else. */}
          <UnclaimedPurchasesCard />

          {/* "נרשמו ולא השלימו תשלום" used to sit here too. Yahav 26.8.26:
              "אני רוצה שזה יהיה רק באירועי קהילה." It lives in
              EventsAdminPanel only, next to the events it is about. */}

          {/* 9.10.26 (Lovable mockup, approved by Yahav): המשימות שלי on the
              right, דורש תשומת לב on the left as cards (icon, title, one muted
              line, action + טופל underneath). On a phone attention comes first:
              it is where the money is. */}
          <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <MyTasksCard tasks={myTasks} reload={reload} />
          </div>
          <div className="min-w-0 order-first lg:order-none">
            <div className="flex items-center gap-2 mb-3 px-1">
              <AlertTriangle className="w-4 h-4" style={{ color: '#8A7A63' }} />
              <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>דורש תשומת לב</h2>
              {attentionCount > 0 && <span className="font-bold rounded-full" style={{ fontSize: 11.5, padding: '1px 8px', background: '#F5E2D8', color: '#8B4A30' }}>{attentionCount}</span>}
            </div>

            {undo && (
              <div className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 mb-2" style={{ background: '#EDEDE6' }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#4F5040' }} />
                <p className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 13, color: '#4F5040' }}>טופל: {undo.label}</p>
                <button
                  onClick={async () => { const u = undo; setUndo(null); if (undoTimer.current) clearTimeout(undoTimer.current); await u.run() }}
                  className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl"
                  style={{ fontSize: 13, padding: '5px 10px', background: '#fff', color: '#4F5040' }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> ביטול
                </button>
              </div>
            )}

            {attentionCount === 0 ? (
              <div className="flex items-center gap-3 rounded-3xl px-4 py-4 bg-white" style={{ border: '1px solid #E9E2D6' }}>
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: '#3F5B39' }} />
                <p className="font-semibold" style={{ fontSize: 14, color: '#4F5040' }}>הכול מטופל, אפשר לנשום</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  ...systemTasks.map(t => ({
                    key: t.id, high: t.severity === 'high', title: t.title, sub: t.detail ?? '',
                    actionLabel: t.link_section ? 'מעבר' : null,
                    onAction: () => onSection(t.link_section as AdminTaskSection),
                    onDone: () => completeManual(t.id, t.title), busy: busyToggle === t.id,
                    doneTitle: 'סימון כטופל',
                  })),
                  ...tasks.map(t => ({
                    key: t.key, high: t.severity === 'high', title: t.title, sub: t.facts.filter(Boolean).join(' · '),
                    actionLabel: t.actionLabel,
                    onAction: () => (t.payment ? setAssigning(t.payment) : onOpenTask ? onOpenTask(t) : onSection(t.section)),
                    onDone: () => dismissDerived(t.key, t.title), busy: busyToggle === t.key,
                    doneTitle: 'טופל. יחזור אם משהו ישתנה במקור',
                  })),
                ].map(item => (
                  <div key={item.key} className="bg-white rounded-3xl p-4" style={{ border: '1px solid #E9E2D6' }}>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 rounded-xl flex items-center justify-center" style={{ width: 32, height: 32, background: item.high ? '#F5E2D8' : '#F6ECD8' }}>
                        <AlertTriangle className="w-4 h-4" style={{ color: item.high ? '#8B4A30' : '#8A6A2F' }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold leading-snug" style={{ fontSize: 14.5, color: '#443327', overflowWrap: 'anywhere' }}>{item.title}</p>
                        {item.sub && <p className="mt-0.5" style={{ fontSize: 12.5, color: '#A2937D', overflowWrap: 'anywhere' }}>{item.sub}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3" style={{ paddingRight: 44 }}>
                      {item.actionLabel && (
                        <button onClick={item.onAction}
                          className="flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
                          style={{ fontSize: 13, padding: '6px 12px', background: item.high ? '#F5E2D8' : '#F6ECD8', color: item.high ? '#8B4A30' : '#6E5836' }}>
                          {item.actionLabel} <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={item.onDone} disabled={item.busy} title={item.doneTitle}
                        className="flex items-center gap-1 font-bold rounded-xl transition-all hover:bg-[#F6F3ED] disabled:opacity-40"
                        style={{ fontSize: 13, padding: '6px 10px', color: '#8A7A63' }}>
                        <Check className="w-3.5 h-3.5" /> טופל
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* כמה נרשמו — split by kind.
              Yahav 26.8.26: "בכמה נרשמו שזה יתחלק לי לאירועי קהילה
              ולסדנאות, כשזה הכל ביחד זה מבלבל." He is right: a community
              evening and a paid workshop cohort are different businesses
              with different capacities, and a single date-sorted list
              interleaved them so neither read as a whole. */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <button
              onClick={() => setOpenCapacity(v => !v)}
              className="w-full flex items-center justify-between mb-3"
              aria-expanded={openCapacity}
            >
              <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>
                כמה נרשמו
                {/* Yahav 2.10.26: the October goal, moved here from the greeting tiles 9.10.26. */}
                {cohortsToYearEnd.length > 0 && <span className="font-semibold" style={{ fontSize: 13, color: '#8A6A2F' }}> · {openSeats} מקומות פנויים עד סוף השנה</span>}
              </h2>
              <ChevronDown className="w-4 h-4 transition-transform" style={{ color: '#BCAE99', transform: openCapacity ? 'rotate(180deg)' : 'none' }} />
            </button>
            {!openCapacity ? null : capacity.length === 0 ? (
              <p className="text-sm py-3 text-center" style={{ color: '#A2937D' }}>אין מחזורים או אירועים קרובים</p>
            ) : (
              /* 9.10.26 (Yahav): community events and workshops side by side, as in the Lovable mockup. */
              <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
                {([
                  ['event', 'אירועי קהילה'],
                  ['cohort', 'סדנאות'],
                ] as const).map(([kind, label]) => {
                  const group = capacity.filter(r => r.kind === kind)
                  if (group.length === 0) return null
                  return (
                    <div key={kind} className="min-w-0">
                      <p className="font-bold mb-1.5 px-1" style={{ fontSize: 13, color: '#6E5836' }}>
                        {label} · {group.length}
                      </p>
                      <div className="space-y-1">
                {group.map(row => {
                  const ratio = row.capacity ? Math.min(1, row.count / row.capacity) : 0
                  const left = row.capacity != null ? Math.max(0, row.capacity - row.count) : null
                  const tight = left != null && left <= 3
                  return (
                    <button
                      key={`${row.kind}:${row.id}`}
                      onClick={() => {
                        // 6.10.26: a cohort opens ITS registrations, not the
                        // whole registrations page.
                        if (row.kind === 'cohort' && row.leadIds && row.leadIds.length > 0 && onOpenTask) {
                          onOpenTask({
                            key: `cohort:${row.id}`,
                            title: `${row.title} · ${ddmm(row.date)}${row.time ? ` ${row.time}` : ''}`,
                            facts: [], severity: 'mid', section: 'registrations', actionLabel: '',
                            sourceUpdatedAt: null, targetLeadIds: row.leadIds,
                          })
                        } else {
                          onSection(row.kind === 'cohort' ? 'registrations' : 'events')
                        }
                      }}
                      className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-right transition-colors hover:bg-[#FAF7F1]"
                    >
                      <span className="flex flex-col items-center justify-center flex-shrink-0 rounded-xl" style={{ width: 52, padding: '5px 0', background: '#F6F3ED' }}>
                        <span className="font-display" style={{ fontSize: 16, lineHeight: 1, color: '#443327' }}>{ddmm(row.date)}</span>
                        <span className="font-semibold" style={{ fontSize: 11, color: '#8A7A63' }}>{weekdayHe(row.date)}</span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate" style={{ fontSize: 14, color: '#443327' }}>
                          {row.title}
                          {row.time && <span className="font-semibold" style={{ color: '#A2937D' }}> · {row.time}</span>}
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
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Yahav 26.8.26: the waitlist was only reachable from inside a
              product. 6.10.26: moved below the capacity list, and it only
              shows when someone on it needs an action. */}
          <WaitlistHomeCard onOpenProduct={onOpenProduct} />

          {/* מועמדות למגלים moved 9.10.26 to the לידים page, tab "בוגרות עטופים". */}

        </div>

        {/* ── Right column — מה המשתמשת רואה עכשיו ── */}
        <div className="space-y-5 min-w-0">
          {/* 9.10.26: moved from a right-hand column to the bottom of the home,
              folded, with a one-line summary (Lovable mockup). */}
          <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
            <button onClick={() => toggleRemembered('admin_home_user_view_open', setOpenUserView)} className="w-full flex items-center justify-between text-right" aria-expanded={openUserView}>
              <span>
                <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>מה המשתמשת רואה עכשיו</h2>
                <span className="block mt-0.5" style={{ fontSize: 12.5, color: '#A2937D' }}>
                  {announcements.filter(a => a.is_active).length} הודעות פעילות · {upcomingEvents.filter(e => e.is_active).length} אירועים מוצגים
                </span>
              </span>
              <ChevronDown className="w-4 h-4 transition-transform" style={{ color: '#BCAE99', transform: openUserView ? 'rotate(180deg)' : 'none' }} />
            </button>
            {openUserView && (<div className="grid gap-5 mt-4 md:grid-cols-3">

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
            </div>)}
          </div>

          {/* ספקים ואירועים moved 9.10.26 to the top of the אירועי קהילה page. */}
        </div>
      </div>
    </div>
  )
}

// ─── The money, line by line ─────────────────────────────────────────
// Brenda 1.9.26: "ההכנסות החודש גם לא מדוייקות - אני רוצה שהם יכילו את
// הכל דרך הממשק של מורנינג ולא ינחשו". So the tile adds up what Morning
// charged, and this is that list: every payment, with the amount that was
// actually taken. If a number looks wrong, the row that caused it is here.
//
// What it cannot show: anything before 17.8.26 (the webhook log starts
// there), and money that never went through Morning — a Bit transfer
// marked paid by hand has no amount anywhere in the system.

function paymentDateHe(ts: string): string {
  return new Date(ts).toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit',
  })
}

function paymentTimeHe(ts: string): string {
  return new Date(ts).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit',
  })
}

function MonthPaymentsModal({
  payments,
  total,
  onClose,
  onAssign,
}: {
  payments: MorningPayment[]
  total: number
  onClose: () => void
  /** 6.10.26: open "למי שייך התשלום?" for an unmatched row. */
  onAssign?: (p: MorningPayment) => void
}) {
  // A payment Morning delivered that we could not attach to anyone. The
  // money is real and counts; the seat is the open question.
  const unmatched = payments.filter(p => p.outcome === 'unmatched')

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: 'rgba(40,30,20,0.45)' }} onClick={onClose}>
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h3 className="font-bold" style={{ fontSize: 17, color: '#443327' }}>נכנס החודש</h3>
            <p className="mt-0.5" style={{ fontSize: 12.5, color: '#8A7A63' }}>
              כל מה שמורנינג חייבה בפועל, לפי הסכום שנגבה
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl transition-colors hover:bg-sand-100" aria-label="סגירה">
            <X className="w-4 h-4" style={{ color: '#8A7A63' }} />
          </button>
        </div>

        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex items-baseline gap-2 rounded-2xl px-4 py-3" style={{ background: '#F6ECD8' }}>
            <span className="font-display" style={{ fontSize: 24, color: '#443327' }}>₪{total.toLocaleString()}</span>
            <span className="font-semibold" style={{ fontSize: 12.5, color: '#6E5836' }}>
              ב-{payments.length} תשלומים
            </span>
          </div>
          {unmatched.length > 0 && (
            <p className="mt-2 rounded-2xl px-3 py-2 font-semibold" style={{ fontSize: 12, background: '#F7EBE4', color: '#8B4A30' }}>
              {unmatched.length === 1 ? 'תשלום אחד נכנס' : `${unmatched.length} תשלומים נכנסו`} בלי שהצלחנו לשייך אותו למישהי. הכסף נספר, המקום לא.
            </p>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-2">
          {payments.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#8A7A63' }}>
              עוד לא נכנס כסף החודש דרך מורנינג.
            </p>
          ) : payments.map(p => (
            <div key={p.id} className="rounded-2xl px-4 py-3" style={{ background: '#F5F1EB' }}>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold flex-1 min-w-0 truncate" style={{ fontSize: 13.5, color: '#443327' }}>
                  {p.payer_name || p.payer_email || 'ללא שם'}
                </span>
                <span className="font-bold flex-shrink-0" style={{ fontSize: 14, color: '#443327' }}>
                  ₪{Number(p.total ?? 0).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-2" style={{ fontSize: 11.5, color: '#8A7A63' }}>
                <span>{paymentDateHe(p.received_at)} · {paymentTimeHe(p.received_at)}</span>
                {p.description && <span>· {p.description}</span>}
                {p.outcome === 'unmatched' && (
                  onAssign
                    ? <button onClick={() => onAssign(p)} className="underline" style={{ color: '#8B4A30', fontWeight: 700 }}>· לא שויך, לשיוך</button>
                    : <span style={{ color: '#8B4A30', fontWeight: 700 }}>· לא שויך</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
