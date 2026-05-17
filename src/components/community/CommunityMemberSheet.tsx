import { X, MessageCircle, MapPin } from 'lucide-react'
import { useOwnerSettings } from '../../hooks/useOwnerSettings'
import { COMMUNITY_TAGS } from '../../constants/communityTags'

// Phase 4 / C2: bottom-sheet profile view for a community member. Opens
// when mom taps a card. Matches the LogEntryModal aesthetic — handle
// bar, tap-backdrop-to-close, X button. The same component handles
// both mom and pregnant members (gender/age vs pregnancy week passed
// in via the `secondaryLine` prop).

type Member = {
  mother_name: string | null
  area: string | null
  phone_number: string | null
  community_consent: boolean | null
  community_bio: string | null
  community_tags: string[] | null
}

type Props = {
  member: Member
  /** "אמא ל-{name} ({age})" or "שבוע 28" — caller composes this. */
  secondaryLine: string
  /** Big avatar emoji at the top (gender or 🤰). */
  avatarEmoji: string
  /** Pre-filled WhatsApp greeting (different copy for mom vs pregnant). */
  whatsappGreeting: string
  /** Fallback message when there's no direct WA — goes to the owner. */
  fallbackGreeting: string
  onClose: () => void
}

function pickTags(ids: string[] | null) {
  if (!ids?.length) return []
  return ids
    .map(id => COMMUNITY_TAGS.find(t => t.id === id))
    .filter((t): t is (typeof COMMUNITY_TAGS)[number] => !!t)
}

export default function CommunityMemberSheet({ member, secondaryLine, avatarEmoji, whatsappGreeting, fallbackGreeting, onClose }: Props) {
  const { ownerWhatsapp } = useOwnerSettings()
  const firstName = member.mother_name?.split(' ')[0] ?? 'אמא'
  const tags = pickTags(member.community_tags ?? null)
  const hasDirectWa = !!(member.community_consent && member.phone_number)

  const directWaHref = hasDirectWa
    ? `https://wa.me/${member.phone_number!.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappGreeting)}`
    : null
  const fallbackHref = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(fallbackGreeting)}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-[72px]" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl flex flex-col max-h-[75vh]">
        {/* Drag-handle visual cue — matches LogEntryModal aesthetic. */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-sand-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-sand-800">פרופיל</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-sand-100 text-sand-400" aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto flex-1 space-y-4">
          {/* Top card — avatar + name + secondary line */}
          <div className="bg-[#F5F1EB] rounded-3xl p-5 text-center space-y-2">
            <div className="text-5xl">{avatarEmoji}</div>
            <p className="text-xl font-bold text-sand-800">{firstName}</p>
            <p className="text-xs text-sand-500">{secondaryLine}</p>
            {member.area && (
              <p className="text-[11px] text-sand-400 flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3" />
                {member.area}
              </p>
            )}
          </div>

          {/* Tags — only render the block when she has at least one */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-sand-600 px-1">מה {firstName} מחפשת</p>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span
                    key={tag.id}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border-2 border-mustard-200 bg-mustard-50 text-mustard-700"
                  >
                    <span className="ml-1">{tag.emoji}</span>{tag.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bio — full text, not clamped */}
          {member.community_bio && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-sand-600 px-1">קצת עליי</p>
              <div className="bg-[#F5F1EB] rounded-2xl p-4">
                <p className="text-sm text-sand-700 whitespace-pre-line leading-relaxed">{member.community_bio}</p>
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="pt-1">
            {directWaHref ? (
              <a
                href={directWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                שלחי הודעה ל-{firstName} ב-WhatsApp
              </a>
            ) : (
              <a
                href={fallbackHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-sand-100 hover:bg-sand-200 text-sand-700 font-bold py-3.5 rounded-2xl text-sm transition-all"
              >
                <MessageCircle className="w-5 h-5" />
                חיברי אותי דרך מימו
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
