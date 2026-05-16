import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { useActiveTimer } from '../../hooks/useActiveTimer'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import ActionPageLayout from './ActionPageLayout'
import TimerControls from './TimerControls'
import ManualEntrySheet from './ManualEntrySheet'

type Props = {
  onBack: () => void
  /** Bumps when an entry is saved so dashboards/journal refresh. */
  onSaved?: () => void
}

const ACCENT = '#E89651'
const DELETE_CONFIRM = 'ביטול זמן הבטן? הטיימר יימחק ולא תישמר רשומה.'

function buildDurationLabel(durationSecs: number): string {
  return durationSecs < 60
    ? `${durationSecs} שניות`
    : `${Math.round(durationSecs / 60)} דקות`
}

function defaultManualStart(): string {
  // Tummy default: 30 minutes ago per spec.
  return toLocalDatetimeInput(new Date(Date.now() - 30 * 60 * 1000))
}
function defaultManualEnd(): string {
  return toLocalDatetimeInput(new Date())
}
function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TummyTimePage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const { timer, loading, paused, start, pause, resume, remove, elapsedSeconds } = useActiveTimer('tummy_time')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastTummy = useLastEntry('tummy_time', refetchTick)

  const [notes, setNotes] = useState('')

  // Manual entry
  const [manualOpen, setManualOpen] = useState(false)
  const [mStart, setMStart] = useState(defaultManualStart())
  const [mEnd, setMEnd] = useState(defaultManualEnd())
  const [mNotes, setMNotes] = useState('')
  const [mSaving, setMSaving] = useState(false)
  const [mError, setMError] = useState<string | null>(null)

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
      const totalSecs = elapsedSeconds()
      const startedAt = new Date(timer.start_time)
      const now = new Date()
      // Tummy entries encode duration in `notes` (legacy convention from
      // LogEntryModal). If the mom also typed her own notes, prepend the
      // duration label so both pieces of information are preserved.
      const durationLabel = totalSecs > 0 ? `משך: ${buildDurationLabel(totalSecs)}` : ''
      const userNotes = notes.trim()
      const finalNotes = durationLabel && userNotes
        ? `${durationLabel} — ${userNotes}`
        : durationLabel || userNotes || null

      const { error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: formatTime(startedAt),
          entry_type: 'tummy_time',
          notes: finalNotes,
        })
      if (error) throw error

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

  function manualDurationSeconds(): number | null {
    if (!mStart || !mEnd) return null
    const s = new Date(mStart).getTime()
    const e = new Date(mEnd).getTime()
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
    return Math.round((e - s) / 1000)
  }

  async function handleManualSave() {
    if (!user || mSaving) return
    const secs = manualDurationSeconds()
    if (secs == null || secs <= 0) {
      setMError('יש להזין שעת התחלה ושעת סיום (סיום אחרי התחלה)')
      return
    }
    setMSaving(true)
    setMError(null)
    try {
      const startDate = new Date(mStart)
      const durationLabel = `משך: ${buildDurationLabel(secs)}`
      const userNotes = mNotes.trim()
      const finalNotes = userNotes ? `${durationLabel} — ${userNotes}` : durationLabel
      const { error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(startDate),
          entry_time: formatTime(startDate),
          entry_type: 'tummy_time',
          notes: finalNotes,
        })
      if (error) throw error
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
        placeholder="כל מה שתרצי לזכור על הסשן הזה…"
        rows={2}
        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
      />
    </div>
  )

  if (loading) {
    return (
      <ActionPageLayout title="זמן בטן" emoji="🤸" accent={ACCENT} onBack={onBack} headerAction={headerAction}>
        <div className="text-center text-sand-400 text-sm py-8">טוענת…</div>
      </ActionPageLayout>
    )
  }

  if (timer) {
    const startedAt = new Date(timer.start_time)
    return (
      <>
        <ActionPageLayout
          title="זמן בטן"
          emoji="🤸"
          accent={ACCENT}
          onBack={onBack}
          headerAction={headerAction}
          status={<span>התחלה: {formatTime(startedAt)}</span>}
          bottom={saveError ? <p className="text-xs text-red-500 text-center">{saveError}</p> : null}
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

  return (
    <>
      <ActionPageLayout
        title="זמן בטן"
        emoji="🤸"
        accent={ACCENT}
        onBack={onBack}
        headerAction={headerAction}
        status={<span>{formatTimeSince(lastTummy, 'טרם נרשם זמן בטן')}</span>}
        bottom={<p className="text-[11px] text-sand-400 text-center">אפשר להשהות ולהמשיך כשהתינוק מתעייף</p>}
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
        {notesField}

        {lastTummy && (
          <div className="mt-8 mx-auto max-w-xs text-center bg-[#F5F1EB] rounded-2xl p-4">
            <p className="text-xs text-sand-500 mb-1">זמן הבטן האחרון</p>
            <p className="text-sm font-semibold text-sand-700">
              {formatTime(lastTummy)} · לפני {formatTimeSince(lastTummy, '').replace('לפני ', '')}
            </p>
          </div>
        )}
      </ActionPageLayout>
      {renderManualSheet()}
    </>
  )

  function renderManualSheet() {
    const secs = manualDurationSeconds()
    return (
      <ManualEntrySheet
        open={manualOpen}
        title="הוספת זמן בטן ידנית"
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
        {secs != null && (
          <p className="text-xs text-sand-500">משך: {buildDurationLabel(secs)}</p>
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
