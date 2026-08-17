import { CalendarDays, LayoutList, BarChart3, CalendarRange, Check } from 'lucide-react'
import type { JournalTab } from './JournalTabs'

// The sheet behind the date. Brenda 17.8.26: "I tap the day and then I get
// the option to see all the other views — week, list and summary — so that
// screen isn't full of text and clutter."
//
// This is the Google Calendar move: the view switcher is not a permanent
// strip competing with the content, it lives one tap behind the thing you
// already look at. The date picker sits here too, so the header keeps its
// single job.

const VIEWS: { id: JournalTab; label: string; hint: string; icon: typeof CalendarDays }[] = [
  { id: 'day',     label: 'יום',    hint: 'ציר הזמן, הפירוט והסיכום של יום אחד', icon: CalendarDays },
  { id: 'week',    label: 'שבוע',   hint: 'שבעה ימים זה לצד זה',                 icon: CalendarRange },
  { id: 'list',    label: 'רשימה',  hint: 'כל הרשומות אחת אחרי השנייה',          icon: LayoutList },
  { id: 'summary', label: 'סיכום',  hint: 'ממוצעים ומגמות לאורך זמן',            icon: BarChart3 },
]

type Props = {
  tab: JournalTab
  selectedDate: string
  maxDate: string
  onTabChange: (tab: JournalTab) => void
  onDateChange: (date: string) => void
  onClose: () => void
}

export default function JournalViewSheet({
  tab, selectedDate, maxDate, onTabChange, onDateChange, onClose,
}: Props) {
  // Picking a date from week/list/summary means "show me that day", so it
  // switches to the day view as well — otherwise the date silently does
  // nothing and the sheet looks broken.
  const jumpsToDay = tab !== 'day'
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(94, 73, 56, 0.22)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 pb-8 space-y-4 animate-rise"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: '#E4DAD0' }} />

        <div className="space-y-1.5">
          {VIEWS.map(v => {
            const active = v.id === tab
            return (
              <button
                key={v.id}
                onClick={() => onTabChange(v.id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl text-right transition-colors"
                style={active ? { background: '#F6ECD8' } : {}}
              >
                <v.icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? '#8A6A2F' : '#A2937D' }} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold" style={{ fontSize: 15, color: '#443327' }}>{v.label}</span>
                  <span className="block" style={{ fontSize: 12, color: '#8C7D6B' }}>{v.hint}</span>
                </span>
                {active && <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#8A6A2F' }} />}
              </button>
            )
          })}
        </div>

        <div className="pt-3 border-t border-[#F0EAE0]">
          <label className="block text-xs font-semibold text-sand-600 mb-1.5">
            {jumpsToDay ? 'מעבר ליום מסוים' : 'מעבר לתאריך'}
          </label>
          <input
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={e => e.target.value && onDateChange(e.target.value)}
            dir="ltr"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl bg-white text-sand-800 focus:outline-none focus:border-mustard-400"
          />
        </div>
      </div>
    </div>
  )
}
