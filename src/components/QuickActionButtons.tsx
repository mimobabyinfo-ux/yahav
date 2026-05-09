type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  onSelect: (type: EntryType) => void
}

// Secondary actions — feeding/sleep/diaper/tummy_time live in the unified
// quick-add grid (ActivityTimers with layout='grid-2'). This row carries
// the less-frequent log types only.
const actions: { type: EntryType; emoji: string; label: string }[] = [
  { type: 'milestone', emoji: '⭐', label: 'אבן דרך' },
  { type: 'doctor_visit', emoji: '🏥', label: 'רופא' },
  { type: 'note', emoji: '📝', label: 'הערה' },
]

export default function QuickActionButtons({ onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto scroll-hide py-1">
      {actions.map(action => (
        <button
          key={action.type}
          onClick={() => onSelect(action.type)}
          className="flex flex-col items-center gap-1 bg-[#F5F1EB] rounded-2xl p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all min-w-[60px]"
        >
          <span className="text-xl">{action.emoji}</span>
          <span className="text-xs font-medium text-sand-600 whitespace-nowrap">{action.label}</span>
        </button>
      ))}
    </div>
  )
}
