import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Square } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatTime } from '../utils/dateUtils'
import { formatTimeSince } from '../utils/timeSince'
import { useLastEntry } from '../hooks/useLastEntry'
import { formatSeconds, timerElapsedSeconds } from '../hooks/useActiveTimer'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'

// ── Quick-add tile config ──────────────────────────────────────────────────
// 9 tiles total. Top six are always visible; the bottom three (medical /
// milestone / note) live under a "More…" toggle and only appear on demand.
// Per-tile routing decides between (a) navigating to the dedicated action
// page on today and (b) opening LogEntryModal as a fallback (always when
// the calling page is in past-date mode; also as a temporary route for tiles
// whose dedicated page hasn't shipped yet).

export type FeedingPreset = 'breast' | 'bottle' | 'solid'

export type ModalRequestPreset = { feedingType?: FeedingPreset }

export type LogPageRoute =
  | 'sleep'
  | 'tummy_time'
  | 'feeding-breast'
  | 'feeding-bottle'    // wired in C3
  | 'feeding-solid'     // wired in C3
  | 'diaper'            // wired in C3
  | 'doctor_visit'      // wired in C4
  | 'milestone'         // wired in C4
  | 'note'              // wired in C4

type SinceKey = 'feeding' | 'sleep' | 'tummy_time' | 'diaper'

type Tile = {
  key: LogPageRoute
  emoji: string
  label: string
  // What to send to LogEntryModal as a fallback / past-date route.
  modalEntry: 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'
  modalPreset?: FeedingPreset
  // useLastEntry key for the "since" footer. Undefined → tile shows no since text.
  sinceKey?: SinceKey
  sinceFallback?: string
  // Whether this tile lives under the "More…" expandable section.
  more?: boolean
}

const PRIMARY_TILES: Tile[] = [
  { key: 'feeding-breast', emoji: '🤱', label: 'הנקה',    modalEntry: 'feeding', modalPreset: 'breast', sinceKey: 'feeding',    sinceFallback: 'טרם נרשמה האכלה' },
  { key: 'feeding-bottle', emoji: '🍼', label: 'בקבוק',   modalEntry: 'feeding', modalPreset: 'bottle', sinceKey: 'feeding',    sinceFallback: 'טרם נרשמה האכלה' },
  { key: 'feeding-solid',  emoji: '🥄', label: 'אוכל',    modalEntry: 'feeding', modalPreset: 'solid',  sinceKey: 'feeding',    sinceFallback: 'טרם נרשמה האכלה' },
  { key: 'sleep',          emoji: '😴', label: 'שינה',     modalEntry: 'sleep',                          sinceKey: 'sleep',      sinceFallback: 'טרם נרשמה שינה' },
  { key: 'diaper',         emoji: '💩', label: 'חיתול',    modalEntry: 'diaper',                         sinceKey: 'diaper',     sinceFallback: 'טרם נרשם חיתול' },
  { key: 'tummy_time',     emoji: '🤸', label: 'זמן בטן',  modalEntry: 'tummy_time',                     sinceKey: 'tummy_time', sinceFallback: 'טרם נרשם זמן בטן' },
]

const MORE_TILES: Tile[] = [
  { key: 'doctor_visit', emoji: '👨‍⚕️', label: 'רופא',    modalEntry: 'doctor_visit', more: true },
  { key: 'milestone',    emoji: '🎯',         label: 'אבן דרך', modalEntry: 'milestone',    more: true },
  { key: 'note',         emoji: '📝',         label: 'הערה',    modalEntry: 'note',         more: true },
]

// Only these three keys currently route to dedicated action pages. Bottle /
// solid / diaper / doctor / milestone / note add themselves in C3 + C4.
const PAGE_BUILT: ReadonlySet<LogPageRoute> = new Set<LogPageRoute>(['sleep', 'tummy_time', 'feeding-breast'])

type Props = {
  onEntrySaved: () => void
  refetchKey?: number
  // Fallback path — opens LogEntryModal with the given entry type + optional
  // feedingType preset. Used for: every past-date tap, and as a temporary
  // route for any tile whose dedicated page hasn't been built yet.
  onModalRequest?: (entryType: string, preset?: ModalRequestPreset) => void
  // When true, ALL tile taps go through onModalRequest, regardless of which
  // page is built. Used in past-date journal views.
  forceModal?: boolean
  // Today-route for tiles whose page is built (see PAGE_BUILT above).
  onOpenLogPage?: (logType: LogPageRoute) => void
}

type AdditionalData = {
  breast_side?: 'left' | 'right' | 'both'
  feeding_type?: string
}

export default function ActivityTimers({
  onEntrySaved,
  refetchKey = 0,
  onModalRequest,
  forceModal = false,
  onOpenLogPage,
}: Props) {
  const { user, selectedChild } = useAuth()
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [elapsed, setElapsed] = useState<Record<string, string>>({})
  // "More…" expand state. Always starts collapsed on mount — per spec, we
  // do NOT persist this across navigations.
  const [moreOpen, setMoreOpen] = useState(false)
  const stoppingRef = useRef<Set<string>>(new Set())

  const lastFeeding = useLastEntry('feeding', refetchKey)
  const lastSleep = useLastEntry('sleep', refetchKey)
  const lastTummy = useLastEntry('tummy_time', refetchKey)
  const lastDiaper = useLastEntry('diaper', refetchKey)

  function sinceTextFor(tile: Tile): string {
    if (!tile.sinceKey) return ''
    const fallback = tile.sinceFallback ?? ''
    if (tile.sinceKey === 'feeding') return formatTimeSince(lastFeeding, fallback)
    if (tile.sinceKey === 'sleep') return formatTimeSince(lastSleep, fallback)
    if (tile.sinceKey === 'tummy_time') return formatTimeSince(lastTummy, fallback)
    return formatTimeSince(lastDiaper, fallback)
  }

  // ── Single dispatcher for every tile ──────────────────────────────────
  function handleTileTap(tile: Tile) {
    if (forceModal || !onOpenLogPage || !PAGE_BUILT.has(tile.key)) {
      // Either we're in past-date mode, the parent didn't wire navigation,
      // or this tile's dedicated page isn't built yet → fall back to modal.
      onModalRequest?.(tile.modalEntry, tile.modalPreset ? { feedingType: tile.modalPreset } : undefined)
      return
    }
    onOpenLogPage(tile.key)
  }

  // ── active_timers loading + 1Hz tick for the legacy big-card render ────
  const loadTimers = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('active_timers')
      .select('*')
      .eq('user_id', user.id)
    setActiveTimers(data ?? [])
  }, [user])

  useEffect(() => { loadTimers() }, [loadTimers])

  useEffect(() => {
    const interval = setInterval(() => {
      const updates: Record<string, string> = {}
      activeTimers.forEach(t => {
        updates[t.id] = formatSeconds(timerElapsedSeconds(t))
      })
      setElapsed(updates)
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTimers])

  // ── stopTimer / switchBreastSide — kept for the defensive big-card path
  //    that still renders any legacy non-hybrid timer (sleep/tummy/feeding
  //    rows from before this PR, or guest-mode where onOpenLogPage isn't
  //    wired). Identical to the previous behavior.
  async function stopTimer(timer: ActiveTimer) {
    if (!user) return
    if (stoppingRef.current.has(timer.id)) return
    stoppingRef.current.add(timer.id)
    try {
      const totalSecs = timerElapsedSeconds(timer)
      const durationForLog = totalSecs >= 1 ? parseFloat((totalSecs / 60).toFixed(2)) : null
      const durationLabel = totalSecs < 60
        ? `${totalSecs} שניות`
        : `${Math.round(totalSecs / 60)} דקות`
      const startedAt = new Date(timer.start_time)
      const now = new Date()

      const { data: entry } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: timer.timer_type,
          notes: timer.timer_type === 'tummy_time' && totalSecs
            ? `משך: ${durationLabel}`
            : null,
        })
        .select()
        .single()

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

      await supabase.from('active_timers').delete().eq('id', timer.id)
      await loadTimers()
      onEntrySaved()
    } catch (err) {
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

  // Hybrid mode (onOpenLogPage wired) suppresses big inline timer cards —
  // their dedicated action pages own stop/save. The global banner still
  // surfaces the running timer.
  const bigCardTimers = onOpenLogPage
    ? activeTimers.filter(t => t.timer_type !== 'sleep' && t.timer_type !== 'tummy_time' && t.timer_type !== 'feeding')
    : activeTimers

  // ── Render a single tile ──────────────────────────────────────────────
  function renderTile(tile: Tile) {
    const since = sinceTextFor(tile)
    return (
      <button
        key={tile.key}
        onClick={() => handleTileTap(tile)}
        className="flex flex-col items-center justify-center gap-1 py-3 px-1 bg-[#F5F1EB] rounded-2xl shadow-sm hover:shadow-md border-2 border-transparent hover:border-mustard-200 transition-all"
      >
        <span className="text-2xl leading-none">{tile.emoji}</span>
        <span className="text-xs font-semibold text-sand-700 whitespace-nowrap">{tile.label}</span>
        {since && (
          <span className="text-[10px] text-sand-400 leading-tight whitespace-nowrap">{since}</span>
        )}
      </button>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {/* Top 2 rows × 3 cols — always visible */}
        <div className="grid grid-cols-3 gap-2">
          {PRIMARY_TILES.map(renderTile)}
        </div>

        {/* Expandable "More…" row */}
        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: moreOpen ? 200 : 0 }}
        >
          <div className="grid grid-cols-3 gap-2 pt-2">
            {MORE_TILES.map(renderTile)}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-sand-500 hover:text-sand-700 transition-colors"
        >
          {moreOpen ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>פחות…</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>עוד…</span>
            </>
          )}
        </button>

        {/* Defensive big-card render — only fires for legacy timers in
            non-hybrid contexts (e.g. guest mode). The dedicated action
            pages own stop/save for hybrid timers; the banner surfaces them. */}
        {bigCardTimers.map(timer => {
          const addl = (timer.additional_data ?? {}) as AdditionalData
          const emojiByType: Record<string, string> = {
            feeding: '🤱',
            sleep: '😴',
            tummy_time: '🤸',
          }
          const labelByType: Record<string, string> = {
            feeding: 'הנקה',
            sleep: 'שינה',
            tummy_time: 'זמן בטן',
          }
          return (
            <div
              key={timer.id}
              className="bg-[#F5F1EB] rounded-2xl p-4 shadow-md border-2 border-mustard-100"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{emojiByType[timer.timer_type] ?? '⏱️'}</span>
                  <p className="text-sm font-bold text-sand-800">{labelByType[timer.timer_type] ?? timer.timer_type} פעיל</p>
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
    </>
  )
}
