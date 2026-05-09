import { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

// Shared bottom-sheet shell — slide-up panel anchored to the viewport bottom,
// rendered via createPortal so it escapes any ancestor stacking context (the
// dashboard / journal pages wrap content in a `relative z-10` div which would
// otherwise trap the sheet beneath the fixed BottomNav).
//
// The component always renders so the slide animation runs on toggle;
// pointer-events flip with `open`.
export default function BottomSheet({ open, title, onClose, children }: Props) {
  return createPortal(
    <div
      className={`fixed inset-0 z-[100] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out p-5 pb-8 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        dir="rtl"
      >
        <div className="max-w-sm mx-auto">
          {/* Drag affordance */}
          <div className="w-10 h-1 bg-sand-200 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-sand-800">{title}</h2>
            <button
              onClick={onClose}
              className="text-sand-400 hover:text-sand-600 p-1"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
