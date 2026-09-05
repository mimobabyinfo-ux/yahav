import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Clock, X, RotateCcw, Pencil, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

// לוח המפגשים של האמא, וממנו גם השלמת מפגש שפוספס.
//
// כל העניין נשען על הפרדה אחת: בקשה זה לא אישור. כשהיא מבקשת להשלים,
// ההרשמה למחזור המארח לפעמים עוד לא נסגרה, ונרשמת משלמת שתגיע מחר
// גוברת עליה. לכן אסור להראות לה "יש לך מקום" — רק אם יש מקום פנוי כרגע,
// כן/לא, בלי מספרים. כשהקבוצה המארחת כבר יצאה לדרך (בעצם תמיד ממפגש 2
// והלאה) הרוסטר שלה כבר סופי, ואז ההכרעה מיידית. כשהיא עוד לא נפתחה
// (בעיקר מפגש 1) ההכרעה הסופית נופלת רק 24 שעות לפני המפגש.
//
// השער להשלמה הוא הצהרת ההיעדרות: קודם היא מסמנת שלא תגיע (או שלא
// הגיעה), ורק אז נפתחת לה הבחירה. ברנדה 3.9.26: "האחריות המלאה עליה".
//
// כל פעולה כאן הפיכה, כי ברנדה ביקשה: אפשר לבטל סימון היעדרות גם על
// מפגש שכבר עבר ("לחצתי בטעות"), ואפשר להחליף את המועד שנבחר.

type Row = {
  lead_id: string
  workshop_id: string
  workshop_title: string
  cohort_id: string
  cohort_start_date: string
  meeting_id: string
  meeting_number: number
  meeting_date: string
  start_time: string | null
  starts_at: string
  is_cancelled: boolean
  is_past: boolean
  i_am_absent: boolean
  makeup_request_id: string | null
  makeup_status: string | null
  makeup_meeting_id: string | null
  makeup_meeting_date: string | null
  makeup_time: string | null
  makeup_cohort_label: string | null
  makeup_decision_at: string | null
  makeup_is_immediate: boolean | null
  makeup_queue_position: number | null
  makeups_used: number
  makeups_allowed: number
}

type Option = {
  meeting_id: string
  cohort_label: string
  meeting_number: number
  meeting_date: string
  start_time: string | null
  starts_at: string
  decision_at: string | null
  is_immediate: boolean
  queue_ahead: number
  available_now: boolean
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
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

// הניסוח שמוצג לאמא מעל רשימת המועדים. ברנדה 3.9.26: בלי הסברים על
// איך ההקצאה עובדת, בלי מיקום בתור, בלי תאריך הכרעה, ובלי המילה "תור".
// האמא רואה: יש/אין מקום פנוי כרגע, "הבקשה התקבלה", ו"נעדכן אותך".
const PICK_NOTE =
  'ההרשמה על בסיס מקום פנוי, וניתן להשלים עד 2 מפגשים.'
const CHANGE_NOTE =
  'בחירת מועד חדש מבטלת את הבקשה הקודמת.'

// workshopId: בתוך סדנה מציגים רק את המחזור של אותה סדנה. ברנדה 5.9.26:
// "אם מישהי רשומה גם לליווי התפתחותי וגם עיסוי תינוקות ולכל אחד מהם
// תאריכים אחרים". בלי workshopId (המסך הנעול) מציגים את המחזור הראשון.
export default function MyWorkshopMeetings({ workshopId }: { workshopId?: string } = {}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // picking = בחירת מועד. mode קובע אם זו בקשה חדשה או החלפה של קיימת.
  const [picking, setPicking] = useState<{ row: Row; mode: 'new' | 'change' } | null>(null)
  const [options, setOptions] = useState<Option[] | null>(null)
  // אישור לפני ביטול סימון שגורר גם ביטול של בקשת השלמה
  const [confirmUndo, setConfirmUndo] = useState<Row | null>(null)
  // ברנדה 3.9.26: הרשימה סגורה כברירת מחדל. לחיצה על הכותרת פותחת את
  // התאריכים וההשלמות.
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_my_cohort_schedule')
    if (rpcError) { setLoading(false); return }
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function setAbsence(row: Row, absent: boolean) {
    setBusy(row.meeting_id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_meeting_absence', {
      p_meeting_id: row.meeting_id,
      p_absent: absent,
    })
    setBusy(null)
    setConfirmUndo(null)
    if (rpcError) {
      setError(rpcError.message.includes('allocation already ran')
        ? 'המקומות למפגש הזה כבר חולקו, אז אי אפשר לבטל את הסימון. דברי איתנו'
        : 'משהו השתבש. נסי שוב')
      return
    }
    await load()
  }

  // ביטול סימון שיש מאחוריו בקשת השלמה מפיל גם אותה. עדיף לשאול פעם אחת
  // מאשר שהיא תגלה בדיעבד שההשלמה נעלמה.
  function requestUndo(row: Row) {
    if (row.makeup_status) { setConfirmUndo(row); return }
    setAbsence(row, false)
  }

  async function openPicker(row: Row, mode: 'new' | 'change') {
    setPicking({ row, mode })
    setOptions(null)
    setError(null)
    const { data } = await supabase.rpc('get_makeup_options', { p_source_meeting_id: row.meeting_id })
    setOptions((data ?? []) as Option[])
  }

  async function chooseOption(o: Option) {
    if (!picking) return
    setBusy(o.meeting_id)
    setError(null)
    const { error: rpcError } = picking.mode === 'change' && picking.row.makeup_request_id
      ? await supabase.rpc('change_makeup_target', {
          p_request_id: picking.row.makeup_request_id,
          p_target_meeting_id: o.meeting_id,
        })
      : await supabase.rpc('request_makeup', {
          p_source_meeting_id: picking.row.meeting_id,
          p_target_meeting_id: o.meeting_id,
        })
    setBusy(null)
    if (rpcError) {
      setError(
        rpcError.message.includes('quota exhausted')
          ? 'כבר ניצלת את שתי ההשלמות שלך בסדנה הזאת'
          : rpcError.message.includes('target not available')
            ? 'המועד הזה כבר לא פתוח להשלמה. רענני ובחרי מועד אחר'
            : 'משהו השתבש. נסי שוב'
      )
      return
    }
    setPicking(null)
    setOptions(null)
    await load()
  }

  async function cancelRequest(row: Row) {
    if (!row.makeup_request_id) return
    setBusy(row.meeting_id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('cancel_makeup_request', {
      p_request_id: row.makeup_request_id,
    })
    setBusy(null)
    if (rpcError) { setError('משהו השתבש. נסי שוב'); return }
    await load()
  }

  const scoped = workshopId ? rows.filter(r => r.workshop_id === workshopId) : rows
  if (loading || scoped.length === 0) return null

  const currentCohort = scoped[0].cohort_id
  const mine = scoped.filter(r => r.cohort_id === currentCohort)
  const head = mine[0]
  const used = head.makeups_used
  const allowed = head.makeups_allowed

  const next = mine.find(r => !r.is_past && !r.is_cancelled)

  return (
    <div className="bg-[#F5F1EB] rounded-3xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-right"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="font-bold text-sand-800 text-sm inline-flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-mustard-600" />
            המפגשים שלי
          </p>
          <p className="text-xs text-sand-500 truncate">
            {head.workshop_title}
            {!open && next ? ` · הבא: יום ${dayName(next.meeting_date)} ${ddmm(next.meeting_date)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-sand-500 bg-white px-2 py-1 rounded-full">
            השלמות: {used}/{allowed}
          </span>
          <ChevronDown className={`w-4 h-4 text-sand-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
      <div className="space-y-2">
        {mine.map(r => {
          const isBusy = busy === r.meeting_id
          const pending = r.makeup_status === 'requested'
          const settled = r.makeup_status === 'confirmed' || r.makeup_status === 'attended'
          return (
            <div
              key={r.meeting_id}
              className={`rounded-2xl bg-white p-3 ${r.is_cancelled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                  r.is_past ? 'bg-sand-100 text-sand-400' : 'bg-mustard-100 text-mustard-800'
                }`}>
                  {r.meeting_number}
                </span>
                <span className={`text-sm font-bold ${r.is_past ? 'text-sand-400' : 'text-sand-800'}`}>
                  יום {dayName(r.meeting_date)}, {ddmm(r.meeting_date)}
                </span>
                {r.start_time && (
                  <span className="text-xs text-sand-400">{hhmm(r.start_time)}</span>
                )}
                {r.is_cancelled && (
                  <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">בוטל</span>
                )}
                {r.i_am_absent && !r.is_cancelled && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full mr-auto">
                    {r.is_past ? 'לא הגעתי' : 'לא מגיעה'}
                  </span>
                )}
              </div>

              {pending && (
                <div className="mt-2 rounded-xl bg-sand-50 px-3 py-2">
                  <p className="text-xs text-sand-700 font-semibold inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    הבקשה התקבלה{r.makeup_meeting_date ? ` ליום ${dayName(r.makeup_meeting_date)}, ${ddmm(r.makeup_meeting_date)}` : ''}
                    {r.makeup_time ? ` ${hhmm(r.makeup_time)}` : ''}
                  </p>
                  <p className="text-[11px] text-sand-500 mt-0.5 leading-relaxed">
                    ברגע שההשלמה תאושר, נעדכן אותך.
                  </p>
                  <div className="flex items-center gap-4 flex-wrap mt-1">
                    <button
                      onClick={() => openPicker(r, 'change')}
                      disabled={isBusy}
                      className="py-2 min-h-[40px] text-xs font-semibold text-mustard-700 hover:text-mustard-800 inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      <Pencil className="w-3 h-3" /> שינוי המועד
                    </button>
                    <button
                      onClick={() => cancelRequest(r)}
                      disabled={isBusy}
                      className="py-2 min-h-[40px] text-xs text-sand-500 hover:text-sand-700 disabled:opacity-40"
                    >
                      ביטול הבקשה
                    </button>
                  </div>
                </div>
              )}

              {settled && (
                <div className="mt-2 rounded-xl bg-[#E8F5E9] px-3 py-2">
                  <p className="text-xs font-semibold text-[#2E7D32] inline-flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    ההשלמה אושרה
                    {r.makeup_meeting_date ? ` ליום ${dayName(r.makeup_meeting_date)}, ${ddmm(r.makeup_meeting_date)}` : ''}
                    {r.makeup_time ? ` ${hhmm(r.makeup_time)}` : ''}
                  </p>
                  {r.makeup_cohort_label && (
                    <p className="text-[11px] text-[#2E7D32] opacity-80 mt-0.5">קבוצת {r.makeup_cohort_label}</p>
                  )}
                  {r.makeup_status === 'confirmed' && (
                    <div className="flex items-center gap-4 flex-wrap mt-1">
                      <button
                        onClick={() => openPicker(r, 'change')}
                        disabled={isBusy}
                        className="py-2 min-h-[40px] text-xs font-semibold text-[#2E7D32] hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                      >
                        <Pencil className="w-3 h-3" /> שינוי המועד
                      </button>
                      <button
                        onClick={() => cancelRequest(r)}
                        disabled={isBusy}
                        className="py-2 min-h-[40px] text-xs text-[#2E7D32] opacity-80 hover:underline disabled:opacity-40"
                      >
                        ביטול ההשלמה
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!r.is_cancelled && (
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  {!r.i_am_absent && (
                    <button
                      onClick={() => setAbsence(r, true)}
                      disabled={isBusy}
                      className="text-xs font-semibold text-sand-600 bg-sand-100 hover:bg-sand-200 px-3.5 py-2.5 min-h-[40px] rounded-xl disabled:opacity-40"
                    >
                      {r.is_past ? 'לא הגעתי למפגש הזה' : 'לא אוכל להגיע'}
                    </button>
                  )}
                  {r.i_am_absent && !r.makeup_status && (
                    <button
                      onClick={() => openPicker(r, 'new')}
                      disabled={isBusy || used >= allowed}
                      className="text-xs font-bold px-3.5 py-2.5 min-h-[40px] rounded-xl disabled:opacity-40"
                      style={{ background: '#C8A460', color: '#33281B' }}
                    >
                      בחירת מועד להשלמה
                    </button>
                  )}
                  {/* ביטול הסימון זמין תמיד, גם אחרי שהמפגש עבר. ברנדה 3.9.26:
                      "במידה ולחצתי בטעות על זה שלא הגעתי אבל כן הגעתי". */}
                  {r.i_am_absent && (
                    <button
                      onClick={() => requestUndo(r)}
                      disabled={isBusy}
                      className="py-2 min-h-[40px] text-xs text-sand-500 hover:text-sand-700 inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {r.is_past ? 'בעצם הגעתי' : 'בעצם כן אגיע'}
                    </button>
                  )}
                  {used >= allowed && r.i_am_absent && !r.makeup_status && (
                    <span className="text-[11px] text-sand-400">ניצלת את שתי ההשלמות</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* אישור לביטול סימון שגורר ביטול השלמה */}
      {confirmUndo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmUndo(null)} dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-xs shadow-2xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sand-800 text-sm">לבטל את הסימון?</p>
            <p className="text-xs text-sand-600 leading-relaxed">
              {confirmUndo.makeup_status === 'confirmed'
                ? 'ההשלמה שכבר אושרה לך תתבטל, והמקום יחזור לקבוצה.'
                : 'הבקשה להשלמה שממתינה תתבטל יחד עם הסימון.'}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAbsence(confirmUndo, false)}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: '#C8A460', color: '#33281B' }}
              >
                כן, הגעתי
              </button>
              <button
                onClick={() => setConfirmUndo(null)}
                className="px-4 py-2 rounded-xl bg-sand-100 text-sand-600 text-sm font-semibold"
              >
                חזרה
              </button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 px-4"
          onClick={() => { setPicking(null); setOptions(null) }} dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh] mb-4 sm:mb-0 pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
              <div>
                <h3 className="font-bold text-sand-800 text-sm">
                  {picking.mode === 'change' ? 'שינוי מועד' : 'השלמת'} מפגש {picking.row.meeting_number}
                </h3>
                <p className="text-xs text-sand-500">אותו תוכן, בקבוצה אחרת</p>
              </div>
              <button onClick={() => { setPicking(null); setOptions(null) }}
                className="p-2.5 -m-1 text-sand-300 hover:text-sand-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
              {options === null ? (
                <p className="text-center text-sand-400 text-sm py-6">טוענת...</p>
              ) : options.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-sand-600 text-sm font-semibold">אין כרגע מועד פתוח להשלמה</p>
                  <p className="text-sand-500 text-xs leading-relaxed">
                    אפשר להשלים את אותו מפגש רק בשני המחזורים הקרובים, וכרגע אין כזה
                    שעוד לא התחיל. סיכום המפגש והתרגילים ממתינים לך באפליקציה.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-sand-500 leading-relaxed bg-sand-50 rounded-xl px-3 py-2">
                    {picking.mode === 'change' ? `${CHANGE_NOTE} ` : ''}
                    {PICK_NOTE}
                  </p>
                  {options.map(o => {
                    const isCurrent = o.meeting_id === picking.row.makeup_meeting_id
                    return (
                      <button
                        key={o.meeting_id}
                        onClick={() => chooseOption(o)}
                        disabled={busy === o.meeting_id || isCurrent}
                        className={`w-full text-right rounded-2xl border-2 p-3 transition-colors disabled:opacity-50 ${
                          isCurrent ? 'border-mustard-300 bg-mustard-50' : 'border-sand-200 hover:border-mustard-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-sand-800">
                            יום {dayName(o.meeting_date)}, {ddmm(o.meeting_date)}
                          </span>
                          {o.start_time && <span className="text-xs text-sand-500">{hhmm(o.start_time)}</span>}
                          {isCurrent && (
                            <span className="text-[11px] font-semibold text-mustard-700 bg-white px-2 py-0.5 rounded-full mr-auto">
                              המועד הנוכחי שלך
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-sand-400 mt-1">
                          קבוצת {o.cohort_label} · {o.available_now ? 'יש כרגע מקום פנוי' : 'אין כרגע מקום פנוי'}
                        </p>
                      </button>
                    )
                  })}
                </>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
