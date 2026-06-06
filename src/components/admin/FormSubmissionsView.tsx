import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircle, Mail, Trash2, ChevronDown, ChevronUp, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  resolveSubmitter,
  findRegistrationMatch,
  normalizePhone,
  type FieldRole,
  type LeadMatch,
} from './formSubmissionResolver'
import { useOpenCustomer } from './CustomerCardContext'

// Phase 5 / A4: replaces the cramped side-panel-per-respondent with
// expand-inline rows that are comfortably readable on mobile.
// Question labels at text-xs, answers at text-sm with leading-relaxed —
// the deliberate type-size bump is the readability win.

type FormField = {
  id: string
  type: 'text' | 'textarea' | 'select' | 'rating' | 'date' | 'info' | 'link'
  label: string
  options?: string[]
  required?: boolean
  role?: FieldRole
}

type FormRecord = {
  id: string
  title: string
  fields_json: FormField[]
}

type Submission = {
  id: string
  user_id: string | null
  responses_json: Record<string, unknown>
  created_at: string
  user_profiles?: { mother_name: string | null; email: string | null } | null
}

type Props = {
  form: FormRecord
  submissions: Submission[]
  onDeleteSubmission: (id: string) => void
  /** Fired after the admin saves field-role overrides — parent should
   *  reload the form (fields_json changed) so the resolver re-runs. */
  onFormSaved: () => void
  /** Polish #9: when provided, a submission for which this returns
   *  true is tagged with a "✨ חדש" pill inline. Caller decides what
   *  "new" means (typically: created_at > last-seen timestamp). */
  isNewSubmission?: (s: Submission) => boolean
}

export default function FormSubmissionsView({ form, submissions, onDeleteSubmission, onFormSaved, isNewSubmission }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showFieldRoles, setShowFieldRoles] = useState(false)
  // Cache of every registration_leads row's identity for the
  // "🔗 רשומה גם בהרשמות" badge. Light projection — admin scale.
  const [leads, setLeads] = useState<LeadMatch[]>([])

  useEffect(() => {
    supabase
      .from('registration_leads')
      .select('id, phone, email')
      .then(({ data }) => setLeads((data ?? []) as LeadMatch[]))
  }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (submissions.length === 0) {
    return (
      <p className="text-center text-sand-400 text-sm py-10">אין תשובות עדיין</p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Field-role override panel toggle. Inline expand — not a modal. */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowFieldRoles(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-sand-500 hover:text-sand-700 underline underline-offset-2"
          title="הגדרת אילו שדות מכילים שם / טלפון / אימייל"
        >
          <Settings className="w-3 h-3" />
          {showFieldRoles ? 'סגרי זיהוי שדות' : 'זיהוי שדות'}
        </button>
      </div>
      {showFieldRoles && (
        <FieldRolesPanel
          form={form}
          submissions={submissions}
          onSaved={() => { setShowFieldRoles(false); onFormSaved() }}
        />
      )}

      {submissions.map(s => (
        <SubmissionRow
          key={s.id}
          form={form}
          submission={s}
          leads={leads}
          expanded={expanded.has(s.id)}
          onToggle={() => toggle(s.id)}
          onDelete={() => {
            if (window.confirm('למחוק תשובה? לא ניתן לשחזר')) onDeleteSubmission(s.id)
          }}
          isNew={isNewSubmission?.(s) ?? false}
        />
      ))}
    </div>
  )
}

// ─── SubmissionRow ──────────────────────────────────────────────────
// One submission as a tappable row. Collapsed view shows resolved
// identity + date + 1-line preview. Expanded shows every answer with
// a readable type-size, plus WA/email/delete actions.

type RowProps = {
  form: FormRecord
  submission: Submission
  leads: LeadMatch[]
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  /** Polish #9: tag the row with a "✨ חדש" pill when true. */
  isNew?: boolean
}

function SubmissionRow({ form, submission, leads, expanded, onToggle, onDelete, isNew }: RowProps) {
  const resolved = useMemo(() => resolveSubmitter(form, submission), [form, submission])
  const match = useMemo(() => findRegistrationMatch(resolved, leads), [resolved, leads])
  // Phase 5 / A2 Part 3: submitter name + 🔗 badge open the unified
  // customer card. Resolver gives us a phone or email to key on.
  const openCustomer = useOpenCustomer()
  const canOpenCard = !!(resolved.phone || resolved.email)
  function openCardFor() {
    openCustomer({ phone: resolved.phone, email: resolved.email })
  }

  // Display fallback chain: name → phone → "אנונימי"
  const displayName = resolved.name ?? resolved.phone ?? 'אנונימי'

  // First non-identity text answer used as the inline preview so admin
  // can scan rows without expanding them.
  const previewAnswer = useMemo(() => {
    for (const f of form.fields_json) {
      if (f.type === 'info' || f.type === 'link') continue
      const role = resolved.roleByLabel[f.label]
      if (role === 'name' || role === 'phone' || role === 'email') continue
      const v = submission.responses_json[f.label]
      const s = v == null ? '' : String(v).trim()
      if (s) return s
    }
    return null
  }, [form, submission, resolved])

  const phoneDigits = normalizePhone(resolved.phone)
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.startsWith('0') ? '972' + phoneDigits.slice(1) : phoneDigits}?text=${encodeURIComponent('היי!')}`
    : null

  return (
    <div className={`bg-[#F5F1EB] rounded-2xl shadow-sm overflow-hidden ${expanded ? 'ring-2 ring-mustard-300' : ''}`}>
      {/* Collapsed header — always rendered. role=button so keyboard
          users can expand. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="w-full text-right px-4 py-3 cursor-pointer hover:bg-sand-50/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {canOpenCard ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openCardFor() }}
                  className="text-sm font-bold text-sand-800 hover:text-mustard-600 hover:underline underline-offset-2 transition-colors truncate text-right"
                  title="פתיחת כרטיס לקוחה"
                >
                  {displayName}
                </button>
              ) : (
                <span className="text-sm font-bold text-sand-800 truncate">{displayName}</span>
              )}
              {/* Polish #9: inline "new since you last opened this form" pill. */}
              {isNew && (
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                  ✨ חדש
                </span>
              )}
              {resolved.source === 'responses' && (
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                  מקור: טופס
                </span>
              )}
              {resolved.source === 'none' && (
                <span className="text-[10px] font-semibold text-sand-500 bg-sand-100 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                  אנונימי
                </span>
              )}
              {match && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openCardFor() }}
                  className="text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded-md whitespace-nowrap transition-colors"
                  title="פתיחת כרטיס לקוחה"
                >
                  🔗 רשומה גם בהרשמות
                </button>
              )}
            </div>
            <p className="text-xs text-sand-500 mt-0.5">
              {new Date(submission.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              {resolved.phone && resolved.source === 'responses' && <> · <span dir="ltr">{resolved.phone}</span></>}
            </p>
            {previewAnswer && !expanded && (
              <p className="text-xs text-sand-600 mt-1 line-clamp-1">"{previewAnswer}"</p>
            )}
          </div>
          <div className="flex-shrink-0 pt-1 text-sand-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-sand-200/60 space-y-4">
          {form.fields_json
            .filter(f => f.type !== 'info' && f.type !== 'link')
            .map(field => {
              const val = submission.responses_json[field.label]
              if (val === undefined || val === '' || val === null) return null
              return (
                // Phase 5 / A4 fix-1: each Q/A pair gets a mustard
                // left-accent border + bold mustard question + larger
                // sand answer. The accent + size step + bold color
                // makes Q vs A unmistakable, even on a small screen.
                <div key={field.id} className="border-r-[3px] border-mustard-300 pr-3">
                  <p className="text-sm font-bold text-mustard-700 mb-1 leading-snug">
                    {field.label}
                  </p>
                  <p className="text-base text-sand-800 leading-relaxed whitespace-pre-line break-words">
                    {String(val)}
                  </p>
                </div>
              )
            })}

          {/* Action row — only renders the contact buttons we resolved.
              Delete sits at the start (RTL: visually right edge). */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-sand-200/60">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              מחיקה
            </button>
            <div className="flex flex-wrap gap-2 mr-auto">
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
              {resolved.email && (
                <a
                  href={`mailto:${resolved.email}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                  dir="ltr"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {resolved.email}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FieldRolesPanel ────────────────────────────────────────────────
// Inline override panel. Admin picks per text field: אוטומטי / שם /
// טלפון / אימייל / —. Saves the chosen role back to forms.fields_json
// (no migration — just an extra optional key on each field).

function FieldRolesPanel({
  form,
  submissions,
  onSaved,
}: {
  form: FormRecord
  submissions: Submission[]
  onSaved: () => void
}) {
  const inputFields = useMemo(
    () => form.fields_json.filter(f => f.type !== 'info' && f.type !== 'link'),
    [form.fields_json],
  )

  // Pre-populate the dropdown values from the actual `field.role`. When
  // it's missing, the dropdown shows "אוטומטי" — saving still writes
  // null (key removed) so the heuristic stays in charge.
  const [roles, setRoles] = useState<Record<string, FieldRole | ''>>(() => {
    const initial: Record<string, FieldRole | ''> = {}
    for (const f of inputFields) initial[f.id] = f.role ?? ''
    return initial
  })
  const [saving, setSaving] = useState(false)

  // Show one example value per field so the admin remembers what's
  // inside each (helps when a label like "מספר" is ambiguous).
  const exampleByLabel = useMemo(() => {
    const e: Record<string, string> = {}
    for (const f of inputFields) {
      for (const s of submissions) {
        const v = s.responses_json[f.label]
        const vs = v == null ? '' : String(v).trim()
        if (vs) { e[f.label] = vs.slice(0, 24); break }
      }
    }
    return e
  }, [inputFields, submissions])

  const save = useCallback(async () => {
    setSaving(true)
    // Strip role key when admin chose "אוטומטי" (empty) so the heuristic
    // remains the source of truth. Other roles persist verbatim.
    const next = form.fields_json.map(f => {
      const r = roles[f.id]
      if (r === undefined) return f
      const copy: FormField = { ...f }
      if (!r) {
        delete copy.role
      } else {
        copy.role = r
      }
      return copy
    })
    await supabase.from('forms').update({ fields_json: next }).eq('id', form.id)
    setSaving(false)
    onSaved()
  }, [form, roles, onSaved])

  return (
    <div className="bg-white border-2 border-mustard-200 rounded-2xl p-4 space-y-3">
      <p className="text-xs text-sand-600 leading-relaxed">
        סמני אילו שדות מכילים שם, טלפון או אימייל כדי שזיהוי המגישה יהיה
        מדויק יותר. "אוטומטי" משתמש בזיהוי לפי שם השדה.
      </p>
      <div className="space-y-2">
        {inputFields.map(f => (
          <div key={f.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-sand-800 truncate">{f.label}</p>
              {exampleByLabel[f.label] && (
                <p className="text-[11px] text-sand-400 truncate">דוגמה: {exampleByLabel[f.label]}</p>
              )}
            </div>
            <select
              value={roles[f.id] ?? ''}
              onChange={e => setRoles(r => ({ ...r, [f.id]: (e.target.value || '') as FieldRole | '' }))}
              className="text-xs px-2 py-1.5 rounded-lg border border-sand-200 bg-white focus:outline-none focus:border-mustard-400 flex-shrink-0"
            >
              <option value="">אוטומטי</option>
              <option value="name">שם</option>
              <option value="phone">טלפון</option>
              <option value="email">אימייל</option>
              <option value="none">— לא לזהות</option>
            </select>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
        style={{ background: '#E7C78A' }}
      >
        {saving ? 'שומרת...' : 'שמירה'}
      </button>
    </div>
  )
}
