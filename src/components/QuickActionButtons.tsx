import { formatTimeSince } from '../utils/timeSince'
import { useLastEntry } from '../hooks/useLastEntry'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  onSelect: (type: EntryType) => void
  refetchKey?: number
}

const actions: { type: EntryType; emoji: string; label: string }[] = [
  { type: 'diaper', emoji: '💩', label: 'חיתול' },
  { type: 'tummy_time', emoji: '🐣', label: 'זמן בטן' },
  { type: 'milestone', emoji: '⭐', label: 'אבן דרך' },
  { type: 'doctor_visit', emoji: '🏥', label: 'רופא' },
  { type: 'note', emoji: '📝', label: 'הערה' },
]

export default function QuickActionButtons({ onSelect, refetchKey = 0 }: Props) {
  const lastDiaper = useLastEntry('diaper', refetchKey)
  const diaperSince = formatTimeSince(lastDiaper, 'טרם נרשם חיתול')

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
          {action.type === 'diaper' && (
            <span className="text-[10px] text-sand-400 whitespace-nowrap leading-tight">{diaperSince}</span>
          )}
        </button>
      ))}
    </div>
  )
}
