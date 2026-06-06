import { useState, type ReactNode } from 'react'
import AdminLargeModal from './AdminLargeModal'

// Polish follow-up to A4: surfaces a form's responses inside a large
// centered modal. Sizing + structure delegated to AdminLargeModal so
// all admin deep-dive modals stay visually consistent.

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
    <AdminLargeModal
      title={formTitle}
      subtitle={`${count} תשובות`}
      onClose={onClose}
      toolbar={
        <div className="px-5 py-2 flex items-center gap-2">
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
      }
    >
      {loading
        ? <p className="text-center text-sand-400 text-sm py-8">טוען...</p>
        : subsView === 'list' ? listContent : aggregateContent}
    </AdminLargeModal>
  )
}
