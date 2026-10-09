import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOpenCustomer } from './CustomerCardContext'
import { shortProductName } from './useUserProducts'
import { dedupePayments, type MorningPayment, type RecentRegistration } from './useAdminOverview'
import { RegistrationRow } from './RecentRegistrationsCard'
import type { AdminTask, UnmatchedPayment } from './adminTasks'

/**
 * "מה חדש" — the first block on the admin home (9.10.26).
 *
 * Yahav: "אני רוצה מסך שמסכם לי את כל המצב ... ואני לא אצטרך לנחש".
 * Until now a new user meant opening משתמשות and scanning for who is new,
 * an event sign-up meant opening אירועי קהילה, a questionnaire meant
 * opening שאלונים. This block answers "what happened" for a period in one
 * place: every tile is a count, a tap opens the names, every name opens the
 * customer card, and the footer of each list goes to the page it lives on.
 *
 * Data: one read-only RPC, admin_activity_feed(p_from, p_to). Default period
 * is "היום" (Yahav's choice, 9.10.26).
 *
 * Where a new user came from is only what the data can prove: a friend's
 * code, a purchase, a public event page, a ?src= campaign link (recorded
 * since 7.10.26), her phone already in the CRM, or her own answer to "איך
 * שמעת על מימו". Anything else is "לא ידוע" and stays that way.
 */

type Lead = { id: string; at: string; name: string | null; phone: string | null; email: string | null; source: string | null; products: string[] | null; stage: string | null; pipeline: string | null; is_open: boolean | null }
type Inbound = { id: string; at: string; name: string | null; phone: string | null; email: string | null; text: string | null; kind: 'lead' | 'customer' }
type NewUser = { id: string; at: string; name: string | null; phone: string | null; email: string | null; onboarded: boolean; installed: boolean; src_kind: 'friend' | 'purchase' | 'event' | 'campaign' | 'crm' | 'said' | 'unknown'; src_detail: string | null }
type Reg = { id: string; at: string; name: string; phone: string | null; email: string | null; status: 'pending' | 'paid' | 'handled'; product: string | null; product_id: string | null; cohort_date: string | null; cohort_time: string | null; cohort_label: string | null; source: string | null }
type EventReg = { id: string; at: string; event_id: string; event: string; event_date: string; name: string | null; phone: string | null; email: string | null; status: string; paid: boolean; paid_via: string | null; guests: number }
type Interest = { id: string; at: string; event_id: string; event: string; event_date: string; name: string | null; phone: string | null; email: string | null; reason: string | null }
type FormSub = { id: string; at: string; form_id: string; form: string | null; name: string | null; phone: string | null; email: string | null }
type Payment = { id: string; at: string; total: number | null; name: string | null; phone: string | null; email: string | null; description: string | null; outcome: string | null }
type Gift = { id: string; at: string; code: string; status: string; name: string | null; phone: string | null; email: string | null; product: string | null; amount: number | null; recipient: string | null }
type OtherKind = 'makeup' | 'waitlist' | 'event_waitlist' | 'event_cancel' | 'credit_used' | 'install'
type Other = { kind: OtherKind; at: string; name: string | null; phone: string | null; email: string | null; detail: string | null }

type Feed = {
  leads: Lead[]; inbound: Inbound[]; users: NewUser[]; registrations: Reg[]
  event_regs: EventReg[]; event_interest: Interest[]; forms: FormSub[]; payments: Payment[]; gifts?: Gift[]; other: Other[]
}

type Period = 'today' | 'yesterday' | 'week' | 'since'
type TileKey = 'leads' | 'users' | 'registrations' | 'events' | 'forms' | 'payments' | 'inbound' | 'gifts' | 'other'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: 'yesterday', label: 'אתמול' },
  { key: 'week', label: '7 ימים' },
  { key: 'since', label: 'מאז הכניסה הקודמת' },
]

const OTHER_LABEL: Record<OtherKind, [string, string]> = {
  makeup: ['בקשת השלמה', 'בקשות השלמה'],
  waitlist: ['הצטרפה לרשימת המתנה', 'הצטרפו לרשימת המתנה'],
  event_waitlist: ['רשימת המתנה לאירוע', 'רשימת המתנה לאירועים'],
  event_cancel: ['ביטלה אירוע', 'ביטולי אירועים'],
  credit_used: ['מימשה זיכוי', 'זיכויים מומשו'],
  install: ['שמה במסך הבית', 'שמו במסך הבית'],
}

// ── time in Israel ──────────────────────────────────────────────────
const TZ = 'Asia/Jerusalem'
function ilDate(d: Date): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }) }
/** The UTC instant of 00:00 in Israel on a YYYY-MM-DD day. */
function ilMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess).map(p => [p.type, p.value]))
  const asIl = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess.getTime() - (asIl - guess.getTime()))
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
function whenHe(ts: string): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  const day = ilDate(d), today = ilDate(new Date())
  if (day === today) return time
  if (day === addDays(today, -1)) return `אתמול ${time}`
  return `${d.toLocaleDateString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric' })} ${time}`
}
function ddmm(day: string): string { const [, m, d] = day.split('-'); return `${Number(d)}/${Number(m)}` }

// "Since my last visit": read the previous stamp and write this one ONCE per
// page load (AdminPage mounts the home twice, mobile + desktop).
const SEEN_KEY = 'admin_whatsnew_seen_at'
let seenCache: number | null = null
function previousVisit(): number {
  if (seenCache === null) {
    let prev = 0
    try { prev = Date.parse(localStorage.getItem(SEEN_KEY) ?? '') || 0; localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* private mode */ }
    seenCache = prev
  }
  return seenCache
}

function range(p: Period, since: number): { from: Date; to: Date } {
  const today = ilDate(new Date())
  const now = new Date(Date.now() + 60_000)
  if (p === 'today') return { from: ilMidnight(today), to: now }
  if (p === 'yesterday') return { from: ilMidnight(addDays(today, -1)), to: ilMidnight(today) }
  if (p === 'week') return { from: ilMidnight(addDays(today, -6)), to: now }
  // No stamp yet (first visit on this browser): fall back to 7 days.
  return { from: since > 0 ? new Date(since) : ilMidnight(addDays(today, -6)), to: now }
}

const SRC_LABEL: Record<NewUser['src_kind'], string> = {
  friend: 'חברה הביאה', purchase: 'רכשה', event: 'אירוע מבחוץ', campaign: 'קמפיין', crm: 'ליד', said: 'לדבריה', unknown: 'מקור לא ידוע',
}

function Chip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' | 'blue' }) {
  const s = {
    ok: { background: '#E7F0E4', color: '#3F5B39' },
    warn: { background: '#F6ECD8', color: '#6E5836' },
    bad: { background: '#F5E2D8', color: '#8B4A30' },
    muted: { background: '#F1EBE1', color: '#8A7A63' },
    blue: { background: '#E4EBEF', color: '#35505C' },
  }[tone]
  return <span className="whitespace-nowrap font-bold rounded-full" style={{ fontSize: 11.5, padding: '3px 9px', ...s }}>{label}</span>
}

/** Count a list by a key, biggest first: "8 טופס פייסבוק · 3 ללא מקור". */
function breakdown<T>(rows: T[], keyOf: (r: T) => string, max = 2): string {
  const m = new Map<string, number>()
  rows.forEach(r => { const k = keyOf(r); m.set(k, (m.get(k) ?? 0) + 1) })
  const parts = [...m.entries()].sort((a, b) => b[1] - a[1])
  const head = parts.slice(0, max).map(([k, n]) => `${n} ${k}`)
  const rest = parts.slice(max).reduce((s, [, n]) => s + n, 0)
  return rest > 0 ? [...head, `${rest} אחר`].join(' · ') : head.join(' · ')
}

type Props = {
  /** Same rows as the old "נרשמו לאחרונה" (14 days, with cohort, balance and
   *  questionnaire). Used to show a workshop registration in full. */
  recentRegistrations: RecentRegistration[]
  monthRevenue: number
  onSection: (tab: 'leads' | 'users' | 'registrations' | 'events' | 'forms' | 'makeups' | 'workshops') => void
  onOpenTask?: (task: AdminTask) => void
  onOpenMonthPayments: () => void
  onAssignPayment: (p: UnmatchedPayment) => void
}

export default function WhatsNewCard({ recentRegistrations, monthRevenue, onSection, onOpenTask, onOpenMonthPayments, onAssignPayment }: Props) {
  const openCustomer = useOpenCustomer()
  const [since] = useState<number>(() => previousVisit())
  const [period, setPeriod] = useState<Period>('today')
  const [feed, setFeed] = useState<Feed | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState<TileKey | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = range(period, since)
    const { data, error: err } = await supabase.rpc('admin_activity_feed', { p_from: from.toISOString(), p_to: to.toISOString() })
    if (err) { console.error('[whats-new]', err); setError(true) } else { setError(false); setFeed(data as Feed) }
    setLoading(false)
  }, [period, since])

  useEffect(() => { load() }, [load])
  // Coming back to the tab refreshes "היום" without a reload.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const payments = useMemo(() => {
    if (!feed) return []
    const asMorning: MorningPayment[] = feed.payments.map(p => ({ id: p.id, received_at: p.at, description: p.description, total: Number(p.total ?? 0), payer_name: p.name, payer_email: p.email, outcome: p.outcome, detail: null }))
    const kept = new Set(dedupePayments(asMorning).map(p => p.id))
    return feed.payments.filter(p => kept.has(p.id))
  }, [feed])

  const regById = useMemo(() => new Map(recentRegistrations.map(r => [r.id, r])), [recentRegistrations])

  const f = feed
  const tiles: { key: TileKey; label: string; value: string; sub: string; count: number }[] = f ? [
    {
      key: 'leads', label: 'לידים חדשים', count: f.leads.length, value: String(f.leads.length),
      sub: f.leads.length ? breakdown(f.leads, l => l.source ?? 'ללא מקור') : '',
    },
    {
      key: 'users', label: 'משתמשות חדשות', count: f.users.length, value: String(f.users.length),
      sub: f.users.length ? breakdown(f.users, u => SRC_LABEL[u.src_kind], 3) : '',
    },
    {
      key: 'registrations', label: 'הרשמות לסדנאות', count: f.registrations.length, value: String(f.registrations.length),
      sub: f.registrations.length ? [
        `${f.registrations.filter(r => r.status !== 'pending').length} שילמו`,
        f.registrations.some(r => r.status === 'pending') ? `${f.registrations.filter(r => r.status === 'pending').length} ממתינות` : '',
      ].filter(Boolean).join(' · ') : '',
    },
    {
      key: 'events', label: 'אירועי קהילה', count: f.event_regs.length + f.event_interest.length, value: String(f.event_regs.length),
      sub: [
        f.event_regs.length ? breakdown(f.event_regs, e => e.event, 1) : '',
        f.event_interest.length ? `${f.event_interest.length} "לא מסתדר לי"` : '',
      ].filter(Boolean).join(' · '),
    },
    {
      key: 'forms', label: 'שאלונים מולאו', count: f.forms.length, value: String(f.forms.length),
      sub: f.forms.length ? breakdown(f.forms, s => s.form ?? 'שאלון', 1) : '',
    },
    {
      key: 'payments', label: 'תשלומים', count: payments.length,
      value: `₪${payments.reduce((s, p) => s + Number(p.total ?? 0), 0).toLocaleString()}`,
      sub: [
        payments.length ? `${payments.length} תשלומים` : '',
        payments.some(p => p.outcome === 'unmatched') ? `${payments.filter(p => p.outcome === 'unmatched').length} לא שויכו` : '',
      ].filter(Boolean).join(' · '),
    },
  ] : []
  // 9.10.26 (Yahav): a new gift card must jump out, not hide in a list.
  // Morning logs its payment as "unmatched", so this is where it reads as a gift.
  const gifts = f?.gifts ?? []
  if (gifts.length > 0) tiles.unshift({ key: 'gifts', label: 'גיפט קארד 🎁', count: gifts.length, value: String(gifts.length), sub: breakdown(gifts, g => g.product ? shortProductName(g.product) : 'גיפט', 1) })
  if (f && f.inbound.length > 0) tiles.push({ key: 'inbound', label: 'כתבו לך', count: f.inbound.length, value: String(f.inbound.length), sub: 'הודעות נכנסות ב-CRM' })

  const otherCounts = useMemo(() => {
    const m = new Map<OtherKind, number>()
    f?.other.forEach(o => m.set(o.kind, (m.get(o.kind) ?? 0) + 1))
    return [...m.entries()]
  }, [f])

  const total = tiles.reduce((s, t) => s + t.count, 0) + (f?.other.length ?? 0)
  const sinceLabel = since > 0 ? whenHe(new Date(since).toISOString()) : null

  function personBtn(name: string | null, phone: string | null, email: string | null, leadId?: string) {
    const can = !!(phone || email)
    return (
      <button
        onClick={() => can && openCustomer({ phone, email, leadId: leadId ?? null })}
        className={`font-bold truncate text-right ${can ? 'hover:underline' : 'cursor-default'}`}
        style={{ fontSize: 14.5, color: '#443327' }}
      >
        {name || phone || email || 'ללא שם'}
      </button>
    )
  }

  function Row({ children, at }: { children: React.ReactNode; at: string }) {
    return (
      <div className="flex items-start gap-3 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]">
        <span className="flex-1 min-w-0">{children}</span>
        <span className="flex-shrink-0 font-semibold" style={{ fontSize: 12, color: '#A2937D' }}>{whenHe(at)}</span>
      </div>
    )
  }

  function Footer({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <button onClick={onClick} className="w-full flex items-center justify-end gap-1 font-bold px-3.5 pt-2" style={{ fontSize: 13, color: '#8A6A2F' }}>
        {label} <ChevronLeft className="w-4 h-4" />
      </button>
    )
  }

  function detail() {
    if (!f || !open) return null
    switch (open) {
      case 'leads': return (<>
        {f.leads.map(l => (
          <Row key={l.id} at={l.at}>
            <span className="flex items-baseline gap-2 min-w-0">{personBtn(l.name, l.phone, l.email)}</span>
            <span className="flex flex-wrap gap-1.5 mt-1">
              <Chip label={l.source ?? 'ללא מקור'} tone={l.source ? 'blue' : 'muted'} />
              {(l.products ?? []).slice(0, 2).map(p => <Chip key={p} label={shortProductName(p)} tone="warn" />)}
              {l.stage && <Chip label={l.stage} tone="muted" />}
            </span>
          </Row>
        ))}
        <Footer label="לעמוד הלידים" onClick={() => onSection('leads')} />
      </>)
      case 'inbound': return (<>
        {f.inbound.map(m => (
          <Row key={`${m.kind}:${m.id}`} at={m.at}>
            {personBtn(m.name, m.phone, m.email)}
            {m.text && <p className="mt-0.5 line-clamp-2" style={{ fontSize: 13, color: '#6B5842' }}>{m.text}</p>}
          </Row>
        ))}
        <Footer label="לעמוד הלידים" onClick={() => onSection('leads')} />
      </>)
      case 'users': return (<>
        {f.users.map(u => (
          <Row key={u.id} at={u.at}>
            {personBtn(u.name, u.phone, u.email)}
            <span className="flex flex-wrap gap-1.5 mt-1">
              <Chip
                label={u.src_detail ? `${SRC_LABEL[u.src_kind]} · ${u.src_kind === 'purchase' ? shortProductName(u.src_detail) : u.src_detail}` : SRC_LABEL[u.src_kind]}
                tone={u.src_kind === 'unknown' ? 'muted' : u.src_kind === 'friend' || u.src_kind === 'campaign' ? 'ok' : 'blue'}
              />
              {!u.onboarded && <Chip label="לא סיימה הרשמה" tone="bad" />}
              {u.installed && <Chip label="במסך הבית" tone="ok" />}
            </span>
          </Row>
        ))}
        <Footer label="לעמוד המשתמשות" onClick={() => onSection('users')} />
      </>)
      case 'registrations': return (<>
        {f.registrations.map(r => {
          const rich = regById.get(r.id)
          if (rich) return <RegistrationRow key={r.id} r={rich} />
          return (
            <Row key={r.id} at={r.at}>
              {personBtn(r.name, r.phone, r.email, r.id)}
              <span className="flex flex-wrap gap-1.5 mt-1">
                {r.product && <Chip label={shortProductName(r.product)} tone="warn" />}
                {r.cohort_date && <Chip label={`${ddmm(r.cohort_date)}${r.cohort_time ? ` · ${r.cohort_time.slice(0, 5)}` : ''}`} tone="blue" />}
                <Chip label={r.status === 'pending' ? 'ממתינה לתשלום' : 'שילמה'} tone={r.status === 'pending' ? 'bad' : 'ok'} />
              </span>
            </Row>
          )
        })}
        <Footer
          label="לפתוח אותן בעמוד ההרשמות"
          onClick={() => onOpenTask
            ? onOpenTask({ key: 'whats-new:regs', title: `הרשמות חדשות · ${PERIODS.find(p => p.key === period)?.label}`, facts: [], severity: 'mid', section: 'registrations', actionLabel: '', sourceUpdatedAt: null, targetLeadIds: f.registrations.map(r => r.id) })
            : onSection('registrations')}
        />
      </>)
      case 'events': return (<>
        {f.event_regs.map(e => (
          <Row key={e.id} at={e.at}>
            {personBtn(e.name, e.phone, e.email)}
            <span className="flex flex-wrap gap-1.5 mt-1">
              <Chip label={`${e.event} · ${ddmm(e.event_date)}`} tone="blue" />
              {e.guests > 0 && <Chip label={`+${e.guests}`} tone="muted" />}
              {e.status === 'cancelled' ? <Chip label="בוטלה" tone="muted" />
                : e.status === 'pending' ? <Chip label="ממתינה לתשלום" tone="bad" />
                : e.paid_via === 'credit' ? <Chip label="זיכוי" tone="ok" />
                : e.paid ? <Chip label="שילמה" tone="ok" />
                : <Chip label="נרשמה" tone="ok" />}
            </span>
          </Row>
        ))}
        {f.event_interest.length > 0 && <p className="font-bold px-3.5 pt-3 pb-1" style={{ fontSize: 13, color: '#6E5836' }}>"לא מסתדר לי הפעם, אשמח פעם הבאה"</p>}
        {f.event_interest.map(i => (
          <Row key={i.id} at={i.at}>
            {personBtn(i.name, i.phone, i.email)}
            <span className="flex flex-wrap gap-1.5 mt-1">
              <Chip label={`${i.event} · ${ddmm(i.event_date)}`} tone="muted" />
              {i.reason && <Chip label={i.reason} tone="muted" />}
            </span>
          </Row>
        ))}
        <Footer label="לעמוד אירועי הקהילה" onClick={() => onSection('events')} />
      </>)
      case 'forms': {
        const byForm = new Map<string, FormSub[]>()
        f.forms.forEach(s => { const k = s.form ?? 'שאלון'; byForm.set(k, [...(byForm.get(k) ?? []), s]) })
        return (<>
          {[...byForm.entries()].sort((a, b) => b[1].length - a[1].length).map(([title, subs]) => (
            <div key={title}>
              <p className="font-bold px-3.5 pt-2 pb-0.5" style={{ fontSize: 13, color: '#6E5836' }}>{title} · {subs.length}</p>
              {subs.map(s => <Row key={s.id} at={s.at}>{personBtn(s.name, s.phone, s.email)}</Row>)}
            </div>
          ))}
          <Footer label="לעמוד השאלונים" onClick={() => onSection('forms')} />
        </>)
      }
      case 'payments': return (<>
        {payments.map(p => (
          <Row key={p.id} at={p.at}>
            <span className="flex items-baseline gap-2 min-w-0">
              {personBtn(p.name, p.phone, p.email)}
              <span className="font-display flex-shrink-0" style={{ fontSize: 15, color: '#443327' }}>₪{Number(p.total ?? 0).toLocaleString()}</span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 mt-1">
              {p.description && <span className="truncate" style={{ fontSize: 12.5, color: '#8A7A63', maxWidth: 260 }}>{p.description}</span>}
              {p.outcome === 'unmatched' && (
                <button onClick={() => onAssignPayment({ id: p.id, received_at: p.at, total: p.total, payer_name: p.name, payer_email: p.email, payer_phone: p.phone, description: p.description, detail: null, outcome: p.outcome })}>
                  <Chip label="לא שויך · לשייך ←" tone="bad" />
                </button>
              )}
            </span>
          </Row>
        ))}
        <Footer label={`כל התשלומים של החודש (₪${monthRevenue.toLocaleString()})`} onClick={onOpenMonthPayments} />
      </>)
      case 'gifts': return (<>
        {gifts.map(g => (
          <Row key={g.id} at={g.at}>
            <span className="flex items-baseline gap-2 min-w-0">
              {personBtn(g.name, g.phone, g.email)}
              {g.amount != null && <span className="font-display flex-shrink-0" style={{ fontSize: 15, color: '#443327' }}>₪{Number(g.amount).toLocaleString()}</span>}
            </span>
            <span className="flex flex-wrap gap-1.5 mt-1">
              {g.product && <Chip label={shortProductName(g.product)} tone="warn" />}
              <Chip label={g.recipient ? `למי: ${g.recipient}` : 'עוד בלי שם מקבלת'} tone={g.recipient ? 'blue' : 'muted'} />
              <Chip
                label={{ pending: 'ממתין לתשלום', paid: 'שולם, עוד לא נשלח', sent: 'נשלח', redeemed: 'מומש', cancelled: 'בוטל' }[g.status] ?? g.status}
                tone={g.status === 'paid' ? 'bad' : g.status === 'cancelled' ? 'muted' : g.status === 'pending' ? 'warn' : 'ok'}
              />
            </span>
          </Row>
        ))}
        <Footer label="לגיפט קארדים (מוצרים ותשלומים)" onClick={() => onSection('workshops')} />
      </>)
      case 'other': return (<>
        {f.other.map((o, i) => (
          <Row key={`${o.kind}:${i}`} at={o.at}>
            {personBtn(o.name, o.phone, o.email)}
            <span className="flex flex-wrap gap-1.5 mt-1">
              <Chip label={OTHER_LABEL[o.kind][0]} tone={o.kind === 'event_cancel' ? 'bad' : 'muted'} />
              {o.detail && <Chip label={o.kind === 'waitlist' ? shortProductName(o.detail) : o.detail} tone="muted" />}
            </span>
          </Row>
        ))}
        {f.other.some(o => o.kind === 'makeup') && <Footer label="לעמוד ההשלמות" onClick={() => onSection('makeups')} />}
      </>)
    }
  }

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-bold flex items-center gap-2" style={{ fontSize: 16, color: '#443327' }}>
          מה חדש
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: '#BCAE99' }} />}
        </h2>
        <button onClick={load} className="p-1 rounded-lg" aria-label="רענון" title="רענון">
          <RefreshCw className="w-4 h-4" style={{ color: '#BCAE99' }} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => { setPeriod(p.key); setOpen(null) }}
            className="font-bold rounded-full transition-colors"
            style={{ fontSize: 12.5, padding: '5px 12px', background: period === p.key ? '#443327' : '#F6F3ED', color: period === p.key ? '#FFFFFF' : '#6B5842' }}
          >
            {p.label}
            {p.key === 'since' && sinceLabel && <span style={{ opacity: 0.7 }}> ({sinceLabel})</span>}
          </button>
        ))}
      </div>

      {error && !feed ? (
        <p className="text-sm py-3 text-center" style={{ color: '#8B4A30' }}>לא הצלחתי לטעון. אפשר לנסות שוב ברענון.</p>
      ) : !f ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-2xl animate-pulse" style={{ height: 76, background: '#F6F3ED' }} />)}
        </div>
      ) : (<>
        {total === 0 && (
          <p className="font-semibold mb-3" style={{ fontSize: 13.5, color: '#8A7A63' }}>
            {period === 'today' ? 'עוד לא קרה היום שום דבר חדש.' : 'שקט בתקופה הזו.'}
            {period === 'today' && <button onClick={() => setPeriod('yesterday')} className="font-bold mr-1" style={{ color: '#8A6A2F' }}>מה היה אתמול?</button>}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map(t => {
            const active = open === t.key
            const can = t.count > 0
            return (
              <button
                key={t.key}
                onClick={() => can && setOpen(active ? null : t.key)}
                disabled={!can}
                aria-expanded={active}
                className={`rounded-2xl px-4 py-3 text-right transition-all ${can ? 'hover:brightness-95' : 'cursor-default'}`}
                style={{ background: active ? '#F6ECD8' : t.key === 'gifts' ? '#FBF1DC' : '#F6F3ED', outline: active || t.key === 'gifts' ? '2px solid #C8A460' : 'none', opacity: can ? 1 : 0.55 }}
              >
                <p className="font-display" style={{ fontSize: 24, lineHeight: 1.1, color: '#443327' }}>{t.value}</p>
                <p className="font-semibold mt-0.5" style={{ fontSize: 13, color: '#8A7A63' }}>{t.label}</p>
                {t.sub && <p className="mt-0.5 truncate" style={{ fontSize: 12, color: '#A2937D' }}>{t.sub}</p>}
              </button>
            )
          })}
        </div>

        {otherCounts.length > 0 && (
          <button
            onClick={() => setOpen(open === 'other' ? null : 'other')}
            className="w-full flex flex-wrap items-center gap-1.5 mt-3 rounded-2xl px-3.5 py-2.5 text-right transition-colors hover:bg-[#FAF7F1]"
            style={{ background: open === 'other' ? '#F6ECD8' : 'transparent' }}
            aria-expanded={open === 'other'}
          >
            <span className="font-bold" style={{ fontSize: 12.5, color: '#6E5836' }}>ועוד:</span>
            {otherCounts.map(([k, n]) => (
              <Chip key={k} label={`${n} ${n === 1 ? OTHER_LABEL[k][0] : OTHER_LABEL[k][1]}`} tone={k === 'event_cancel' ? 'bad' : 'muted'} />
            ))}
          </button>
        )}

        {open && <div className="mt-3 pt-2 space-y-0.5" style={{ borderTop: '1px solid #F1EBE1' }}>{detail()}</div>}
      </>)}
    </div>
  )
}
