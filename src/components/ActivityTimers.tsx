import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Square, RefreshCw } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatTime, formatElapsed } from '../utils/dateUtils'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'

type Props = {
  onEntrySaved: () => void
}

type TimerType = 'feeding' | 'sleep' | 'tummy_time'

type AdditionalData = {
  breast_side?: 'left' | 'right' | 'both'
  feeding_type?: string
}

export default function ActivityTimers({ onEntrySaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [elapsed, setElapsed] = useState<Record<string, string>>({})
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>('right')
  const stoppingRef = useRef<Set<string>>(new Set())

  const loadTimers = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('active_timers')
      .select('*')
      .eq('user_id', user.id)
    setActiveTimers(data ?? [])
  }, [user])

  useEffect(() => {
    loadTimers()
  }, [loadTimers])

  useEffect(() => {
    const interval = setInterval(() => {
      const updates: Record<string, string> = {}
      activeTimers.forEach(t => {
        updates[t.id] = formatElapsed(t.start_time)
      })
      setElapsed(updates)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTimers])

  async function startTimer(type: TimerType) {
    if (!user) return
    const additionalData: AdditionalData = {}
    if (type === 'feeding') {
      additionalData.feeding_type = 'breast'
      additionalData.breast_side = breastSide
    }
    await supabase.from('active_timers').insert({
      user_id: user.id,
      timer_type: type,
      start_time: new Date().toISOString(),
      additional_data: additionalData,
    })
    await loadTimers()
  }

  async function stopTimer(timer: ActiveTimer) {
    if (!user) return
    if (stoppingRef.current.has(timer.id)) return
    stoppingRef.current.add(timer.id)
    try {
    const start = new Date(timer.start_time)
    const now = new Date()
    const durationSecs = Math.round((now.getTime() - start.getTime()) / 1000)
    const durationForLog = durationSecs >= 1 ? parseFloat((durationSecs / 60).toFixed(2)) : null
    const durationLabel = durationSecs < 60
      ? `${durationSecs} שניות`
      : `${Math.round(durationSecs / 60)} דקות`

    // Insert log entry and get back the row in one call
    const { data: entry } = await supabase
      .from('daily_log_entries')
      .insert({
        user_id: user.id,
        child_id: selectedChild?.id ?? null,
        entry_date: formatDate(now),
        entry_time: formatTime(start),
        entry_type: timer.timer_type,
        notes: timer.timer_type === 'tummy_time' && durationSecs
          ? `משך: ${durationLabel}`
          : null,
      })
      .select()
      .single()

    // Save type-specific details if we have the entry ID
    if (entry) {
      const addl = (timer.additional_data ?? {}) as AdditionalData
      if (timer.timer_type === 'feeding') {
        await supabase.from('feeding_details').insert({
          log_entry_id: entry.id,
          feeding_type: addl.feeding_type ?? 'breast',
          breast_side: addl.breast_side ?? null,
          duration_minutes: durationForLog,
        })
      } else if (timer.timer_type === 'sleep') {
        await supabase.from('sleep_details').insert({
          log_entry_id: entry.id,
          sleep_type: 'nap',
          duration_minutes: durationForLog,
        })
      }
    }

    // Always delete the active timer and refresh — even if details save failed
    await supabase.from('active_timers').delete().eq('id', timer.id)
    await loadTimers()
    onEntrySaved()
    // Intentionally do NOT remove from stoppingRef on success.
    // The timer row is deleted, so this id cannot be passed to stopTimer again.
    // Removing it earlier opens a window where a delayed click could re-fire
    // before loadTimers() removes the button from the DOM.
    } catch (err) {
      // On error, allow the user to retry.
      stoppingRef.current.delete(timer.id)
      throw err
    }
  }

  async function switchBreastSide(timer: ActiveTimer) {
    const addl = (timer.additional_data ?? {}) as AdditionalData
    const currentSide = addl.breast_side ?? 'right'
    const newSide = currentSide === 'right' ? 'left' : 'right'
    await supabase
      .from('active_timers')
      .update({ additional_data: { ...addl, breast_side: newSide } })
      .eq('id', timer.id)
    await loadTimers()
  }

  const timerDefs: { type: TimerType; emoji: string; label: string; color: string }[] = [
    { type: 'feeding',    emoji: '🍼', label: 'האכלה',   color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { type: 'sleep',      emoji: '😴', label: 'שינה',    color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { type: 'tummy_time', emoji: '🐣', label: 'זמן בטן', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  ]

  const runningTypes = new Set(activeTimers.map(t => t.timer_type))

  return (
    <div className="space-y-3">
      {/* Start buttons */}
      <div className="flex gap-2">
        {timerDefs.map(def => {
          if (runningTypes.has(def.type)) return null
          return (
            <button
              key={def.type}
              onClick={() => startTimer(def.type)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white rounded-2xl shadow-sm hover:shadow-md border-2 border-transparent hover:border-mustard-200 transition-all"
            >
              <span className="text-xl">{def.emoji}</span>
              <div className="text-right">
                <div className="text-xs font-semibold text-sand-700">{def.label}</div>
                <div className="flex items-center gap-1 text-xs text-mustard-500">
                  <Play className="w-3 h-3" />
                  <span>התחלה</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Breast side selector for feeding */}
      {!runningTypes.has('feeding') && (
        <div className="px-1">
          <p className="text-xs text-sand-400 mb-1.5">צד האכלה</p>
          <BreastfeedingQuickSwitch side={breastSide} onChange={setBreastSide} />
        </div>
      )}

      {/* Active timers */}
      {activeTimers.map(timer => {
        const def = timerDefs.find(d => d.type === timer.timer_type)
        const addl = (timer.additional_data ?? {}) as AdditionalData
        return (
          <div
            key={timer.id}
            className="bg-white rounded-2xl p-4 shadow-md border-2 border-mustard-100"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{def?.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-sand-800">{def?.label} פעיל</p>
                  {timer.timer_type === 'feeding' && addl.breast_side && (
                    <p className="text-xs text-sand-400">
                      {addl.breast_side === 'right' ? 'ימין' : addl.breast_side === 'left' ? 'שמאל' : 'שניהם'}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-2xl font-mono font-bold text-mustard-600">
                {elapsed[timer.id] ?? '00:00'}
              </div>
            </div>

            <div className="flex gap-2">
              {timer.timer_type === 'feeding' && (
                <button
                  onClick={() => switchBreastSide(timer)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sand-100 rounded-xl text-sand-600 text-xs font-medium hover:bg-sand-200 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  החלפת צד
                </button>
              )}
              <button
                onClick={() => stopTimer(timer)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-mustard-500 to-mustard-600 text-white rounded-xl text-xs font-semibold hover:from-mustard-600 hover:to-mustard-700 transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                עצירה ושמירה
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
