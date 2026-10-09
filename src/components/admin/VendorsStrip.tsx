import { AlertTriangle, ChevronLeft, Users } from 'lucide-react'

/**
 * "ספקים ואירועים" — moved 9.10.26 from the admin home's right column to
 * the top of the אירועי קהילה page, where the events it warns about live.
 * Renders nothing when there is no event without a vendor and no new
 * partner lead, so it does not take room on a quiet week.
 */

type Ev = { id: string; title: string; event_date: string }

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function VendorsStrip({ eventsMissingVendor, recentPartnerLeads, onOpenPartners }: { eventsMissingVendor: Ev[]; recentPartnerLeads: number; onOpenPartners: () => void }) {
  if (eventsMissingVendor.length === 0 && recentPartnerLeads === 0) return null
  return (
    <div className="flex flex-col sm:flex-row gap-2" dir="rtl">
      {eventsMissingVendor.length > 0 && (
        <div className="flex-1 rounded-2xl px-3.5 py-3" style={{ background: '#F7EBE4' }}>
          <p className="flex items-center gap-1.5 font-bold" style={{ fontSize: 13, color: '#8B4A30' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {eventsMissingVendor.length === 1 ? 'אירוע קרוב בלי ספק' : `${eventsMissingVendor.length} אירועים קרובים בלי ספק`}
          </p>
          <p className="mt-0.5 font-semibold" style={{ fontSize: 13, color: '#6B5842' }}>
            {eventsMissingVendor.slice(0, 4).map(ev => `${ev.title} · ${ddmm(ev.event_date)}`).join('  |  ')}
          </p>
        </div>
      )}
      {recentPartnerLeads > 0 && (
        <button onClick={onOpenPartners} className="flex-1 flex items-center gap-2 rounded-2xl px-3.5 py-3 text-right transition-colors hover:brightness-95" style={{ background: '#EEF2F4' }}>
          <Users className="w-4 h-4 flex-shrink-0" style={{ color: '#35505C' }} />
          <span className="flex-1 font-semibold" style={{ fontSize: 13, color: '#35505C' }}>{recentPartnerLeads} לידים לספקים בשבוע האחרון</span>
          <ChevronLeft className="w-4 h-4 flex-shrink-0" style={{ color: '#35505C' }} />
        </button>
      )}
    </div>
  )
}
