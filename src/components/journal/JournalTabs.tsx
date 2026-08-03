// 4-tab strip at the top of the Journal page.
// Brand segmented control: white track, amarillo pill with dark text
// (WCAG rule: never white-on-amarillo), springy transition.

export type JournalTab = 'day' | 'week' | 'list' | 'summary'

const TABS: { id: JournalTab; label: string }[] = [
  { id: 'day',     label: 'יום' },
  { id: 'week',    label: 'שבוע' },
  { id: 'list',    label: 'רשימה' },
  { id: 'summary', label: 'סיכום' },
]

type Props = {
  value: JournalTab
  onChange: (tab: JournalTab) => void
}

export default function JournalTabs({ value, onChange }: Props) {
  return (
    <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
            value === t.id ? 'shadow-sm' : 'text-sand-500 hover:text-sand-700'
          }`}
          style={value === t.id ? { background: '#E7C78A', color: '#4A3A28' } : {}}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
