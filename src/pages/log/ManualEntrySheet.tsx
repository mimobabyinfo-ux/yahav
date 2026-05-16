import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

// Shared bottom-sheet shell used by the "+" manual-entry modal on every
// timer-based action page (Sleep, Tummy, Breast). Pages compose the fields
// into `children` and pass the save handler in `bottom`. createPortal'd to
// document.body so the parent's stacking context can't trap it (the same
// fix we landed earlier for the existing bottom-sheet pickers).

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky save button row. */
  bottom: ReactNode
}

export default function ManualEntrySheet({ open, title, onClose, children, bottom }: Props) {
  // Lock body scroll while open so iOS doesn't bounce the page underneath.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-sand-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-sand-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-400"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-5 space-y-4 overflow-y-auto flex-1 pb-2">
          {children}
        </div>

        {/* Sticky bottom */}
        <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t border-sand-100 space-y-2">
          {bottom}
        </div>
      </div>
    </div>,
    document.body,
  )
}
