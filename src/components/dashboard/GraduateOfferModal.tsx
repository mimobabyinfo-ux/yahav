// Brenda 27.8.26: "אולי אפילו להקפיץ לכל מי שסיימה הודעה שיש לה הנחה".
//
// The push notification (grant-graduate-offers) only reaches a mother who
// turned notifications on, and today that is four of them. This is where
// everyone else meets the news: once, on the home screen, the first time
// she opens the app after the workshop ends.
//
// Shown once and then never again — mark_graduate_offer_seen latches it,
// including when she taps אחר כך. The offer itself stays in the store for
// the whole week; this is the announcement, not the offer.
import { useEffect, useState } from 'react'
import { Gift, X } from 'lucide-react'
import {
  useGraduateOffers,
  graduateOfferPrice,
  graduateOfferDaysLeft,
  graduateOfferDeadline,
  type GraduateOffer,
} from '../../hooks/useGraduateOffers'
import type { Page } from '../../App'

function discountLabel(o: GraduateOffer): string {
  return o.discount_type === 'percent'
    ? `${Number(o.discount_value)}% הנחה`
    : `מחיר מיוחד ₪${Number(o.discount_value)}`
}

function windowLabel(o: GraduateOffer): string {
  const days = graduateOfferDaysLeft(o)
  if (days <= 1) return 'היום זה היום האחרון'
  return `בתוקף עוד ${days} ימים, עד ${graduateOfferDeadline(o)}`
}

export default function GraduateOfferModal({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { offers, markSeen } = useGraduateOffers()
  const [dismissed, setDismissed] = useState(false)

  const unseen = offers.find(o => !o.seen_at) ?? null

  // Nothing to announce, or she already saw it in this session.
  useEffect(() => { setDismissed(false) }, [unseen?.grant_id])

  if (!unseen || dismissed) return null

  const price = graduateOfferPrice(unseen)
  const list = unseen.list_price != null ? Number(unseen.list_price) : null

  function close() {
    setDismissed(true)
    void markSeen(unseen!.grant_id)
  }

  function go() {
    setDismissed(true)
    void markSeen(unseen!.grant_id)
    onNavigate('workshops')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={close}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="relative px-6 pt-7 pb-5 text-center" style={{ background: '#F6ECD8' }}>
          <button
            onClick={close}
            className="absolute top-4 left-4 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center"
            aria-label="סגירה"
          >
            <X className="w-4 h-4 text-sand-700" />
          </button>
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: '#E7C78A' }}>
            <Gift className="w-7 h-7" style={{ color: '#4A3A28' }} />
          </div>
          <h2 className="mt-3 font-bold text-lg" style={{ color: '#3D2E20' }}>מתנה קטנה לסיום 🤎</h2>
          {unseen.source_workshop_title && (
            <p className="mt-1 text-sm" style={{ color: '#7B604C' }}>
              סיימת את {unseen.source_workshop_title}
            </p>
          )}
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: '#5C4A38' }}>
            כי את כבר חלק ממשפחת מימו, מחכה לך {discountLabel(unseen)} על {unseen.workshop_title}.
            הקישור אישי שלך ותקף לשבוע אחד בלבד.
          </p>

          {price != null && (
            <div className="flex items-baseline justify-center gap-2 py-2 rounded-2xl" style={{ background: '#FAF6EF' }}>
              {list != null && list !== price && (
                <span className="text-sm line-through" style={{ color: '#A79684' }}>₪{list}</span>
              )}
              <span className="text-2xl font-black" style={{ color: '#B98F4E' }}>₪{price}</span>
            </div>
          )}

          <p className="text-center text-xs font-bold" style={{ color: '#A35C3D' }}>
            {windowLabel(unseen)}
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={close}
              className="px-4 py-3 rounded-2xl text-sm font-bold"
              style={{ background: '#F0EAE0', color: '#7B604C' }}
            >
              אחר כך
            </button>
            <button
              onClick={go}
              className="flex-1 py-3 rounded-2xl text-sm font-bold"
              style={{ background: '#E7C78A', color: '#4A3A28' }}
            >
              לצפייה בהצעה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
