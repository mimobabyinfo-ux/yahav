import { useCallback, useEffect, useState } from 'react'
import { X, Pencil, Trash2, Plus, Check } from 'lucide-react'
import { supabase, type WorkshopCohort, type Workshop } from '../../lib/supabase'
import ConfirmDialog from './ConfirmDialog'

// Phase 5 / A1: per-workshop cohort manager. Opened from the admin
// Workshops list via the "📅 מחזורים" button. Lists existing cohorts
// for one workshop with create / edit / delete + smart confirm on
// delete (prompts only when registrations are attached).
//
// User-facing Hebrew throughout uses "מחזור / מחזורים"; the technical
// name `cohort` stays in code + DB.

type Props = {
  workshop: Workshop
  onClose: () => void
}

type Draft = {
  start_date: string
  start_time: string  // HH:MM or '' for none
  end_date: string    // YYYY-MM-DD or '' — auto-suggested start + 4 weeks, editable
  label: string
  capacity: string
  notes: string
  is_active: boolean
}

const EMPTY_DRAFT: Draft = {
  start_date: '',
  start_time: '',
  end_date: '',
  label: '',
  capacity: '',
  notes: '',
  is_active: true,
}

// Auto-suggest end_date = start_date + 4 weeks. Pure date math on the
// YYYY-MM-DD parts (UTC-based so no timezone drift); the result stays a
// plain date string the admin can freely override.
function addWeeks(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + weeks * 7 * 86400000
  const dt = new Date(t)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Display-only Hebrew date+time. Input <date>/<time> values stay
// YYYY-MM-DD / HH:MM. Returns DD/MM/YYYY HH:MM when time is set,
// DD/MM/YYYY alone otherwise.
function ddmmyyyyhhmm(date: string, time: string | null): string {
  const [y, m, d] = date.split('-')
  const base = `${d}/${m}/${y}`
  if (!time) return base
  return `${base} ${time.slice(0, 5)}`
}

export default function CohortsModal({ workshop, onClose }: Props) {
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  // Per-cohort registration counts — populated by a single grouped
  // query after cohorts load. Empty for cohorts with no rows.
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Task A: delete confirmation. Only triggered when the cohort has
  // attached registrations — empty cohorts delete silently to keep
  // admin's quick-cleanup flow.
  const [pendingDelete, setPendingDelete] = useState<WorkshopCohort | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rows }, { data: regs }] = await Promise.all([
      supabase
        .from('workshop_cohorts')
        .select('*')
        .eq('workshop_id', workshop.id)
        .order('start_date', { ascending: false }),
      // Pull the cohort_id of every registration on this workshop so
      // we can count client-side. Faster than a per-cohort COUNT(*)
      // round-trip for typical (low) row counts.
      supabase
        .from('registration_leads')
        .select('cohort_id')
        .eq('selected_workshop_id', workshop.id)
        .not('cohort_id', 'is', null),
    ])
    setCohorts((rows ?? []) as WorkshopCohort[])
    const counter: Record<string, number> = {}
    for (const r of (regs ?? []) as { cohort_id: string | null }[]) {
      if (r.cohort_id) counter[r.cohort_id] = (counter[r.cohort_id] ?? 0) + 1
    }
    setCounts(counter)
    setLoading(false)
  }, [workshop.id])

  useEffect(() => { load() }, [load])

  function startCreate() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
    setShowForm(true)
  }

  function startEdit(cohort: WorkshopCohort) {
    setEditingId(cohort.id)
    setDraft({
      start_date: cohort.start_date,
      start_time: cohort.start_time?.slice(0, 5) ?? '',
      end_date: cohort.end_date ?? '',
      label: cohort.label ?? '',
      capacity: cohort.capacity?.toString() ?? '',
      notes: cohort.notes ?? '',
      is_active: cohort.is_active,
    })
    setError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  async function save() {
    if (!draft.start_date) { setError('יש לבחור תאריך התחלה'); return }
    const cap = draft.capacity.trim() ? parseInt(draft.capacity, 10) : null
    if (cap != null && (!Number.isInteger(cap) || cap <= 0)) {
      setError('קיבולת חייבת להיות מספר חיובי')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      workshop_id: workshop.id,
      start_date: draft.start_date,
      start_time: draft.start_time || null,
      end_date: draft.end_date || null,
      label: draft.label.trim() || null,
      capacity: cap,
      notes: draft.notes.trim() || null,
      is_active: draft.is_active,
    }
    const { error: dbError } = editingId
      ? await supabase.from('workshop_cohorts').update(payload).eq('id', editingId)
      : await supabase.from('workshop_cohorts').insert(payload)
    setSaving(false)
    if (dbError) { setError('שגיאה בשמירה — נסי שוב'); return }
    cancelForm()
    await load()
  }

  async function remove(cohort: WorkshopCohort) {
    // Smart confirm: prompt with the count only when registrations
    // would be orphaned. Cohort with zero registrations deletes
    // silently — admin asked to be able to clean up freely. The
    // ConfirmDialog handles the prompt; the silent path runs the
    // delete directly.
    const count = counts[cohort.id] ?? 0
    if (count > 0) {
      setPendingDelete(cohort)
      return
    }
    const { error: dbError } = await supabase
      .from('workshop_cohorts')
      .delete()
      .eq('id', cohort.id)
    if (dbError) { setError('שגיאה במחיקה'); return }
    await load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    const { error: dbError } = await supabase
      .from('workshop_cohorts')
      .delete()
      .eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    if (dbError) { setError('שגיאה במחיקה'); return }
    await load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div
        className="bg-[#F5F1EB] rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-sand-800">📅 מחזורים</h3>
            <p className="text-[11px] text-sand-500 truncate">{workshop.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sand-400 text-sm py-6">טוענת...</p>
          ) : (
            <>
              {cohorts.length === 0 && !showForm && (
                <p className="text-center text-sand-500 text-sm py-6">
                  אין מחזורים עדיין למוצר הזה.
                </p>
              )}

              {cohorts.map(c => {
                const count = counts[c.id] ?? 0
                const capLabel = c.capacity != null ? `${count}/${c.capacity}` : `${count}`
                const overCap = c.capacity != null && count > c.capacity
                const nearCap = c.capacity != null && !overCap && count >= Math.ceil(c.capacity * 0.9)
                const capColor = overCap
                  ? 'text-red-600 bg-red-50'
                  : nearCap
                    ? 'text-amber-700 bg-amber-50'
                    : 'text-mustard-700 bg-mustard-50'
                return (
                  <div key={c.id} className={`rounded-2xl bg-white border p-3 ${c.is_active ? 'border-sand-200' : 'border-sand-200 opacity-60'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-sand-800">{ddmmyyyyhhmm(c.start_date, c.start_time)}</span>
                          {c.label && <span className="text-xs text-sand-500">· {c.label}</span>}
                          {!c.is_active && (
                            <span className="text-[10px] font-semibold text-sand-500 bg-sand-100 px-2 py-0.5 rounded-full">לא פעיל</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${capColor}`}>{capLabel}</span>
                          {c.capacity == null && (
                            <span className="text-[10px] text-sand-400">קיבולת לא הוגדרה</span>
                          )}
                        </div>
                        {c.end_date && (
                          <p className="text-[10px] text-sand-400 mt-1">סיום: {ddmmyyyyhhmm(c.end_date, null)}</p>
                        )}
                        {c.survey_sent_at && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            ✓ שאלון משוב נשלח {ddmmyyyyhhmm(c.survey_sent_at.slice(0, 10), null)}
                          </span>
                        )}
                        {c.notes && (
                          <p className="text-[11px] text-sand-500 mt-1.5 whitespace-pre-line">{c.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => startEdit(c)}
                          className="p-1.5 rounded-lg text-sand-400 hover:text-mustard-600 hover:bg-mustard-50"
                          aria-label="עריכה"
                          title="עריכה"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          className="p-1.5 rounded-lg text-sand-400 hover:text-red-500 hover:bg-red-50"
                          aria-label="מחיקה"
                          title="מחיקה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Create / edit form */}
              {showForm && (
                <div className="rounded-2xl bg-white border-2 border-mustard-300 p-4 space-y-2.5">
                  <p className="text-xs font-bold text-sand-700">
                    {editingId ? 'עריכת מחזור' : 'הוספת מחזור'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-sand-500 mb-1">תאריך התחלה</label>
                      <div dir="ltr">
                        <input
                          type="date"
                          value={draft.start_date}
                          onChange={e => {
                            // Auto-suggest end_date = start + 4 weeks whenever
                            // start_date is set/changed. Stays editable below.
                            const v = e.target.value
                            setDraft(d => ({ ...d, start_date: v, end_date: v ? addWeeks(v, 4) : '' }))
                          }}
                          className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-sand-500 mb-1">שעה (אופציונלי)</label>
                      <div dir="ltr">
                        <input
                          type="time"
                          value={draft.start_time}
                          onChange={e => setDraft(d => ({ ...d, start_time: e.target.value }))}
                          className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-sand-500 mb-1">תאריך סיום (מחושב, ניתן לעריכה)</label>
                    <div dir="ltr">
                      <input
                        type="date"
                        value={draft.end_date}
                        onChange={e => setDraft(d => ({ ...d, end_date: e.target.value }))}
                        className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                      />
                    </div>
                    <p className="text-[10px] text-sand-400 mt-1 leading-relaxed">
                      שאלון המשוב נשלח אוטומטית יומיים אחרי תאריך זה.
                    </p>
                  </div>
                  {editingId && (() => {
                    const c = cohorts.find(x => x.id === editingId)
                    return c?.survey_sent_at ? (
                      <p className="text-[11px] font-semibold text-green-700 bg-green-50 rounded-lg px-2.5 py-1.5">
                        ✓ שאלון משוב נשלח בתאריך {ddmmyyyyhhmm(c.survey_sent_at.slice(0, 10), null)}
                      </p>
                    ) : null
                  })()}
                  <div>
                    <label className="block text-[11px] font-semibold text-sand-500 mb-1">תווית (אופציונלי)</label>
                    <input
                      value={draft.label}
                      onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="למשל: בוקר / ערב"
                      maxLength={40}
                      className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-sand-500 mb-1">קיבולת (אופציונלי)</label>
                    <input
                      type="number"
                      min="1"
                      value={draft.capacity}
                      onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))}
                      placeholder="ללא מגבלה"
                      className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-sand-500 mb-1">הערות פנימיות (אופציונלי)</label>
                    <textarea
                      value={draft.notes}
                      onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
                    />
                  </div>
                  {editingId && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked }))}
                        className="w-4 h-4 accent-mustard-500"
                      />
                      <span className="text-xs text-sand-700">פעיל (מופיע ברשימת המחזורים להקצאה)</span>
                    </label>
                  )}
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                      style={{ background: '#E7C78A' }}
                    >
                      {saving ? '...' : <><Check className="w-4 h-4" /> שמירה</>}
                    </button>
                    <button
                      onClick={cancelForm}
                      className="px-3 py-2 rounded-xl bg-sand-100 text-sand-600 text-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {!showForm && (
                <button
                  onClick={startCreate}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold text-mustard-700 bg-mustard-50 hover:bg-mustard-100 border-2 border-dashed border-mustard-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  הוסיפי מחזור
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete
          ? `המחזור (${counts[pendingDelete.id] ?? 0} הרשמות יישארו ללא שיוך)`
          : 'המחזור'}
        title="מחיקת מחזור"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
