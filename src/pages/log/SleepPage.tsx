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

const ACCENT = '#5C7CB8' // calm blue, matching the sleep theme

export default function SleepPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const { timer, loading, start, remove, elapsedSeconds } = useActiveTimer('sleep')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastSleep = useLastEntry('sleep', refetchTick)

  // Re-render once a second when running so the elapsed display ticks.
  // useActiveTimer already triggers its own internal tick; this is a
  // safety net for the manual-entry math (it doesn't depend on time).
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => setNow(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  async function handleStart() {
    setSaveError(null)
    await start('sleep', { sleep_type: 'nap' })
  }

  async function handleStop() {
    if (!user || !timer || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const startedAt = new Date(timer.start_time)
      const now = new Date()
      const durationSecs = Math.round((now.getTime() - startedAt.getTime()) / 1000)
      const durationForLog = durationSecs >= 1 ? parseFloat((durationSecs / 60).toFixed(2)) : null

      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: 'sleep',
          notes: null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      await supabase.from('sleep_details').insert({
        log_entry_id: entry.id,
        sleep_type: 'nap',
        duration_minutes: durationForLog,
      })

      await remove(timer.id)
      setRefetchTick(t => t + 1)
      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ActionPageLayout title="שינה" emoji="😴" accent={ACCENT} onBack={onBack}>
        <div className="text-center text-sand-400 text-sm py-8">טוענת…</div>
      </ActionPageLayout>
    )
  }

  // ── DURING state ───────────────────────────────────────────────────────
  if (timer) {
    const startedAt = new Date(timer.start_time)
    return (
      <ActionPageLayout
        title="שינה"
        emoji="😴"
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
          elapsedSeconds={elapsedSeconds()}
          onStart={() => {}}
          onStop={handleStop}
          accent={ACCENT}
          stopLabel={saving ? 'שומרת…' : 'עצור ושמור'}
        />
      </ActionPageLayout>
    )
  }

  // ── BEFORE state ───────────────────────────────────────────────────────
  return (
    <ActionPageLayout
      title="שינה"
      emoji="😴"
      accent={ACCENT}
      onBack={onBack}
      status={<span>{formatTimeSince(lastSleep, 'טרם נרשמה שינה')}</span>}
      bottom={
        <p className="text-[11px] text-sand-400 text-center">
          ניתן לעצור את הטיימר ולשמור בכל רגע
        </p>
      }
    >
      <TimerControls
        running={false}
        elapsedSeconds={0}
        onStart={handleStart}
        onStop={() => {}}
        accent={ACCENT}
        startLabel="התחל שינה"
      />

      {lastSleep && (
        <div className="mt-8 mx-auto max-w-xs text-center bg-[#F5F1EB] rounded-2xl p-4">
          <p className="text-xs text-sand-500 mb-1">השינה האחרונה</p>
          <p className="text-sm font-semibold text-sand-700">
            {formatTime(lastSleep)} · לפני {formatTimeSince(lastSleep, '').replace('לפני ', '')}
          </p>
        </div>
      )}
    </ActionPageLayout>
  )
}
