// "קיבלת 30 ₪" — Brenda 12.9.26, מבצע מסך הבית + חברה מביאה חברה.
//
// The credit itself is granted by a DB trigger the first time the app
// pings pwa_installed_at (App.tsx). The mother sees nothing of that, so
// this is where she learns it happened: once, over the home screen,
// right after that first open from the icon. Which credit to celebrate
// is decided by App.tsx (a promo credit created in the last few minutes);
// this component only shows it and remembers that it did.
import { Gift, X } from 'lucide-react'
import type { MyCredit } from '../../lib/supabase'
import type { Page } from '../../App'

const SEEN_KEY = 'mimo_credit_won_seen'

export function creditWonSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]) } catch { return new Set() }
}
export function markCreditWonSeen(id: string) {
  try {
    const s = creditWonSeen(); s.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
  } catch { /* private mode */ }
}

function windowLabel(c: MyCredit): string {
  if (c.valid_event_from && c.valid_event_to) {
    const f = new Date(c.valid_event_from + 'T12:00:00')
    const t = new Date(c.valid_event_to + 'T12:00:00')
    const m = (d: Date) => d.toLocaleDateString('he-IL', { month: 'long' })
    return `לאירועי הקהילה של ${m(f)}${m(f) === m(t) ? '' : ' ו' + m(t)}`
  }
  return `בתוקף עד ${new Date(c.expires_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`
}

export default function CreditWonModal({ credit, onClose, onNavigate }: {
  credit: MyCredit
  onClose: () => void
  onNavigate: (page: Page) => void
}) {
  const referral = (credit.grant_note ?? '').startsWith('חברה מביאה חברה')
  const invited = referral && (credit.grant_note ?? '').includes('הזמנת')

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="relative px-6 pt-7 pb-5 text-center" style={{ background: '#F6ECD8' }}>
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center"
            aria-label="סגירה"
          >
            <X className="w-4 h-4 text-sand-700" />
          </button>
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: '#E7C78A' }}>
            <Gift className="w-7 h-7" style={{ color: '#4A3A28' }} />
          </div>
          <h2 className="mt-3 font-bold text-lg" style={{ color: '#3D2E20' }}>
            קיבלת ₪{Number(credit.amount)} 🤍
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#7B604C' }}>
            {invited
              ? 'חברה שהזמנת שמה את מימו במסך הבית'
              : referral
                ? 'הגעת דרך חברה ושמת את מימו במסך הבית'
                : 'מימו במסך הבית שלך, ואירוע קהילה ראשון עלינו'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: '#5C4A38' }}>
            הזיכוי כבר מחכה לך במסך הקהילה, {windowLabel(credit)}. בוחרות אירוע ולוחצות "לשימוש בזיכוי שלי".
          </p>
          <button
            onClick={() => { onClose(); onNavigate('community') }}
            className="w-full py-3 rounded-2xl font-bold text-sm text-[#4A3A28] transition-all hover:brightness-95"
            style={{ background: '#E7C78A' }}
          >
            לאירועי הקהילה
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: '#EFE9DF', color: '#8A7A63' }}
          >
            אחר כך
          </button>
        </div>
      </div>
    </div>
  )
}
