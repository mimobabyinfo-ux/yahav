import { Play, Pencil } from 'lucide-react'
import BottomSheet from './BottomSheet'

export type TimerOrManualChoice = 'timer' | 'manual'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  onPick: (choice: TimerOrManualChoice) => void
}

// Two-option sheet shown after the user taps a timer cell on today. Lets her
// decide between starting a live timer or recording an action that already
// happened. Past-date views skip this picker — there's only one option there.
export default function TimerOrManualPicker({ open, title, onClose, onPick }: Props) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        <button
          onClick={() => onPick('timer')}
          className="w-full flex items-center gap-3 px-4 py-4 bg-[#F5F1EB] rounded-3xl border-2 border-transparent hover:border-mustard-200 transition-all active:scale-[0.98] text-right"
        >
          <div className="w-10 h-10 rounded-2xl bg-mustard-100 text-mustard-700 flex items-center justify-center flex-shrink-0">
            <Play className="w-5 h-5 fill-current" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-sand-800">התחילי טיימר</div>
            <div className="text-xs text-sand-500 mt-0.5">עכשיו</div>
          </div>
        </button>

        <button
          onClick={() => onPick('manual')}
          className="w-full flex items-center gap-3 px-4 py-4 bg-[#F5F1EB] rounded-3xl border-2 border-transparent hover:border-mustard-200 transition-all active:scale-[0.98] text-right"
        >
          <div className="w-10 h-10 rounded-2xl bg-mustard-100 text-mustard-700 flex items-center justify-center flex-shrink-0">
            <Pencil className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-sand-800">רישום ידני</div>
            <div className="text-xs text-sand-500 mt-0.5">בדיעבד</div>
          </div>
        </button>
      </div>
    </BottomSheet>
  )
}
