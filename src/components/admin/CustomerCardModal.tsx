import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, MessageCircle, Mail, Phone, Copy, Check, ChevronDown, ChevronUp, Loader2, ChevronLeft, ChevronRight, Plus, Maximize2, Minimize2 } from 'lucide-react'
import { supabase, type WorkshopCohort } from '../../lib/supabase'
import AddRegistrationModal from './AddRegistrationModal'
import {
  lookupCustomer,
  type CustomerKey,
  type CustomerProfile,
  type CustomerCandidate,
  type CustomerRegistration,
  type CustomerFormSubmission,
} from './customerLookup'

// Screen A / A3: the registrant panel. One person opens as a side
// panel docked to the far edge (left in RTL), stretched to the
// overlay's height (flex column — no vh caps anywhere; a vh cap
// collapsed this panel to ~110px in an earlier attempt).
//
// Layout contract:
//   [Header]   avatar · name · cohort+date · ‹ › · הרחבה · close
//   [Contact]  pinned at the TOP: וואטסאפ · מייל · חיוג
//   [Tabs]     ההרשמה · השאלון · היסטוריה
//   [Body]     scrollable tab content
//   [Footer]   pinned: שמירה + סגירה
//
// הרחבה is a real proportion change: the panel takes the viewport
// minus a ~270px column for the list behind it, and the tab content
// re-flows to two columns.
//
// The identity resolution (lookupCustomer), multi-candidate chooser,
// registration history and questionnaire matching are unchanged —
// only the presentation moved.

// Fired after any write that changes registration rows, so list
// screens (RegistrationsTab) can refetch without prop-drilling
// through the provider.
export const REGISTRATIONS_CHANGED_EVENT = 'mimo:registrations-changed'
function notifyRegistrationsChanged() {
  window.dispatchEvent(new Event(REGISTRATIONS_CHANGED_EVENT))
}

type Props = {
  initialKey: CustomerKey
  onClose: () => void
  /** Position inside the caller's ordered list, for the ‹ › header
   *  arrows. Absent → no arrows. */
  nav?: { index: number; total: number }
  onNavigate?: (delta: number) => void
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'chooser'; candidates: CustomerCandidate[] }
  | { kind: 'loaded'; profile: CustomerProfile }

type PanelTab = 'reg' | 'form' | 'history'

type WorkshopLite = { id: string; title: string; price: number | null; linked_form_id: string | null }

type LeadStage = 'new_lead' | 'contacted' | 'registered' | 'paid' | 'lost'

type Draft = {
  status: 'pending' | 'paid' | 'handled'
  phone: string
  email: string
  workshopId: string
  cohortId: string
  notes: string
  // Screen B / B4: the CRM pipeline stage lives on the person
  // (user_profiles.lead_stage), edited here in the panel. Empty string
  // = no user profile, section hidden.
  leadStage: LeadStage | ''
  lostReason: string
  lostReasonNote: string
}

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new_lead: 'ליד חדש',
  contacted: 'נוצר קשר',
  registered: 'נרשמה',
  paid: 'שילמה',
  lost: 'אבדה',
}

const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'no_response', label: 'לא ענתה' },
  { value: 'price', label: 'המחיר גבוה' },
  { value: 'timing', label: 'התזמון לא התאים' },
  { value: 'chose_other', label: 'בחרה מקום אחר' },
  { value: 'not_relevant', label: 'לא רלוונטי' },
  { value: 'other', label: 'אחר' },
]

function formatCohortDate(date: string, time: string | null): string {
  const [y, m, d] = date.split('-')
  const t = time ? ` ${time.slice(0, 5)}` : ''
  return `${d}/${m}/${y.slice(2)}${t}`
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return parts[0][0] + parts[1][0]
}

function waHrefFor(phone: string | null, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export default function CustomerCardModal({ initialKey, onClose, nav, onNavigate }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [activeKey, setActiveKey] = useState<CustomerKey>(initialKey)
  const [wide, setWide] = useState(false)
  const [tab, setTab] = useState<PanelTab>('reg')
  const [phoneCopied, setPhoneCopied] = useState(false)

  // ‹ › navigation swaps initialKey from the provider — re-seed.
  useEffect(() => { setActiveKey(initialKey) }, [initialKey])

  const load = useCallback(async (key: CustomerKey) => {
    setView({ kind: 'loading' })
    const result = await lookupCustomer(key)
    if (result.kind === 'one') setView({ kind: 'loaded', profile: result.profile })
    else if (result.kind === 'many') setView({ kind: 'chooser', candidates: result.candidates })
    else setView({ kind: 'none' })
  }, [])

  useEffect(() => { load(activeKey) }, [load, activeKey])

  // Workshops + cohorts for the ההרשמה selects — one fetch per mount.
  const [workshops, setWorkshops] = useState<WorkshopLite[]>([])
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: w }, { data: c }] = await Promise.all([
        supabase.from('workshops').select('id, title, price, linked_form_id').order('display_order'),
        supabase.from('workshop_cohorts').select('*').order('start_date', { ascending: false }),
      ])
      if (!alive) return
      setWorkshops((w ?? []) as WorkshopLite[])
      setCohorts((c ?? []) as WorkshopCohort[])
    })()
    return () => { alive = false }
  }, [])

  function pickCandidate(c: CustomerCandidate) {
    setActiveKey({ phone: c.phone ?? c.key.normalizedPhone, email: c.key.email, leadId: activeKey.leadId })
  }

  const profile = view.kind === 'loaded' ? view.profile : null

  // The focused registration: the row the admin clicked (leadId),
  // else the latest. Everything in the ההרשמה + השאלון tabs binds
  // to this one.
  const focused = useMemo<CustomerRegistration | null>(() => {
    if (!profile) return null
    const regs = profile.registrations
    if (activeKey.leadId) {
      const hit = regs.find(r => r.id === activeKey.leadId)
      if (hit) return hit
    }
    return regs[0] ?? null
  }, [profile, activeKey.leadId])

  // ── Draft state for the ההרשמה form (saved by the footer) ──────────
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  useEffect(() => {
    if (!profile) { setDraft(null); return }
    const personFields = {
      notes: profile.user?.staff_notes ?? '',
      leadStage: (profile.user ? (profile.user.lead_stage ?? 'new_lead') : '') as Draft['leadStage'],
      lostReason: profile.user?.lost_reason ?? '',
      lostReasonNote: profile.user?.lost_reason_note ?? '',
    }
    if (!focused) {
      setDraft(profile.user ? {
        status: 'pending', phone: '', email: '', workshopId: '', cohortId: '',
        ...personFields,
      } : null)
      return
    }
    setDraft({
      status: focused.status,
      phone: focused.phone ?? '',
      email: focused.email ?? '',
      workshopId: focused.selected_workshop_id ?? '',
      cohortId: focused.cohort_id ?? '',
      ...personFields,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id, view.kind === 'loaded' ? profile : null])

  const personDirty = useMemo(() => {
    if (!draft || !profile?.user) return false
    return draft.notes !== (profile.user.staff_notes ?? '')
      || draft.leadStage !== (profile.user.lead_stage ?? 'new_lead')
      || (draft.leadStage === 'lost' && (
        draft.lostReason !== (profile.user.lost_reason ?? '')
        || draft.lostReasonNote !== (profile.user.lost_reason_note ?? '')
      ))
  }, [draft, profile])

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!focused) return personDirty
    return personDirty
      || draft.status !== focused.status
      || draft.phone !== (focused.phone ?? '')
      || draft.email !== (focused.email ?? '')
      || draft.workshopId !== (focused.selected_workshop_id ?? '')
      || draft.cohortId !== (focused.cohort_id ?? '')
  }, [draft, focused, profile, personDirty])

  // B4: capture the reason at the moment of loss — save is BLOCKED
  // until a reason is chosen. Not optional, not a later field.
  const lostNeedsReason = !!draft && draft.leadStage === 'lost' && !draft.lostReason

  async function save() {
    if (!draft || saving || !dirty || lostNeedsReason) return
    setSaving(true)
    let ok = true
    if (focused) {
      const { error } = await supabase.from('registration_leads').update({
        status: draft.status,
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        selected_workshop_id: draft.workshopId || null,
        cohort_id: draft.cohortId || null,
      }).eq('id', focused.id)
      if (error) ok = false
    }
    if (ok && profile?.user && personDirty) {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          staff_notes: draft.notes || null,
          lead_stage: draft.leadStage || 'new_lead',
          lost_reason: draft.leadStage === 'lost' ? (draft.lostReason || null) : null,
          lost_reason_note: draft.leadStage === 'lost' ? (draft.lostReasonNote.trim() || null) : null,
        })
        .eq('id', profile.user.id)
      if (error) ok = false
    }
    setSaving(false)
    if (ok) {
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      notifyRegistrationsChanged()
      load(activeKey)
    }
  }

  // ── Delete (two-step inline confirm) ───────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  async function deleteRegistration() {
    if (!focused) return
    const { error } = await supabase.from('registration_leads').delete().eq('id', focused.id)
    if (!error) {
      notifyRegistrationsChanged()
      onClose()
    }
  }

  const contactPhone = focused?.phone ?? profile?.phone ?? null
  const contactEmail = focused?.email ?? profile?.email ?? null
  const waHref = profile ? waHrefFor(contactPhone, `היי ${profile.displayName}! 🤍`) : null
  const telHref = contactPhone ? `tel:${contactPhone.replace(/[^\d+]/g, '')}` : null

  const headerSubtitle = focused
    ? `${focused.workshop?.title ?? 'ללא מוצר'}${focused.cohort ? ` · מחזור ${formatCohortDate(focused.cohort.start_date, focused.cohort.start_time)}` : ''}`
    : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      dir="rtl"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="absolute inset-y-0 left-0 bg-white h-full w-full lg:rounded-r-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200"
        // הרחבה = a real proportion change: the list behind collapses
        // to a ~270px column; the panel takes the rest.
        style={{ maxWidth: wide ? 'calc(100vw - 290px)' : 460 }}
      >
        {/* ── Header: avatar · name · cohort · ‹ › · הרחבה · close ── */}
        <div className="px-5 py-3.5 border-b flex-shrink-0 flex items-center gap-3" style={{ borderColor: '#E9E2D6' }}>
          <span
            className="flex-shrink-0 rounded-full flex items-center justify-center font-bold"
            style={{ width: 38, height: 38, background: '#F1EBE1', color: '#6E5836', fontSize: 14 }}
            aria-hidden="true"
          >
            {view.kind === 'loaded' ? initialsOf(view.profile.displayName) : '·'}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold truncate" style={{ fontSize: 17, color: '#443327' }}>
              {view.kind === 'loaded' ? view.profile.displayName : 'כרטיס לקוחה'}
            </h2>
            {headerSubtitle && (
              <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#8A7A63' }}>{headerSubtitle}</p>
            )}
          </div>
          {nav && onNavigate && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => onNavigate(-1)}
                disabled={nav.index <= 0}
                className="p-1.5 rounded-lg hover:bg-sand-100 text-sand-500 disabled:opacity-30"
                title="הקודמת ברשימה"
                aria-label="הקודמת ברשימה"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-sand-400 px-0.5 whitespace-nowrap">{nav.index + 1}/{nav.total}</span>
              <button
                onClick={() => onNavigate(1)}
                disabled={nav.index >= nav.total - 1}
                className="p-1.5 rounded-lg hover:bg-sand-100 text-sand-500 disabled:opacity-30"
                title="הבאה ברשימה"
                aria-label="הבאה ברשימה"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => setWide(x => !x)}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 flex-shrink-0 hidden lg:block"
            title={wide ? 'צמצום' : 'הרחבה'}
            aria-label={wide ? 'צמצום' : 'הרחבה'}
          >
            {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 flex-shrink-0"
            aria-label="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Contact actions — pinned at the TOP ── */}
        {view.kind === 'loaded' && (
          <div className="px-5 py-2.5 border-b flex-shrink-0 flex items-center gap-2 flex-wrap" style={{ borderColor: '#E9E2D6', background: '#FBF8F3' }}>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all hover:shadow-sm"
                style={{ background: '#C8A460', color: '#33281B', fontSize: 13.5 }}
              >
                <MessageCircle className="w-4 h-4" />
                וואטסאפ
              </a>
            )}
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors hover:bg-[#EDE6DA]"
                style={{ background: '#F1EBE1', color: '#443327', fontSize: 13.5 }}
              >
                <Mail className="w-4 h-4" />
                מייל
              </a>
            )}
            {telHref && (
              <a
                href={telHref}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors hover:bg-[#EDE6DA]"
                style={{ background: '#F1EBE1', color: '#443327', fontSize: 13.5 }}
              >
                <Phone className="w-4 h-4" />
                חיוג
              </a>
            )}
            {contactPhone && (
              <button
                type="button"
                onClick={() => {
                  const digits = contactPhone.replace(/\D/g, '')
                  if (!digits) return
                  navigator.clipboard.writeText(digits).then(() => {
                    setPhoneCopied(true)
                    setTimeout(() => setPhoneCopied(false), 1500)
                  })
                }}
                className="inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[#EDE6DA]"
                style={{ padding: '4px 8px', fontWeight: 600, fontSize: 13, color: phoneCopied ? '#4F5040' : '#8A7A63' }}
                title="העתקת המספר"
                aria-label="העתקת מספר הטלפון"
              >
                <span dir="ltr">{contactPhone}</span>
                {phoneCopied
                  ? <Check style={{ width: 13, height: 13 }} />
                  : <Copy style={{ width: 13, height: 13 }} />}
              </button>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        {view.kind === 'loaded' && (
          <div className="px-5 border-b flex-shrink-0 flex items-center gap-1" style={{ borderColor: '#E9E2D6' }}>
            {([
              ['reg', 'ההרשמה'],
              ['form', 'השאלון'],
              ['history', `היסטוריה (${view.profile.registrations.length})`],
            ] as [PanelTab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="py-2.5 px-3 font-bold transition-colors"
                style={{
                  fontSize: 14,
                  color: tab === t ? '#443327' : '#8A7A63',
                  borderBottom: tab === t ? '2.5px solid #C8A460' : '2.5px solid transparent',
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Scrollable body ── */}
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

          {view.kind === 'loaded' && tab === 'reg' && (
            <RegistrationTabView
              profile={view.profile}
              focused={focused}
              draft={draft}
              setDraft={setDraft}
              workshops={workshops}
              cohorts={cohorts}
              wide={wide}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              onDelete={deleteRegistration}
              onProfileChanged={() => { notifyRegistrationsChanged(); load(activeKey) }}
            />
          )}

          {view.kind === 'loaded' && tab === 'form' && (
            <QuestionnaireTabView profile={view.profile} focused={focused} wide={wide} />
          )}

          {view.kind === 'loaded' && tab === 'history' && (
            <HistoryTabView
              profile={view.profile}
              wide={wide}
              onProfileChanged={() => { notifyRegistrationsChanged(); load(activeKey) }}
            />
          )}
        </div>

        {/* ── Footer — Save + close, pinned at the bottom. The mobile
            bottom padding keeps the admin BottomNav from covering it. ── */}
        {view.kind === 'loaded' && (
          <div className="px-5 pt-3 pb-[96px] lg:pb-3 border-t flex-shrink-0 flex items-center gap-2" style={{ borderColor: '#E9E2D6', background: '#fff' }}>
            <button
              onClick={save}
              disabled={!dirty || saving || lostNeedsReason}
              className="flex-1 py-2.5 rounded-xl font-bold transition-all disabled:opacity-40"
              style={{ background: '#C8A460', color: '#33281B', fontSize: 15 }}
              title={lostNeedsReason ? 'בחרי סיבת אובדן כדי לשמור' : undefined}
            >
              {saving ? 'שומרת...' : savedFlash ? '✓ נשמר' : lostNeedsReason ? 'בחרי סיבת אובדן' : 'שמירה'}
            </button>
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-xl font-bold transition-colors hover:bg-sand-100"
              style={{ color: '#7B604C', fontSize: 15 }}
            >
              סגירה
            </button>
          </div>
        )}
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

// ─── Tab: ההרשמה ────────────────────────────────────────────────────
const inputClass = 'w-full px-3.5 py-2.5 border-2 border-sand-200 rounded-xl text-sm text-sand-800 focus:outline-none focus:border-mustard-400 bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-bold" style={{ fontSize: 12.5, color: '#8A7A63' }}>{label}</p>
      {children}
    </div>
  )
}

function RegistrationTabView({
  profile,
  focused,
  draft,
  setDraft,
  workshops,
  cohorts,
  wide,
  confirmDelete,
  setConfirmDelete,
  onDelete,
  onProfileChanged,
}: {
  profile: CustomerProfile
  focused: CustomerRegistration | null
  draft: Draft | null
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>
  workshops: WorkshopLite[]
  cohorts: WorkshopCohort[]
  wide: boolean
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  onDelete: () => void
  onProfileChanged: () => void
}) {
  if (!draft) {
    return (
      <div className="px-5 py-10 text-center space-y-3">
        <p className="text-sm text-sand-500">אין הרשמות ללקוחה הזו.</p>
        <AddRegistrationButton profile={profile} onSaved={onProfileChanged} />
      </div>
    )
  }

  // A person with a user account but no registration still gets the
  // lead-stage + notes section (B4) — only the registration fields
  // need a focused registration.
  if (!focused) {
    return (
      <div className="px-5 py-4 space-y-4">
        <div className="text-center space-y-3 py-4">
          <p className="text-sm text-sand-500">אין הרשמות ללקוחה הזו.</p>
          <AddRegistrationButton profile={profile} onSaved={onProfileChanged} />
        </div>
        <LeadStageSection draft={draft} setDraft={setDraft} />
        <NotesField profile={profile} draft={draft} setDraft={setDraft} />
      </div>
    )
  }

  const wsCohorts = cohorts.filter(c => c.workshop_id === draft.workshopId)
  const selectedWorkshop = workshops.find(w => w.id === draft.workshopId) ?? null

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Payment status — two options only. מומש is never set by hand:
          effectiveStatus() derives it once the cohort has passed. */}
      <Field label="סטטוס תשלום">
        <div className="flex rounded-xl overflow-hidden border-2" style={{ borderColor: '#E9E2D6' }}>
          {(['pending', 'paid'] as const).map(s => {
            const active = draft.status === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(d => d ? { ...d, status: s } : d)}
                className="flex-1 py-2.5 font-bold transition-colors"
                style={active
                  ? { background: '#C8A460', color: '#33281B', fontSize: 14 }
                  : { background: '#fff', color: '#7B604C', fontSize: 14 }}
              >
                {s === 'pending' ? 'ממתינה' : 'שילמה'}
              </button>
            )
          })}
        </div>
        {draft.status === 'handled' && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#8A7A63' }}>
            מסומנת כמומש. בחירת סטטוס תחליף אותו.
          </p>
        )}
      </Field>

      <div className={wide ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
        <Field label="טלפון">
          <input
            value={draft.phone}
            onChange={e => setDraft(d => d ? { ...d, phone: e.target.value } : d)}
            className={inputClass}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </Field>
        <Field label="אימייל">
          <input
            value={draft.email}
            onChange={e => setDraft(d => d ? { ...d, email: e.target.value } : d)}
            className={inputClass}
            dir="ltr"
            style={{ textAlign: 'right' }}
          />
        </Field>
        <Field label="מוצר">
          <select
            value={draft.workshopId}
            onChange={e => setDraft(d => d ? { ...d, workshopId: e.target.value, cohortId: '' } : d)}
            className={inputClass}
          >
            <option value="">ללא מוצר</option>
            {workshops.map(w => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
        </Field>
        <Field label="מחזור">
          {wsCohorts.length > 0 ? (
            <select
              value={draft.cohortId}
              onChange={e => setDraft(d => d ? { ...d, cohortId: e.target.value } : d)}
              className={inputClass}
            >
              <option value="">ללא מחזור</option>
              {wsCohorts.map(c => (
                <option key={c.id} value={c.id}>
                  {formatCohortDate(c.start_date, c.start_time)}{c.label ? ` · ${c.label}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="py-2.5" style={{ fontSize: 13.5, fontWeight: 600, color: '#8A7A63' }}>
              {draft.workshopId ? 'למוצר הזה אין מחזורים' : '—'}
            </p>
          )}
        </Field>
      </div>

      {selectedWorkshop?.price != null && (
        <Field label="סכום">
          <p style={{ fontSize: 15, fontWeight: 700, color: '#443327' }}>
            ₪{selectedWorkshop.price}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#8A7A63' }}> · לפי מחיר המוצר</span>
          </p>
        </Field>
      )}

      <LeadStageSection draft={draft} setDraft={setDraft} />

      <NotesField profile={profile} draft={draft} setDraft={setDraft} />

      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#A2937D' }}>
        נרשמה {new Date(focused.created_at).toLocaleDateString('he-IL')}
        {focused.source ? ` · מקור: ${focused.source}` : ''}
      </p>

      {/* Delete — two-step inline confirm; no browser dialogs. */}
      <div className="pt-1">
        {confirmDelete ? (
          <span className="inline-flex items-center gap-3">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#8B4A30' }}>למחוק את ההרשמה הזו?</span>
            <button onClick={onDelete} className="font-bold hover:underline" style={{ fontSize: 13.5, color: '#8B4A30' }}>כן, מחקי</button>
            <button onClick={() => setConfirmDelete(false)} className="font-semibold hover:underline" style={{ fontSize: 13.5, color: '#7B604C' }}>ביטול</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="font-bold hover:underline"
            style={{ fontSize: 13.5, color: '#8B4A30' }}
          >
            מחיקת ההרשמה
          </button>
        )}
      </div>
    </div>
  )
}

// ─── B4: lead stage + the inline lost-reason picker ─────────────────
// The stage lives on the person (user_profiles.lead_stage). Choosing
// "אבדה" reveals the reason picker IMMEDIATELY, inline — six fixed
// options plus optional free text — and the panel's save button stays
// blocked until a reason is chosen. Reasons are a fixed enum so the
// insights breakdown can group them; free text goes to
// lost_reason_note alongside, never instead.
function LeadStageSection({ draft, setDraft }: {
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>
}) {
  if (!draft.leadStage) return null
  return (
    <Field label="שלב ליד">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(LEAD_STAGE_LABELS) as LeadStage[]).map(s => {
          const active = draft.leadStage === s
          const isLost = s === 'lost'
          return (
            <button
              key={s}
              type="button"
              onClick={() => setDraft(d => d ? { ...d, leadStage: s } : d)}
              className="rounded-full font-bold transition-all"
              style={active
                ? isLost
                  ? { background: '#F7EBE4', color: '#8B4A30', border: '1.5px solid #E0BFA9', padding: '7px 14px', fontSize: 13 }
                  : { background: '#F6ECD8', color: '#4A3A28', border: '1.5px solid #E7C78A', padding: '7px 14px', fontSize: 13 }
                : { background: '#fff', color: '#7B604C', border: '1px solid #E9E2D6', padding: '7px 14px', fontSize: 13 }}
            >
              {LEAD_STAGE_LABELS[s]}
            </button>
          )
        })}
      </div>
      {draft.leadStage === 'lost' && (
        <div className="space-y-2" style={{ background: '#F7EBE4', border: '1px solid #EDD9CD', borderRadius: 14, padding: '12px 14px', marginTop: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 12.5, color: '#8B4A30' }}>
            {draft.lostReason ? 'למה היא לא נסגרה?' : 'למה היא לא נסגרה? בחרי סיבה כדי לשמור'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LOST_REASONS.map(r => {
              const active = draft.lostReason === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDraft(d => d ? { ...d, lostReason: r.value } : d)}
                  className="rounded-full font-bold transition-all"
                  style={active
                    ? { background: '#8B4A30', color: '#F7EBE4', border: '1.5px solid #8B4A30', padding: '6px 12px', fontSize: 12.5 }
                    : { background: '#fff', color: '#8B4A30', border: '1px solid #E0BFA9', padding: '6px 12px', fontSize: 12.5 }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          <input
            value={draft.lostReasonNote}
            onChange={e => setDraft(d => d ? { ...d, lostReasonNote: e.target.value } : d)}
            placeholder="פירוט חופשי (לא חובה)"
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none"
            style={{ border: '1px solid #E0BFA9', color: '#443327', background: '#fff' }}
          />
        </div>
      )}
    </Field>
  )
}

function NotesField({ profile, draft, setDraft }: {
  profile: CustomerProfile
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>
}) {
  return (
    <Field label="הערות פנימיות">
      {profile.user ? (
        <textarea
          value={draft.notes}
          onChange={e => setDraft(d => d ? { ...d, notes: e.target.value } : d)}
          rows={4}
          placeholder="כתבי כאן הערות פנימיות..."
          className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm text-sand-800 leading-relaxed focus:outline-none focus:border-mustard-400 resize-none"
        />
      ) : (
        <p className="py-1" style={{ fontSize: 13, fontWeight: 600, color: '#8A7A63' }}>
          ניתן להוסיף הערות אחרי שהיא תפתח חשבון.
        </p>
      )}
    </Field>
  )
}

// ─── Tab: השאלון ────────────────────────────────────────────────────
function QuestionnaireTabView({
  profile,
  focused,
  wide,
}: {
  profile: CustomerProfile
  focused: CustomerRegistration | null
  wide: boolean
}) {
  const linkedFormId = focused?.workshop?.linked_form_id ?? null
  if (!focused || !linkedFormId) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-sand-500">
          {focused ? 'למוצר הזה אין שאלון מקושר.' : 'אין הרשמה שמקושרת לשאלון.'}
        </p>
      </div>
    )
  }
  const sub = profile.formSubmissions.find(s => s.form_id === linkedFormId) ?? null

  if (!sub) {
    // Unfilled: one card — when it was sent, and one reminder button.
    const form = profile.linkedForms.find(f => f.id === linkedFormId) ?? null
    const formTitle = form?.title ?? 'השאלון'
    const sentDate = new Date(focused.created_at).toLocaleDateString('he-IL')
    const firstName = profile.displayName.split(' ')[0] ?? ''
    const url = `${window.location.origin}/?form=${linkedFormId}`
    const cohortPart = focused.cohort
      ? ` לקראת ${focused.workshop?.title ?? ''} ${formatCohortDate(focused.cohort.start_date, focused.cohort.start_time)}`
      : focused.workshop?.title ? ` לקראת ${focused.workshop.title}` : ''
    const msg = `היי ${firstName}! זה Mimo ❤️\nעדיין לא קיבלנו ממך את התשובות ל"${formTitle}"${cohortPart}.\nאשמח אם תמלאי כאן: ${url}`
    const reminderHref = waHrefFor(focused.phone ?? profile.phone, msg)
    return (
      <div className="px-5 py-4">
        <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: '#F7EBE4', border: '1px solid #EDD9CD' }}>
          <p className="font-bold" style={{ fontSize: 15, color: '#8B4A30' }}>השאלון עדיין לא מולא</p>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: '#7B604C', lineHeight: 1.6 }}>
            "{formTitle}" נשלח אליה עם ההרשמה ב-{sentDate}.
          </p>
          {reminderHref && (
            <a
              href={reminderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold transition-all hover:shadow-sm"
              style={{ background: '#C8A460', color: '#33281B', fontSize: 14 }}
            >
              <MessageCircle className="w-4 h-4" />
              שליחת תזכורת בוואטסאפ
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 space-y-2">
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#A2937D' }}>
        {sub.form?.title ?? 'שאלון'} · מולא {new Date(sub.created_at).toLocaleDateString('he-IL')}
      </p>
      <div className={wide ? 'grid grid-cols-2 gap-x-6 gap-y-4' : 'space-y-4'}>
        <SubmissionAnswers submission={sub} />
      </div>
    </div>
  )
}

// The A4 Q/A styling — mustard right-border, bold mustard question,
// larger sand answer. Shared by the שאלון tab and the history tab.
function SubmissionAnswers({ submission }: { submission: CustomerFormSubmission }) {
  const form = submission.form
  if (!form) return null
  const inputFields = form.fields_json.filter(f => f.type !== 'info' && f.type !== 'link')
  return (
    <>
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
    </>
  )
}

// ─── Tab: היסטוריה ──────────────────────────────────────────────────
function HistoryTabView({
  profile,
  wide,
  onProfileChanged,
}: {
  profile: CustomerProfile
  wide: boolean
  onProfileChanged: () => void
}) {
  return (
    <div className="px-5 py-4 space-y-5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 border-b border-sand-200 pb-1.5">
          <h3 className="text-base font-bold text-sand-800">הרשמות ({profile.registrations.length})</h3>
          <AddRegistrationButton profile={profile} onSaved={onProfileChanged} />
        </div>
        {profile.registrations.length === 0 ? (
          <p className="text-sm text-sand-500">אין הרשמות.</p>
        ) : (
          <div className={wide ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
            {profile.registrations.map(r => (
              <RegistrationHistoryRow key={r.id} reg={r} profile={profile} />
            ))}
          </div>
        )}
      </div>

      {profile.formSubmissions.length > 0 && (
        <div className="space-y-2.5">
          <div className="border-b border-sand-200 pb-1.5">
            <h3 className="text-base font-bold text-sand-800">שאלונים שמולאו</h3>
          </div>
          <div className="space-y-3">
            {profile.formSubmissions.map(sub => (
              <FormSubmissionInline key={sub.id} submission={sub} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Phase 5 / A2 Stage 3 (Part 3): "+ הוסף הרשמה" — existing-mother
// path. Pre-fills name/phone/email; admin picks workshop+cohort+status.
function AddRegistrationButton({
  profile,
  onSaved,
}: {
  profile: CustomerProfile
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-mustard-50 text-mustard-700 hover:bg-mustard-100 text-xs font-bold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        הוסף הרשמה
      </button>
      {open && (
        <AddRegistrationModal
          mode="existing-mother"
          prefill={{
            name: profile.displayName,
            phone: profile.phone ?? '',
            email: profile.email ?? '',
          }}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'paid' | 'handled' }) {
  const cfg = {
    pending: { label: 'ממתינה', color: '#8B4A30', bg: '#F7EBE4' },
    paid:    { label: 'שילמה',  color: '#35505C', bg: '#EEF2F4' },
    handled: { label: 'מומש',   color: '#6E6852', bg: '#F0EBE3' },
  }[status]
  return (
    <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ─── Registration history row ──────────────────────────────────────
function RegistrationHistoryRow({ reg, profile }: { reg: CustomerRegistration; profile: CustomerProfile }) {
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
        <p className="text-xs font-semibold" style={{ color: sub ? '#4F5040' : '#8B4A30' }}>
          {sub ? `שאלון מולא (${new Date(sub.created_at).toLocaleDateString('he-IL')})` : 'שאלון חסר'}
        </p>
      )}
    </div>
  )
}

// ─── Inline form submission (collapsible, history tab) ──────────────
function FormSubmissionInline({ submission }: { submission: CustomerFormSubmission }) {
  const [expanded, setExpanded] = useState(false)
  const form = submission.form
  if (!form) return null
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
          <SubmissionAnswers submission={submission} />
        </div>
      )}
    </div>
  )
}
