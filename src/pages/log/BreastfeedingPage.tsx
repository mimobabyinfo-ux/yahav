import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, Plus, Square } from 'lucide-react'
import { supabase, ActiveTimer } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { formatSeconds } from '../../hooks/useActiveTimer'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import ActionPageLayout from './ActionPageLayout'
import ManualEntrySheet from './ManualEntrySheet'

function defaultManualStart(): string {
  // Breast default: 30 minutes ago per spec.
  return toLocalDatetimeInput(new Date(Date.now() - 30 * 60 * 1000))
}
function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Props = {
  onBack: () => void
  /** Bumps after save so dashboards/journal refresh. */
  onSaved?: () => void
}

type Side = 'left' | 'right'

// active_timers.additional_data shape used by this page. One row per session;
// state for both sides lives in one row.
type FeedingState = {
  feeding_type: 'breast'
  active_side: Side | null
  left_accumulated_seconds: number
  right_accumulated_seconds: number
  side_started_at: string | null // ISO; null when both paused
}

const ACCENT = '#A35C3D' // brand brown — feeding theme
const DELETE_CONFIRM = 'לבטל את הסשן? לא תישמר רשומה.'

// ── Pure helpers ────────────────────────────────────────────────────────────

function readState(timer: ActiveTimer): FeedingState {
  const d = (timer.additional_data ?? {}) as Record<string, unknown>
  const left = typeof d.left_accumulated_seconds === 'number' ? d.left_accumulated_seconds : 0
  const right = typeof d.right_accumulated_seconds === 'number' ? d.right_accumulated_seconds : 0
  const seg = typeof d.side_started_at === 'string' ? d.side_started_at : null
  const active =
    d.active_side === 'left' || d.active_side === 'right' ? d.active_side : null
  return {
    feeding_type: 'breast',
    active_side: active,
    left_accumulated_seconds: left,
    right_accumulated_seconds: right,
    side_started_at: seg,
  }
}

function liveTotalsFor(state: FeedingState): { left: number; right: number; combined: number } {
  let left = state.left_accumulated_seconds
  let right = state.right_accumulated_seconds
  if (state.active_side && state.side_started_at) {
    const delta = Math.max(0, (Date.now() - new Date(state.side_started_at).getTime()) / 1000)
    if (state.active_side === 'left') left += delta
    else right += delta
  }
  return { left, right, combined: left + right }
}

// Detect a legacy feeding timer (created by ActivityTimers before this PR,
// or with the single-segment schema only). Migrated on mount to per-side
// schema — see migrateToPerSideSchema below.
function isLegacyFeedingTimer(timer: ActiveTimer): boolean {
  const d = (timer.additional_data ?? {}) as Record<string, unknown>
  return !(
    'active_side' in d ||
    'left_accumulated_seconds' in d ||
    'right_accumulated_seconds' in d ||
    'side_started_at' in d
  )
}

export default function BreastfeedingPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastFeeding = useLastEntry('feeding', refetchTick)

  // Notes — local state only, sent on save.
  const [notes, setNotes] = useState('')

  // Manual entry sheet
  const [manualOpen, setManualOpen] = useState(false)
  const [mSide, setMSide] = useState<'left' | 'right' | 'both'>('right')
  const [mLeftMins, setMLeftMins] = useState('')
  const [mRightMins, setMRightMins] = useState('')
  const [mTotalMins, setMTotalMins] = useState('')
  const [mStart, setMStart] = useState(defaultManualStart())
  const [mNotes, setMNotes] = useState('')
  const [mSaving, setMSaving] = useState(false)
  const [mError, setMError] = useState<string | null>(null)

  // Re-render once a second so the ticking side updates.
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => setNow(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  // ── Load + migrate any in-flight legacy feeding row on mount ──────────
  const loadTimer = useCallback(async () => {
    if (!user) {
      setTimer(null)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('active_timers')
      .select('*')
      .eq('user_id', user.id)
      .eq('timer_type', 'feeding')
      .order('start_time', { ascending: false })
      .limit(1)
    const row = data?.[0] ?? null
    if (row && isLegacyFeedingTimer(row)) {
      // Q2(a): treat as fresh session — active_side = breast_side from the old
      // row (defaulting to right per ActivityTimers' historical default),
      // accumulated = 0, side_started_at = row.start_time so existing elapsed
      // doesn't reset to zero.
      const oldData = (row.additional_data ?? {}) as Record<string, unknown>
      const initialSide: Side =
        oldData.breast_side === 'left' ? 'left' : 'right'
      const migrated: FeedingState = {
        feeding_type: 'breast',
        active_side: initialSide,
        left_accumulated_seconds: 0,
        right_accumulated_seconds: 0,
        side_started_at: row.start_time, // keep prior elapsed
      }
      await supabase
        .from('active_timers')
        .update({ additional_data: { ...oldData, ...migrated } })
        .eq('id', row.id)
      setTimer({ ...row, additional_data: { ...oldData, ...migrated } })
    } else {
      setTimer(row)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { loadTimer() }, [loadTimer])

  // ── State transitions (all atomic against active_timers) ──────────────

  // Activate `side`. If another side was running, commit its current segment
  // to its accumulated total first. If `side` was already active, no-op.
  // Pass `side=null` to pause everything.
  async function setActive(side: Side | null) {
    if (!user) return
    const now = new Date()
    const nowIso = now.toISOString()
    if (!timer) {
      // Fresh session — only allowed when side !== null.
      if (side === null) return
      const seed: FeedingState = {
        feeding_type: 'breast',
        active_side: side,
        left_accumulated_seconds: 0,
        right_accumulated_seconds: 0,
        side_started_at: nowIso,
      }
      const { data } = await supabase
        .from('active_timers')
        .insert({
          user_id: user.id,
          timer_type: 'feeding',
          start_time: nowIso,
          additional_data: seed,
        })
        .select()
        .single()
      if (data) setTimer(data)
      return
    }

    const state = readState(timer)
    if (state.active_side === side) return // already in the requested state

    // Commit current active side's segment, if any.
    let leftAcc = state.left_accumulated_seconds
    let rightAcc = state.right_accumulated_seconds
    if (state.active_side && state.side_started_at) {
      const delta = Math.max(0, (now.getTime() - new Date(state.side_started_at).getTime()) / 1000)
      if (state.active_side === 'left') leftAcc += delta
      else rightAcc += delta
    }

    const next: FeedingState = {
      feeding_type: 'breast',
      active_side: side,
      left_accumulated_seconds: leftAcc,
      right_accumulated_seconds: rightAcc,
      side_started_at: side ? nowIso : null,
    }
    const merged = { ...(timer.additional_data ?? {}), ...next }
    await supabase.from('active_timers').update({ additional_data: merged }).eq('id', timer.id)
    setTimer({ ...timer, additional_data: merged })
  }

  async function handleSave() {
    if (!user || !timer || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Snapshot final totals BEFORE any state change so saved values match
      // what's on screen at tap time.
      const { left: leftSecs, right: rightSecs } = liveTotalsFor(readState(timer))
      const leftInt = Math.round(leftSecs)
      const rightInt = Math.round(rightSecs)
      const totalSecs = leftInt + rightInt
      const durationMins = totalSecs >= 1 ? parseFloat((totalSecs / 60).toFixed(2)) : null

      // Derived breast_side for legacy timeline rendering.
      const breastSide =
        leftInt > 0 && rightInt > 0 ? 'both' :
        leftInt > 0 ? 'left' :
        rightInt > 0 ? 'right' :
        null

      const startedAt = new Date(timer.start_time)
      const now = new Date()

      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: 'feeding',
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      const { error: detErr } = await supabase.from('feeding_details').insert({
        log_entry_id: entry.id,
        feeding_type: 'breast',
        breast_side: breastSide,
        duration_minutes: durationMins,
        left_duration_seconds: leftInt,
        right_duration_seconds: rightInt,
      })
      if (detErr) throw detErr

      await supabase.from('active_timers').delete().eq('id', timer.id)
      setTimer(null)
      setNotes('')
      setRefetchTick(t => t + 1)
      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!timer) return
    if (!window.confirm(DELETE_CONFIRM)) return
    await supabase.from('active_timers').delete().eq('id', timer.id)
    setTimer(null)
    onSaved?.()
    onBack()
  }

  // ── Manual entry ──────────────────────────────────────────────────────
  function manualDurations(): { left: number; right: number } | null {
    // Returns SECONDS per side. Returns null if input invalid / zero.
    if (mSide === 'left') {
      const m = parseFloat(mTotalMins)
      if (!Number.isFinite(m) || m <= 0) return null
      return { left: Math.round(m * 60), right: 0 }
    }
    if (mSide === 'right') {
      const m = parseFloat(mTotalMins)
      if (!Number.isFinite(m) || m <= 0) return null
      return { left: 0, right: Math.round(m * 60) }
    }
    // both
    const l = parseFloat(mLeftMins)
    const r = parseFloat(mRightMins)
    if (!Number.isFinite(l) || !Number.isFinite(r) || (l <= 0 && r <= 0)) return null
    return { left: Math.round(l * 60), right: Math.round(r * 60) }
  }

  async function handleManualSave() {
    if (!user || mSaving) return
    const dur = manualDurations()
    if (!dur) {
      setMError('יש להזין משך תקין (בדקות, גדול מ-0)')
      return
    }
    setMSaving(true)
    setMError(null)
    try {
      const startDate = new Date(mStart)
      if (Number.isNaN(startDate.getTime())) throw new Error('שעת התחלה לא תקינה')
      const totalSecs = dur.left + dur.right
      const durationMins = totalSecs >= 1 ? parseFloat((totalSecs / 60).toFixed(2)) : null
      const breastSide: 'left' | 'right' | 'both' | null =
        dur.left > 0 && dur.right > 0 ? 'both' :
        dur.left > 0 ? 'left' :
        dur.right > 0 ? 'right' : null

      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(startDate),
          entry_time: formatTime(startDate),
          entry_type: 'feeding',
          notes: mNotes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      const { error: detErr } = await supabase.from('feeding_details').insert({
        log_entry_id: entry.id,
        feeding_type: 'breast',
        breast_side: breastSide,
        duration_minutes: durationMins,
        left_duration_seconds: dur.left,
        right_duration_seconds: dur.right,
      })
      if (detErr) throw detErr

      setManualOpen(false)
      setMSide('right')
      setMLeftMins('')
      setMRightMins('')
      setMTotalMins('')
      setMStart(defaultManualStart())
      setMNotes('')
      setRefetchTick(t => t + 1)
      onSaved?.()
    } catch (err) {
      setMError(err instanceof Error ? err.message : 'שגיאה בשמירה')
    } finally {
      setMSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const headerAction = (
    <button
      onClick={() => setManualOpen(true)}
      className="p-2 rounded-xl hover:bg-sand-100 text-sand-600 transition-colors"
      aria-label="הוספת רשומה ידנית"
      title="הוספת רשומה ידנית"
    >
      <Plus className="w-5 h-5" />
    </button>
  )

  if (loading) {
    return (
      <ActionPageLayout title="הנקה" emoji="🤱" accent={ACCENT} onBack={onBack} headerAction={headerAction}>
        <div className="text-center text-sand-400 text-sm py-8">טוענת…</div>
      </ActionPageLayout>
    )
  }

  const state = timer ? readState(timer) : null
  const totals = state ? liveTotalsFor(state) : { left: 0, right: 0, combined: 0 }
  const hasAccumulated = totals.combined > 0
  const isActiveSession = !!timer

  // Status label below the title
  const statusLine = (() => {
    if (!state) return formatTimeSince(lastFeeding, 'טרם נרשמה האכלה')
    if (state.active_side === 'left') return 'שמאל פעיל'
    if (state.active_side === 'right') return 'ימין פעיל'
    return hasAccumulated ? 'בהפסקה' : 'מוכן להתחלה'
  })()

  const notesField = (
    <div className="mt-6 max-w-xs mx-auto">
      <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">הערות</label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="כל מה שתרצי לזכור על ההאכלה הזו…"
        rows={2}
        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
      />
    </div>
  )

  return (
    <>
    <ActionPageLayout
      title="הנקה"
      emoji="🤱"
      accent={ACCENT}
      onBack={onBack}
      headerAction={headerAction}
      status={
        <span>
          {statusLine}
          {state && (
            <>
              {' · '}
              סה"כ {formatSeconds(totals.combined)}
            </>
          )}
        </span>
      }
      bottom={
        saveError ? (
          <p className="text-xs text-red-500 text-center">{saveError}</p>
        ) : null
      }
    >
      {/* Per-side cards */}
      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        <SideCard
          side="right"
          state={state}
          totalSeconds={totals.right}
          onActivate={() => setActive('right')}
          onPause={() => setActive(null)}
          accent={ACCENT}
        />
        <SideCard
          side="left"
          state={state}
          totalSeconds={totals.left}
          onActivate={() => setActive('left')}
          onPause={() => setActive(null)}
          accent={ACCENT}
        />
      </div>

      {/* Bottom controls — show only when a session exists */}
      {isActiveSession && (
        <div className="mt-8 flex flex-col items-center gap-3 max-w-xs mx-auto">
          <button
            onClick={handleSave}
            disabled={saving || !hasAccumulated}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold shadow-md transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}dd)` }}
          >
            <Square className="w-5 h-5 fill-current" />
            {saving ? 'שומרת…' : 'סיים ושמור'}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-sand-400 hover:text-red-500 underline underline-offset-2 transition-colors"
          >
            ביטול וסשן
          </button>
        </div>
      )}

      {/* Empty-state hint when no session yet */}
      {!isActiveSession && (
        <p className="text-center text-xs text-sand-400 mt-6 max-w-xs mx-auto">
          לחצי על הצד שמתחילה ממנו. ניתן לעבור בין הצדדים בכל רגע — המעבר מפסיק
          את הצד הפעיל ומפעיל את השני.
        </p>
      )}

      {/* Notes — visible in all states (before/during/paused). */}
      {notesField}
    </ActionPageLayout>

    {/* Manual entry sheet */}
    <ManualEntrySheet
      open={manualOpen}
      title="הוספת הנקה ידנית"
      onClose={() => setManualOpen(false)}
      bottom={
        <>
          {mError && <p className="text-xs text-red-500 text-center">{mError}</p>}
          <button
            onClick={handleManualSave}
            disabled={mSaving}
            className="w-full font-semibold py-4 rounded-2xl text-white shadow-md transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}dd)` }}
          >
            {mSaving ? 'שומרת…' : 'שמירה ✓'}
          </button>
        </>
      }
    >
      <div>
        <label className="block text-xs font-semibold text-sand-600 mb-2">צד</label>
        <div className="flex gap-2">
          {(['right', 'left', 'both'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setMSide(s)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                mSide === s
                  ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                  : 'border-sand-200 text-sand-600'
              }`}
            >
              {s === 'left' ? 'שמאל' : s === 'right' ? 'ימין' : 'שניהם'}
            </button>
          ))}
        </div>
      </div>

      {mSide !== 'both' ? (
        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5">משך (דקות)</label>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            value={mTotalMins}
            onChange={e => setMTotalMins(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
          />
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">שמאל (דקות)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              value={mLeftMins}
              onChange={e => setMLeftMins(e.target.value)}
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">ימין (דקות)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              value={mRightMins}
              onChange={e => setMRightMins(e.target.value)}
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-sand-600 mb-1.5">התחלה</label>
        <input
          type="datetime-local"
          value={mStart}
          onChange={e => setMStart(e.target.value)}
          className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-sand-600 mb-1.5">הערות</label>
        <textarea
          value={mNotes}
          onChange={e => setMNotes(e.target.value)}
          placeholder="הערות (אופציונלי)"
          rows={3}
          className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none"
        />
      </div>
    </ManualEntrySheet>
    </>
  )
}

// ── Per-side card ───────────────────────────────────────────────────────────

function SideCard({
  side,
  state,
  totalSeconds,
  onActivate,
  onPause,
  accent,
}: {
  side: Side
  state: FeedingState | null
  totalSeconds: number
  onActivate: () => void
  onPause: () => void
  accent: string
}) {
  const isActive = state?.active_side === side
  const hasTime = totalSeconds > 0
  const label = side === 'left' ? 'שמאל' : 'ימין'

  // Button label depends on side state
  let buttonLabel: string
  let ButtonIcon: typeof Play | typeof Pause = Play
  let onClick = onActivate
  if (isActive) {
    buttonLabel = 'הפסקה'
    ButtonIcon = Pause
    onClick = onPause
  } else if (state && state.active_side && state.active_side !== side) {
    // Other side is running — this is a "switch" button
    buttonLabel = 'עברי לכאן'
    ButtonIcon = Play
  } else if (hasTime) {
    buttonLabel = 'המשיכי'
    ButtonIcon = Play
  } else {
    buttonLabel = 'התחילי'
    ButtonIcon = Play
  }

  return (
    <div
      className="rounded-3xl p-4 border-2 flex flex-col items-center gap-2 transition-all"
      style={{
        borderColor: isActive ? accent : '#E7E0CC',
        background: isActive ? `${accent}10` : '#F5F1EB',
        boxShadow: isActive ? `0 4px 12px ${accent}33` : 'none',
      }}
    >
      <div className="text-sm font-bold" style={{ color: isActive ? accent : '#7a6f56' }}>
        {label}
      </div>
      <div
        className="text-3xl font-mono font-bold tabular-nums"
        style={{ color: isActive ? accent : '#7a6f56', opacity: isActive ? 1 : hasTime ? 0.7 : 0.4 }}
      >
        {formatSeconds(totalSeconds)}
      </div>
      <button
        onClick={onClick}
        className="w-full mt-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl font-semibold text-sm transition-all"
        style={{
          background: isActive ? accent : 'white',
          color: isActive ? 'white' : accent,
          border: `1.5px solid ${accent}`,
        }}
      >
        <ButtonIcon className="w-4 h-4 fill-current" />
        {buttonLabel}
      </button>
    </div>
  )
}
