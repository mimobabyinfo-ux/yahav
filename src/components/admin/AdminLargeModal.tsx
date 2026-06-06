import { X } from 'lucide-react'
import type { ReactNode } from 'react'

// Shared shell for the admin's "deep-dive" modals — customer card,
// form responses, product editor. Same sizing contract: edge-to-edge
// on mobile with a 96px bottom inset to clear the admin BottomNav,
// centered max-w-2xl with max-h-[85vh] on desktop. Backdrop click
// closes; X button in the sticky header closes; ESC closes (handled
// via keydown in the consumer when needed).
//
// Layout:
//   [Sticky header] — title + optional subtitle + close button
//   [Optional sticky toolbar row] — content provided via `toolbar`
//   [Scrollable body]
//   [Optional sticky footer] — content provided via `footer`

type Props = {
  title: string
  subtitle?: string
  /** Sticky row beneath the header — for tabs, action buttons, etc. */
  toolbar?: ReactNode
  /** Sticky row pinned at the bottom — for save/cancel etc. */
  footer?: ReactNode
  /** Modal width on desktop. Defaults to `lg:max-w-2xl`. */
  maxWidthClass?: string
  children: ReactNode
  onClose: () => void
}

export default function AdminLargeModal({
  title,
  subtitle,
  toolbar,
  footer,
  maxWidthClass = 'lg:max-w-2xl',
  children,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch lg:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-3 pb-[96px] lg:pb-6"
      onClick={onClose}
      dir="rtl"
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-white w-full ${maxWidthClass} h-full lg:max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden`}
      >
        {/* Sticky header */}
        <div className="px-5 py-4 border-b border-sand-200 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg lg:text-xl font-bold text-sand-800 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-sand-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 flex-shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {toolbar && (
          <div className="flex-shrink-0 border-b border-sand-200 bg-sand-50">
            {toolbar}
          </div>
        )}

        {/* Body — scrolls inside. */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex-shrink-0 border-t border-sand-200 bg-white px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
