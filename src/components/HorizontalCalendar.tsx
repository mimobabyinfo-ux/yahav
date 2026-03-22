import { ChevronRight, ChevronLeft } from 'lucide-react'
import { formatDate, getWeekDates } from '../utils/dateUtils'

type Props = {
  selectedDate: string
  onSelect: (date: string) => void
}

const DAYS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

export default function HorizontalCalendar({ selectedDate, onSelect }: Props) {
  const center = new Date(selectedDate + 'T00:00:00')
  const dates = getWeekDates(center, 7)
  const today = formatDate(new Date())

  function shift(days: number) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    onSelect(formatDate(d))
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => shift(-7)}
        className="p-1.5 rounded-xl hover:bg-sand-100 text-sand-400 hover:text-sand-700 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="flex gap-1 flex-1 justify-between">
        {dates.map(date => {
          const str = formatDate(date)
          const isSelected = str === selectedDate
          const isToday = str === today
          const dayIdx = date.getDay()

          return (
            <button
              key={str}
              onClick={() => onSelect(str)}
              className={`flex flex-col items-center gap-0.5 py-2 px-2 rounded-2xl transition-all flex-1 ${
                isSelected
                  ? 'bg-mustard-500 text-white shadow-md'
                  : isToday
                  ? 'bg-mustard-50 text-mustard-700'
                  : 'hover:bg-sand-50 text-sand-600'
              }`}
            >
              <span className="text-xs font-medium">{DAYS_HE[dayIdx]}</span>
              <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>
                {date.getDate()}
              </span>
              {isToday && !isSelected && (
                <div className="w-1 h-1 rounded-full bg-mustard-500" />
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => shift(7)}
        className="p-1.5 rounded-xl hover:bg-sand-100 text-sand-400 hover:text-sand-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    </div>
  )
}
