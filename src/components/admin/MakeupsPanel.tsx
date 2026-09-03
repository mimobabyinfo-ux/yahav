import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Check, Clock, Users, CalendarDays } from 'lucide-react'
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
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const today = todayIso()
    const horizon = addDaysIso(today, 21)
    const [{ data: r }, { data: q }] = await Promise.all([
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
    ])
    setRoster((r ?? []) as Roster[])
    setRequests((q ?? []) as Request[])
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
          {/* ממתינות בתור.
              ברנדה 3.9.26: "יותר מדי מלל, אני לא מצליח להבין מה רשום". המידע
              הוא תמיד אותם ארבעה שדות (מי, איזה מפגש, מאיפה, לאן), אז הוא
              נפרס לשתי משבצות עם תווית קטנה במקום להיסחב כמשפט. */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-sand-700 inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sand-400" />
              ממתינות לתשובה ({waiting.length})
            </h3>
            {waiting.length === 0 ? (
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
            )}
          </section>

          {/* אושרו */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-sand-700 inline-flex items-center gap-1.5">
              <Check className="w-4 h-4 text-sand-400" />
              משלימות שאושרו ({incoming.length})
            </h3>
            {incoming.length === 0 ? (
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
            )}
          </section>

          {/* המפגשים הקרובים שיש בהם תנועה */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-sand-700 inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-sand-400" />
              מפגשים קרובים עם שינויים
            </h3>
            {busyMeetings.length === 0 ? (
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
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                        {m.absent} הודיעו שלא מגיעות
                      </span>
                    )}
                    {m.makeups_in > 0 && (
                      <span className="text-mustard-700 bg-mustard-50 px-2 py-0.5 rounded-full font-semibold">
                        +{m.makeups_in} משלימות
                      </span>
                    )}
                    {m.makeups_waiting > 0 && (
                      <span className="text-sand-500 bg-sand-100 px-2 py-0.5 rounded-full">
                        {m.makeups_waiting} בתור
                      </span>
                    )}
                    {m.allocated_at && <span className="text-sand-400">הוקצה</span>}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
