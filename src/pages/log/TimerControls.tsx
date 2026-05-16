import { Play, Square, Pause } from 'lucide-react'
import { formatSeconds } from '../../hooks/useActiveTimer'

// Shared timer-display + start/stop UI used by SleepPage, TummyTimePage,
// (and eventually BreastfeedingPage). Stateless — the parent owns the
// active timer (via useActiveTimer) and passes elapsedSeconds.

type Props = {
  /** Live elapsed seconds. Pass 0 when no timer is running. */
  elapsedSeconds: number
  /** True when a timer is currently running. */
  running: boolean
  onStart: () => void
  onStop: () => void
  /** Label override for the start button (default: "התחל"). */
  startLabel?: string
  /** Label override for the stop button (default: "עצור ושמור"). */
  stopLabel?: string
  /** Color theme for active state. */
  accent?: string
  /** When false, hide the inline start button — pages may render their own
   *  custom start UI and only need the elapsed display. */
  showStartButton?: boolean
}

export default function TimerControls({
  elapsedSeconds,
  running,
  onStart,
  onStop,
  startLabel = 'התחל',
  stopLabel = 'עצור ושמור',
  accent = '#A35C3D',
  showStartButton = true,
}: Props) {
  if (running) {
    return (
      <div className="flex flex-col items-center gap-5">
        <div
          className="text-6xl font-mono font-bold tabular-nums tracking-wide"
          style={{ color: accent }}
        >
          {formatSeconds(elapsedSeconds)}
        </div>
        <div className="flex items-center gap-2 text-sm text-sand-500">
          <Pause className="w-4 h-4" />
          <span>הטיימר רץ</span>
        </div>
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
      </div>
    )
  }

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
