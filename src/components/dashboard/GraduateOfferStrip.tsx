import { Gift } from 'lucide-react'
import {
  useGraduateOffers,
  graduateOfferDaysLeft,
  type GraduateOffer,
} from '../../hooks/useGraduateOffers'
import type { Page } from '../../App'

/**
 * Yahav 19.9.26: "שיופיע באפליקציה באיזשהו אופן שיזכיר לה את ההנחה, בהתאם
 * לזמן שהיא נכנסת יופיע כמה ימים נשארו לה ... שזה יהיה לכולן".
 *
 * GraduateOfferModal announces the discount once and then latches shut.
 * After that the only trace of it was the price on the מגלים card in the
 * store, and by 19.9 none of the 13 personal links handed out had been
 * used. The WhatsApp reminder from the CRM does not reach everyone either
 * (two of four checked in the August cohort failed at Meta).
 *
 * So this is the standing reminder: one thin line on the home screen,
 * every visit, for as long as get_my_graduate_offers returns the offer,
 * which means until it expires, is used, or she registers some other way.
 * The count is computed at render, so it is right whenever she opens the
 * app. Nothing renders for everyone else.
 *
 * Same shape as PendingPaymentStrip on purpose: a strip, not a card.
 */

function discountLabel(o: GraduateOffer): string {
  return o.discount_type === 'percent'
    ? `${Number(o.discount_value)}% הנחה`
    : `מחיר מיוחד ₪${Number(o.discount_value)}`
}

/** "ליווי התפתחותי - סדנת מגלים" is too long for one line at this size;
 *  the part after the dash is the name she knows it by. */
function shortTitle(o: GraduateOffer): string {
  return o.workshop_title.split(' - ').pop()!.trim() || o.workshop_title
}

function daysLabel(o: GraduateOffer): string {
  const days = graduateOfferDaysLeft(o)
  if (days <= 1) return 'היום היום האחרון'
  if (days === 2) return 'נשארו יומיים'
  return `נשארו ${days} ימים`
}

export default function GraduateOfferStrip({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { offers } = useGraduateOffers()

  if (offers.length === 0) return null

  function open(o: GraduateOffer) {
    // Same hand-off RecommendedWorkshopCard uses: WorkshopsPage reads the
    // id once and opens that product's sheet, where her price and her
    // personal link already are.
    try { sessionStorage.setItem('mimo_open_product', o.workshop_id) } catch { /* private mode */ }
    onNavigate('workshops')
  }

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {offers.map(o => {
        const lastDay = graduateOfferDaysLeft(o) <= 1
        return (
          <div
            key={o.grant_id}
            className="flex items-center"
            style={{
              gap: 10,
              padding: '10px 12px',
              borderRadius: 16,
              background: '#FBF3E4',
              border: '1px solid #F0E2C4',
            }}
          >
            <Gift className="w-4 h-4 flex-shrink-0" style={{ color: '#B08A3C' }} />
            <p className="flex-1 min-w-0 font-semibold" style={{ fontSize: 13, lineHeight: 1.35, color: '#8A6A2F' }}>
              {discountLabel(o)} על <span className="font-bold">{shortTitle(o)}</span>
              {' · '}
              <span className="font-bold" style={{ color: lastDay ? '#A35C3D' : '#8A6A2F' }}>{daysLabel(o)}</span>
            </p>
            <button
              onClick={() => open(o)}
              className="flex-shrink-0 font-bold rounded-xl"
              style={{ background: '#E7C78A', color: '#4A3A28', fontSize: 12, padding: '7px 11px' }}
            >
              להצעה
            </button>
          </div>
        )
      })}
    </div>
  )
}
