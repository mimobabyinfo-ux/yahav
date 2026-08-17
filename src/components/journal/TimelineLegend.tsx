import { ENTRY_COLORS } from '../DailyTimeline'

// The key for both Gantt charts.
//
// Brenda 17.8.26: "add the emoji of each of the things — nursing, sleep,
// bottle, food and so on — inside the colours in the journal." Colour
// alone cannot carry it: every kind of feed shares one colour, so a
// breast, a bottle and a first taste of avocado were three identical
// rectangles. The emoji is the distinction, and the swatch shows it on
// the colour it will actually appear on.
//
// Shared so the day chart and the week chart can never drift apart.

export const TIMELINE_LEGEND: { type: string; emoji: string; label: string }[] = [
  { type: 'feeding',    emoji: '🤱🏼', label: 'הנקה' },
  { type: 'feeding',    emoji: '🍼',  label: 'בקבוק' },
  { type: 'feeding',    emoji: '🥄',  label: 'אוכל' },
  { type: 'sleep',      emoji: '😴',  label: 'שינה' },
  { type: 'diaper',     emoji: '💩',  label: 'חיתול' },
  { type: 'tummy_time', emoji: '🤸🏼', label: 'זמן בטן' },
]

export default function TimelineLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      {TIMELINE_LEGEND.map(l => (
        <span key={l.label} className="flex items-center gap-1 text-[11px] font-semibold text-sand-600">
          <span
            className="inline-flex items-center justify-center rounded-[4px]"
            style={{
              width: 16, height: 16, fontSize: 10, lineHeight: 1,
              background: (ENTRY_COLORS[l.type] ?? ENTRY_COLORS.note).dot,
            }}
          >
            {l.emoji}
          </span>
          {l.label}
        </span>
      ))}
    </div>
  )
}
