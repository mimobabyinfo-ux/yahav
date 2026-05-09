import { X } from 'lucide-react'

export type FeedingChoice = 'breast' | 'bottle' | 'solid'

type Props = {
  open: boolean
  onClose: () => void
  onPick: (choice: FeedingChoice) => void
}

const choices: { value: FeedingChoice; emoji: string; label: string }[] = [
  { value: 'breast', emoji: '🤱', label: 'הנקה' },
  { value: 'bottle', emoji: '🍼', label: 'בקבוק' },
  { value: 'solid',  emoji: '🥄', label: 'מוצק' },
]

// Bottom-sheet picker — slides up from the bottom edge so a one-handed
// thumb can reach the buttons. The component always renders so the slide
// transition runs on toggle; pointer-events flip with `open`.
export default function FeedingTypePicker({ open, onClose, onPick }: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
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
            <h2 className="text-base font-bold text-sand-800">איך אכל/ה?</h2>
            <button
              onClick={onClose}
              className="text-sand-400 hover:text-sand-600 p-1"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-3">
            {choices.map(c => (
              <button
                key={c.value}
                onClick={() => onPick(c.value)}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-5 bg-[#F5F1EB] rounded-3xl border-2 border-transparent hover:border-mustard-200 transition-all active:scale-95"
              >
                <span className="text-3xl">{c.emoji}</span>
                <span className="text-sm font-semibold text-sand-700">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
