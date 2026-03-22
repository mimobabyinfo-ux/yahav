type EntryType = 'feeding' | 'sleep' | 'diaper' | 'pumping' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  onSelect: (type: EntryType) => void
}

const actions: { type: EntryType; emoji: string; label: string }[] = [
  { type: 'diaper', emoji: '🧷', label: 'חיתול' },
  { type: 'pumping', emoji: '🫧', label: 'שאיבה' },
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
          className="flex flex-col items-center gap-1 bg-white rounded-2xl p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all min-w-[60px]"
        >
          <span className="text-xl">{action.emoji}</span>
          <span className="text-xs font-medium text-sand-600 whitespace-nowrap">{action.label}</span>
        </button>
      ))}
    </div>
  )
}
