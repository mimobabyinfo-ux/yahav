import { useEffect } from 'react'
import { Trash2 } from 'lucide-react'

// Shared "are you sure you want to delete" modal. Controlled — parent
// holds `pendingDelete` state, opens by setting it, dismisses by
// clearing it. Visual pattern extracted from the ad-hoc Users-tab
// modal at AdminPage.tsx:554-573 so every delete across the admin
// matches.
//
// Why a dedicated component: trash buttons sit next to edit / copy /
// toggle buttons and the ~14 delete triggers had inconsistent
// confirmation (some window.confirm, some none, one ad-hoc modal).
// One component, one copy line, no more accidental deletes.

type Props = {
  open: boolean
  /** Bold display name interpolated into the message. */
  itemName: string
  /** Header text. Default: "מחיקה". */
  title?: string
  /** Red confirm button label. Default: "מחק". */
  confirmLabel?: string
  /** Cancel button label. Default: "ביטול". */
  cancelLabel?: string
  /** Disables both buttons + shows "..." on confirm while a delete
   *  is in flight. Parent flips this on async deletion. */
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  open,
  itemName,
  title = 'מחיקה',
  confirmLabel = 'מחק',
  cancelLabel = 'ביטול',
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  // ESC closes (unless mid-delete) — matches every other admin modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
      onClick={() => { if (!busy) onClose() }}
      dir="rtl"
    >
      <div
        className="bg-[#F5F1EB] rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="font-bold text-sand-800">{title}</h3>
          <p className="text-sm text-sand-500 mt-1 leading-relaxed">
            בטוח/ה שברצונך למחוק את <strong className="text-sand-700">{itemName}</strong>?
            <br />
            לא ניתן לבטל פעולה זו.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {busy ? '...' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm hover:bg-sand-200 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
