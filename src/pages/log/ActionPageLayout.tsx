import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import type { ReactNode } from 'react'

// Shared shell for the dedicated tracking action pages (sleep, breastfeeding,
// tummy time, …). All variants follow the same three-region layout:
//
//   ┌───────────────────────────────┐
//   │ [back arrow]    child name   │  ← top bar
//   ├───────────────────────────────┤
//   │                               │
//   │      icon + title             │
//   │      status / status line     │  ← center
//   │      controls / content       │
//   │                               │
//   ├───────────────────────────────┤
//   │       [primary action]        │  ← fixed bottom button
//   └───────────────────────────────┘
//
// Pages compose their content into `children`. The primary CTA at the bottom
// is rendered via `bottom` (a node — can be a single button, a pair, or any
// custom row). Top padding accounts for the global ActiveTimerBanner when
// it's visible via the `--banner-height` CSS variable set in App.tsx.

type Props = {
  title: string
  emoji?: string
  /** Optional status line below the title (e.g. "Sleeping for 00:23:14"). */
  status?: ReactNode
  /** Page-specific body content (controls, inputs, etc). */
  children?: ReactNode
  /** Sticky bottom CTA area. */
  bottom?: ReactNode
  onBack: () => void
  /** Optional accent color for the title/icon. */
  accent?: string
}

export default function ActionPageLayout({
  title,
  emoji,
  status,
  children,
  bottom,
  onBack,
  accent = '#A35C3D',
}: Props) {
  const { selectedChild } = useAuth()

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: '#FFFFFF',
        // Account for the active-timer banner when present (set in App.tsx).
        paddingTop: 'var(--banner-height, 0px)',
      }}
      dir="rtl"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sand-100 bg-white">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-sand-100 text-sand-600 transition-colors"
          aria-label="חזרה"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        {selectedChild?.name && (
          <span className="text-sm font-semibold text-sand-700">{selectedChild.name}</span>
        )}
        {/* Spacer to balance back button width */}
        <span className="w-9" />
      </div>

      {/* Center content — scroll if too tall */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          {emoji && <div className="text-6xl leading-none">{emoji}</div>}
          <h1 className="text-2xl font-bold" style={{ color: accent }}>{title}</h1>
          {status && <div className="text-sm text-sand-500">{status}</div>}
        </div>
        {children}
      </div>

      {/* Bottom CTA */}
      {bottom && (
        <div className="px-5 pb-6 pt-3 border-t border-sand-100 bg-white space-y-2">
          {bottom}
        </div>
      )}
    </div>
  )
}
