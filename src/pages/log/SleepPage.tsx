import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { useActiveTimer } from '../../hooks/useActiveTimer'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import { sleepTypeFromStartTime } from '../../utils/sleepTypeFromTime'
import ActionPageLayout from './ActionPageLayout'
import TimerControls from './TimerControls'
import ManualEntrySheet from './ManualEntrySheet'

type Props = {
  onBack: () => void
  /** Bumps when an entry is saved so dashboards/journal refresh. */
  onSaved?: () => void
}

const ACCENT = '#5C7CB8' // calm blue, matching the sleep theme
const DELETE_CONFIRM = 'התינוק לא באמת נרדם? הטיימר יימחק ולא תישמר רשומה.'

// Default the manual modal's start to 1h ago (per spec).
function defaultManualStart(): string {
  const d = new Date(Date.now() - 60 * 60 * 1000)
  return toLocalDatetimeInput(d)
}
function defaultManualEnd(): string {
  return toLocalDatetimeInput(new Date())
}
function toLocalDatetimeInput(d: Date): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time.
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SleepPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const { timer, loading, paused, start, pause, resume, remove, elapsedSeconds } = useActiveTimer('sleep')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastSleep = useLastEntry('sleep', refetchTick)

  // Notes — local state only (resets on navigation), saved on Stop.
  const [notes, setNotes] = useState('')

  // Manual entry modal state
  const [manualOpen, setManualOpen] = useState(false)
  const [mStart, setMStart] = useState(defaultManualStart())
  const [mEnd, setMEnd] = useState(defaultManualEnd())
  const [mNotes, setMNotes] = useState('')
  const [mSaving, setMSaving] = useState(false)
  const [mError, setMError] = useState<string | null>(null)

  // Safety-net ticker for the elapsed display.
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => setNow(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  async function handleStart() {
    setSaveError(null)
    // sleep_type is derived from start time at save time (handleStop), so
    // we don't seed it in additional_data — keeping a stale guess here
    // would just be misleading.
    await start('sleep')
  }

  async function handleStop() {
    if (!user || !timer || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const totalSecs = elapsedSeconds()
      const startedAt = new Date(timer.start_time)
      const now = new Date()
      const durationForLog = totalSecs >= 1 ? parseFloat((totalSecs / 60).toFixed(2)) : null

      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: 'sleep',
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      await supabase.from('sleep_details').insert({
        log_entry_id: entry.id,
        sleep_type: sleepTypeFromStartTime(startedAt),
        duration_minutes: durationForLog,
      })

      await remove(timer.id)
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
    await remove(timer.id)
    onSaved?.()
    onBack()
  }

  // ── Manual entry save ─────────────────────────────────────────────────
  function manualDurationMinutes(): number | null {
    if (!mStart || !mEnd) return null
    const s = new Date(mStart).getTime()
    const e = new Date(mEnd).getTime()
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
    return parseFloat(((e - s) / 60000).toFixed(2))
  }

  async function handleManualSave() {
    if (!user || mSaving) return
    const dur = manualDurationMinutes()
    if (dur == null || dur <= 0) {
      setMError('יש להזין שעת התחלה ושעת סיום (סיום אחרי התחלה)')
      return
    }
    setMSaving(true)
    setMError(null)
    try {
      const startDate = new Date(mStart)
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(startDate),
          entry_time: formatTime(startDate),
          entry_type: 'sleep',
          notes: mNotes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')
      await supabase.from('sleep_details').insert({
        log_entry_id: entry.id,
        sleep_type: sleepTypeFromStartTime(startDate),
        duration_minutes: dur,
      })
      setManualOpen(false)
      setMStart(defaultManualStart())
      setMEnd(defaultManualEnd())
      setMNotes('')
      setRefetchTick(t => t + 1)
      onSaved?.()
    } catch (err) {
      setMError(err instanceof Error ? err.message : 'שגיאה בשמירה')
    } finally {
      setMSaving(false)
    }
  }

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

  const notesField = (
    <div className="mt-6 max-w-xs mx-auto">
      <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">הערות</label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="כל מה שתרצי לזכור על השינה הזו…"
        rows={2}
        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
      />
    </div>
  )

  if (loading) {
    return (
      <ActionPageLayout title="שינה" emoji="😴" accent={ACCENT} onBack={onBack} headerAction={headerAction}>
        <div className="text-center text-sand-400 text-sm py-8">טוענת…</div>
      </ActionPageLayout>
    )
  }

  // ── DURING state (running or paused) ──────────────────────────────────
  if (timer) {
    const startedAt = new Date(timer.start_time)
    return (
      <>
        <ActionPageLayout
          title="שינה"
          emoji="😴"
          accent={ACCENT}
          onBack={onBack}
          headerAction={headerAction}
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
          {notesField}
        </ActionPageLayout>
        {renderManualSheet()}
      </>
    )
  }

  // ── BEFORE state ───────────────────────────────────────────────────────
  return (
    <>
      <ActionPageLayout
        title="שינה"
        emoji="😴"
        accent={ACCENT}
        onBack={onBack}
        headerAction={headerAction}
        status={<span>{formatTimeSince(lastSleep, 'טרם נרשמה שינה')}</span>}
        bottom={
          <p className="text-[11px] text-sand-400 text-center">
            אפשר להשהות ולהמשיך אם התינוק מתעורר לרגע
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
          startLabel="התחל שינה"
        />
        {notesField}

        {lastSleep && (
          <div className="mt-8 mx-auto max-w-xs text-center bg-[#F5F1EB] rounded-2xl p-4">
            <p className="text-xs text-sand-500 mb-1">השינה האחרונה</p>
            <p className="text-sm font-semibold text-sand-700">
              {formatTime(lastSleep)} · לפני {formatTimeSince(lastSleep, '').replace('לפני ', '')}
            </p>
          </div>
        )}
      </ActionPageLayout>
      {renderManualSheet()}
    </>
  )

  function renderManualSheet() {
    const dur = manualDurationMinutes()
    return (
      <ManualEntrySheet
        open={manualOpen}
        title="הוספת שינה ידנית"
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
          <label className="block text-xs font-semibold text-sand-600 mb-1.5">התחלה</label>
          <input
            type="datetime-local"
            value={mStart}
            onChange={e => setMStart(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5">סיום</label>
          <input
            type="datetime-local"
            value={mEnd}
            onChange={e => setMEnd(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
          />
        </div>
        {dur != null && (
          <p className="text-xs text-sand-500">משך: {dur < 60 ? `${Math.round(dur)} דקות` : `${Math.floor(dur / 60)}ש ${Math.round(dur % 60)}דק'`}</p>
        )}
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
    )
  }
}
