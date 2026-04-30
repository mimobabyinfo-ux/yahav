import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Local-date string in user's timezone — never throws on Invalid Date
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseEntryDateTime(entry_date: string, entry_time: string): Date | null {
  // PostgREST returns time as "HH:MM:SS"; older code expected "HH:MM" — normalize both.
  const t = entry_time.length === 5 ? `${entry_time}:00` : entry_time
  const dt = new Date(`${entry_date}T${t}`)
  return isNaN(dt.getTime()) ? null : dt
}

function formatRemaining(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} דקות`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (m === 0) return `${h} שעות`
  return `${h} שעות ו-${m} דקות`
}

function formatElapsed(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} דקות`
  const h = Math.round(totalMin / 60 * 10) / 10
  return `${h} שעות`
}

export default function FeedingIntervalCard() {
  const { user, profile, selectedChild, refreshProfile } = useAuth()
  const [lastFeedingAt, setLastFeedingAt] = useState<Date | null>(null)
  const [now, setNow] = useState(new Date())

  // Refresh "now" every minute so the countdown updates live
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Pull the most recent feeding entry from the journal
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function loadLast() {
      if (!user) return
      let q = supabase
        .from('daily_log_entries')
        .select('entry_date, entry_time')
        .eq('entry_type', 'feeding')
        .order('entry_date', { ascending: false })
        .order('entry_time', { ascending: false })
        .limit(1)
      if (selectedChild) q = q.eq('child_id', selectedChild.id)
      else q = q.eq('user_id', user.id)
      const { data } = await q
      if (cancelled) return
      const row = data?.[0]
      setLastFeedingAt(row?.entry_date && row?.entry_time ? parseEntryDateTime(row.entry_date, row.entry_time) : null)
    }
    loadLast()
    const t = setInterval(loadLast, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [user, selectedChild])

  if (!selectedChild) return null

  async function saveFeedingInterval(hours: number) {
    if (!user) return
    await supabase.from('user_profiles').update({ feeding_interval_hours: hours }).eq('id', user.id)
    refreshProfile()
  }

  const intervalHours = profile?.feeding_interval_hours ?? 3
  const intervalMs = intervalHours * 3600 * 1000
  const validLast = lastFeedingAt && !isNaN(lastFeedingAt.getTime()) ? lastFeedingAt : null
  const todayStr = localDateStr(new Date())
  const loggedToday = !!(validLast && localDateStr(validLast) === todayStr)
  const elapsedMs = validLast ? now.getTime() - validLast.getTime() : null
  const remainingMs = elapsedMs != null ? intervalMs - elapsedMs : null

  let status: 'none' | 'overdue' | 'soon' | 'normal' = 'none'
  if (validLast && elapsedMs != null && remainingMs != null) {
    if (remainingMs <= 0) status = 'overdue'
    else if (remainingMs <= 15 * 60 * 1000) status = 'soon'
    else status = 'normal'
  }

  return (
    <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3" dir="rtl">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${status === 'overdue' ? 'bg-orange-100' : 'bg-mustard-50'}`}>
          🍼
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-sand-800">מעקב האכלה</p>
          <p className="text-xs text-sand-400">
            {loggedToday
              ? `האכלה אחרונה: ${validLast!.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
              : 'רשמי האכלה ביומן כדי לעקוב'}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs text-sand-400 mb-1.5">מרווח בין האכלות</p>
        <div className="flex gap-1.5 flex-wrap">
          {[2, 2.5, 3, 3.5, 4].map(h => (
            <button
              key={h}
              onClick={() => saveFeedingInterval(h)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${intervalHours === h ? 'text-white shadow-sm' : 'bg-sand-100 text-sand-500'}`}
              style={intervalHours === h ? { background: '#E7C78A' } : {}}
            >
              {h}ש׳
            </button>
          ))}
        </div>
      </div>

      <div className="pt-1">
        {!loggedToday && (
          <p className="text-xs text-sand-400">עוד לא תועדה האכלה היום</p>
        )}
        {status === 'normal' && remainingMs != null && (
          <p className="text-xs text-sand-600">
            ההאכלה הבאה בעוד {formatRemaining(remainingMs)}
          </p>
        )}
        {status === 'soon' && (
          <p className="text-xs font-semibold text-mustard-700">
            ההאכלה הבאה: בקרוב
          </p>
        )}
        {status === 'overdue' && elapsedMs != null && (
          <div className="rounded-xl px-3 py-2" style={{ background: '#FFF4E6', border: '1px solid #F5C77E' }}>
            <p className="text-sm font-bold" style={{ color: '#C2410C' }}>🍼 הגיע זמן ההאכלה</p>
            <p className="text-xs mt-0.5" style={{ color: '#9A3412' }}>
              (חלפו {formatElapsed(elapsedMs)} מההאכלה האחרונה)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
