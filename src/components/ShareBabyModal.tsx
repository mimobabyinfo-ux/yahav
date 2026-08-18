import { useState } from 'react'
import { X, Copy, Check, MessageCircle, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SHARE_ROLES, type ShareRole, roleDef } from '../constants/shareRoles'

// Sharing the journal with family.
//
// Brenda 17.8.26, first: "drop 'pick a role' and 'create a link', leave
// only 'share with family'." Then, on seeing it: "you took out אבא, דודה,
// the name and so on — put that back."
//
// Both notes are the same note. What was wrong was the CHAIN — a menu
// holding a single option, then a form, then the link: three screens for
// one outcome. The role and the recipient's name were never the problem;
// they are what makes the WhatsApp message say "היי סבתא!" instead of
// "היי!". So the chain is gone and the content stayed: one screen with
// the roles, the optional name, and the button.
//
// The invite is created on tap, not on open, so closing without sharing
// leaves no live token behind. The mother's `families` row is still
// lazy-created here on her first invite.

type Stage =
  | { kind: 'form' }
  | { kind: 'ready'; token: string; role: ShareRole | null; recipientName: string }

export default function ShareBabyModal({ onClose }: { onClose: () => void }) {
  const { profile, selectedChild, createFamilyInvite, createFamily, refreshProfile } = useAuth()
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [role, setRole] = useState<ShareRole | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baby = selectedChild

  // Brenda 17.8.26: the anonymous view-only link is gone. Sharing a baby's
  // day with anyone holding a URL was the one route into this app that
  // asked nobody's permission, and she does not want it offered.

  async function share() {
    if (!baby?.id || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // Lazy-create the mother's family on her very first invite. Capture
      // the id from createFamily's return value — reading profile.family_id
      // after the await still sees the stale closure.
      let familyId = profile?.family_id ?? null
      if (!familyId) {
        const familyName = profile?.mother_name ? `המשפחה של ${profile.mother_name}` : 'המשפחה שלי'
        familyId = await createFamily(familyName)
        await refreshProfile()
      }
      if (!familyId) throw new Error('no family')
      const name = recipientName.trim()
      const token = await createFamilyInvite(baby.id, {
        role: role ?? undefined, recipientName: name, familyId,
      })
      if (!token) throw new Error('no token')
      setStage({ kind: 'ready', token, role, recipientName: name })
    } catch {
      setError('לא הצלחנו ליצור את הלינק. נסי שוב')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div
        className="bg-[#F5F1EB] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100 flex-shrink-0">
          <h3 className="font-bold text-sand-800">
            {stage.kind === 'ready' ? 'הלינק מוכן' : 'שיתוף עם בני משפחה'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600" aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {stage.kind === 'ready' ? (
            <ShareLink
              babyName={baby?.name ?? null}
              motherName={profile?.mother_name ?? null}
              token={stage.token}
              role={stage.role}
              recipientName={stage.recipientName}
              copied={copied}
              onCopy={(link) => {
                navigator.clipboard.writeText(link).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
            />
          ) : !baby?.id ? (
            <div className="p-5 text-center text-sm text-sand-500">
              בחרי תינוק כדי לשתף את היומן שלו.
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-2">מי מקבל גישה?</label>
                <div className="flex flex-wrap gap-2">
                  {SHARE_ROLES.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setRole(cur => (cur === r.id ? null : r.id))}
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
                  ההודעה תפתח ב"היי {recipientName.trim() || roleDef(role)?.label || '…'}!"
                </p>
              </div>

              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              <button
                onClick={share}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white text-sm transition-all disabled:opacity-50"
                style={{ background: '#818267' }}
              >
                <Users className="w-5 h-5" />
                {submitting ? 'יוצרת לינק…' : 'שתפי עם בני משפחה'}
              </button>

              <p className="text-[11px] text-sand-400 text-center leading-relaxed">
                מי שיקבל את הלינק יראה את היומן של {baby.name} בדיוק כמו שאת רואה אותו.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ShareLinkProps = {
  babyName: string | null
  motherName: string | null
  token: string
  role: ShareRole | null
  recipientName: string
  copied: boolean
  onCopy: (link: string) => void
}

function ShareLink({ babyName, motherName, token, role, recipientName, copied, onCopy }: ShareLinkProps) {
  const joinLink = `${window.location.origin}?join=${token}`
  const greeting = recipientName.trim() || roleDef(role)?.label || 'שלום'
  const message = [
    `היי ${greeting}!`,
    `${motherName ?? 'אמא'} משתפת איתך את היומן של ${babyName ?? 'התינוק'} ב-Mimo.`,
    '',
    'לחצו על הלינק כדי להיכנס:',
    joinLink,
  ].join('\n')

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-sand-200">
        <p className="text-[11px] font-semibold text-sand-500 mb-1">תצוגה מקדימה של ההודעה</p>
        <p className="text-xs text-sand-700 whitespace-pre-line leading-relaxed">{message}</p>
      </div>

      <button
        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')}
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
        הלינק תקף 30 ימים. ניתן לבטל גישה בכל רגע מהגדרות ← ניהול שיתופים.
      </p>
    </div>
  )
}
