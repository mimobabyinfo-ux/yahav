import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase, DailyLogEntryWithDetails } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDisplayDate, entryTypeLabel } from '../utils/dateUtils'
import HorizontalCalendar from '../components/HorizontalCalendar'
import ActivityTimers from '../components/ActivityTimers'
import DailyTimeline from '../components/DailyTimeline'
import { ENTRY_COLORS } from '../components/DailyTimeline'
import DailySummary from '../components/DailySummary'
import LogEntryModal from '../components/LogEntryModal'
import QuickActionButtons from '../components/QuickActionButtons'
import ChildSwitcher from '../components/ChildSwitcher'
import FeedingIntervalCard from '../components/FeedingIntervalCard'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'
type ViewMode = 'day' | 'week' | 'month'

const UPSELLS: Record<string, { emoji: string; text: string; cta: string; wa: string }> = {
  sleep: {
    emoji: '😴',
    text: 'מתמודדת עם שינה קשה?',
    cta: 'סדנת שינה לתינוקות',
    wa: 'היי! אני מתמודדת עם שינה קשה ורוצה לשמוע על הסדנה',
  },
  diaper: {
    emoji: '🍼',
    text: 'הרבה חיתולים מלוכלכים? נסי עיסוי בטן',
    cta: 'סדנת עיסוי תינוקות',
    wa: 'היי! אני מעוניינת לשמוע על סדנת עיסוי תינוקות',
  },
  note: {
    emoji: '💛',
    text: 'כתבת הערה — אנחנו כאן לכל שאלה',
    cta: 'שאלי אותנו בוואטסאפ',
    wa: 'היי! יש לי שאלה לגבי התינוק שלי',
  },
  feeding: {
    emoji: '🤱',
    text: 'רוצה תמיכה בהנקה?',
    cta: 'להתייעצות עם מנחה',
    wa: 'היי! אני מעוניינת בייעוץ הנקה',
  },
}

function UpsellCard({ type, onDismiss }: { type: EntryType; onDismiss: () => void }) {
  const u = UPSELLS[type]
  if (!u) return null
  const waUrl = `https://wa.me/972559904274?text=${encodeURIComponent(u.wa)}`
  return (
    <div className="bg-gradient-to-r from-mustard-50 to-beige-50 border border-mustard-200 rounded-3xl p-4 flex items-start gap-3 animate-fade-in">
      <span className="text-2xl flex-shrink-0">{u.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sand-800">{u.text}</p>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs font-bold text-white px-3 py-1.5 rounded-xl"
          style={{ background: '#E7C78A' }}
        >
          {u.cta} →
        </a>
      </div>
      <button onClick={onDismiss} className="text-sand-300 hover:text-sand-500 flex-shrink-0">✕</button>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - day)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isoDate(d: Date) { return formatDate(d) }

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

// ── Weekly view ───────────────────────────────────────────────────────────────
function WeekView({ entries, weekStart, onDayClick }: { entries: DailyLogEntryWithDetails[]; weekStart: Date; onDayClick: (date: string) => void }) {
  const today = isoDate(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const byDate: Record<string, DailyLogEntryWithDetails[]> = {}
  entries.forEach(e => {
    if (!byDate[e.entry_date]) byDate[e.entry_date] = []
    byDate[e.entry_date].push(e)
  })

  return (
    <div className="bg-[#DCD4C8] rounded-3xl shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-sand-100">
        {days.map((d, i) => {
          const ds = isoDate(d)
          const isToday = ds === today
          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="flex flex-col items-center py-2 hover:bg-mustard-50 transition-colors"
            >
              <span className="text-[10px] text-sand-400">{DAY_LABELS[i]}</span>
              <span className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'text-white' : 'text-sand-700'}`}
                style={isToday ? { background: '#E7C78A' } : {}}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Entry color dots grid */}
      <div className="grid grid-cols-7 min-h-[120px] p-2 gap-1">
        {days.map((d) => {
          const ds = isoDate(d)
          const dayEntries = byDate[ds] ?? []
          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="flex flex-col gap-1 items-center pt-1 hover:bg-sand-50 rounded-xl transition-colors min-h-[100px]"
            >
              {dayEntries.slice(0, 6).map(e => {
                const col = ENTRY_COLORS[e.entry_type] ?? { bg: '#e5e7eb' }
                return (
                  <div key={e.id} className="w-4 h-4 rounded-md flex-shrink-0" style={{ background: col.bg }} title={e.entry_type} />
                )
              })}
              {dayEntries.length > 6 && (
                <span className="text-[9px] text-sand-400">+{dayEntries.length - 6}</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-center text-xs text-sand-300 pb-2">לחצי על יום לצפייה מפורטת</p>
    </div>
  )
}

// ── Monthly view ──────────────────────────────────────────────────────────────
function MonthView({ entries, month, year, onDayClick }: { entries: DailyLogEntryWithDetails[]; month: number; year: number; onDayClick: (date: string) => void }) {
  const today = isoDate(new Date())
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = firstDay.getDay() // 0=Sun
  const totalCells = startOffset + lastDay.getDate()
  const rows = Math.ceil(totalCells / 7)

  const byDate: Record<string, { type: string }[]> = {}
  entries.forEach(e => {
    if (!byDate[e.entry_date]) byDate[e.entry_date] = []
    byDate[e.entry_date].push({ type: e.entry_type })
  })

  return (
    <div className="bg-[#DCD4C8] rounded-3xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-sand-100">
        {DAY_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] text-sand-400 py-2 font-semibold">{l}</div>
        ))}
      </div>
      <div className="p-2">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid grid-cols-7 mb-1">
            {Array.from({ length: 7 }, (_, c) => {
              const dayNum = r * 7 + c - startOffset + 1
              if (dayNum < 1 || dayNum > lastDay.getDate()) return <div key={c} />
              const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
              const dayEntries = byDate[ds] ?? []
              const isToday = ds === today
              return (
                <button
                  key={c}
                  onClick={() => onDayClick(ds)}
                  className="flex flex-col items-center py-1 rounded-xl hover:bg-mustard-50 transition-colors"
                >
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'text-white' : 'text-sand-700'}`}
                    style={isToday ? { background: '#D9B978' } : {}}>
                    {dayNum}
                  </span>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-0.5 max-w-[24px]">
                    {[...new Set(dayEntries.map(e => e.type))].slice(0, 3).map(type => {
                      const col = ENTRY_COLORS[type as EntryType] ?? { bg: '#e5e7eb' }
                      return <div key={type} className="w-1.5 h-1.5 rounded-full" style={{ background: col.bg }} />
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const { user, selectedChild, profile, isGuest } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [entries, setEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [allEntries, setAllEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [modalType, setModalType] = useState<EntryType | null>(null)
  const [upsellType, setUpsellType] = useState<EntryType | null>(null)
  const [feedingAlert, setFeedingAlert] = useState(false)

  // Feeding interval alert: check on mount and after each feeding save
  const checkFeedingAlert = useCallback(() => {
    const intervalHours = profile?.feeding_interval_hours ?? 3
    const lastStr = localStorage.getItem('last_feeding_time')
    const dismissedStr = localStorage.getItem('feeding_alert_dismissed')
    if (!lastStr) return
    const elapsed = (Date.now() - new Date(lastStr).getTime()) / 3600000
    if (elapsed < intervalHours) { setFeedingAlert(false); return }
    // Don't re-show if already dismissed since the last feeding
    if (dismissedStr && new Date(dismissedStr) > new Date(lastStr)) { setFeedingAlert(false); return }
    setFeedingAlert(true)
  }, [profile?.feeding_interval_hours])

  useEffect(() => {
    checkFeedingAlert()
    const timer = setInterval(checkFeedingAlert, 60000) // recheck every minute
    return () => clearInterval(timer)
  }, [checkFeedingAlert])

  // Week/month navigation
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [monthDate, setMonthDate] = useState<Date>(() => new Date())

  // Helper: get all relevant user IDs (self + family members)
  const getFamilyUserIds = useCallback(async (): Promise<string[]> => {
    if (!user) return []
    if (!profile?.family_id) return [user.id]
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('family_id', profile.family_id)
    return data?.map(r => r.id) ?? [user.id]
  }, [user, profile?.family_id])

  // Fetch entries for the selected date (daily view)
  const fetchEntries = useCallback(async () => {
    if (!user) return
    setLoading(true)
    // When a child is selected, filter by child_id — works for all family members & guests
    // Otherwise fall back to user_id-based family query
    let query = supabase
      .from('daily_log_entries')
      .select(`*, feeding_details(*), sleep_details(*), diaper_details(*)`)
      .eq('entry_date', selectedDate)
      .order('entry_time', { ascending: false })
    if (selectedChild) {
      query = query.or(`child_id.eq.${selectedChild.id},user_id.eq.${selectedChild.user_id}`)
    } else {
      const userIds = await getFamilyUserIds()
      query = query.in('user_id', userIds)
    }
    const { data } = await query
    setEntries((data as DailyLogEntryWithDetails[]) ?? [])
    setLoading(false)
  }, [user, selectedDate, selectedChild, getFamilyUserIds])

  // Fetch all entries for the week/month range
  const fetchRangeEntries = useCallback(async (from: string, to: string) => {
    if (!user) return
    let query = supabase
      .from('daily_log_entries')
      .select(`*, feeding_details(*), sleep_details(*), diaper_details(*)`)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
    if (selectedChild) {
      query = query.or(`child_id.eq.${selectedChild.id},user_id.eq.${selectedChild.user_id}`)
    } else {
      const userIds = await getFamilyUserIds()
      query = query.in('user_id', userIds)
    }
    const { data } = await query
    setAllEntries((data as DailyLogEntryWithDetails[]) ?? [])
  }, [user, selectedChild, getFamilyUserIds])

  useEffect(() => {
    if (viewMode === 'day') {
      fetchEntries()
    } else if (viewMode === 'week') {
      const from = isoDate(weekStart)
      const to = isoDate(addDays(weekStart, 6))
      fetchRangeEntries(from, to)
    } else {
      const from = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`
      const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      const to = isoDate(last)
      fetchRangeEntries(from, to)
    }
  }, [viewMode, selectedDate, weekStart, monthDate, fetchEntries, fetchRangeEntries])

  function handleDayClick(date: string) {
    setSelectedDate(date)
    setViewMode('day')
  }

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">📔</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Feeding interval alert */}
        {feedingAlert && selectedChild && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'linear-gradient(135deg, #FFF7ED, #FFFBEB)', border: '1px solid #F3C96C' }}>
            <span className="text-2xl flex-shrink-0">🍼</span>
            <p className="flex-1 text-sm font-semibold text-sand-800">
              {selectedChild.name} צריך/ה לאכול עכשיו!
            </p>
            <button onClick={() => { localStorage.setItem('feeding_alert_dismissed', new Date().toISOString()); setFeedingAlert(false) }} className="text-sand-400 hover:text-sand-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Guest banner */}
        {isGuest && selectedChild && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl" style={{ background: 'linear-gradient(135deg, #FFF8E7, #FFF0CC)' }}>
            <span className="text-lg">👁️</span>
            <p className="text-xs font-semibold text-mustard-800">
              צופה ביומן של {selectedChild.name} — הצטרפת כבן/בת משפחה
            </p>
          </div>
        )}

        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-sand-800">יומן</h1>
            <p className="text-sand-400 text-sm">
              {viewMode === 'day' ? formatDisplayDate(selectedDate)
               : viewMode === 'week' ? `שבוע ${isoDate(weekStart)} – ${isoDate(addDays(weekStart, 6))}`
               : `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`}
            </p>
          </div>
        </div>

        {/* Child Switcher */}
        <ChildSwitcher />

        {/* Feeding interval tracker */}
        <FeedingIntervalCard />

        {/* View mode tabs */}
        <div className="flex bg-[#DCD4C8] rounded-2xl p-1 shadow-sm gap-1">
          {([['day','יום'], ['week','שבוע'], ['month','חודש']] as [ViewMode, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${viewMode === v ? 'text-white shadow-sm' : 'text-sand-500'}`}
              style={viewMode === v ? { background: '#E7C78A' } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Day view ─────────────────────────────────────────── */}
        {viewMode === 'day' && (
          <>
            <div className="bg-[#DCD4C8] rounded-3xl p-4 shadow-sm">
              <HorizontalCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
            </div>

            {selectedDate === formatDate(new Date()) && (
              <div className="bg-[#DCD4C8] rounded-3xl p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-sand-600 mb-3">טיימרים</h2>
                <ActivityTimers onEntrySaved={fetchEntries} />
              </div>
            )}

            <div className="bg-[#DCD4C8] rounded-3xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-sand-600">הוספה מהירה</h2>
                <button
                  onClick={() => setModalType('feeding')}
                  className="flex items-center gap-1 text-xs text-mustard-600 font-medium bg-mustard-50 px-3 py-1.5 rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" />האכלה
                </button>
              </div>
              <QuickActionButtons onSelect={setModalType} />
            </div>

            <DailySummary entries={entries} />

            {upsellType && (
              <UpsellCard type={upsellType} onDismiss={() => setUpsellType(null)} />
            )}

            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <DailyTimeline entries={entries} onRefresh={fetchEntries} />
            )}
          </>
        )}

        {/* ── Week view ─────────────────────────────────────────── */}
        {viewMode === 'week' && (
          <>
            <div className="flex items-center justify-between">
              <button onClick={() => setWeekStart(d => addDays(d, -7))} className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50">
                <ChevronRight className="w-4 h-4 text-sand-500" />
              </button>
              <span className="text-sm font-semibold text-sand-600">
                {isoDate(weekStart)} – {isoDate(addDays(weekStart, 6))}
              </span>
              <button onClick={() => setWeekStart(d => addDays(d, 7))} className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50">
                <ChevronLeft className="w-4 h-4 text-sand-500" />
              </button>
            </div>
            <WeekView entries={allEntries} weekStart={weekStart} onDayClick={handleDayClick} />

            {/* Legend */}
            <div className="bg-[#DCD4C8] rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-sand-500 mb-2">מקרא</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(ENTRY_COLORS).map(([type, col]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: col.bg }} />
                    <span className="text-xs text-sand-500">{entryTypeLabel(type)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Month view ────────────────────────────────────────── */}
        {viewMode === 'month' && (
          <>
            <div className="flex items-center justify-between">
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50">
                <ChevronRight className="w-4 h-4 text-sand-500" />
              </button>
              <span className="text-sm font-semibold text-sand-600">
                {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
              </span>
              <button onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50">
                <ChevronLeft className="w-4 h-4 text-sand-500" />
              </button>
            </div>
            <MonthView
              entries={allEntries}
              month={monthDate.getMonth()}
              year={monthDate.getFullYear()}
              onDayClick={handleDayClick}
            />

            {/* Legend */}
            <div className="bg-[#DCD4C8] rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-sand-500 mb-2">מקרא</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(ENTRY_COLORS).map(([type, col]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.bg }} />
                    <span className="text-xs text-sand-500">{entryTypeLabel(type)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {modalType && (
        <LogEntryModal
          entryType={modalType}
          date={selectedDate}
          onClose={() => setModalType(null)}
          onSaved={() => {
            fetchEntries()
            setUpsellType(modalType)
            setTimeout(() => setUpsellType(null), 8000)
            if (modalType === 'feeding') {
              const now = new Date()
              localStorage.setItem('last_feeding_time', now.toISOString())
              const intervalHours = profile?.feeding_interval_hours ?? 3
              const nextTime = new Date(now.getTime() + intervalHours * 3600 * 1000)
              localStorage.setItem('next_feeding_time', nextTime.toISOString())
              setFeedingAlert(false)
              if ('Notification' in window) {
                Notification.requestPermission().then(perm => {
                  if (perm === 'granted') {
                    const delay = nextTime.getTime() - Date.now()
                    if (delay > 0) {
                      setTimeout(() => {
                        new Notification('הגיע זמן לאכול! 🍼', {
                          body: `${selectedChild?.name ?? 'התינוק'} צריכ/ה לאכול עכשיו`,
                        })
                      }, delay)
                    }
                  }
                })
              }
            }
          }}
        />
      )}
    </div>
  )
}
