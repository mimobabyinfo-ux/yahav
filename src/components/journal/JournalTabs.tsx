// 4-tab strip at the top of the Journal page (Phase 3 / C3).
// Reuses the existing mustard-pill style from the previous viewMode strip
// so the visual change is just: 3 tabs (יום / שבוע / חודש) → 4 tabs
// (יום / שבוע / רשימה / סיכום). Month view is replaced by List per spec.

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
    <div className="flex bg-[#F5F1EB] rounded-2xl p-1 shadow-sm gap-1">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
            value === t.id ? 'text-white shadow-sm' : 'text-sand-500'
          }`}
          style={value === t.id ? { background: '#E7C78A' } : {}}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
