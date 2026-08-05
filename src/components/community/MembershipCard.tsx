import { useEffect, useState } from 'react'
import { X, Ticket, Gift } from 'lucide-react'
import { supabase, type PartnerPerk } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import MimoDuck from '../MimoDuck'

// Digital membership card — shown by a mom at partner businesses to
// claim community perks, and as an entry ticket at limited-capacity
// community events. Verification without QR infrastructure: the card
// carries a LIVE ticking clock — a faked screenshot shows a frozen,
// wrong time, while a real card visibly ticks.

type EventTicket = {
  title: string
  emoji?: string | null
  dateLabel: string
  timeLabel?: string
  location?: string | null
}

type Props = {
  onClose: () => void
  /** When present, the card renders as an event entry ticket. */
  event?: EventTicket
}

function useLiveClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function MembershipCard({ onClose, event }: Props) {
  const { profile } = useAuth()
  const clock = useLiveClock()
  const [perks, setPerks] = useState<PartnerPerk[]>([])

  useEffect(() => {
    if (event) return // ticket mode doesn't need the perks list
    supabase.from('partner_perks')
      .select('*')
      .eq('is_active', true)
      .eq('redeem_in_person', true) // online perks live in the benefits page, not on the card
      .order('display_order')
      .then(({ data }) => setPerks(data ?? []))
  }, [event])

  const name = profile?.mother_name ?? 'חברת קהילה'
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5" onClick={onClose} dir="rtl">
      <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {/* The card itself */}
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(150deg, #F6ECD8 0%, #EFDDBC 60%, #E7C78A 100%)' }}
        >
          <div className="p-6 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold" style={{ fontSize: 13, color: '#8A6A2F' }}>
                  {event ? 'כרטיס כניסה · אירוע קהילה' : 'קהילת מימו'}
                </p>
                <h2 className="font-display mt-1" style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 400, color: '#4A3A28' }}>
                  {name}
                </h2>
                {!event && memberSince && (
                  <p className="font-semibold mt-1" style={{ fontSize: 13, color: '#8A6A2F' }}>חברה מאז {memberSince}</p>
                )}
              </div>
              <MimoDuck variant="mama" size={64} className="duck-bob flex-shrink-0" />
            </div>

            {event ? (
              <div className="mt-5 rounded-2xl bg-white/70 p-4">
                <p className="font-bold" style={{ fontSize: 17, color: '#443327' }}>
                  {event.emoji ? `${event.emoji} ` : ''}{event.title}
                </p>
                <p className="font-semibold mt-1" style={{ fontSize: 14, color: '#6E5836' }}>
                  {event.dateLabel}
                  {event.timeLabel && ` · ${event.timeLabel}`}
                </p>
                {event.location && (
                  <p className="font-semibold mt-0.5" style={{ fontSize: 14, color: '#6E5836' }}>{event.location}</p>
                )}
                <span className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-musgo-500 text-white font-bold" style={{ fontSize: 13, padding: '5px 12px' }}>
                  <Ticket className="w-3.5 h-3.5" /> רשומה
                </span>
              </div>
            ) : (
              <p className="mt-4 font-semibold" style={{ fontSize: 14, color: '#6E5836', lineHeight: 1.5 }}>
                הכרטיס מקנה את הטבות הקהילה אצל בתי העסק השותפים — פשוט מראים אותו בקופה
              </p>
            )}
          </div>

          {/* Live verification strip */}
          <div className="flex items-center justify-between px-6 py-3" style={{ background: 'rgba(74,58,40,0.10)' }}>
            <span className="font-semibold" style={{ fontSize: 12, color: '#6E5836' }}>
              כרטיס חי · {new Date().toLocaleDateString('he-IL')}
            </span>
            <span className="font-bold tabular-nums" style={{ fontSize: 16, color: '#4A3A28', fontVariantNumeric: 'tabular-nums' }} dir="ltr">
              {clock}
            </span>
          </div>
        </div>

        {/* Perks list (membership mode) */}
        {!event && perks.length > 0 && (
          <div className="mt-3 bg-white rounded-3xl p-4 shadow-xl max-h-[32vh] overflow-y-auto">
            <p className="font-bold mb-2 flex items-center gap-1.5" style={{ fontSize: 14, color: '#443327' }}>
              <Gift className="w-4 h-4" style={{ color: '#A35C3D' }} /> הטבות בהצגת הכרטיס
            </p>
            <div className="space-y-2">
              {perks.map(p => (
                <div key={p.id} className="rounded-2xl p-3" style={{ background: '#FAF7F1' }}>
                  <p className="font-bold" style={{ fontSize: 14, color: '#443327' }}>{p.partner_name}</p>
                  {p.short_description && (
                    <p className="mt-0.5" style={{ fontSize: 13, color: '#7B604C', lineHeight: 1.45 }}>{p.short_description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 mx-auto flex items-center justify-center rounded-full bg-white shadow-xl"
          style={{ width: 44, height: 44 }}
          aria-label="סגירה"
        >
          <X className="w-5 h-5" style={{ color: '#7B604C' }} />
        </button>
      </div>
    </div>
  )
}
