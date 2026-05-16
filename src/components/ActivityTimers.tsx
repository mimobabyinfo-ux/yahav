import { useState, useEffect, useCallback, useRef } from 'react'
import { Square } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatTime, formatElapsed } from '../utils/dateUtils'
import { formatTimeSince } from '../utils/timeSince'
import { useLastEntry } from '../hooks/useLastEntry'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'
import FeedingTypePicker, { FeedingChoice } from './FeedingTypePicker'
import TimerOrManualPicker, { TimerOrManualChoice } from './TimerOrManualPicker'

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
  // Hybrid quick-add (Phase 2):
  //  - 'sleep' / 'tummy_time' taps on today bypass the TimerOrManualPicker:
  //    timer starts immediately + this callback navigates to the page.
  //  - 'feeding-breast' is fired after the feeding type picker resolves to
  //    breast: no timer pre-start (mom picks the side on the page itself).
  onOpenLogPage?: (logType: 'sleep' | 'tummy_time' | 'feeding-breast') => void
}

type TimerType = 'feeding' | 'sleep' | 'tummy_time'
// Value tracked while the 2-option (timer / manual) sheet is open. The
// 'feeding-breast' variant lets the sheet's pick handler know to route the
// 'manual' branch with feedingType='breast' preset.
type PendingTimerChoice = 'sleep' | 'tummy_time' | 'feeding-breast'

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
  onOpenLogPage,
}: Props) {
  const { user, selectedChild } = useAuth()
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [elapsed, setElapsed] = useState<Record<string, string>>({})
  const [feedingPickerOpen, setFeedingPickerOpen] = useState(false)
  // Non-null while the 2-option (timer / manual) sheet is shown. Set when
  // the user taps a timer cell on today (sleep/tummy_time) or picks 'breast'
  // from the feeding type sheet. Past-date taps skip this entirely.
  const [pendingTimerChoice, setPendingTimerChoice] = useState<PendingTimerChoice | null>(null)
  const stoppingRef = useRef<Set<string>>(new Set())
  const lastFeeding = useLastEntry('feeding', refetchKey)
  const lastSleep = useLastEntry('sleep', refetchKey)
  const lastTummy = useLastEntry('tummy_time', refetchKey)

  function timerOrManualTitle(choice: PendingTimerChoice): string {
    if (choice === 'sleep') return 'שינה'
    if (choice === 'tummy_time') return 'זמן בטן'
    return 'הנקה'
  }

  // Tap behavior dispatch:
  //  - feeding → always opens the 3-option type picker
  //  - sleep / tummy_time on today (hybrid quick-add) → start timer
  //    immediately + navigate to the dedicated action page. No picker.
  //  - sleep / tummy_time on past-date → opens modal directly (forceModal)
  function handleTimerCellClick(type: TimerType) {
    if (type === 'feeding') {
      setFeedingPickerOpen(true)
      return
    }
    if (forceModal) {
      onModalRequest?.(type)
      return
    }
    if ((type === 'sleep' || type === 'tummy_time') && onOpenLogPage) {
      // Hybrid: start the timer first, then navigate. The page reads the
      // running timer from active_timers on mount and shows the DURING
      // state immediately.
      void (async () => {
        await startTimer(type)
        onOpenLogPage(type)
      })()
      return
    }
    setPendingTimerChoice(type)
  }

  function handleFeedingPick(choice: FeedingChoice) {
    setFeedingPickerOpen(false)
    if (choice === 'breast') {
      if (forceModal) {
        // Past-date: no live-timer option — straight to the modal.
        onModalRequest?.('feeding', { feedingType: 'breast' })
      } else if (onOpenLogPage) {
        // Today + hybrid quick-add: navigate to BreastfeedingPage. Per Q1(a)
        // no pre-start — mom picks the starting side on the page itself.
        onOpenLogPage('feeding-breast')
      } else {
        // Legacy fallback (no onOpenLogPage wired) — old 2-option picker.
        setPendingTimerChoice('feeding-breast')
      }
    } else {
      onModalRequest?.('feeding', { feedingType: choice })
    }
  }

  function handleTimerOrManualPick(choice: TimerOrManualChoice) {
    const pending = pendingTimerChoice
    setPendingTimerChoice(null)
    if (!pending) return
    if (choice === 'timer') {
      startTimer(pending === 'feeding-breast' ? 'feeding' : pending)
    } else {
      // manual
      if (pending === 'feeding-breast') {
        onModalRequest?.('feeding', { feedingType: 'breast' })
      } else {
        onModalRequest?.(pending)
      }
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
    // Seed the Phase-2 segmented-timer schema (accumulated_seconds +
    // segment_started_at) so pause/resume on the dedicated action pages
    // work on timers started from the quick-add bar. Legacy consumers
    // (this file's own stopTimer below, plus useActiveTimer helpers)
    // already tolerate missing keys; this seeds them positively.
    const additionalData: Record<string, unknown> = {
      accumulated_seconds: 0,
      segment_started_at: new Date().toISOString(),
    }
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
    return (
      <button
        key={def.type}
        onClick={() => handleTimerCellClick(def.type)}
        className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F5F1EB] rounded-2xl shadow-sm hover:shadow-md border-2 border-transparent hover:border-mustard-200 transition-all"
      >
        <span className="text-xl">{def.emoji}</span>
        <div className="text-right">
          <div className="text-xs font-semibold text-sand-700">{def.label}</div>
          <div className="text-[10px] text-sand-400 leading-tight">{sinceTextFor(def.type)}</div>
        </div>
      </button>
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
  // the same shape when a timer is running. Sleep, tummy_time, and feeding
  // (breast) timers route the tap to their dedicated action page in Phase 2.
  function renderCompactRunningCell(timer: ActiveTimer) {
    const def = timerDefs.find(d => d.type === timer.timer_type)
    const t = timer.timer_type
    const hybridType: 'sleep' | 'tummy_time' | 'feeding-breast' | null = onOpenLogPage
      ? (t === 'sleep' ? 'sleep'
        : t === 'tummy_time' ? 'tummy_time'
        : t === 'feeding' ? 'feeding-breast'
        : null)
      : null
    return (
      <button
        key={timer.id}
        onClick={() => {
          if (hybridType) onOpenLogPage?.(hybridType)
          else stopTimer(timer)
        }}
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

    // In hybrid mode the dedicated action pages own the stop/save UI, so
    // we suppress the big inline card for every hybrid timer type (sleep /
    // tummy_time / feeding). The compact running cell still navigates there.
    const bigCardTimers = activeTimers.filter(t =>
      !(onOpenLogPage && (t.timer_type === 'sleep' || t.timer_type === 'tummy_time' || t.timer_type === 'feeding')),
    )

    return (
      <>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">{cells}</div>

          {/* Big active-timer cards (for BreastfeedingQuickSwitch etc.) */}
          {bigCardTimers.map(timer => {
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
        <TimerOrManualPicker
          open={pendingTimerChoice !== null}
          title={pendingTimerChoice ? timerOrManualTitle(pendingTimerChoice) : ''}
          onClose={() => setPendingTimerChoice(null)}
          onPick={handleTimerOrManualPick}
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

        {/* Active timers — same hybrid suppression as grid-2: hide the
            big inline card for any timer whose dedicated action page owns
            the stop/save UI. */}
        {activeTimers
          .filter(t => !(onOpenLogPage && (t.timer_type === 'sleep' || t.timer_type === 'tummy_time' || t.timer_type === 'feeding')))
          .map(timer => {
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
      <TimerOrManualPicker
        open={pendingTimerChoice !== null}
        title={pendingTimerChoice ? timerOrManualTitle(pendingTimerChoice) : ''}
        onClose={() => setPendingTimerChoice(null)}
        onPick={handleTimerOrManualPick}
      />
    </>
  )
}
