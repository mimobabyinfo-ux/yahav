import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, MessageCircle, Mail, ChevronDown, ChevronUp, Loader2, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  lookupCustomer,
  type CustomerKey,
  type CustomerProfile,
  type CustomerCandidate,
  type CustomerRegistration,
  type CustomerFormSubmission,
} from './customerLookup'

// Phase 5 / A2 Part 3: the unified customer card.
//
// Sizing contract (the user's hard requirement):
//   - Desktop: centered card, max-w-2xl, max-h-[85vh].
//   - Mobile : edge-to-edge with a small inset, near-fullscreen.
// Type sizes:
//   - Headers: text-lg-to-xl
//   - Body / Q&A: text-sm base, text-base for primary content,
//     leading-relaxed throughout. Same A4 Q/A hierarchy reused for
//     questionnaire answers.
//
// Content layout:
//   [Sticky header]    name + close
//   [Top section]      contact buttons + status + cohort + questionnaire indicator
//   [Scrollable body]  registrations list / questionnaire / staff notes
//
// Routing: opened via useOpenCustomer() context. When the lookup
// returns multiple candidates, we show a small chooser first; the
// admin clicks one to load that person's full card.

type Props = {
  initialKey: CustomerKey
  onClose: () => void
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'chooser'; candidates: CustomerCandidate[] }
  | { kind: 'loaded'; profile: CustomerProfile }

export default function CustomerCardModal({ initialKey, onClose }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [activeKey, setActiveKey] = useState<CustomerKey>(initialKey)

  const load = useCallback(async (key: CustomerKey) => {
    setView({ kind: 'loading' })
    const result = await lookupCustomer(key)
    if (result.kind === 'one') setView({ kind: 'loaded', profile: result.profile })
    else if (result.kind === 'many') setView({ kind: 'chooser', candidates: result.candidates })
    else setView({ kind: 'none' })
  }, [])

  useEffect(() => { load(activeKey) }, [load, activeKey])

  function pickCandidate(c: CustomerCandidate) {
    setActiveKey({ phone: c.phone ?? c.key.normalizedPhone, email: c.key.email })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch lg:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-3 lg:p-6"
      onClick={onClose}
      dir="rtl"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white w-full lg:max-w-2xl h-full lg:max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky header */}
        <div className="px-5 py-4 border-b border-sand-200 flex-shrink-0 flex items-center justify-between gap-3">
          <h2 className="text-lg lg:text-xl font-bold text-sand-800 truncate">
            {view.kind === 'loaded' ? view.profile.displayName : 'כרטיס לקוחה'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 flex-shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {view.kind === 'loading' && (
            <div className="flex items-center justify-center py-20 text-sand-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {view.kind === 'none' && (
            <div className="px-6 py-16 text-center space-y-2">
              <p className="text-4xl">🔍</p>
              <p className="text-sm font-semibold text-sand-700">לא נמצאה התאמה</p>
              <p className="text-xs text-sand-500">
                לא נמצאה לקוחה לפי הטלפון או האימייל שנבחרו.
              </p>
            </div>
          )}

          {view.kind === 'chooser' && (
            <ChooserView candidates={view.candidates} onPick={pickCandidate} />
          )}

          {view.kind === 'loaded' && <ProfileView profile={view.profile} onProfileChanged={() => load(activeKey)} />}
        </div>
      </div>
    </div>
  )
}

// ─── Chooser ────────────────────────────────────────────────────────
function ChooserView({
  candidates,
  onPick,
}: {
  candidates: CustomerCandidate[]
  onPick: (c: CustomerCandidate) => void
}) {
  return (
    <div className="p-5 space-y-3">
      <p className="text-sm text-sand-600 leading-relaxed">
        נמצאו {candidates.length} התאמות שונות. בחרי את הלקוחה המתאימה:
      </p>
      {candidates.map((c, i) => (
        <button
          key={`${c.key.normalizedPhone ?? ''}-${c.key.email ?? ''}-${i}`}
          type="button"
          onClick={() => onPick(c)}
          className="w-full text-right rounded-2xl bg-[#F5F1EB] hover:bg-mustard-50 hover:ring-2 hover:ring-mustard-300 p-4 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-sand-800 flex-1 truncate">{c.displayName}</span>
            <ChevronLeft className="w-4 h-4 text-sand-400 flex-shrink-0" />
          </div>
          <div className="text-xs text-sand-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {c.phone && <span dir="ltr">{c.phone}</span>}
            {c.email && <span dir="ltr">{c.email}</span>}
            <span>·</span>
            <span>{c.registrationCount} הרשמות</span>
            {c.hasUserProfile && <span>· משתמשת רשומה</span>}
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Profile body ───────────────────────────────────────────────────
function ProfileView({
  profile,
  onProfileChanged,
}: {
  profile: CustomerProfile
  onProfileChanged: () => void
}) {
  // Latest registration = top-of-card "current" status + cohort +
  // questionnaire indicator. Older ones appear in the registrations
  // list below.
  const latest = profile.registrations[0] ?? null
  const phoneDigits = (profile.phone ?? '').replace(/\D/g, '')
  const waHref = phoneDigits
    ? `https://wa.me/${phoneDigits.startsWith('0') ? '972' + phoneDigits.slice(1) : phoneDigits}?text=${encodeURIComponent('היי ' + profile.displayName + '! 🤍')}`
    : null

  return (
    <div className="px-5 py-4 space-y-5">
      {/* Top contact + status block */}
      <div className="space-y-3">
        {(profile.phone || profile.email) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-sand-700">
            {profile.phone && <span className="font-semibold" dir="ltr">{profile.phone}</span>}
            {profile.email && <span className="text-sand-500" dir="ltr">{profile.email}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          )}
          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email
            </a>
          )}
        </div>

        {latest && (
          <div className="rounded-2xl bg-[#F5F1EB] p-4 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={latest.status} />
              {latest.workshop && (
                <span className="text-sm font-semibold text-sand-700">
                  {latest.workshop.title}
                </span>
              )}
              {latest.cohort && (
                <span className="text-xs text-sand-500">
                  · {formatCohortDate(latest.cohort.start_date, latest.cohort.start_time)}
                  {latest.cohort.label ? ` · ${latest.cohort.label}` : ''}
                </span>
              )}
            </div>
            {latest.workshop?.linked_form_id && (
              <QuestionnaireHeaderRow
                linkedFormId={latest.workshop.linked_form_id}
                profile={profile}
              />
            )}
          </div>
        )}
      </div>

      {/* Registrations history */}
      <Section title={`הרשמות (${profile.registrations.length})`}>
        {profile.registrations.length === 0 ? (
          <p className="text-sm text-sand-500">אין הרשמות.</p>
        ) : (
          <div className="space-y-2">
            {profile.registrations.map(r => (
              <RegistrationRow key={r.id} reg={r} profile={profile} />
            ))}
          </div>
        )}
      </Section>

      {/* Linked questionnaires (when filled) */}
      {profile.formSubmissions.length > 0 && (
        <Section title="שאלונים שמולאו">
          <div className="space-y-3">
            {profile.formSubmissions.map(sub => (
              <FormSubmissionInline key={sub.id} submission={sub} />
            ))}
          </div>
        </Section>
      )}

      {/* Staff notes */}
      <Section title="הערות פנימיות">
        <StaffNotesEditor profile={profile} onSaved={onProfileChanged} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-base font-bold text-sand-800 border-b border-sand-200 pb-1.5">{title}</h3>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'paid' | 'handled' }) {
  const cfg = {
    pending: { label: '⏳ ממתינה', color: '#b45309', bg: '#fef3c7' },
    paid:    { label: '✅ שילמה',  color: '#15803d', bg: '#dcfce7' },
    handled: { label: '🎓 מומש',   color: '#475569', bg: '#f1f5f9' },
  }[status]
  return (
    <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function formatCohortDate(date: string, time: string | null): string {
  const [y, m, d] = date.split('-')
  const t = time ? ` ${time.slice(0, 5)}` : ''
  return `${d}/${m}/${y.slice(2)}${t}`
}

// ─── Questionnaire indicator (top header line) ──────────────────────
function QuestionnaireHeaderRow({
  linkedFormId,
  profile,
}: {
  linkedFormId: string
  profile: CustomerProfile
}) {
  const sub = profile.formSubmissions.find(s => s.form_id === linkedFormId) ?? null
  const formTitle = sub?.form?.title ?? 'שאלון התפתחותי'
  if (sub) {
    return (
      <p className="text-sm text-sand-700">
        <span className="font-semibold">✅ {formTitle} — מולא</span>
        <span className="text-xs text-sand-500"> · {new Date(sub.created_at).toLocaleDateString('he-IL')}</span>
      </p>
    )
  }
  return (
    <p className="text-sm text-amber-700">
      <span className="font-semibold">⚠️ {formTitle} — טרם מולא</span>
    </p>
  )
}

// ─── Registration history row ──────────────────────────────────────
function RegistrationRow({ reg, profile }: { reg: CustomerRegistration; profile: CustomerProfile }) {
  const linkedFormId = reg.workshop?.linked_form_id ?? null
  const sub = linkedFormId
    ? profile.formSubmissions.find(s => s.form_id === linkedFormId) ?? null
    : null
  return (
    <div className="rounded-2xl bg-[#F5F1EB] p-3.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={reg.status} />
        <span className="text-sm font-semibold text-sand-800 flex-1 min-w-0 truncate">
          {reg.workshop?.title ?? 'ללא סדנה'}
        </span>
      </div>
      <p className="text-xs text-sand-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {reg.cohort
          ? <span>📅 {formatCohortDate(reg.cohort.start_date, reg.cohort.start_time)}{reg.cohort.label ? ` · ${reg.cohort.label}` : ''}</span>
          : <span className="text-sand-400">ללא מחזור</span>}
        <span>· נרשמה {new Date(reg.created_at).toLocaleDateString('he-IL')}</span>
        {reg.source && <span>· מקור: {reg.source}</span>}
      </p>
      {linkedFormId && (
        <p className={`text-xs font-semibold ${sub ? 'text-green-700' : 'text-amber-700'}`}>
          {sub ? `✅ שאלון מולא (${new Date(sub.created_at).toLocaleDateString('he-IL')})` : '⚠️ שאלון טרם מולא'}
        </p>
      )}
    </div>
  )
}

// ─── Inline form submission (A4 Q/A styling) ────────────────────────
function FormSubmissionInline({ submission }: { submission: CustomerFormSubmission }) {
  const [expanded, setExpanded] = useState(false)
  const form = submission.form
  if (!form) return null
  const inputFields = form.fields_json.filter(f => f.type !== 'info' && f.type !== 'link')
  return (
    <div className="rounded-2xl bg-[#F5F1EB] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-right px-4 py-3 flex items-center justify-between gap-2 hover:bg-sand-50/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-sand-800 truncate">{form.title}</p>
          <p className="text-xs text-sand-500">{new Date(submission.created_at).toLocaleDateString('he-IL')}</p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-sand-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-sand-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-sand-200/60 space-y-4">
          {inputFields.map(field => {
            const val = submission.responses_json[field.label]
            if (val === undefined || val === '' || val === null) return null
            return (
              <div key={field.id} className="border-r-[3px] border-mustard-300 pr-3">
                <p className="text-sm font-bold text-mustard-700 mb-1 leading-snug">{field.label}</p>
                <p className="text-base text-sand-800 leading-relaxed whitespace-pre-line break-words">
                  {String(val)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Staff notes ────────────────────────────────────────────────────
function StaffNotesEditor({ profile, onSaved }: { profile: CustomerProfile; onSaved: () => void }) {
  const initial = useMemo(() => profile.user?.staff_notes ?? '', [profile.user?.staff_notes])
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  if (!profile.user) {
    return (
      <div className="rounded-2xl bg-[#F5F1EB] p-4 text-center">
        <p className="text-sm text-sand-500">
          ניתן להוסיף הערות אחרי שהיא תפתח חשבון.
        </p>
      </div>
    )
  }

  async function save() {
    if (!profile.user) return
    if (text === initial) return
    setSaving(true)
    const { error } = await supabase
      .from('user_profiles')
      .update({ staff_notes: text || null })
      .eq('id', profile.user.id)
    setSaving(false)
    if (!error) {
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      onSaved()
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        rows={4}
        placeholder="כתבי כאן הערות פנימיות..."
        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm text-sand-800 leading-relaxed focus:outline-none focus:border-mustard-400 resize-none"
      />
      <div className="flex items-center justify-between text-xs text-sand-400">
        <span>נשמר אוטומטית בעת יציאה משדה הטקסט.</span>
        {saving && <span>שומרת...</span>}
        {savedFlash && <span className="text-green-600 font-semibold">✓ נשמר</span>}
      </div>
    </div>
  )
}
