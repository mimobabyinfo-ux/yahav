import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase, DailyLogEntryWithDetails } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDisplayDate } from '../utils/dateUtils'
import HorizontalCalendar from '../components/HorizontalCalendar'
import ActivityTimers from '../components/ActivityTimers'
import DailyTimeline from '../components/DailyTimeline'
import DailySummary from '../components/DailySummary'
import LogEntryModal from '../components/LogEntryModal'
import QuickActionButtons from '../components/QuickActionButtons'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'pumping' | 'milestone' | 'doctor_visit' | 'note'

export default function JournalPage() {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [entries, setEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [modalType, setModalType] = useState<EntryType | null>(null)

  const fetchEntries = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('daily_log_entries')
      .select(`
        *,
        feeding_details(*),
        sleep_details(*),
        diaper_details(*)
      `)
      .eq('user_id', user.id)
      .eq('entry_date', selectedDate)
      .order('entry_time', { ascending: false })
    setEntries((data as DailyLogEntryWithDetails[]) ?? [])
    setLoading(false)
  }, [user, selectedDate])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  return (
    <div className="min-h-screen p-4 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">📔</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">יומן</h1>
          <p className="text-sand-400 text-sm">{formatDisplayDate(selectedDate)}</p>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <HorizontalCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
        </div>

        {/* Timers (only for today) */}
        {selectedDate === formatDate(new Date()) && (
          <div className="bg-white rounded-3xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-sand-600 mb-3">טיימרים</h2>
            <ActivityTimers onEntrySaved={fetchEntries} />
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-sand-600">הוספה מהירה</h2>
            <button
              onClick={() => setModalType('feeding')}
              className="flex items-center gap-1 text-xs text-mustard-600 font-medium bg-mustard-50 px-3 py-1.5 rounded-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              האכלה
            </button>
          </div>
          <QuickActionButtons onSelect={setModalType} />
        </div>

        {/* Summary */}
        <DailySummary entries={entries} />

        {/* Timeline */}
        {loading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <DailyTimeline entries={entries} onRefresh={fetchEntries} />
        )}
      </div>

      {modalType && (
        <LogEntryModal
          entryType={modalType}
          date={selectedDate}
          onClose={() => setModalType(null)}
          onSaved={fetchEntries}
        />
      )}
    </div>
  )
}
