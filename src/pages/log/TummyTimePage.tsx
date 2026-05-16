import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { useActiveTimer } from '../../hooks/useActiveTimer'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import ActionPageLayout from './ActionPageLayout'
import TimerControls from './TimerControls'

type Props = {
  onBack: () => void
  /** Bumps when an entry is saved so dashboards/journal refresh. */
  onSaved?: () => void
}

// Tummy-time accent — matches the warm orange used on the dashboard tile
// (tailwind orange-50/600).
const ACCENT = '#E89651'
const DELETE_CONFIRM = 'ביטול זמן הבטן? הטיימר יימחק ולא תישמר רשומה.'

// Mirrors the duration label used by ActivityTimers.stopTimer so timeline
// and journal rendering stay consistent: short sessions show seconds,
// longer ones show minutes.
function buildDurationLabel(durationSecs: number): string {
  return durationSecs < 60
    ? `${durationSecs} שניות`
    : `${Math.round(durationSecs / 60)} דקות`
}

export default function TummyTimePage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const { timer, loading, paused, start, pause, resume, remove, elapsedSeconds } = useActiveTimer('tummy_time')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastTummy = useLastEntry('tummy_time', refetchTick)

  // Safety-net ticker for the elapsed display (useActiveTimer ticks too).
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => setNow(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  async function handleStart() {
    setSaveError(null)
    await start('tummy_time')
  }

  async function handleStop() {
    if (!user || !timer || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Pull elapsed BEFORE any state mutation so the saved value reflects
      // exactly what's on screen (paused gaps excluded).
      const totalSecs = elapsedSeconds()
      const startedAt = new Date(timer.start_time)
      const now = new Date()
      const notes = totalSecs > 0 ? `משך: ${buildDurationLabel(totalSecs)}` : null

      const { error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: 'tummy_time',
          notes,
        })
      if (error) throw error

      await remove(timer.id)
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
    await remove(timer.id)
    onSaved?.()
    onBack()
  }

  if (loading) {
    return (
      <ActionPageLayout title="זמן בטן" emoji="🐣" accent={ACCENT} onBack={onBack}>
        <div className="text-center text-sand-400 text-sm py-8">טוענת…</div>
      </ActionPageLayout>
    )
  }

  // ── DURING state (running or paused) ──────────────────────────────────
  if (timer) {
    const startedAt = new Date(timer.start_time)
    return (
      <ActionPageLayout
        title="זמן בטן"
        emoji="🐣"
        accent={ACCENT}
        onBack={onBack}
        status={<span>התחלה: {formatTime(startedAt)}</span>}
        bottom={
          saveError ? (
            <p className="text-xs text-red-500 text-center">{saveError}</p>
          ) : null
        }
      >
        <TimerControls
          running={true}
          paused={paused}
          elapsedSeconds={elapsedSeconds()}
          onStart={() => {}}
          onPause={pause}
          onResume={resume}
          onStop={handleStop}
          onDelete={handleDelete}
          accent={ACCENT}
          stopLabel={saving ? 'שומרת…' : 'עצור ושמור'}
        />
      </ActionPageLayout>
    )
  }

  // ── BEFORE state ───────────────────────────────────────────────────────
  return (
    <ActionPageLayout
      title="זמן בטן"
      emoji="🐣"
      accent={ACCENT}
      onBack={onBack}
      status={<span>{formatTimeSince(lastTummy, 'טרם נרשם זמן בטן')}</span>}
      bottom={
        <p className="text-[11px] text-sand-400 text-center">
          אפשר להשהות ולהמשיך כשהתינוק מתעייף
        </p>
      }
    >
      <TimerControls
        running={false}
        elapsedSeconds={0}
        onStart={handleStart}
        onPause={() => {}}
        onResume={() => {}}
        onStop={() => {}}
        onDelete={() => {}}
        accent={ACCENT}
        startLabel="התחל זמן בטן"
      />

      {lastTummy && (
        <div className="mt-8 mx-auto max-w-xs text-center bg-[#F5F1EB] rounded-2xl p-4">
          <p className="text-xs text-sand-500 mb-1">זמן הבטן האחרון</p>
          <p className="text-sm font-semibold text-sand-700">
            {formatTime(lastTummy)} · לפני {formatTimeSince(lastTummy, '').replace('לפני ', '')}
          </p>
        </div>
      )}
    </ActionPageLayout>
  )
}
