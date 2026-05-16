import { Play, Square, Pause } from 'lucide-react'
import { formatSeconds } from '../../hooks/useActiveTimer'

// Shared timer-display + start/pause/resume/stop UI used by SleepPage,
// TummyTimePage, (and eventually BreastfeedingPage for the per-side block).
// Stateless — the parent owns the active timer (via useActiveTimer) and
// passes elapsedSeconds + the paused flag.

type Props = {
  /** Live elapsed seconds. Pass 0 when no timer is running. */
  elapsedSeconds: number
  /** True when a session is open (timer row exists in DB). */
  running: boolean
  /** True when running but the current segment is paused. */
  paused?: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onDelete: () => void
  /** Label override for the start button (default: "התחל"). */
  startLabel?: string
  /** Label override for the stop button (default: "עצור ושמור"). */
  stopLabel?: string
  /** Label override for the delete button (default: "מחיקת רשומה"). */
  deleteLabel?: string
  /** Color theme for active state. */
  accent?: string
  /** When false, hide the inline start button — pages may render their own
   *  custom start UI and only need the elapsed display. */
  showStartButton?: boolean
}

export default function TimerControls({
  elapsedSeconds,
  running,
  paused = false,
  onStart,
  onPause,
  onResume,
  onStop,
  onDelete,
  startLabel = 'התחל',
  stopLabel = 'עצור ושמור',
  deleteLabel = 'מחיקת רשומה',
  accent = '#A35C3D',
  showStartButton = true,
}: Props) {
  // ── Running (or paused) — session is open ──────────────────────────────
  if (running) {
    return (
      <div className="flex flex-col items-center gap-5">
        <div
          className="text-6xl font-mono font-bold tabular-nums tracking-wide"
          style={{ color: accent, opacity: paused ? 0.55 : 1 }}
        >
          {formatSeconds(elapsedSeconds)}
        </div>

        <div className="text-sm text-sand-500">
          {paused ? 'בהפסקה' : 'הטיימר רץ'}
        </div>

        {/* Pause / Resume toggle — secondary action */}
        {paused ? (
          <button
            onClick={onResume}
            className="w-full max-w-xs flex items-center justify-center gap-2 py-3 rounded-2xl font-bold border-2 transition-all"
            style={{ borderColor: accent, color: accent, background: 'white' }}
          >
            <Play className="w-5 h-5 fill-current" />
            המשיכי
          </button>
        ) : (
          <button
            onClick={onPause}
            className="w-full max-w-xs flex items-center justify-center gap-2 py-3 rounded-2xl font-bold border-2 transition-all"
            style={{ borderColor: accent, color: accent, background: 'white' }}
          >
            <Pause className="w-5 h-5 fill-current" />
            הפסקה
          </button>
        )}

        {/* Stop & save — primary action */}
        <button
          onClick={onStop}
          className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold shadow-md transition-all"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
          }}
        >
          <Square className="w-5 h-5 fill-current" />
          {stopLabel}
        </button>

        {/* Delete — tertiary, muted; goes red on hover so destructive intent is clear */}
        <button
          onClick={onDelete}
          className="text-xs text-sand-400 hover:text-red-500 underline underline-offset-2 transition-colors pt-1"
        >
          {deleteLabel}
        </button>
      </div>
    )
  }

  // ── Idle (no session) ──────────────────────────────────────────────────
  if (!showStartButton) return null

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={onStart}
        className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold shadow-md transition-all"
        style={{
          background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
        }}
      >
        <Play className="w-5 h-5 fill-current" />
        {startLabel}
      </button>
    </div>
  )
}
