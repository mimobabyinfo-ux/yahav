import { useEffect, useState, useCallback } from 'react'
import { Share2 } from 'lucide-react'
import { supabase, DailyLogEntryWithDetails } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { formatDate, formatDisplayDate } from '../utils/dateUtils'
import LogEntryModal from '../components/LogEntryModal'
import ChildSwitcher from '../components/ChildSwitcher'
import ShareBabyModal from '../components/ShareBabyModal'
import ActivityTimers from '../components/ActivityTimers'
import JournalTabs, { JournalTab } from '../components/journal/JournalTabs'
import DayView from '../components/journal/DayView'
import WeekView from '../components/journal/WeekView'
import ListView from '../components/journal/ListView'
import SummaryView from '../components/journal/SummaryView'
import type { Page } from '../App'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'
type TimelineFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time'

// ── Upsell hooks shown briefly after a manual log entry on a past date ──
// (Kept local — only the journal page surfaces these.)
const UPSELLS: Record<string, { emoji: string; text: string; cta: string; wa: string }> = {
  sleep:   { emoji: '😴', text: 'מתמודדת עם שינה קשה?',   cta: 'סדנת שינה לתינוקות',    wa: 'היי! אני מתמודדת עם שינה קשה ורוצה לשמוע על הסדנה' },
  diaper:  { emoji: '🍼', text: 'הרבה חיתולים מלוכלכים? נסי עיסוי בטן', cta: 'סדנת עיסוי תינוקות', wa: 'היי! אני מעוניינת לשמוע על סדנת עיסוי תינוקות' },
  note:    { emoji: '💛', text: 'כתבת הערה — אנחנו כאן לכל שאלה',       cta: 'שאלי אותנו בוואטסאפ',  wa: 'היי! יש לי שאלה לגבי התינוק שלי' },
  feeding: { emoji: '🤱', text: 'רוצה תמיכה בהנקה?',     cta: 'להתייעצות עם מנחה',     wa: 'היי! אני מעוניינת בייעוץ הנקה' },
}

function UpsellCard({ type, onDismiss, ownerWhatsapp }: { type: EntryType; onDismiss: () => void; ownerWhatsapp: string }) {
  const u = UPSELLS[type]
  if (!u) return null
  const waUrl = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(u.wa)}`
  return (
    <div className="bg-gradient-to-r from-mustard-50 to-beige-50 border border-mustard-200 rounded-3xl p-4 flex items-start gap-3 animate-fade-in">
      <span className="text-2xl flex-shrink-0">{u.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sand-800">{u.text}</p>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-bold text-white px-3 py-1.5 rounded-xl" style={{ background: '#E7C78A' }}>
          {u.cta} →
        </a>
      </div>
      <button onClick={onDismiss} className="text-sand-300 hover:text-sand-500 flex-shrink-0">✕</button>
    </div>
  )
}

// ── helpers preserved from the pre-refactor file (used by week-tab arrows) ──
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

// ── Main page ─────────────────────────────────────────────────────────────────
type JournalPageProps = {
  /** Optional — provided by App.tsx for Phase-2 hybrid quick-add (sleep tap
   *  on today routes to the dedicated SleepPage). Guest-mode rendering of
   *  this page doesn't pass it, so the picker fallback still works. */
  onNavigate?: (page: Page) => void
}

export default function JournalPage({ onNavigate }: JournalPageProps = {}) {
  const { user, selectedChild, profile, isGuest } = useAuth()
  const { ownerWhatsapp } = useOwnerSettings()

  const [tab, setTab] = useState<JournalTab>('day')
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [entries, setEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [allEntries, setAllEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  // Separate loading flag for the week-range fetch (used by Week + List
  // tabs). The day-tab `loading` flag is unrelated; both can be in flight
  // simultaneously as the user switches tabs.
  const [rangeLoading, setRangeLoading] = useState(false)
  const [modalType, setModalType] = useState<EntryType | null>(null)
  const [presetFeedingType, setPresetFeedingType] = useState<'breast' | 'bottle' | 'solid' | undefined>(undefined)
  // Phase 3 / C3: tap-to-edit. When set, LogEntryModal opens prefilled
  // from the entry and saves via UPDATE rather than INSERT.
  const [editingEntry, setEditingEntry] = useState<DailyLogEntryWithDetails | null>(null)
  const [upsellType, setUpsellType] = useState<EntryType | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [shareOpen, setShareOpen] = useState(false)

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))

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

  // Fetch entries for the selected date (day view). Widened by 1 day on
  // the LEFT so the DayTimelineChart can render cross-midnight tails from
  // the previous night's sleep. Consumers downstream that only care about
  // selectedDate (the text timeline, DailySummary cards) filter inside
  // DayView so the widening is transparent to them.
  const fetchEntries = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const prev = formatDate(addDays(new Date(selectedDate + 'T12:00:00'), -1))
    let query = supabase
      .from('daily_log_entries')
      .select(`*, feeding_details(*), sleep_details(*), diaper_details(*)`)
      .in('entry_date', [prev, selectedDate])
      .order('entry_time', { ascending: false })
    if (selectedChild) {
      query = query.eq('child_id', selectedChild.id)
    } else {
      const userIds = await getFamilyUserIds()
      query = query.in('user_id', userIds)
    }
    const { data } = await query
    setEntries((data ?? []) as DailyLogEntryWithDetails[])
    setLoading(false)
  }, [user, selectedDate, selectedChild, getFamilyUserIds])

  // Refresh after a save/edit/delete — bumps the quick-add bar's "time since"
  // counters AND re-pulls today's entries.
  const handleEntrySaved = useCallback(() => {
    setRefetchKey(k => k + 1)
    fetchEntries()
  }, [fetchEntries])

  // Fetch all entries for a range (week + list views)
  const fetchRangeEntries = useCallback(async (from: string, to: string) => {
    if (!user) return
    setRangeLoading(true)
    let query = supabase
      .from('daily_log_entries')
      .select(`*, feeding_details(*), sleep_details(*), diaper_details(*)`)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
    if (selectedChild) {
      query = query.eq('child_id', selectedChild.id)
    } else {
      const userIds = await getFamilyUserIds()
      query = query.in('user_id', userIds)
    }
    const { data } = await query
    setAllEntries((data ?? []) as DailyLogEntryWithDetails[])
    setRangeLoading(false)
  }, [user, selectedChild, getFamilyUserIds])

  useEffect(() => {
    if (tab === 'day') {
      fetchEntries()
    } else if (tab === 'week' || tab === 'list') {
      // Week tab widens by one day on the LEFT so cross-midnight sleeps
      // from the Saturday BEFORE weekStart still appear on Sunday's
      // column in the chart (C4 / Q7). List view reuses the same range
      // (visible 7 days only — the chart's filter logic ignores any extra).
      const from = formatDate(addDays(weekStart, -1))
      const to = formatDate(addDays(weekStart, 6))
      fetchRangeEntries(from, to)
    }
    // summary tab is still a placeholder (lands in C6).
  }, [tab, selectedDate, weekStart, fetchEntries, fetchRangeEntries])

  function handleDayClick(date: string) {
    setSelectedDate(date)
    setTab('day')
  }

  // ── Header label per tab ─────────────────────────────────────────────
  const headerSubLabel =
    tab === 'day'  ? formatDisplayDate(selectedDate) :
    tab === 'week' ? `שבוע ${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}` :
    tab === 'list' ? 'תצוגת רשימה' :
    'תצוגת סיכום'

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">📔</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Guest banner — Phase 4 / C1 surfaces role + custom name from
            the redeemed invite so the greeting feels personal. Falls
            back to the generic "בן/בת משפחה" label for legacy guests
            whose invites predate the role column. */}
        {isGuest && selectedChild && (() => {
          const roleLabelMap: Record<string, { emoji: string; label: string }> = {
            father:  { emoji: '👨',    label: 'אבא' },
            grandma: { emoji: '👵',    label: 'סבתא' },
            grandpa: { emoji: '👴',    label: 'סבא' },
            aunt:    { emoji: '👩',    label: 'דודה' },
            nanny:   { emoji: '👩‍⚕️', label: 'מטפלת' },
          }
          const def = profile?.family_role ? roleLabelMap[profile.family_role] : null
          const name = profile?.family_display_name?.trim()
          const greeting = name
            ? `היי ${name}! זה היומן של ${selectedChild.name}`
            : def
              ? `שלום ${def.label} — זה היומן של ${selectedChild.name}`
              : `צופה ביומן של ${selectedChild.name} — הצטרפת כבן/בת משפחה`
          return (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl" style={{ background: 'linear-gradient(135deg, #FFF8E7, #FFF0CC)' }}>
              <span className="text-lg">{def?.emoji ?? '👁️'}</span>
              <p className="text-xs font-semibold text-mustard-800">{greeting}</p>
            </div>
          )
        })()}

        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-sand-800">יומן</h1>
            {selectedChild && !isGuest && (
              <button
                onClick={() => setShareOpen(true)}
                className="p-2 rounded-xl text-sand-400 hover:text-mustard-600 hover:bg-mustard-50 transition-colors"
                title="שיתוף יומן"
                aria-label="שיתוף יומן"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-sand-400 text-sm">{headerSubLabel}</p>
        </div>

        <ChildSwitcher />

        {/* Quick-add bar — promoted to top of the page (Phase 3 / C4 UX
            restructure). Visible on every tab so logging is always one
            tap away. forceModal kicks in only when the Day tab is on a
            past date; on other tabs taps go to the dedicated action
            pages regardless of selectedDate. */}
        <div className="bg-[#F5F1EB] rounded-3xl p-3 shadow-sm">
          <ActivityTimers
            onEntrySaved={handleEntrySaved}
            refetchKey={refetchKey}
            onModalRequest={(t, preset) => {
              setModalType(t as EntryType)
              setPresetFeedingType(preset?.feedingType)
            }}
            forceModal={tab === 'day' && selectedDate !== formatDate(new Date())}
            onOpenLogPage={onNavigate ? (logType) => {
              if (logType === 'sleep') onNavigate('log-sleep')
              else if (logType === 'tummy_time') onNavigate('log-tummy')
              else if (logType === 'feeding-breast') onNavigate('log-feeding-breast')
              else if (logType === 'feeding-bottle') onNavigate('log-feeding-bottle')
              else if (logType === 'feeding-solid') onNavigate('log-feeding-solid')
              else if (logType === 'diaper') onNavigate('log-diaper')
              else if (logType === 'doctor_visit') onNavigate('log-medical')
              else if (logType === 'milestone') onNavigate('log-milestone')
              else if (logType === 'note') onNavigate('log-note')
            } : undefined}
          />
        </div>

        <JournalTabs value={tab} onChange={setTab} />

        {/* Upsell card surfaces briefly after a past-date manual log save. */}
        {tab === 'day' && upsellType && (
          <UpsellCard type={upsellType} onDismiss={() => setUpsellType(null)} ownerWhatsapp={ownerWhatsapp} />
        )}

        {tab === 'day' && (
          <DayView
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            entries={entries}
            loading={loading}
            filter={timelineFilter}
            onFilterChange={setTimelineFilter}
            onEntrySaved={handleEntrySaved}
            onEditEntry={setEditingEntry}
          />
        )}

        {tab === 'week' && (
          <WeekView
            entries={allEntries}
            weekStart={weekStart}
            onWeekShift={setWeekStart}
            onDayClick={handleDayClick}
          />
        )}

        {tab === 'list' && (
          <ListView
            entries={allEntries}
            weekStart={weekStart}
            onWeekShift={setWeekStart}
            loading={rangeLoading}
            onEntrySaved={handleEntrySaved}
            onEditEntry={setEditingEntry}
          />
        )}
        {tab === 'summary' && (
          <SummaryView
            refetchKey={refetchKey}
            onNavigateToDay={(iso) => {
              setSelectedDate(iso)
              setTab('day')
            }}
          />
        )}
      </div>

      {/* Create modal (past-date taps + non-hybrid action types) */}
      {modalType && (
        <LogEntryModal
          entryType={modalType}
          date={selectedDate}
          presetFeedingType={presetFeedingType}
          onClose={() => { setModalType(null); setPresetFeedingType(undefined) }}
          onSaved={() => {
            handleEntrySaved()
            setUpsellType(modalType)
            setTimeout(() => setUpsellType(null), 8000)
            setPresetFeedingType(undefined)
          }}
        />
      )}

      {/* Edit modal — only fires for entry types the modal can round-trip
          without data loss (sleep / tummy_time / note / doctor_visit).
          Other types render with cursor-default in DailyTimeline. */}
      {editingEntry && (
        <LogEntryModal
          entryType={editingEntry.entry_type as EntryType}
          date={editingEntry.entry_date}
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            handleEntrySaved()
            setEditingEntry(null)
          }}
        />
      )}

      {shareOpen && <ShareBabyModal onClose={() => setShareOpen(false)} />}
    </div>
  )
}
