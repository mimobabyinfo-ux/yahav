import { CalendarDays, BarChart3, CalendarRange, Check } from 'lucide-react'
import type { JournalTab } from './JournalTabs'

// The sheet behind the date. Brenda 17.8.26: "I tap the day and then I get
// the option to see all the other views, so that screen isn't full of text
// and clutter."
//
// This is the Google Calendar move: the view switcher is not a permanent
// strip competing with the content, it lives one tap behind the thing you
// already look at. The date picker sits here too, so the header keeps its
// single job.
//
// Three views, not four. רשימה folded into שבוע the same day — a week of
// entries as a list and a week of entries as a chart were two tabs holding
// one thing. Day and week are now the same screen at two widths; summary
// is the only view that answers a different question.

const VIEWS: { id: JournalTab; label: string; hint: string; icon: typeof CalendarDays }[] = [
  { id: 'day',     label: 'יום',   hint: 'ציר הזמן, הפירוט והסיכום של יום אחד', icon: CalendarDays },
  { id: 'week',    label: 'שבוע',  hint: 'ציר הזמן, הפירוט והסיכום של השבוע',   icon: CalendarRange },
  { id: 'summary', label: 'סיכום', hint: 'ממוצעים ומגמות לאורך זמן',            icon: BarChart3 },
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
  // Picking a date from week/summary means "show me that day", so it
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
      {/* Brenda 17.8.26, on the screenshot: "and the missing, cut-off part
          at the bottom." The sheet ended flush with the viewport and the
          bottom nav sits on top of it, so the date field — the last thing
          in the sheet — was half hidden behind the tab bar. The padding
          clears the nav plus the phone's home indicator. */}
      <div
        className="w-full max-w-[480px] bg-white rounded-t-3xl p-5 space-y-4 animate-rise"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6.5rem)' }}
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
