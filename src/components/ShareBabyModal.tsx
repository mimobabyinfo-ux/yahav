import { useState } from 'react'
import { X, Copy, Check, MessageCircle, Users, ChevronRight, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SHARE_ROLES, type ShareRole, roleDef } from '../constants/shareRoles'

// Phase 4 / C1: the share modal now exposes TWO flows.
//   1. "שתפי עם בני משפחה" — picks a role (5 chips), optionally a custom
//      name, and creates a family_invite_tokens row. The recipient lands
//      via ?join=<token>, signs in as an anonymous guest, and gets the
//      full role-aware journal experience.
//   2. "שיתוף מהיר אנונימי" — the legacy children.share_token link.
//      Anyone with the URL sees today's stats; no signup, no role.
//
// Inside the family-share flow we lazy-create the mom's `families` row
// on first invite — keeps the UX one-tap (mom doesn't need a separate
// "create family" step she'd have no reason to think about).

type Stage =
  | { kind: 'menu' }
  | { kind: 'family-form' }
  | { kind: 'family-success'; token: string; role: ShareRole | null; recipientName: string }

export default function ShareBabyModal({ onClose }: { onClose: () => void }) {
  const { profile, selectedChild, createFamilyInvite, createFamily, refreshProfile } = useAuth()
  const [stage, setStage] = useState<Stage>({ kind: 'menu' })
  const [copiedJoin, setCopiedJoin] = useState(false)

  const baby = selectedChild

  // Brenda 17.8.26: the anonymous view-only link is gone. Sharing a baby's
  // day with anyone holding a URL was the one route into this app that
  // asked nobody's permission, and she does not want it offered.

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div
        className="bg-[#F5F1EB] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {stage.kind !== 'menu' && (
              <button
                onClick={() => setStage({ kind: 'menu' })}
                className="p-1.5 text-sand-400 hover:text-sand-700"
                aria-label="חזרה"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <h3 className="font-bold text-sand-800">
              {stage.kind === 'menu' && 'שיתוף יומן'}
              {stage.kind === 'family-form' && 'שיתוף עם בני משפחה'}
              {stage.kind === 'family-success' && 'הלינק מוכן'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {stage.kind === 'menu' && (
            <MenuView onOpenFamily={() => setStage({ kind: 'family-form' })} />
          )}

          {stage.kind === 'family-form' && (
            <FamilyForm
              childId={baby?.id ?? null}
              hasFamily={!!profile?.family_id}
              motherName={profile?.mother_name ?? null}
              onCreate={async (role, recipientName) => {
                if (!baby?.id) return
                // Lazy-create the mom's family on the very first invite.
                // Capture the family ID immediately from createFamily's return
                // value — reading profile?.family_id after await would still
                // see the stale closure value before React re-renders.
                let familyId = profile?.family_id ?? null
                if (!familyId) {
                  const familyName = profile?.mother_name
                    ? `המשפחה של ${profile.mother_name}`
                    : 'המשפחה שלי'
                  familyId = await createFamily(familyName)
                  await refreshProfile()
                }
                if (!familyId) return
                const token = await createFamilyInvite(baby.id, { role, recipientName, familyId })
                if (token) {
                  setStage({ kind: 'family-success', token, role, recipientName })
                }
              }}
            />
          )}

          {stage.kind === 'family-success' && (
            <FamilySuccess
              babyName={baby?.name ?? null}
              motherName={profile?.mother_name ?? null}
              token={stage.token}
              role={stage.role}
              recipientName={stage.recipientName}
              copied={copiedJoin}
              onCopy={(link) => {
                navigator.clipboard.writeText(link).then(() => {
                  setCopiedJoin(true)
                  setTimeout(() => setCopiedJoin(false), 2000)
                })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Menu view: family share, the only sharing route there is.
// ───────────────────────────────────────────────────────────────────────────

function MenuView({ onOpenFamily }: { onOpenFamily: () => void }) {
  return (
    <div className="p-5 space-y-4">
      {/* Section 1 — family share (primary, prominent) */}
      <button
        onClick={onOpenFamily}
        className="w-full text-right rounded-2xl p-4 bg-gradient-to-l from-mustard-50 to-white border-2 border-mustard-300 hover:border-mustard-400 transition-colors space-y-2"
      >
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-mustard-600 flex-shrink-0" />
          <p className="font-bold text-sand-800">שתפי עם בני משפחה</p>
          <ChevronRight className="w-4 h-4 text-mustard-500 mr-auto rotate-180" />
        </div>
        <p className="text-sm font-bold text-mustard-700">בחרי תפקיד וצרי לינק ←</p>
      </button>

    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Family-share form: role chips + optional recipient name + create button
// ───────────────────────────────────────────────────────────────────────────

type FamilyFormProps = {
  childId: string | null
  hasFamily: boolean
  motherName: string | null
  onCreate: (role: ShareRole, recipientName: string) => Promise<void>
}

function FamilyForm({ childId, hasFamily: _hasFamily, motherName: _motherName, onCreate }: FamilyFormProps) {
  const [role, setRole] = useState<ShareRole | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!role || !childId || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(role, recipientName.trim())
    } catch {
      setError('שגיאה ביצירת הלינק. נסי שנית')
    } finally {
      setSubmitting(false)
    }
  }

  if (!childId) {
    return (
      <div className="p-5 text-center text-sm text-sand-500">
        בחרי תינוק כדי לשתף את היומן שלו.
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-sand-600 mb-2">מי מקבל גישה?</label>
        <div className="flex flex-wrap gap-2">
          {SHARE_ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={`px-3 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                role === r.id
                  ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                  : 'border-sand-200 text-sand-600 hover:border-sand-300'
              }`}
            >
              <span className="ml-1">{r.emoji}</span>{r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-sand-600 mb-1">
          השם של מי שמקבל (אופציונלי)
        </label>
        <input
          type="text"
          value={recipientName}
          onChange={e => setRecipientName(e.target.value)}
          placeholder="למשל: דני"
          maxLength={40}
          className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
        />
        <p className="text-[11px] text-sand-400 mt-1">
          ההודעה תגיד "היי {recipientName.trim() || (role ? roleDef(role)?.label : '__')}!" במקום ברכה כללית.
        </p>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={!role || submitting}
        className="w-full bg-gradient-to-r from-mustard-500 to-mustard-600 hover:from-mustard-600 hover:to-mustard-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg disabled:opacity-40"
      >
        {submitting ? 'יוצרת לינק…' : 'צרי לינק'}
      </button>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Success view: WhatsApp share + copy link
// ───────────────────────────────────────────────────────────────────────────

type FamilySuccessProps = {
  babyName: string | null
  motherName: string | null
  token: string
  role: ShareRole | null
  recipientName: string
  copied: boolean
  onCopy: (link: string) => void
}

function FamilySuccess({ babyName, motherName, token, role, recipientName, copied, onCopy }: FamilySuccessProps) {
  const appBase = window.location.origin
  const joinLink = `${appBase}?join=${token}`
  const def = roleDef(role)
  const greeting = recipientName.trim() || def?.label || 'שלום'
  const message = [
    `היי ${greeting}!`,
    `${motherName ?? 'אמא'} משתפת איתך את היומן של ${babyName ?? 'התינוק'} ב-Mimo.`,
    '',
    'לחצי על הלינק כדי להיכנס:',
    joinLink,
  ].join('\n')

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-sand-200">
        <p className="text-[11px] font-semibold text-sand-500 mb-1">תצוגה מקדימה של ההודעה</p>
        <p className="text-xs text-sand-700 whitespace-pre-line leading-relaxed">{message}</p>
      </div>

      <button
        onClick={shareWhatsApp}
        className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
      >
        <MessageCircle className="w-5 h-5" />
        שלחי ב-WhatsApp
      </button>

      <button
        onClick={() => onCopy(joinLink)}
        className="w-full flex items-center justify-center gap-2 border-2 border-sand-200 text-sand-700 font-semibold py-3 rounded-2xl text-sm transition-all hover:bg-sand-50"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        {copied ? 'הלינק הועתק' : 'העתק לינק'}
      </button>

      <p className="text-[11px] text-sand-400 text-center leading-relaxed">
        הלינק תקף 30 ימים. ניתן לבטל גישה בכל רגע מהגדרות → ניהול שיתופים.
      </p>
    </div>
  )
}
