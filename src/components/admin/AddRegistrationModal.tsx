import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Check, Plus } from 'lucide-react'
import { supabase, type Workshop, type WorkshopCohort } from '../../lib/supabase'
import CohortsModal from './CohortsModal'

// Phase 5 / A2 Stage 3 (Part 3): manual "add registration" modal.
// Single component, two modes:
//   - new-mother  : blank form (name + phone + email + workshop +
//                   cohort + status)
//   - existing-mother : name/phone/email prefilled (still editable
//                       per spec, with a hint if she's a known mother)
// Always writes to registration_leads with source='manual'. That way
// every existing surface — cohort grouping, bulk actions, gap report,
// customer card lookup — picks it up without any further wiring.

type Mode = 'new-mother' | 'existing-mother'

type Prefill = {
  name?: string
  phone?: string
  email?: string
}

type Props = {
  mode: Mode
  prefill?: Prefill
  onClose: () => void
  onSaved: () => void
}

export default function AddRegistrationModal({ mode, prefill, onClose, onSaved }: Props) {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])

  const [name, setName] = useState(prefill?.name ?? '')
  const [phone, setPhone] = useState(prefill?.phone ?? '')
  const [email, setEmail] = useState(prefill?.email ?? '')
  const [workshopId, setWorkshopId] = useState('')
  const [cohortId, setCohortId] = useState<string>('')
  // Default status is שילמה (paid) per spec — admin typically adds
  // people who've already paid offline. Flip to ממתינה when needed.
  const [status, setStatus] = useState<'pending' | 'paid' | 'handled'>('paid')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lazy-create cohort flow: workshop is picked but has no cohorts yet
  // → "+ הוסיפי מחזור" link opens the CohortsModal for that workshop.
  const [cohortsModalWorkshop, setCohortsModalWorkshop] = useState<Workshop | null>(null)

  const load = useCallback(async () => {
    const [{ data: ws }, { data: cs }] = await Promise.all([
      supabase.from('workshops').select('*').eq('is_active', true).order('display_order'),
      supabase.from('workshop_cohorts').select('*').order('start_date', { ascending: false }),
    ])
    setWorkshops((ws ?? []) as Workshop[])
    setCohorts((cs ?? []) as WorkshopCohort[])
  }, [])
  useEffect(() => { load() }, [load])

  const selectedWorkshop = useMemo(
    () => workshops.find(w => w.id === workshopId) ?? null,
    [workshops, workshopId],
  )

  const matchingCohorts = useMemo(
    () => cohorts.filter(c => c.workshop_id === workshopId),
    [cohorts, workshopId],
  )

  function validate(): string | null {
    if (!name.trim()) return 'יש להזין שם'
    const cleanPhone = phone.replace(/\D/g, '')
    if (!cleanPhone) return 'יש להזין מספר טלפון'
    if (!/^05\d{8}$/.test(cleanPhone) && !/^972/.test(cleanPhone)) {
      return 'מספר טלפון ישראלי לא תקין (05X-XXXXXXX)'
    }
    if (!email.trim()) return 'יש להזין אימייל'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'כתובת אימייל לא תקינה'
    if (!workshopId) return 'יש לבחור סדנה'
    return null
  }

  async function save() {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setSaving(true)
    const cleanPhone = phone.replace(/\D/g, '')
    const payload = {
      name: name.trim(),
      phone: cleanPhone,
      email: email.trim().toLowerCase(),
      selected_workshop_id: workshopId,
      cohort_id: cohortId || null,
      status,
      source: 'manual',
    }
    const { error: dbError } = await supabase.from('registration_leads').insert(payload)
    setSaving(false)
    if (dbError) {
      setError('שגיאה בשמירה: ' + dbError.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch lg:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-3 pb-[96px] lg:pb-6"
      onClick={onClose}
      dir="rtl"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white w-full lg:max-w-lg h-full lg:max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky header */}
        <div className="px-5 py-4 border-b border-sand-200 flex-shrink-0 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-sand-800">
            {mode === 'new-mother' ? '+ הרשמה חדשה' : '+ הוסף הרשמה'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {mode === 'existing-mother' && (
            <p className="text-xs text-sand-500 bg-sand-50 border border-sand-200 rounded-2xl px-3 py-2 leading-relaxed">
              אם הטלפון השתנה — עדכני כאן.
            </p>
          )}

          <Field label="שם מלא">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="שם פרטי ושם משפחה"
              className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 text-sand-800"
            />
          </Field>

          <Field label="טלפון">
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="050-1234567"
              className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 text-sand-800"
            />
          </Field>

          <Field label="אימייל">
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 text-sand-800"
            />
          </Field>

          <Field label="סדנה">
            <select
              value={workshopId}
              onChange={e => { setWorkshopId(e.target.value); setCohortId('') }}
              className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
            >
              <option value="">— בחרי סדנה —</option>
              {workshops.map(w => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
          </Field>

          {workshopId && (
            <Field label="מחזור (אופציונלי)">
              {matchingCohorts.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sand-500">אין מחזורים לסדנה הזו עדיין.</span>
                  <button
                    type="button"
                    onClick={() => selectedWorkshop && setCohortsModalWorkshop(selectedWorkshop)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-mustard-700 hover:text-mustard-800 underline underline-offset-2"
                  >
                    <Plus className="w-3 h-3" />
                    הוסיפי מחזור
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={cohortId}
                    onChange={e => setCohortId(e.target.value)}
                    className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
                  >
                    <option value="">ללא מחזור</option>
                    {matchingCohorts.map(c => {
                      const [y, m, d] = c.start_date.split('-')
                      const t = c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''
                      const lbl = `${d}/${m}/${y.slice(2)}${t}${c.label ? ' · ' + c.label : ''}${!c.is_active ? ' (לא פעיל)' : ''}`
                      return <option key={c.id} value={c.id}>{lbl}</option>
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => selectedWorkshop && setCohortsModalWorkshop(selectedWorkshop)}
                    className="px-2.5 py-2 rounded-xl text-xs font-semibold text-mustard-700 hover:bg-mustard-50 inline-flex items-center gap-1 flex-shrink-0"
                    title="הוספת מחזור חדש לסדנה הזו"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    מחזור
                  </button>
                </div>
              )}
            </Field>
          )}

          <Field label="סטטוס">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['pending', '⏳ ממתינה', '#fef3c7', '#b45309'],
                ['paid',    '✅ שילמה',  '#dcfce7', '#15803d'],
                ['handled', '🎓 מומש',   '#f1f5f9', '#475569'],
              ] as ['pending' | 'paid' | 'handled', string, string, string][]).map(([k, label, bg, color]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatus(k)}
                  className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${status === k ? 'border-mustard-500' : 'border-sand-200'}`}
                  style={status === k ? { background: bg, color } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Sticky save row */}
        <div className="px-5 py-3 border-t border-sand-200 flex-shrink-0 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50"
            style={{ background: '#E7C78A' }}
          >
            {saving ? '...' : <><Check className="w-4 h-4" /> שמירת הרשמה</>}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-700 text-sm font-semibold"
          >
            ביטול
          </button>
        </div>
      </div>

      {cohortsModalWorkshop && (
        <CohortsModal
          workshop={cohortsModalWorkshop}
          onClose={() => { setCohortsModalWorkshop(null); load() }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-sand-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
