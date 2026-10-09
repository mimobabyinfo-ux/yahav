import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Check, Clock, CalendarDays, ChevronDown, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOpenCustomer } from './CustomerCardContext'

// 6.10.26: names open the customer card (phone is the key the card uses).
function NameLink({ name, phone, className }: { name: string | null; phone: string | null; className: string }) {
  const open = useOpenCustomer()
  if (!phone) return <span className={className}>{name ?? '—'}</span>
  return <button type="button" onClick={() => open({ phone })} className={`${className} hover:underline text-right`}>{name ?? '—'}</button>
}

// מסך ההשלמות. קריאה בלבד כמעט לגמרי, במכוון.
//
// ברנדה 3.9.26: "כל פיצ׳ר ניהולי חייב להיות ברירת מחדל של אפס קליקים".
// ההקצאה רצה לבד כל שעה ושולחת את המיילים; המסך הזה קיים כדי שהיא תדע מי
// מגיעה למפגש הקרוב ומי ממתינה בתור, לא כדי שתאשר בקשות.
//
// שתי הפעולות היחידות כאן: הרצת הקצאה מוקדמת (כשהיא רוצה תשובה לפני
// שהקרון מגיע), וסימון "הגיעה" אחרי מפגש.

type Roster = {
  meeting_id: string
  workshop_title: string
  cohort_label: string
  meeting_number: number
  meeting_date: string
  start_time: string | null
  is_cancelled: boolean
  allocated_at: string | null
  capacity: number
  registered: number
  absent: number
  makeups_in: number
  makeups_waiting: number
}

type Request = {
  request_id: string
  status: string
  reject_reason: string | null
  requested_at: string
  mother_name: string | null
  mother_phone: string | null
  workshop_title: string
  meeting_number: number
  missed_date: string
  source_cohort_label: string
  makeup_date: string
  makeup_time: string | null
  makeup_cohort_label: string
  queue_position: number | null
  allocated_at: string | null
  target_meeting_id: string
}

type Absence = {
  absence_id: string
  meeting_id: string
  marked_at: string
  mother_name: string | null
  mother_phone: string | null
  makeup: {
    status: string
    makeup_date: string
    makeup_time: string | null
    makeup_cohort_label: string
  } | null
}

// 22.9.26 ברנדה: "אופציה לפתוח ולסגור כל אחד מהטאבים". המצב נשמר בדפדפן
// כדי שהמסך ייפתח כמו שהשאירה אותו.
type SectionKey = 'waiting' | 'incoming' | 'meetings'
const OPEN_KEY = 'mimo_admin_makeups_open'
function loadOpen(): Record<SectionKey, boolean> {
  const dflt = { waiting: true, incoming: true, meetings: true }
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    return raw ? { ...dflt, ...JSON.parse(raw) } : dflt
  } catch { return dflt }
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function ddmm(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}
function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export default function MakeupsPanel() {
  const [roster, setRoster] = useState<Roster[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [absences, setAbsences] = useState<Absence[]>([])
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>(loadOpen)
  // 22.9.26 ברנדה: "כשאני רואה +1 משלימות או 1 שהודיעו שלא מגיעות הייתי רוצה
  // ללחוץ על זה ולראות מי זה". מפגש אחד פתוח בכל פעם, לפי סוג הצ'יפ.

  function toggle(k: SectionKey) {
    setOpen(prev => {
      const next = { ...prev, [k]: !prev[k] }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayIso()
    const horizon = addDaysIso(today, 21)
    const [{ data: r }, { data: q }, { data: a }] = await Promise.all([
      supabase
        .from('v_meeting_roster')
        .select('*')
        .gte('meeting_date', today)
        .lte('meeting_date', horizon)
        .order('meeting_date'),
      supabase
        .from('v_makeup_requests_admin')
        .select('*')
        .in('status', ['requested', 'confirmed', 'attended'])
        .order('makeup_date'),
      supabase
        .from('v_meeting_absences_admin')
        .select('*')
        .order('marked_at'),
    ])
    setRoster((r ?? []) as Roster[])
    setRequests((q ?? []) as Request[])
    setAbsences((a ?? []) as Absence[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function runAllocation() {
    setRunning(true)
    setNote(null)
    const { data, error } = await supabase.rpc('admin_allocate_makeups_now')
    setRunning(false)
    if (error) { setNote('שגיאה בהרצת ההקצאה'); return }
    const rows = (data ?? []) as Array<{ confirmed: number; rejected: number }>
    const confirmed = rows.reduce((s, x) => s + x.confirmed, 0)
    const rejected = rows.reduce((s, x) => s + x.rejected, 0)
    setNote(rows.length === 0
      ? 'אין כרגע מפגש שהגיע זמן ההקצאה שלו'
      : `${confirmed} אושרו, ${rejected} לא נכנסו. המיילים יוצאים בריצה הקרובה`)
    await load()
  }

  async function markAttended(id: string, attended: boolean) {
    const { error } = await supabase.rpc('admin_mark_makeup_attended', {
      p_request_id: id,
      p_attended: attended,
    })
    if (error) { setNote('שגיאה בסימון'); return }
    await load()
  }

  const waiting = requests.filter(r => r.status === 'requested')
  const incoming = requests.filter(r => r.status === 'confirmed' || r.status === 'attended')
  // 10.10.26 (Lovable mockup): one week-by-week list of the meetings that
  // changed, each with a head count that adds up ("8 רשומות · 2 לא מגיעות ·
  // +1 משלימה = 7 מגיעות") and the names as small colored chips; tapping a
  // meeting opens the names with phone + WhatsApp. Meetings with no change
  // fold into one line. Pending requests and approved make-ups follow.
  const [openMeeting, setOpenMeeting] = useState<string | null>(null)
  const [showQuiet, setShowQuiet] = useState(false)
  const live = roster.filter(r => !r.is_cancelled)
  const busyMeetings = live.filter(r => r.absent > 0 || r.makeups_in > 0 || r.makeups_waiting > 0)
  const quietMeetings = live.filter(r => !(r.absent > 0 || r.makeups_in > 0 || r.makeups_waiting > 0))
  const weekOf = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, d))
    t.setUTCDate(t.getUTCDate() - t.getUTCDay())
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
  }
  const thisWeek = weekOf(todayIso())
  const weeks: { key: string; items: Roster[] }[] = []
  for (const m of busyMeetings) {
    const k = weekOf(m.meeting_date)
    const last = weeks[weeks.length - 1]
    if (last && last.key === k) last.items.push(m); else weeks.push({ key: k, items: [m] })
  }
  const weekLabel = (k: string) => k === thisWeek ? 'השבוע' : k === addDaysIso(thisWeek, 7) ? 'שבוע הבא' : `שבוע ${ddmm(k)}`
  const short = (t: string) => t.replace(/^ליווי התפתחותי\s*-\s*/, '').replace(/^סדנת\s+/, '')
  const first = (n: string | null) => (n ?? '').split(' ')[0] || '?'
  const wa = (phone: string | null) => phone ? `https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '972')}` : null
  const when = (date: string, time: string | null) => `${dayName(date)} ${ddmm(date)}${time ? ` ${time.slice(0, 5)}` : ''}`

  const person = (key: string, name: string | null, phone: string | null, note: React.ReactNode, tone: 'rust' | 'green' | 'gray') => (
    <li key={key} className={`mk-person ${tone}`}>
      <span className="mk-dot" />
      <NameLink className="mk-pname" name={name} phone={phone} />
      <span className="mk-pnote">{note}</span>
      {wa(phone) && <a href={wa(phone)!} target="_blank" rel="noopener noreferrer" className="mk-icon" title="וואטסאפ" aria-label={`וואטסאפ ל${name ?? ''}`}><MessageCircle className="w-4 h-4" /></a>}
    </li>
  )

  const meetingCard = (m: Roster) => {
    const abs = absences.filter(a => a.meeting_id === m.meeting_id)
    const ins = requests.filter(r => r.target_meeting_id === m.meeting_id && r.status !== 'requested')
    const wait = requests.filter(r => r.target_meeting_id === m.meeting_id && r.status === 'requested')
    const coming = m.registered - m.absent + m.makeups_in
    const isOpen = openMeeting === m.meeting_id
    return (
      <article key={m.meeting_id} className={`mk-card${isOpen ? ' open' : ''}`}>
        <button type="button" className="mk-head" onClick={() => setOpenMeeting(isOpen ? null : m.meeting_id)} aria-expanded={isOpen}>
          <span className="mk-when"><b>{dayName(m.meeting_date)} {ddmm(m.meeting_date)}</b>{m.start_time && <span>{m.start_time.slice(0, 5)}</span>}</span>
          <span className="min-w-0 flex-1">
            <span className="mk-title">{short(m.workshop_title)} · מפגש {m.meeting_number}{m.cohort_label ? <span className="mk-faint"> · {m.cohort_label}</span> : null}</span>
            <span className="mk-count">
              {m.registered} רשומות
              {m.absent > 0 && <> · <span className="rust">{m.absent} לא מגיעות</span></>}
              {m.makeups_in > 0 && <> · <span className="green">+{m.makeups_in} {m.makeups_in === 1 ? 'משלימה' : 'משלימות'}</span></>}
              {' = '}<b>{coming} מגיעות</b>
              {m.capacity ? <span className="mk-faint"> מתוך {m.capacity}</span> : null}
              {m.makeups_waiting > 0 && <span className="mk-faint"> · {m.makeups_waiting} ממתינות</span>}
            </span>
            <span className="mk-chips">
              {abs.map(a => <span key={a.absence_id} className="mk-chip rust">{first(a.mother_name)}</span>)}
              {ins.map(r => <span key={r.request_id} className="mk-chip green">{first(r.mother_name)}</span>)}
              {wait.map(r => <span key={r.request_id} className="mk-chip">{first(r.mother_name)}</span>)}
              {m.allocated_at && <span className="mk-faint">הוקצה</span>}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: '#A2937D' }} />
        </button>
        {isOpen && (
          <div className="mk-body">
            {abs.length > 0 && (
              <div>
                <p className="mk-group rust">לא מגיעות</p>
                <ul>
                  {abs.map(a => person(a.absence_id, a.mother_name, a.mother_phone,
                    a.makeup
                      ? `${a.makeup.status === 'requested' ? 'ביקשה להשלים' : 'משלימה'} ב${when(a.makeup.makeup_date, a.makeup.makeup_time)}`
                      : <span className="rust">לא ביקשה השלמה</span>, 'rust'))}
                </ul>
              </div>
            )}
            {ins.length > 0 && (
              <div>
                <p className="mk-group green">משלימות מקבוצה אחרת</p>
                <ul>
                  {ins.map(r => person(r.request_id, r.mother_name, r.mother_phone,
                    <>פספסה ב-{ddmm(r.missed_date)} · קבוצת {r.source_cohort_label}{r.status === 'attended' && <span className="green"> · הגיעה</span>}</>, 'green'))}
                </ul>
              </div>
            )}
            {wait.length > 0 && (
              <div>
                <p className="mk-group">ממתינות לאישור</p>
                <ul>
                  {wait.map(r => person(r.request_id, r.mother_name, r.mother_phone,
                    <>פספסה ב-{ddmm(r.missed_date)} · קבוצת {r.source_cohort_label}</>, 'gray'))}
                </ul>
              </div>
            )}
          </div>
        )}
      </article>
    )
  }

  const reqRow = (r: Request, done: boolean) => (
    <li key={r.request_id} className="mk-req">
      <span className="min-w-0 flex-1">
        <NameLink className="mk-pname" name={r.mother_name} phone={r.mother_phone} />
        <span className="mk-route">
          {short(r.workshop_title)} · מפגש {r.meeting_number} · {ddmm(r.missed_date)}
          <span className="arrow">←</span>
          <b>{when(r.makeup_date, r.makeup_time)}</b>
          <span className="mk-faint"> · קבוצת {r.makeup_cohort_label}</span>
        </span>
      </span>
      {wa(r.mother_phone) && <a href={wa(r.mother_phone)!} target="_blank" rel="noopener noreferrer" className="mk-icon" title="וואטסאפ"><MessageCircle className="w-4 h-4" /></a>}
      {done && (
        <button type="button" onClick={() => markAttended(r.request_id, r.status !== 'attended')} className={`mk-btn${r.status === 'attended' ? ' ok' : ''}`}>
          {r.status === 'attended' ? <><Check className="w-3.5 h-3.5" /> הגיעה</> : r.makeup_date <= todayIso() ? 'סימון כהגיעה' : 'מאושרת'}
        </button>
      )}
    </li>
  )

  return (
    <div className="space-y-4" dir="rtl">
      <style>{MK_CSS}</style>
      <header className="mk-header">
        <div>
          <h1>השלמות</h1>
          <p className="mk-faint">ההקצאה רצה לבד כל שעה. כאן רואים מי מגיעה לכל מפגש.</p>
        </div>
        <button onClick={runAllocation} disabled={running} className="mk-btn quiet" title="מריץ עכשיו את ההקצאה שרצה לבד כל שעה">
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          הרצת הקצאה עכשיו
        </button>
      </header>

      {note && <p className="mk-note">{note}</p>}

      {loading ? (
        <p className="text-center text-sand-400 text-sm py-10">טוענת...</p>
      ) : (
        <>
          {/* ברנדה 22.9.26: "זה הכי חשוב לי, ככה אני יכולה להבין מי מגיע למפגשים הקרובים ומי לא". */}
          <section aria-label="מפגשים קרובים">
            <div className="mk-h"><CalendarDays className="w-4 h-4" /><h2>מי מגיעה בשלושת השבועות הקרובים</h2></div>
            {busyMeetings.length === 0 ? (
              <p className="mk-calm"><Check className="w-4 h-4" /> אין היעדרויות ואין השלמות. הכל כרגיל.</p>
            ) : weeks.map(w => (
              <div key={w.key} className="mk-week">
                <p className="mk-wlabel">{weekLabel(w.key)}</p>
                <div className="mk-list">{w.items.map(meetingCard)}</div>
              </div>
            ))}
            {quietMeetings.length > 0 && (
              <div className="mk-fold">
                <button type="button" onClick={() => setShowQuiet(v => !v)} aria-expanded={showQuiet}>
                  <span>{quietMeetings.length === 1 ? 'מפגש אחד בלי שינויים' : `${quietMeetings.length} מפגשים בלי שינויים`}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showQuiet ? 'rotate-180' : ''}`} style={{ color: '#A2937D' }} />
                </button>
                {showQuiet && (
                  <ul className="mk-quiet">
                    {quietMeetings.map(m => (
                      <li key={m.meeting_id}><b>{dayName(m.meeting_date)} {ddmm(m.meeting_date)}{m.start_time ? ` ${m.start_time.slice(0, 5)}` : ''}</b> · {short(m.workshop_title)} · מפגש {m.meeting_number} · {m.registered} רשומות</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section aria-label="ממתינות לתשובה">
            <button type="button" className="mk-h mk-toggle" onClick={() => toggle('waiting')} aria-expanded={open.waiting}>
              <Clock className="w-4 h-4" /><h2>ממתינות לתשובה</h2>{waiting.length > 0 && <span className="mk-count-b">{waiting.length}</span>}
              <ChevronDown className={`w-4 h-4 mr-auto transition-transform ${open.waiting ? 'rotate-180' : ''}`} style={{ color: '#A2937D' }} />
            </button>
            {open.waiting && (waiting.length === 0
              ? <p className="mk-faint" style={{ padding: '0 4px' }}>אף אחת לא ממתינה כרגע.</p>
              : <ul className="mk-reqs">{waiting.map(r => reqRow(r, false))}</ul>)}
          </section>

          <section aria-label="השלמות שאושרו">
            <button type="button" className="mk-h mk-toggle" onClick={() => toggle('incoming')} aria-expanded={open.incoming}>
              <Check className="w-4 h-4" /><h2>השלמות שאושרו</h2><span className="mk-faint">{incoming.length}</span>
              <ChevronDown className={`w-4 h-4 mr-auto transition-transform ${open.incoming ? 'rotate-180' : ''}`} style={{ color: '#A2937D' }} />
            </button>
            {open.incoming && (incoming.length === 0
              ? <p className="mk-faint" style={{ padding: '0 4px' }}>עדיין אין השלמות מאושרות.</p>
              : <ul className="mk-reqs">{incoming.map(r => reqRow(r, true))}</ul>)}
          </section>
        </>
      )}
    </div>
  )
}

const MK_CSS = `
.mk-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px}
.mk-header h1{font-size:26px;font-weight:700;color:#443327;line-height:1.2}
.mk-faint{font-size:12.5px;font-weight:600;color:#A2937D}
.mk-btn{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;border-radius:10px;padding:7px 12px;white-space:nowrap;background:#F6ECD8;color:#6E5836}
.mk-btn.quiet{background:transparent;color:#8A7A63;border:1px solid #E9E2D6}
.mk-btn.quiet:hover{background:#F6F3ED}
.mk-btn.ok{background:#E7F0E4;color:#3F5B39}
.mk-btn:disabled{opacity:.5}
.mk-note{font-size:13px;font-weight:600;color:#434434;background:#ECEDE6;border-radius:12px;padding:9px 12px}
.mk-h{display:flex;align-items:center;gap:7px;margin:4px 2px 8px;color:#8A6A2F}
.mk-h h2{font-size:17px;font-weight:700;color:#443327}
.mk-toggle{width:100%;text-align:right}
.mk-count-b{font-size:12px;font-weight:800;background:#F5E2D8;color:#8B4A30;border-radius:999px;padding:1px 9px}
.mk-calm{display:flex;align-items:center;gap:6px;font-size:14px;color:#3F5B39;font-weight:600;background:#EEF3EA;border-radius:12px;padding:10px 14px}
.mk-week{margin-bottom:12px}
.mk-wlabel{font-size:13px;font-weight:800;color:#8A7A63;margin:0 4px 6px}
.mk-list{display:flex;flex-direction:column;gap:8px}
.mk-card{background:#fff;border:1px solid #E9E2D6;border-radius:16px;overflow:hidden}
.mk-card.open{border-color:#E2D3B4}
.mk-head{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;text-align:right}
.mk-head:hover{background:#FCFAF6}
.mk-when{flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;width:64px;background:#F6ECD8;border-radius:12px;padding:6px 0;color:#4A3A28}
.mk-when b{font-size:13px;white-space:nowrap}
.mk-when span{font-size:12px;font-weight:700;color:#6E5836}
.mk-title{display:block;font-size:15px;font-weight:700;color:#443327}
.mk-count{display:block;font-size:13px;font-weight:600;color:#6E5836;margin-top:2px}
.mk-count b{color:#443327}
.rust{color:#8B4A30}.green{color:#3F5B39}
.mk-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.mk-chip{font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 9px;background:#F1EBE1;color:#6E5836}
.mk-chip.rust{background:#F5E2D8;color:#8B4A30}
.mk-chip.green{background:#E7F0E4;color:#3F5B39}
.mk-body{display:flex;flex-direction:column;gap:10px;border-top:1px solid #F1EBE1;padding:10px 14px 12px;background:#FBF9F5}
.mk-group{font-size:12px;font-weight:800;color:#8A7A63;margin-bottom:4px}
.mk-person{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:5px 0}
.mk-dot{width:7px;height:7px;border-radius:99px;background:#CFC4B4;flex-shrink:0}
.mk-person.rust .mk-dot{background:#B5694A}.mk-person.green .mk-dot{background:#6E8F5E}
.mk-pname{font-size:14px;font-weight:700;color:#443327}
.mk-pnote{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#8A7A63}
.mk-icon{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;color:#8A7A63}
.mk-icon:hover{background:#F1EBE1;color:#443327}
.mk-fold{background:#fff;border:1px solid #E9E2D6;border-radius:14px;overflow:hidden}
.mk-fold>button{display:flex;justify-content:space-between;align-items:center;width:100%;padding:10px 14px;font-size:13.5px;font-weight:700;color:#6E5836;text-align:right}
.mk-quiet{border-top:1px solid #F1EBE1;padding:8px 14px;font-size:12.5px;color:#8A7A63;display:flex;flex-direction:column;gap:4px}
.mk-quiet b{color:#443327}
.mk-reqs{display:flex;flex-direction:column;gap:6px}
.mk-req{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E9E2D6;border-radius:14px;padding:10px 12px}
.mk-route{display:block;font-size:12.5px;font-weight:600;color:#8A7A63;margin-top:2px}
.mk-route .arrow{margin:0 6px;color:#C8A460}
.mk-route b{color:#443327}
@media (max-width:640px){.mk-header h1{font-size:22px}.mk-req{flex-wrap:wrap}}
`
