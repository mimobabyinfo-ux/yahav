import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

/**
 * One thin line on the home screen for a mother who started registering
 * for a paid event and never finished paying.
 *
 * Yahav 26.8.26: "הכרטיס במסך הבית צריך להיות קטן שלא יתפוס הרבה נפח."
 * So this is a strip, not a card: one row, one sentence, one button, and
 * it renders nothing at all for the ~99% of mothers with nothing pending.
 *
 * The app already says this inside the event card in the community tab.
 * That is the problem: she has to go back and look. Every one of the six
 * stalled registrations on 26.8 belonged to someone who never returned to
 * that tab. This puts the same fact where she actually lands.
 *
 * It deliberately does not say "המקום שמור לך". The hold expired within
 * minutes of her leaving; claiming otherwise would be a lie she discovers
 * at the door.
 *
 * Reads her own rows directly rather than through get_community_events:
 * that RPC is the heaviest query on the home screen, and this needs two
 * columns from an indexed lookup on her own user id.
 *
 * The user_id filter is NOT redundant with RLS. The "users read own event
 * registrations" policy scopes a normal mother to her own rows, but the
 * "admins manage event registrations" policy is USING (is_admin) FOR ALL,
 * so an admin account reads everyone's. Without this filter Yahav opened
 * his own home screen on 26.8 and found five strips telling him that five
 * other women had not paid. Never let RLS do a query's filtering when an
 * admin bypass policy exists on the same table.
 */

type Row = {
  id: string
  guest_names: string[] | null
  payment_claimed_at: string | null
  community_events: {
    id: string
    title: string
    event_date: string
    payment_link: string | null
    payment_link_pair: string | null
  } | null
}

export default function PendingPaymentStrip() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!user?.id) { setRows([]); return }
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('event_registrations')
      .select('id, guest_names, payment_claimed_at, community_events!inner(id, title, event_date, payment_link, payment_link_pair)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .eq('paid', false)
      .eq('community_events.is_active', true)
      .gte('community_events.event_date', today)
      .gt('community_events.price', 0)
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]))
  }, [user?.id])

  if (rows.length === 0) return null

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {rows.map(r => {
        const ev = r.community_events
        if (!ev) return null
        const seats = (r.guest_names?.length ?? 0) + 1
        const link = seats === 2 && ev.payment_link_pair ? ev.payment_link_pair : ev.payment_link
        const claimed = !!r.payment_claimed_at

        return (
          <div
            key={r.id}
            className="flex items-center"
            style={{
              gap: 10,
              padding: '10px 12px',
              borderRadius: 16,
              background: claimed ? '#EFF3EA' : '#FBF3E4',
              border: `1px solid ${claimed ? '#DDE6D2' : '#F0E2C4'}`,
            }}
          >
            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: claimed ? '#5C7A4A' : '#B08A3C' }} />
            <p className="flex-1 min-w-0 font-semibold" style={{ fontSize: 13, lineHeight: 1.35, color: claimed ? '#4F6B3E' : '#8A6A2F' }}>
              {claimed
                ? `קיבלנו! מאשרות את התשלום ל${ev.title} ושומרות לך מקום`
                : <>ההרשמה שלך ל<span className="font-bold">{ev.title}</span> נעצרה לפני התשלום</>}
            </p>
            {!claimed && link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 font-bold rounded-xl"
                style={{ background: '#E7C78A', color: '#4A3A28', fontSize: 12, padding: '7px 11px' }}
              >
                להשלמה
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
