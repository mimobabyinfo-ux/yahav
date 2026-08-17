import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

// The journal's single control, shared by all four views.
//
// Brenda 17.8.26: "I want everything to look like the day view, and not
// that when I move to week it goes back to those tabs. When it's week, it
// should just say the week, and I can tap it to go back to day or over to
// list."
//
// So the tab strip is gone everywhere. Every view wears the same shape:
// arrows on the sides, a tappable label in the middle that opens the view
// sheet. Only the label changes — a date on the day screen, a range on
// week and list, a word on summary. Learn it once, it works everywhere.

type Props = {
  /** Rendered in the middle. The whole thing is the button. */
  children: React.ReactNode
  /** Omitted on views with nothing to step through (summary). */
  onPrev?: () => void
  onNext?: () => void
  nextDisabled?: boolean
  prevLabel?: string
  nextLabel?: string
  onOpenViews: () => void
}

export default function JournalHeader({
  children, onPrev, onNext, nextDisabled, prevLabel = 'קודם', nextLabel = 'הבא', onOpenViews,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-1">
      {onPrev ? (
        <button
          onClick={onPrev}
          className="p-2 rounded-xl text-sand-500 hover:bg-white transition-colors"
          aria-label={prevLabel}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      ) : <span className="w-9" />}

      <button
        onClick={onOpenViews}
        className="flex items-baseline gap-2 px-3 py-1.5 rounded-2xl hover:bg-white transition-colors"
      >
        {children}
        <ChevronDown className="w-4 h-4 self-center" style={{ color: '#A2937D' }} />
      </button>

      {onNext ? (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="p-2 rounded-xl text-sand-500 hover:bg-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label={nextLabel}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      ) : <span className="w-9" />}
    </div>
  )
}
