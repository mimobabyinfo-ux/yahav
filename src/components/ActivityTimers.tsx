import { useState, useEffect, useCallback, useRef } from 'react'
import { Square, Plus } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatTime, formatElapsed } from '../utils/dateUtils'
import { formatTimeSince } from '../utils/timeSince'
import { useLastEntry } from '../hooks/useLastEntry'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'
import FeedingTypePicker, { FeedingChoice } from './FeedingTypePicker'

// Buttons that don't run a timer — they just open a modal (e.g. diaper).
// Used by Dashboard's grid-2 layout to combine timer buttons + modal actions
// in a single 2x2 grid. Caller computes sinceText (so it can use its own
// useLastEntry calls) and handles the click via onModalRequest.
export type ExtraAction = {
  type: string
  emoji: string
  label: string
  sinceText: string
}

export type ModalRequestPreset = { feedingType?: FeedingChoice }

type Props = {
  onEntrySaved: () => void
  refetchKey?: number
  // 'flex' (default) — 3 timer buttons in a row, big active-timer cards below.
  // 'grid-2' — 2x2 grid combining timer buttons + extraActions.
  layout?: 'flex' | 'grid-2'
  extraActions?: ExtraAction[]
  // Called when a tap should open a LogEntryModal instead of starting a timer:
  // - Always: extraActions click (e.g. diaper)
  // - feeding tap → opens picker → if 'bottle'/'solid', calls this with that preset.
  //                                  if 'breast' AND forceModal, also calls this.
  // - When forceModal=true: sleep / tummy_time taps also call this.
  onModalRequest?: (entryType: string, preset?: ModalRequestPreset) => void
  // When true, ALL action taps open modals via onModalRequest instead of
  // starting a timer. Used in past-date views where "now" timers don't apply.
  forceModal?: boolean
}

type TimerType = 'feeding' | 'sleep' | 'tummy_time'

type AdditionalData = {
  breast_side?: 'left' | 'right' | 'both'
  feeding_type?: string
}

export default function ActivityTimers({
  onEntrySaved,
  refetchKey = 0,
  layout = 'flex',
  extraActions = [],
  onModalRequest,
  forceModal = false,
}: Props) {
  const { user, selectedChild } = useAuth()
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [elapsed, setElapsed] = useState<Record<string, string>>({})
  const [feedingPickerOpen, setFeedingPickerOpen] = useState(false)
  // When true, the next picker pick — including breast — routes to a modal
  // (manual entry) instead of starting a live timer. Set by tapping the
  // "+" sub-button on the feeding cell, reset after the pick or close.
  const [manualFeedRequested, setManualFeedRequested] = useState(false)
  const stoppingRef = useRef<Set<string>>(new Set())
  const lastFeeding = useLastEntry('feeding', refetchKey)
  const lastSleep = useLastEntry('sleep', refetchKey)
  const lastTummy = useLastEntry('tummy_time', refetchKey)

  // Tap behavior dispatch — feeding always goes through the picker.
  // sleep / tummy_time start a timer (today) or open a modal (past-date).
  function handleTimerCellClick(type: TimerType) {
    if (type === 'feeding') {
      setFeedingPickerOpen(true)
      return
    }
    if (forceModal) {
      onModalRequest?.(type)
    } else {
      startTimer(type)
    }
  }

  function handleFeedingPick(choice: FeedingChoice) {
    const wantManual = forceModal || manualFeedRequested
    setFeedingPickerOpen(false)
    setManualFeedRequested(false)
    if (choice === 'breast' && !wantManual) {
      startTimer('feeding')
    } else {
      onModalRequest?.('feeding', { feedingType: choice })
    }
  }

  function closePicker() {
    setFeedingPickerOpen(false)
    setManualFeedRequested(false)
  }

  // "+" sub-button on a timer cell — opens manual entry for that type.
  // Feeding routes through the picker (so user still chooses breast/bottle/solid)
  // but every choice goes to a modal, not a live timer.
  function handleManualClick(type: TimerType) {
    if (type === 'feeding') {
      setManualFeedRequested(true)
      setFeedingPickerOpen(true)
    } else {
      onModalRequest?.(type)
    }
  }

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
      additionalData.breast_side = 'right'
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

  async function switchBreastSide(timer: ActiveTimer, newSide: 'left' | 'right' | 'both') {
    const addl = (timer.additional_data ?? {}) as AdditionalData
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

  const sinceTextFor = (type: TimerType): string => {
    if (type === 'feeding') return formatTimeSince(lastFeeding, 'טרם נרשמה האכלה')
    if (type === 'sleep') return formatTimeSince(lastSleep, 'טרם נרשמה שינה')
    return formatTimeSince(lastTummy, 'טרם נרשם זמן בטן')
  }

  const runningTypes = new Set(activeTimers.map(t => t.timer_type))

  function renderTimerStartButton(def: typeof timerDefs[number]) {
    // Show "+" only on Start state (idle) and only when timers are live.
    // On past-date (forceModal) the whole cell is already manual, so "+" would be redundant.
    const showManualPlus = !forceModal
    return (
      <div key={def.type} className="flex-1 relative">
        <button
          onClick={() => handleTimerCellClick(def.type)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#F5F1EB] rounded-2xl shadow-sm hover:shadow-md border-2 border-transparent hover:border-mustard-200 transition-all"
        >
          <span className="text-xl">{def.emoji}</span>
          <div className="text-right">
            <div className="text-xs font-semibold text-sand-700">{def.label}</div>
            <div className="text-[10px] text-sand-400 leading-tight">{sinceTextFor(def.type)}</div>
          </div>
        </button>
        {showManualPlus && (
          <button
            onClick={(e) => { e.stopPropagation(); handleManualClick(def.type) }}
            className="absolute top-1 left-1 w-7 h-7 rounded-full bg-mustard-100 hover:bg-mustard-200 text-mustard-700 flex items-center justify-center transition-colors"
            aria-label="הוספה ידנית"
            title="הוספה ידנית"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  function renderExtraActionButton(action: ExtraAction) {
    return (
      <button
        key={action.type}
        onClick={() => onModalRequest?.(action.type)}
        className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5F1EB] rounded-2xl shadow-sm hover:shadow-md border-2 border-transparent hover:border-mustard-200 transition-all"
      >
        <span className="text-xl">{action.emoji}</span>
        <div className="text-right">
          <div className="text-xs font-semibold text-sand-700">{action.label}</div>
          <div className="text-[10px] text-sand-400 leading-tight">{action.sinceText}</div>
        </div>
      </button>
    )
  }

  // Compact in-grid running cell — used in grid-2 layout so the cell stays
  // the same shape when a timer is running. The big card below still renders
  // for advanced controls (BreastfeedingQuickSwitch).
  function renderCompactRunningCell(timer: ActiveTimer) {
    const def = timerDefs.find(d => d.type === timer.timer_type)
    return (
      <button
        key={timer.id}
        onClick={() => stopTimer(timer)}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl shadow-sm border-2 border-mustard-200"
        style={{ background: '#FFF7E5' }}
      >
        <span className="text-xl">{def?.emoji}</span>
        <div className="text-right">
          <div className="text-xs font-semibold text-mustard-700">{def?.label} פעיל</div>
          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-mustard-600 leading-tight">
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>{elapsed[timer.id] ?? '00:00'}</span>
          </div>
        </div>
      </button>
    )
  }

  // ── Layout: grid-2 (Dashboard) ───────────────────────────────────────────
  if (layout === 'grid-2') {
    const cells = [
      ...timerDefs.map(def => {
        const runningTimer = activeTimers.find(t => t.timer_type === def.type)
        return runningTimer
          ? renderCompactRunningCell(runningTimer)
          : renderTimerStartButton(def)
      }),
      ...extraActions.map(renderExtraActionButton),
    ]

    return (
      <>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">{cells}</div>

          {/* Big active-timer cards (for BreastfeedingQuickSwitch etc.) */}
          {activeTimers.map(timer => {
            const def = timerDefs.find(d => d.type === timer.timer_type)
            const addl = (timer.additional_data ?? {}) as AdditionalData
            return (
              <div
                key={timer.id}
                className="bg-[#F5F1EB] rounded-2xl p-4 shadow-md border-2 border-mustard-100"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{def?.emoji}</span>
                    <p className="text-sm font-bold text-sand-800">{def?.label} פעיל</p>
                  </div>
                  <div className="text-2xl font-mono font-bold text-mustard-600">
                    {elapsed[timer.id] ?? '00:00'}
                  </div>
                </div>

                {timer.timer_type === 'feeding' && (
                  <div className="mb-3">
                    <p className="text-xs text-musgo-600 mb-1.5">צד האכלה</p>
                    <BreastfeedingQuickSwitch
                      side={addl.breast_side ?? 'right'}
                      onChange={side => switchBreastSide(timer, side)}
                    />
                  </div>
                )}

                <button
                  onClick={() => stopTimer(timer)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-mustard-500 to-mustard-600 text-white rounded-xl text-xs font-semibold hover:from-mustard-600 hover:to-mustard-700 transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  עצירה ושמירה
                </button>
              </div>
            )
          })}
        </div>
        <FeedingTypePicker
          open={feedingPickerOpen}
          onClose={closePicker}
          onPick={handleFeedingPick}
        />
      </>
    )
  }

  // ── Layout: flex (default) ───────────────────────────────────────────────
  return (
    <>
      <div className="space-y-3">
        {/* Start buttons */}
        <div className="flex gap-2">
          {timerDefs.map(def => runningTypes.has(def.type) ? null : renderTimerStartButton(def))}
        </div>

        {/* Active timers */}
        {activeTimers.map(timer => {
          const def = timerDefs.find(d => d.type === timer.timer_type)
          const addl = (timer.additional_data ?? {}) as AdditionalData
          return (
            <div
              key={timer.id}
              className="bg-[#F5F1EB] rounded-2xl p-4 shadow-md border-2 border-mustard-100"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{def?.emoji}</span>
                  <p className="text-sm font-bold text-sand-800">{def?.label} פעיל</p>
                </div>
                <div className="text-2xl font-mono font-bold text-mustard-600">
                  {elapsed[timer.id] ?? '00:00'}
                </div>
              </div>

              {timer.timer_type === 'feeding' && (
                <div className="mb-3">
                  <p className="text-xs text-musgo-600 mb-1.5">צד האכלה</p>
                  <BreastfeedingQuickSwitch
                    side={addl.breast_side ?? 'right'}
                    onChange={side => switchBreastSide(timer, side)}
                  />
                </div>
              )}

              <button
                onClick={() => stopTimer(timer)}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-mustard-500 to-mustard-600 text-white rounded-xl text-xs font-semibold hover:from-mustard-600 hover:to-mustard-700 transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                עצירה ושמירה
              </button>
            </div>
          )
        })}
      </div>
      <FeedingTypePicker
        open={feedingPickerOpen}
        onClose={() => setFeedingPickerOpen(false)}
        onPick={handleFeedingPick}
      />
    </>
  )
}
