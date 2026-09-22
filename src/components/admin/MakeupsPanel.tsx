import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Check, Clock, Users, CalendarDays, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'

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
  const [detail, setDetail] = useState<{ meetingId: string; kind: 'absent' | 'in' | 'waiting' } | null>(null)

  function toggle(k: SectionKey) {
    setOpen(prev => {
      const next = { ...prev, [k]: !prev[k] }
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  function toggleDetail(meetingId: string, kind: 'absent' | 'in' | 'waiting') {
    setDetail(prev => (prev && prev.meetingId === meetingId && prev.kind === kind ? null : { meetingId, kind }))
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
  const isDetail = (meetingId: string, kind: 'absent' | 'in' | 'waiting') =>
    detail?.meetingId === meetingId && detail.kind === kind
  const busyMeetings = roster.filter(r => !r.is_cancelled && (r.absent > 0 || r.makeups_in > 0 || r.makeups_waiting > 0))

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-sand-800">השלמות מפגשים</h2>
          <p className="text-sand-400 text-sm">
            ההקצאה רצה לבד כל שעה, 24 שעות לפני כל מפגש. המסך הזה רק מראה מה קורה.
          </p>
        </div>
        <button
          onClick={runAllocation}
          disabled={running}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          style={{ background: '#C8A460', color: '#33281B' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          הרצת הקצאה עכשיו
        </button>
      </div>

      {note && (
        <p className="text-xs font-semibold text-[#434434] bg-[#E6E6E0] rounded-xl px-3 py-2">{note}</p>
      )}

      {loading ? (
        <p className="text-center text-sand-400 text-sm py-10">טוענת...</p>
      ) : (
        <>
          {/* המפגשים הקרובים שיש בהם תנועה. ראשון מ-22.9.26, ברנדה: "זה הכי חשוב לי,
              ככה אני יכולה להבין מי מגיע למפגשים הקרובים ומי לא". */}
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => toggle('meetings')}
              className="w-full flex items-center gap-1.5 text-sm font-bold text-sand-700 py-1"
              aria-expanded={open.meetings}
            >
              <CalendarDays className="w-4 h-4 text-sand-400" />
              מפגשים קרובים עם שינויים
              <ChevronDown className={`w-4 h-4 text-sand-400 mr-auto transition-transform ${open.meetings ? '' : '-rotate-90'}`} />
            </button>
            {open.meetings && (
            busyMeetings.length === 0 ? (
              <p className="text-sand-400 text-sm bg-sand-50 rounded-2xl px-4 py-3">
                בשלושת השבועות הקרובים אין היעדרויות ואין השלמות. הכל כרגיל.
              </p>
            ) : (
              busyMeetings.map(m => (
                <div key={m.meeting_id} className="rounded-2xl bg-white border border-sand-200 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-sand-800">
                      {dayName(m.meeting_date)} {ddmm(m.meeting_date)}
                      {m.start_time ? ` ${m.start_time.slice(0, 5)}` : ''}
                    </span>
                    <span className="text-[11px] text-sand-400">
                      {m.workshop_title} · מפגש {m.meeting_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-sand-600 bg-sand-100 px-2 py-0.5 rounded-full">
                      <Users className="w-3 h-3" /> {m.registered - m.absent + m.makeups_in}/{m.capacity} צפויות
                    </span>
                    {m.absent > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDetail(m.meeting_id, 'absent')}
                        className={`text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold ${isDetail(m.meeting_id, 'absent') ? 'ring-2 ring-amber-300' : ''}`}
                      >
                        {m.absent} הודיעו שלא מגיעות
                      </button>
                    )}
                    {m.makeups_in > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDetail(m.meeting_id, 'in')}
                        className={`text-mustard-700 bg-mustard-50 px-2 py-0.5 rounded-full font-semibold ${isDetail(m.meeting_id, 'in') ? 'ring-2 ring-mustard-300' : ''}`}
                      >
                        +{m.makeups_in} משלימות
                      </button>
                    )}
                    {m.makeups_waiting > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDetail(m.meeting_id, 'waiting')}
                        className={`text-sand-500 bg-sand-100 px-2 py-0.5 rounded-full ${isDetail(m.meeting_id, 'waiting') ? 'ring-2 ring-sand-300' : ''}`}
                      >
                        {m.makeups_waiting} בתור
                      </button>
                    )}
                    {m.allocated_at && <span className="text-sand-400">הוקצה</span>}
                  </div>

                  {isDetail(m.meeting_id, 'absent') && (
                    <ul className="mt-2 space-y-1 border-t border-sand-100 pt-2">
                      {absences.filter(a => a.meeting_id === m.meeting_id).map(a => (
                        <li key={a.absence_id} className="flex items-baseline gap-2 flex-wrap text-[11px]">
                          <span className="text-xs font-bold text-sand-800">{a.mother_name ?? '—'}</span>
                          <span className="text-sand-400" dir="ltr">{a.mother_phone ?? ''}</span>
                          {a.makeup ? (
                            <span className="text-sand-500">
                              {a.makeup.status === 'requested' ? 'ביקשה להשלים ב' : 'משלימה ב'}
                              {dayName(a.makeup.makeup_date)} {ddmm(a.makeup.makeup_date)}
                              {a.makeup.makeup_time ? ` ${a.makeup.makeup_time.slice(0, 5)}` : ''}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold">לא ביקשה השלמה</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(isDetail(m.meeting_id, 'in') || isDetail(m.meeting_id, 'waiting')) && (
                    <ul className="mt-2 space-y-1 border-t border-sand-100 pt-2">
                      {requests
                        .filter(r => r.target_meeting_id === m.meeting_id &&
                          (detail?.kind === 'in' ? r.status !== 'requested' : r.status === 'requested'))
                        .map(r => (
                          <li key={r.request_id} className="flex items-baseline gap-2 flex-wrap text-[11px]">
                            <span className="text-xs font-bold text-sand-800">{r.mother_name ?? '—'}</span>
                            <span className="text-sand-400" dir="ltr">{r.mother_phone ?? ''}</span>
                            <span className="text-sand-500">
                              פספסה מפגש {r.meeting_number} ב-{ddmm(r.missed_date)} (קבוצת {r.source_cohort_label})
                            </span>
                            {r.status === 'attended' && <span className="text-[#2E7D32]">✓ הגיעה</span>}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))
            )
            )}
          </section>

          {/* ממתינות בתור.
              ברנדה 3.9.26: "יותר מדי מלל, אני לא מצליח להבין מה רשום". המידע
              הוא תמיד אותם ארבעה שדות (מי, איזה מפגש, מאיפה, לאן), אז הוא
              נפרס לשתי משבצות עם תווית קטנה במקום להיסחב כמשפט. */}
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => toggle('waiting')}
              className="w-full flex items-center gap-1.5 text-sm font-bold text-sand-700 py-1"
              aria-expanded={open.waiting}
            >
              <Clock className="w-4 h-4 text-sand-400" />
              ממתינות לתשובה ({waiting.length})
              <ChevronDown className={`w-4 h-4 text-sand-400 mr-auto transition-transform ${open.waiting ? '' : '-rotate-90'}`} />
            </button>
            {open.waiting && (
            waiting.length === 0 ? (
              <p className="text-sand-400 text-sm bg-sand-50 rounded-2xl px-4 py-3">
                אף אחת לא ממתינה כרגע.
              </p>
            ) : (
              waiting.map(r => (
                <div key={r.request_id} className="rounded-2xl bg-white border border-sand-200 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-sand-800">{r.mother_name ?? '—'}</span>
                    <span className="text-[11px] text-sand-400" dir="ltr">{r.mother_phone ?? ''}</span>
                    {r.queue_position != null && (
                      <span className="text-[10px] font-semibold text-sand-600 bg-sand-100 px-2 py-0.5 rounded-full mr-auto flex-shrink-0">
                        מקום {r.queue_position} בתור
                      </span>
                    )}
                  </div>
                  <div className="flex items-stretch gap-2 mt-2">
                    <div className="flex-1 rounded-xl bg-sand-50 px-3 py-2 min-w-0">
                      <p className="text-[10px] text-sand-400">פספסה</p>
                      <p className="text-xs font-bold text-sand-700">מפגש {r.meeting_number}</p>
                      <p className="text-[11px] text-sand-500">{ddmm(r.missed_date)}</p>
                    </div>
                    <div className="flex items-center text-sand-300 text-lg flex-shrink-0">←</div>
                    <div className="flex-1 rounded-xl bg-mustard-50 px-3 py-2 min-w-0">
                      <p className="text-[10px] text-mustard-600">רוצה להשלים</p>
                      <p className="text-xs font-bold text-sand-700">
                        {dayName(r.makeup_date)} {ddmm(r.makeup_date)}
                        {r.makeup_time ? ` ${r.makeup_time.slice(0, 5)}` : ''}
                      </p>
                      <p className="text-[11px] text-sand-500 truncate">קבוצת {r.makeup_cohort_label}</p>
                    </div>
                  </div>
                </div>
              ))
            )
            )}
          </section>

          {/* אושרו */}
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => toggle('incoming')}
              className="w-full flex items-center gap-1.5 text-sm font-bold text-sand-700 py-1"
              aria-expanded={open.incoming}
            >
              <Check className="w-4 h-4 text-sand-400" />
              משלימות שאושרו ({incoming.length})
              <ChevronDown className={`w-4 h-4 text-sand-400 mr-auto transition-transform ${open.incoming ? '' : '-rotate-90'}`} />
            </button>
            {open.incoming && (
            incoming.length === 0 ? (
              <p className="text-sand-400 text-sm bg-sand-50 rounded-2xl px-4 py-3">
                עדיין אין השלמות מאושרות.
              </p>
            ) : (
              incoming.map(r => (
                <div key={r.request_id} className="rounded-2xl bg-white border border-sand-200 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-sand-800">{r.mother_name ?? '—'}</span>
                    <span className="text-[11px] text-sand-400" dir="ltr">{r.mother_phone ?? ''}</span>
                    <button
                      onClick={() => markAttended(r.request_id, r.status !== 'attended')}
                      className={`mr-auto flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                        r.status === 'attended'
                          ? 'text-[#2E7D32] bg-[#E8F5E9]'
                          : 'text-sand-600 bg-sand-100 hover:bg-sand-200'
                      }`}
                    >
                      {r.status === 'attended' ? '✓ הגיעה' : 'סימון כהגיעה'}
                    </button>
                  </div>
                  <div className="flex items-stretch gap-2 mt-2">
                    <div className="flex-1 rounded-xl bg-sand-50 px-3 py-2 min-w-0">
                      <p className="text-[10px] text-sand-400">פספסה</p>
                      <p className="text-xs font-bold text-sand-700">מפגש {r.meeting_number}</p>
                      <p className="text-[11px] text-sand-500">{ddmm(r.missed_date)}</p>
                    </div>
                    <div className="flex items-center text-sand-300 text-lg flex-shrink-0">←</div>
                    <div className="flex-1 rounded-xl bg-[#E8F5E9] px-3 py-2 min-w-0">
                      <p className="text-[10px] text-[#2E7D32] opacity-80">מגיעה אלייך</p>
                      <p className="text-xs font-bold text-sand-700">
                        {dayName(r.makeup_date)} {ddmm(r.makeup_date)}
                        {r.makeup_time ? ` ${r.makeup_time.slice(0, 5)}` : ''}
                      </p>
                      <p className="text-[11px] text-sand-500 truncate">קבוצת {r.makeup_cohort_label}</p>
                    </div>
                  </div>
                </div>
              ))
            )
            )}
          </section>
        </>
      )}
    </div>
  )
}
