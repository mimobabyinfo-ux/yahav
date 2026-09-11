import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle, Trash2, CalendarDays, X } from 'lucide-react'
import { supabase, type WorkshopWaitlistRow } from '../../lib/supabase'

/**
 * One product's waitlist as a control panel: a proposed date, and for every
 * mother where she stands on it.
 *
 * Yahav 11.9.26: "ברגע שאני שולח הודעה זה נעלם ואז אני לא מצליח לראות מי
 * האמהות שרצו ... אני רוצה לדעת מי יכלה מי לא מי לא ענתה ולהיות בבקרה על
 * זה כדי שאם יש לי מספיק אז אני אוכל להוציא את זה לפועל". Until now the
 * home card listed only notified_at IS NULL, so pressing "שלח" made her
 * vanish, and the product page hid her behind "הצג N שכבר עודכנו". Nobody
 * was deleted; the list just stopped showing the people he needed most.
 *
 * Rules:
 * - Nobody leaves the list for being messaged. Only "הסרה" removes a row.
 * - The proposed date is on the product (workshops.waitlist_proposed_date),
 *   not a cohort, so he can test a date before a buy button exists.
 * - Her answer is tied to the date she was asked about (proposed_date).
 *   Change the proposed date and everyone is "not asked yet" again, with
 *   the old answer shown as history. "לא יכולה ב-25/09" therefore stays in
 *   the data as someone to call for the next cohort, automatically.
 * - Sending is still a wa.me link (see project memory whatsapp_24h_window).
 * - Yahav 11.9.26: "מי שנרשמה תצא משם". A row is "registered" when he marks
 *   it so, OR when a paid registration_leads row for the same product and
 *   the same person (user_id, else normalized phone) was created after she
 *   asked. Registered rows leave the tally and fold into one line.
 *
 * Used by both WaitlistHomeCard and the product page (WaitlistPanel), so
 * the two never drift apart again.
 */

type Status = 'not_sent' | 'sent' | 'yes' | 'no' | 'registered'

type Cohort = { id: string; start_date: string; is_active: boolean }
type PaidLead = { user_id: string | null; normalized_phone: string | null; created_at: string }

function waHref(phone: string | null, text: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('972') ? digits : digits.replace(/^0/, '972')
  if (intl.length < 11) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

function agoHe(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`
  return `לפני ${Math.floor(days / 30)} חודשים`
}

/** Where does this row stand on the CURRENT proposal? */
export function statusOf(r: WorkshopWaitlistRow, proposed: string | null, paidLeads: PaidLead[] = []): Status {
  if (r.response === 'registered') return 'registered'
  const paid = paidLeads.some(l =>
    l.created_at > r.created_at &&
    ((r.user_id && l.user_id === r.user_id) ||
     (r.normalized_phone && l.normalized_phone === r.normalized_phone)))
  if (paid) return 'registered'
  if (r.proposed_date === proposed) {
    if (r.response) return r.response
    return r.notified_at ? 'sent' : 'not_sent'
  }
  // Sent before this feature existed: notified_at set, no date recorded.
  // Treat as "asked, waiting for an answer" about the current proposal;
  // marking an answer attaches the current date to the row.
  if (proposed && r.notified_at && !r.proposed_date) return 'sent'
  return 'not_sent'
}

const ORDER: Record<Status, number> = { not_sent: 0, sent: 1, yes: 2, no: 3, registered: 4 }

export default function WaitlistOutreach({ workshopId, workshopTitle, compact = false }: {
  workshopId: string
  workshopTitle: string
  /** Home card: tighter rows. Product page: roomier. */
  compact?: boolean
}) {
  const [rows, setRows] = useState<WorkshopWaitlistRow[]>([])
  const [proposed, setProposed] = useState<string | null>(null)
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [paidLeads, setPaidLeads] = useState<PaidLead[]>([])
  const [loading, setLoading] = useState(true)
  const [showRegistered, setShowRegistered] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<WorkshopWaitlistRow | null>(null)

  const load = useCallback(async () => {
    const [{ data: w }, { data: ws }, { data: cs }, { data: pl }] = await Promise.all([
      supabase.from('workshop_waitlist').select('*').eq('workshop_id', workshopId).order('created_at'),
      supabase.from('workshops').select('waitlist_proposed_date').eq('id', workshopId).maybeSingle(),
      supabase.from('workshop_cohorts').select('id, start_date, is_active').eq('workshop_id', workshopId),
      // Who already paid for this product. Matched per row in statusOf.
      supabase.from('registration_leads').select('user_id, normalized_phone, created_at')
        .eq('selected_workshop_id', workshopId).eq('status', 'paid'),
    ])
    setPaidLeads((pl ?? []) as PaidLead[])
    setRows((w ?? []) as WorkshopWaitlistRow[])
    setProposed((ws as { waitlist_proposed_date: string | null } | null)?.waitlist_proposed_date ?? null)
    setCohorts((cs ?? []) as Cohort[])
    setLoading(false)
  }, [workshopId])
  useEffect(() => { load() }, [load])

  // If a real cohort already exists for the proposed date, keep stamping
  // notified_cohort_id like before, so older reports still work.
  const cohortForProposed = useMemo(
    () => (proposed ? cohorts.find(c => c.start_date === proposed) ?? null : null),
    [cohorts, proposed],
  )
  // Convenience: the soonest upcoming cohort, offered as a one-tap default
  // when nothing has been proposed yet.
  const nextCohort = useMemo(() => {
    const t = todayIso()
    return cohorts.filter(c => c.is_active && c.start_date > t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
  }, [cohorts])

  const withStatus = useMemo(
    () => rows
      .map(r => ({ r, s: statusOf(r, proposed, paidLeads) }))
      .sort((a, b) => ORDER[a.s] - ORDER[b.s] || a.r.created_at.localeCompare(b.r.created_at)),
    [rows, proposed, paidLeads],
  )
  const active = useMemo(() => withStatus.filter(x => x.s !== 'registered'), [withStatus])
  const registered = useMemo(() => withStatus.filter(x => x.s === 'registered'), [withStatus])
  const counts = useMemo(() => {
    const c: Record<Status, number> = { not_sent: 0, sent: 0, yes: 0, no: 0, registered: 0 }
    for (const { s } of withStatus) c[s]++
    return c
  }, [withStatus])

  async function saveProposed(date: string | null) {
    setProposed(date)
    await supabase.from('workshops').update({ waitlist_proposed_date: date }).eq('id', workshopId)
  }

  function messageFor(r: WorkshopWaitlistRow): string {
    const hi = `היי ${firstName(r.name)}, ביקשת שנעדכן אותך כשייפתח מחזור חדש של ${workshopTitle}.`
    return proposed
      ? `${hi} אנחנו מתכננים לפתוח מחזור ב${longDate(proposed)}. מתאים לך?`
      : hi
  }

  async function markSent(r: WorkshopWaitlistRow) {
    const patch = {
      notified_at: new Date().toISOString(),
      notified_cohort_id: cohortForProposed?.id ?? null,
      proposed_date: proposed,
      response: null,
      responded_at: null,
    }
    await supabase.from('workshop_waitlist').update(patch).eq('id', r.id)
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...patch } : x))
  }

  async function setResponse(r: WorkshopWaitlistRow, response: 'yes' | 'no' | 'registered' | null) {
    const patch = {
      response,
      responded_at: response ? new Date().toISOString() : null,
      proposed_date: proposed,
      // He may have heard the answer by phone without ever pressing "שלח".
      notified_at: r.notified_at ?? new Date().toISOString(),
      notified_cohort_id: r.notified_cohort_id ?? cohortForProposed?.id ?? null,
    }
    await supabase.from('workshop_waitlist').update(patch).eq('id', r.id)
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...patch } : x))
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await supabase.from('workshop_waitlist').delete().eq('id', pendingDelete.id)
    setRows(prev => prev.filter(x => x.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  if (loading || rows.length === 0) return null

  const fs = compact ? 12 : 13

  return (
    <div className="space-y-3">
      {/* Proposed date */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl px-3 py-2" style={{ background: '#FBF3E4' }}>
        <CalendarDays className="w-4 h-4 flex-shrink-0" style={{ color: '#8A6A2F' }} />
        <label className="font-semibold" style={{ fontSize: 12, color: '#8A6A2F' }}>תאריך שאני מציע:</label>
        <input
          type="date"
          value={proposed ?? ''}
          onChange={e => saveProposed(e.target.value || null)}
          className="rounded-lg px-2 py-1 bg-white"
          style={{ fontSize: 12, color: '#443327', border: '1px solid #E9E2D6' }}
        />
        {proposed && (
          <button onClick={() => saveProposed(null)} title="נקה תאריך" className="p-1">
            <X className="w-3.5 h-3.5" style={{ color: '#A2937D' }} />
          </button>
        )}
        {!proposed && nextCohort && (
          <button onClick={() => saveProposed(nextCohort.start_date)}
            className="rounded-lg px-2 py-1 font-semibold" style={{ fontSize: 11, background: '#fff', color: '#6E5836' }}>
            השתמש במחזור הקרוב ({shortDate(nextCohort.start_date)})
          </button>
        )}
        {proposed && cohortForProposed && (
          <span style={{ fontSize: 11, color: '#7A8F63' }}>יש מחזור בתאריך הזה</span>
        )}
      </div>

      {/* Tally: the number he actually needs */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ fontSize: 12 }}>
        <span className="font-bold" style={{ color: '#5C7A4A' }}>יכולות {counts.yes}</span>
        <span className="font-bold" style={{ color: '#B5543D' }}>לא יכולות {counts.no}</span>
        <span style={{ color: '#C08A5A' }}>לא ענו {counts.sent}</span>
        <span style={{ color: '#A2937D' }}>עוד לא נשלח {counts.not_sent}</span>
        {counts.registered > 0 && (
          <button onClick={() => setShowRegistered(v => !v)} className="font-semibold" style={{ color: '#6E5836' }}>
            נרשמו {counts.registered} {showRegistered ? '(הסתר)' : '(הצג)'}
          </button>
        )}
      </div>
      {!proposed && (
        <p style={{ fontSize: 11, color: '#8A6A2F' }}>
          בלי תאריך ההודעה רק אומרת "ביקשת שנעדכן אותך". קבע תאריך כדי לשאול "מתאים לך?" ולסמן תשובות.
        </p>
      )}

      <div className="space-y-1.5">
        {active.map(({ r, s }) => {
          const href = waHref(r.phone, messageFor(r))
          const muted = s === 'no'
          const history = r.response && r.proposed_date && r.proposed_date !== proposed
            ? `${r.response === 'yes' ? 'יכלה' : 'לא יכלה'} ב-${shortDate(r.proposed_date)}`
            : null
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{ background: s === 'yes' ? '#EEF3E8' : s === 'no' ? '#F6F1EE' : '#FBF8F3', opacity: muted ? 0.75 : 1 }}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ fontSize: fs, color: '#443327' }}>{r.name}</p>
                <p style={{ fontSize: 11, color: '#A2937D' }} dir="ltr">{r.phone || r.email || 'אין פרטי קשר'}</p>
                <p style={{ fontSize: 10.5, color: '#BCAE99' }}>
                  ביקשה {agoHe(r.created_at)}
                  {s === 'sent' && r.notified_at && ` · נשלח ${agoHe(r.notified_at)}${r.proposed_date ? '' : ' (בלי תאריך רשום)'}`}
                  {s === 'yes' && ' · יכולה'}
                  {s === 'no' && ' · לא יכולה בתאריך הזה, נשארת לרשימה של המחזור הבא'}
                  {history && ` · ${history}`}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {s === 'not_sent' && (href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => markSent(r)}
                    className="inline-flex items-center gap-1 rounded-xl font-bold text-white"
                    style={{ background: '#5C7A4A', fontSize: 12, padding: '6px 10px' }}>
                    <MessageCircle className="w-3.5 h-3.5" />
                    שלח
                  </a>
                ) : (
                  <button onClick={() => markSent(r)} className="rounded-xl font-semibold"
                    style={{ background: '#F0EAE0', color: '#6E5836', fontSize: 12, padding: '6px 10px' }}>
                    סמן כנשלח
                  </button>
                ))}

                {s !== 'not_sent' && href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" title="שלח שוב"
                    className="p-1.5 rounded-lg" style={{ color: '#5C7A4A' }}>
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}

                <button onClick={() => setResponse(r, s === 'yes' ? null : 'yes')} title="יכולה"
                  className="rounded-lg font-bold"
                  style={{ fontSize: 11, padding: '5px 8px', background: s === 'yes' ? '#5C7A4A' : '#fff', color: s === 'yes' ? '#fff' : '#5C7A4A', border: '1px solid #5C7A4A' }}>
                  יכולה
                </button>
                <button onClick={() => setResponse(r, s === 'no' ? null : 'no')} title="לא יכולה"
                  className="rounded-lg font-bold"
                  style={{ fontSize: 11, padding: '5px 8px', background: s === 'no' ? '#B5543D' : '#fff', color: s === 'no' ? '#fff' : '#B5543D', border: '1px solid #B5543D' }}>
                  לא יכולה
                </button>
                <button onClick={() => setResponse(r, 'registered')} title="נרשמה ושילמה מחוץ למערכת"
                  className="rounded-lg font-bold"
                  style={{ fontSize: 11, padding: '5px 8px', background: '#fff', color: '#6E5836', border: '1px solid #C8A460' }}>
                  נרשמה
                </button>

                <button onClick={() => setPendingDelete(r)} title="הסרה מהרשימה" className="p-1">
                  <Trash2 className="w-4 h-4" style={{ color: '#E2B4AA' }} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showRegistered && registered.length > 0 && (
        <div className="space-y-1.5">
          {registered.map(({ r }) => (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: '#F5F1E8', opacity: 0.8 }}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ fontSize: fs, color: '#6E5836' }}>{r.name}</p>
                <p style={{ fontSize: 10.5, color: '#A2937D' }}>
                  {r.response === 'registered' ? 'סומנה כנרשמה' : 'נרשמה ושילמה (זוהה אוטומטית)'}
                </p>
              </div>
              {r.response === 'registered' && (
                <button onClick={() => setResponse(r, null)} className="rounded-lg font-semibold"
                  style={{ fontSize: 11, padding: '5px 8px', background: '#fff', color: '#6E5836', border: '1px solid #E9E2D6' }}>
                  החזר לרשימה
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6" onClick={() => setPendingDelete(null)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm text-right" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sm" style={{ color: '#443327' }}>להסיר את {pendingDelete.name} מהרשימה?</p>
            <p className="text-xs mt-1" style={{ color: '#A2937D' }}>
              היא לא תדע על זה, ולא תופיע יותר כמי שרוצה את הסדנה. אם היא רק לא יכולה בתאריך הזה, סמן "לא יכולה" והיא תישאר למחזור הבא.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">הסרה</button>
              <button onClick={() => setPendingDelete(null)} className="px-4 py-3 rounded-2xl font-semibold text-sm" style={{ background: '#F0EAE0', color: '#6E5836' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
