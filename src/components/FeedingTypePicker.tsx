import BottomSheet from './BottomSheet'

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

export default function FeedingTypePicker({ open, onClose, onPick }: Props) {
  return (
    <BottomSheet open={open} title="איך אכל/ה?" onClose={onClose}>
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
    </BottomSheet>
  )
}
