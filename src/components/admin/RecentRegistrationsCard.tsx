import { useState } from 'react'
import { ChevronDown, CalendarDays, AlertTriangle } from 'lucide-react'
import { useOpenCustomer } from './CustomerCardContext'
import { shortProductName } from './useUserProducts'
import type { RecentRegistration } from './useAdminOverview'

/**
 * "נרשמו לאחרונה" on the admin home (6.10.26).
 *
 * Yahav: "כשמגיע הרשמה חדשה אני צריך לחפש אותה לאיזה מחזור נרשמו ... אני
 * מקבל מייל ממורנינג ומגרואו ואני לא באמת יודע לאיזה מחזור הבחורה נרשמה".
 * The receipt emails carry a name and an amount, never the cohort. This is
 * the one place that says, per new registration: which product, WHICH
 * COHORT (weekday, date, time), paid or not, questionnaire or not. A tap
 * opens her card. Last 14 days, newest first; first 5 shown.
 *
 * "חדשה" marks rows newer than the last time this card was opened on this
 * browser (localStorage, per-viewer convenience only).
 */

const SEEN_KEY = 'admin_recent_regs_seen_at'

function whenHe(ts: string): string {
  const d = new Date(ts)
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const y = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const time = d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
  if (day === today) return `היום ${time}`
  if (day === y) return `אתמול ${time}`
  return d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' })
}

function cohortHe(c: { start_date: string; start_time: string | null }): string {
  const d = new Date(c.start_date + 'T12:00:00')
  const wd = d.toLocaleDateString('he-IL', { weekday: 'short' })
  const [, m, dd] = c.start_date.split('-')
  return `${wd} ${Number(dd)}/${Number(m)}${c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''}`
}

function Chip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }) {
  const s = {
    ok: { background: '#E7F0E4', color: '#3F5B39' },
    warn: { background: '#F6ECD8', color: '#6E5836' },
    bad: { background: '#F5E2D8', color: '#8B4A30' },
    muted: { background: '#F1EBE1', color: '#8A7A63' },
  }[tone]
  return <span className="whitespace-nowrap font-bold rounded-full" style={{ fontSize: 11.5, padding: '3px 9px', ...s }}>{label}</span>
}

export default function RecentRegistrationsCard({ rows }: { rows: RecentRegistration[] }) {
  const openCustomer = useOpenCustomer()
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem('admin_recent_regs_open') !== '0' } catch { return true } })
  // Read once per mount: rows newer than the previous visit get a dot.
  const [seenAt] = useState<string>(() => {
    let prev = ''
    try { prev = localStorage.getItem(SEEN_KEY) ?? ''; localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch { /* private mode */ }
    return prev
  })

  if (rows.length === 0) return null
  const week = rows.filter(r => Date.now() - new Date(r.created_at).getTime() < 7 * 86400000).length
  const fresh = seenAt ? rows.filter(r => r.created_at > seenAt).length : 0
  const shown = showAll ? rows : rows.slice(0, 5)

  function toggle() {
    setOpen(v => { const n = !v; try { localStorage.setItem('admin_recent_regs_open', n ? '1' : '0') } catch { /* */ } return n })
  }

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <button onClick={toggle} className="w-full flex items-center justify-between gap-2" aria-expanded={open}>
        <h2 className="font-bold flex items-center gap-2" style={{ fontSize: 16, color: '#443327' }}>
          נרשמו לאחרונה
          <span className="font-display" style={{ color: '#8A6A2F' }}>· {week} השבוע</span>
          {fresh > 0 && <span className="font-bold rounded-full" style={{ fontSize: 11.5, padding: '2px 8px', background: '#C8A460', color: '#33281B' }}>{fresh} חדשות</span>}
        </h2>
        <ChevronDown className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: '#BCAE99', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {shown.map(r => {
            const isNew = !!seenAt && r.created_at > seenAt
            return (
              <button
                key={r.id}
                onClick={() => openCustomer({ phone: r.phone, email: r.email, leadId: r.id })}
                className="w-full text-right flex items-start gap-3 rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-[#FAF7F1]"
              >
                <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: isNew ? '#C8A460' : 'transparent' }} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-bold truncate" style={{ fontSize: 14.5, color: '#443327' }}>{r.name}</span>
                    <span className="flex-shrink-0" style={{ fontSize: 12, color: '#A2937D', fontWeight: 600 }}>{whenHe(r.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5 flex-wrap" style={{ fontSize: 13, fontWeight: 700 }}>
                    <span style={{ color: '#6E5836' }}>{r.workshopTitle ? shortProductName(r.workshopTitle) : 'ללא מוצר'}</span>
                    {r.cohort ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#35505C' }}>
                        <CalendarDays className="w-3.5 h-3.5" /> {cohortHe(r.cohort)}
                      </span>
                    ) : r.needsCohort ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#8B4A30' }}>
                        <AlertTriangle className="w-3.5 h-3.5" /> בלי מחזור
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.status === 'pending'
                      ? <Chip label="ממתינה לתשלום" tone="bad" />
                      : r.balanceLeft != null && r.balanceLeft > 0
                        ? <Chip label={`יתרה ₪${r.balanceLeft.toLocaleString()}`} tone="warn" />
                        : <Chip label="שילמה" tone="ok" />}
                    {r.formFilled === true && <Chip label="שאלון ✓" tone="ok" />}
                    {r.formFilled === false && <Chip label="שאלון חסר" tone={r.status === 'pending' ? 'muted' : 'warn'} />}
                  </span>
                </span>
              </button>
            )
          })}
          {rows.length > 5 && (
            <button onClick={() => setShowAll(v => !v)} className="w-full text-right font-bold px-3.5 pt-1" style={{ fontSize: 12.5, color: '#8A6A2F' }}>
              {showAll ? 'הצגה מקוצרת' : `עוד ${rows.length - 5} מהשבועיים האחרונים ←`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
