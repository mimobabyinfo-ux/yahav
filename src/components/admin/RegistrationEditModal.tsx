import { useState, useMemo } from 'react'
import AdminLargeModal from './AdminLargeModal'
import type { Workshop, WorkshopCohort } from '../../lib/supabase'

// Task C: edit an existing registration row. Each field maps 1:1 to
// the registration_leads column the admin most commonly fixes
// (typos in name/phone/email; wrong product or cohort picked at
// signup; manual status correction). Reuses AdminLargeModal so the
// shell matches the customer card / forms-responses / product
// editor — admin's "deep-dive" modal pattern.
//
// Fields:
//   name              — text
//   phone             — normalized on save (digits only)
//   email             — lowercased + trimmed on save
//   selected_workshop_id  — dropdown sorted by display_order
//   cohort_id         — dropdown filtered to the selected workshop's
//                       cohorts (so changing the workshop resets
//                       the cohort dropdown to "ללא מחזור")
//   status            — pending / paid / handled
//
// Source is intentionally NOT editable (internal field). Delete is
// handled separately via the row's trash button + the shared
// ConfirmDialog from Task A.

type LeadShape = {
  id: string
  name: string
  phone: string
  email: string
  selected_workshop_id: string | null
  cohort_id: string | null
  status: 'pending' | 'paid' | 'handled'
}

type Props = {
  lead: LeadShape
  workshops: Workshop[]
  cohorts: WorkshopCohort[]
  onSave: (id: string, patch: Partial<LeadShape>) => Promise<void>
  onClose: () => void
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, '')
}

export default function RegistrationEditModal({ lead, workshops, cohorts, onSave, onClose }: Props) {
  const [name, setName] = useState(lead.name)
  const [phone, setPhone] = useState(lead.phone)
  const [email, setEmail] = useState(lead.email)
  const [workshopId, setWorkshopId] = useState<string>(lead.selected_workshop_id ?? '')
  const [cohortId, setCohortId] = useState<string>(lead.cohort_id ?? '')
  const [status, setStatus] = useState<LeadShape['status']>(lead.status)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const sortedWorkshops = useMemo(
    () => [...workshops].sort((a, b) => a.display_order - b.display_order),
    [workshops],
  )

  // Changing the workshop should auto-clear the cohort (the old
  // cohort belongs to a different workshop, can't survive). The
  // dropdown shows only cohorts for the currently-selected workshop.
  const cohortsForWorkshop = useMemo(() => {
    if (!workshopId) return [] as WorkshopCohort[]
    return cohorts
      .filter(c => c.workshop_id === workshopId)
      .sort((a, b) => {
        const dc = a.start_date.localeCompare(b.start_date)
        if (dc !== 0) return dc
        return (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
      })
  }, [workshopId, cohorts])

  function onWorkshopChange(next: string) {
    setWorkshopId(next)
    // If the previously-selected cohort no longer belongs to this
    // workshop, drop it. Same workshop → preserve.
    const stillValid = cohorts.some(c => c.id === cohortId && c.workshop_id === next)
    if (!stillValid) setCohortId('')
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'שם נדרש'
    const cleanPhone = normalizePhone(phone)
    if (!cleanPhone) e.phone = 'טלפון נדרש'
    else if (!/^05\d{8}$/.test(cleanPhone)) e.phone = 'טלפון ישראלי לא תקין (05X-XXXXXXX)'
    if (!email.trim()) e.email = 'אימייל נדרש'
    else if (!isValidEmail(email.trim())) e.email = 'אימייל לא תקין'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const patch: Partial<LeadShape> = {
      name: name.trim(),
      phone: normalizePhone(phone),
      email: email.trim().toLowerCase(),
      selected_workshop_id: workshopId || null,
      cohort_id: cohortId || null,
      status,
    }
    try {
      await onSave(lead.id, patch)
      onClose()
    } catch {
      setErrors({ submit: 'שגיאה בשמירה — נסי שוב' })
      setSaving(false)
    }
  }

  return (
    <AdminLargeModal
      title="עריכת הרשמה"
      subtitle={lead.name}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-mustard-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-mustard-600 transition-colors"
          >
            {saving ? 'שומרת...' : 'שמירה'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-sand-100 text-sand-600 text-sm font-semibold disabled:opacity-50 hover:bg-sand-200 transition-colors"
          >
            ביטול
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">שם מלא</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">טלפון</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            dir="ltr"
            placeholder="050-1234567"
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
          />
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">אימייל</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            dir="ltr"
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500"
          />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">מוצר</label>
          <select
            value={workshopId}
            onChange={e => onWorkshopChange(e.target.value)}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500 bg-white"
          >
            <option value="">— ללא מוצר —</option>
            {sortedWorkshops.map(w => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">מחזור</label>
          <select
            value={cohortId}
            onChange={e => setCohortId(e.target.value)}
            disabled={!workshopId}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500 bg-white disabled:opacity-50"
          >
            <option value="">— ללא מחזור —</option>
            {cohortsForWorkshop.map(c => {
              const [y, m, d] = c.start_date.split('-')
              const t = c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''
              const label = `${d}/${m}/${y.slice(2)}${t}${c.label ? ' · ' + c.label : ''}`
              return <option key={c.id} value={c.id}>{label}</option>
            })}
          </select>
          {!workshopId && (
            <p className="text-[10px] text-sand-400 mt-0.5">יש לבחור מוצר כדי לראות מחזורים</p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">סטטוס</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as LeadShape['status'])}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-500 bg-white"
          >
            <option value="pending">⏳ ממתינה</option>
            <option value="paid">✅ שילמה</option>
            <option value="handled">🎓 מומש</option>
          </select>
        </div>

        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{errors.submit}</div>
        )}
      </div>
    </AdminLargeModal>
  )
}
