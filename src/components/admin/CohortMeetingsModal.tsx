import { useCallback, useEffect, useState } from 'react'
import { X, Calendar, ChevronsLeft, Users, AlertCircle, RotateCcw } from 'lucide-react'
import { supabase, type WorkshopCohort, type Workshop } from '../../lib/supabase'

// לוח המפגשים של מחזור אחד.
//
// זה המסך היחיד שברנדה צריכה לגעת בו כדי שכל מנגנון ההשלמות יעבוד. עד
// היום מועדי המפגשים חיו רק ביומן החיצוני שלה, ולכן אף אחד חוץ ממנה לא
// ידע מתי רץ מפגש 3 של המחזור של יולי. עכשיו זו טבלה, ו"המפגש האחרון זז
// בשבוע" הוא עריכה של תאריך אחד.
//
// תאריך הסיום של המחזור נגזר מכאן אוטומטית (טריגר במסד), וזה מה שמזמן את
// שאלון המשוב. אין יותר הקלדה כפולה.

type Props = {
  workshop: Workshop
  cohort: WorkshopCohort
  onClose: () => void
  onChanged?: () => void
}

type Meeting = {
  id: string
  meeting_number: number
  meeting_date: string
  start_time: string | null
  is_cancelled: boolean
  capacity_override: number | null
  allocated_at: string | null
}

type Roster = {
  meeting_id: string
  capacity: number
  registered: number
  absent: number
  makeups_in: number
  makeups_waiting: number
}

function ddmm(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CohortMeetingsModal({ workshop, cohort, onClose, onChanged }: Props) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [roster, setRoster] = useState<Record<string, Roster>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capacityDraft, setCapacityDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rows }, { data: rst }] = await Promise.all([
      supabase
        .from('cohort_meetings')
        .select('id, meeting_number, meeting_date, start_time, is_cancelled, capacity_override, allocated_at')
        .eq('cohort_id', cohort.id)
        .order('meeting_number'),
      supabase
        .from('v_meeting_roster')
        .select('meeting_id, capacity, registered, absent, makeups_in, makeups_waiting')
        .eq('cohort_id', cohort.id),
    ])
    const list = (rows ?? []) as Meeting[]
    setMeetings(list)
    const map: Record<string, Roster> = {}
    for (const r of (rst ?? []) as Roster[]) map[r.meeting_id] = r
    setRoster(map)
    setCapacityDraft(Object.fromEntries(list.map(m => [m.id, m.capacity_override?.toString() ?? ''])))
    setLoading(false)
  }, [cohort.id])

  useEffect(() => { load() }, [load])

  async function patch(id: string, fields: Partial<Meeting>) {
    setBusyId(id)
    setError(null)
    const { error: dbError } = await supabase.from('cohort_meetings').update(fields).eq('id', id)
    setBusyId(null)
    if (dbError) { setError('שגיאה בשמירה. נסי שוב'); return }
    await load()
    onChanged?.()
  }

  // "המפגש הזה נדחה, וכל מה שאחריו זז איתו" — המקרה שקורה בפועל כשמשהו
  // אצלה משתנה. הזזה של מפגש בודד היא פשוט עריכת התאריך שלו.
  async function shiftFrom(id: string, days: number) {
    setBusyId(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('shift_cohort_meetings', {
      p_from_meeting_id: id,
      p_days: days,
    })
    setBusyId(null)
    if (rpcError) { setError('שגיאה בהזזה. נסי שוב'); return }
    await load()
    onChanged?.()
  }

  // החריגה: "לפעמים אפשר להחליט שנכנסות 9". עובר דרך RPC ולא update ישיר,
  // כי אם ההקצאה של המפגש כבר רצה, הגדלת המקום צריכה להכניס מיד את מי
  // שנדחתה מחוסר מקום, לפי אותו סדר בקשות.
  async function saveCapacity(m: Meeting) {
    const raw = (capacityDraft[m.id] ?? '').trim()
    const value = raw === '' ? null : parseInt(raw, 10)
    if (value != null && (!Number.isInteger(value) || value < 1)) {
      setError('קיבולת חייבת להיות מספר חיובי')
      return
    }
    setBusyId(m.id)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('admin_set_meeting_capacity', {
      p_meeting_id: m.id,
      p_capacity: value,
    })
    setBusyId(null)
    if (rpcError) { setError('שגיאה בשמירת הקיבולת'); return }
    if (typeof data === 'number' && data > 0) {
      setError(null)
      window.setTimeout(() => alert(`${data} משלימות נכנסו למפגש בעקבות הגדלת המקום`), 50)
    }
    await load()
    onChanged?.()
  }

  async function generate() {
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_regenerate_cohort_meetings', {
      p_cohort_id: cohort.id,
      p_count: null,
    })
    if (rpcError) { setError('שגיאה ביצירת המפגשים'); return }
    await load()
    onChanged?.()
  }

  const today = todayIso()

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-sand-800">🗓️ מפגשי המחזור</h3>
            <p className="text-[11px] text-sand-500 truncate">
              {workshop.title} · {ddmm(cohort.start_date)}
              {cohort.start_time ? ` ${cohort.start_time.slice(0, 5)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sand-400 text-sm py-6">טוענת...</p>
          ) : meetings.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sand-500 text-sm">אין עדיין מפגשים למחזור הזה.</p>
              <button
                onClick={generate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#C8A460', color: '#33281B' }}
              >
                <Calendar className="w-4 h-4" />
                יצירת {workshop.meetings_count ?? 1} מפגשים שבועיים
              </button>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-sand-500 leading-relaxed bg-sand-50 rounded-xl px-3 py-2">
                תאריך הסיום של המחזור, ואיתו מועד שאלון המשוב, מתעדכנים לבד לפי המפגש
                האחרון כאן. אמהות רואות את התאריכים האלה באפליקציה, וההשלמות נסמכות עליהם.
              </p>

              {meetings.map(m => {
                const r = roster[m.id]
                const isPast = m.meeting_date < today
                const busy = busyId === m.id
                const seatsLeft = r ? r.capacity - r.registered + r.absent - r.makeups_in : null
                return (
                  <div
                    key={m.id}
                    className={`rounded-2xl border p-3 ${
                      m.is_cancelled
                        ? 'border-red-200 bg-red-50/50'
                        : isPast
                          ? 'border-sand-200 bg-sand-50/60'
                          : 'border-sand-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-mustard-100 text-mustard-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {m.meeting_number}
                      </span>
                      <span className="text-sm font-bold text-sand-800">
                        יום {dayName(m.meeting_date)}, {ddmm(m.meeting_date)}
                      </span>
                      {m.is_cancelled && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">בוטל</span>
                      )}
                      {isPast && !m.is_cancelled && (
                        <span className="text-[10px] font-semibold text-sand-500 bg-sand-100 px-2 py-0.5 rounded-full">עבר</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div dir="ltr">
                        <input
                          type="date"
                          value={m.meeting_date}
                          disabled={busy}
                          onChange={e => patch(m.id, { meeting_date: e.target.value })}
                          className="w-full px-2.5 py-1.5 border-2 border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                        />
                      </div>
                      <div dir="ltr">
                        <input
                          type="time"
                          value={m.start_time?.slice(0, 5) ?? cohort.start_time?.slice(0, 5) ?? ''}
                          disabled={busy}
                          onChange={e => patch(m.id, { start_time: e.target.value || null })}
                          className="w-full px-2.5 py-1.5 border-2 border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                        />
                      </div>
                    </div>

                    {!isPast && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-sand-400">הזזה מכאן והלאה:</span>
                        {[7, -7, 1, -1].map(d => (
                          <button
                            key={d}
                            onClick={() => shiftFrom(m.id, d)}
                            disabled={busy}
                            className="px-2 py-0.5 rounded-lg text-[11px] font-semibold text-sand-600 bg-sand-100 hover:bg-sand-200 disabled:opacity-40"
                          >
                            {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                        <ChevronsLeft className="w-3 h-3 text-sand-300" />
                      </div>
                    )}

                    {r && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                        <span className="inline-flex items-center gap-1 text-sand-600 bg-sand-100 px-2 py-0.5 rounded-full font-semibold">
                          <Users className="w-3 h-3" /> {r.registered}/{r.capacity}
                        </span>
                        {r.absent > 0 && (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                            {r.absent} לא מגיעות
                          </span>
                        )}
                        {r.makeups_in > 0 && (
                          <span className="text-mustard-700 bg-mustard-50 px-2 py-0.5 rounded-full font-semibold">
                            +{r.makeups_in} משלימות
                          </span>
                        )}
                        {r.makeups_waiting > 0 && (
                          <span className="text-sand-500 bg-sand-100 px-2 py-0.5 rounded-full">
                            {r.makeups_waiting} בתור
                          </span>
                        )}
                        {seatsLeft != null && seatsLeft > 0 && !isPast && (
                          <span className="text-sand-400">{seatsLeft} מקומות פנויים</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-[10px] text-sand-400 flex-shrink-0">חריגה למפגש הזה:</label>
                      <input
                        type="number"
                        min="1"
                        value={capacityDraft[m.id] ?? ''}
                        disabled={busy}
                        onChange={e => setCapacityDraft(d => ({ ...d, [m.id]: e.target.value }))}
                        onBlur={() => {
                          const raw = (capacityDraft[m.id] ?? '').trim()
                          const current = m.capacity_override?.toString() ?? ''
                          if (raw !== current) saveCapacity(m)
                        }}
                        placeholder={r ? r.capacity.toString() : ''}
                        className="w-16 px-2 py-1 border-2 border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                      />
                      <button
                        onClick={() => patch(m.id, { is_cancelled: !m.is_cancelled })}
                        disabled={busy}
                        className={`mr-auto px-2 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-40 ${
                          m.is_cancelled
                            ? 'text-sand-600 bg-sand-100 hover:bg-sand-200'
                            : 'text-red-600 bg-red-50 hover:bg-red-100'
                        }`}
                      >
                        {m.is_cancelled ? (
                          <span className="inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> ביטול הביטול</span>
                        ) : 'ביטול המפגש'}
                      </button>
                    </div>

                    {m.allocated_at && (
                      <p className="text-[10px] text-sand-400 mt-1.5 inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        ההשלמות למפגש הזה כבר הוקצו. שינוי מקומות כאן יריץ הקצאה מחדש.
                      </p>
                    )}
                  </div>
                )
              })}
            </>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
