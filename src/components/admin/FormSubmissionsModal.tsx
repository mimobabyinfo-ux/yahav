import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

// Polish follow-up to A4: surfaces a form's responses inside a large
// centered modal instead of a narrow side panel (desktop) or a
// full-page swap (mobile). Sizing + structure deliberately mirror
// CustomerCardModal so the admin gets a single, consistent
// "deep-dive" modal pattern.
//
// The modal is intentionally generic — it owns the tab UI + CSV
// export trigger, but the inner content (list view / aggregate view)
// is passed as ReactNode so callers continue to render their existing
// FormSubmissionsView / FormAggregatePanel components without
// touching the modal's internals.

type Props = {
  formTitle: string
  count: number
  loading?: boolean
  /** Rendered when the view tab is "פרטי". Usually <FormSubmissionsView />. */
  listContent: ReactNode
  /** Rendered when the view tab is "מצטבר". Usually <FormAggregatePanel />. */
  aggregateContent: ReactNode
  /** When provided, surfaces the "⬇️ CSV" button alongside the aggregate
   *  tab. Hidden when omitted or when there are zero responses. */
  onExportCsv?: () => void
  onClose: () => void
}

export default function FormSubmissionsModal({
  formTitle,
  count,
  loading,
  listContent,
  aggregateContent,
  onExportCsv,
  onClose,
}: Props) {
  // Local to the modal — resets when the parent remounts via key=form.id.
  const [subsView, setSubsView] = useState<'list' | 'aggregate'>('list')

  return (
    <div
      // Same sizing contract as CustomerCardModal: edge-to-edge on
      // mobile with 96px bottom inset to clear the admin BottomNav,
      // centered max-w-2xl on desktop. Backdrop click closes.
      className="fixed inset-0 z-50 flex items-stretch lg:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-3 pb-[96px] lg:pb-6"
      onClick={onClose}
      dir="rtl"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white w-full lg:max-w-2xl h-full lg:max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky header */}
        <div className="px-5 py-4 border-b border-sand-200 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg lg:text-xl font-bold text-sand-800 truncate">{formTitle}</h2>
            <p className="text-xs text-sand-500 mt-0.5">{count} תשובות</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 flex-shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View tabs row — sand-50 strip beneath the header. CSV
            button appears only in מצטבר view when there are responses. */}
        <div className="px-5 py-2 border-b border-sand-200 flex-shrink-0 flex items-center gap-2 bg-sand-50">
          <button
            type="button"
            onClick={() => setSubsView('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              subsView === 'list'
                ? 'bg-white shadow text-sand-800'
                : 'text-sand-500 hover:text-sand-700'
            }`}
          >
            פרטי
          </button>
          <button
            type="button"
            onClick={() => setSubsView('aggregate')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              subsView === 'aggregate'
                ? 'bg-white shadow text-sand-800'
                : 'text-sand-500 hover:text-sand-700'
            }`}
          >
            מצטבר
          </button>
          {subsView === 'aggregate' && count > 0 && onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              className="mr-auto text-xs text-sand-500 hover:text-sand-800 px-2 py-1 rounded-lg hover:bg-white transition-colors"
              title="הורדת הנתונים כקובץ CSV"
            >
              ⬇️ CSV
            </button>
          )}
        </div>

        {/* Body — scrolls inside. */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading
            ? <p className="text-center text-sand-400 text-sm py-8">טוען...</p>
            : subsView === 'list' ? listContent : aggregateContent}
        </div>
      </div>
    </div>
  )
}
