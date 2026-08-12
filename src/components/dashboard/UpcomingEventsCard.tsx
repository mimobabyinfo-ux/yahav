import { useEffect, useState } from 'react'
import { supabase, type CommunityEventRow } from '../../lib/supabase'
import type { Page } from '../../App'
import MimoLeaf from '../MimoLeaf'

// Community card for the home dashboard. Tier-2 content card: white
// surface, soft single-elevation shadow, date blocks instead of emoji
// squares, and two explicit footer CTAs (events / members).

const MONTHS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

export default function UpcomingEventsCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [events, setEvents] = useState<CommunityEventRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.rpc('get_community_events').then(({ data }) => {
      setEvents(((data ?? []) as CommunityEventRow[]).slice(0, 3))
      setLoaded(true)
    })
  }, [])

  function openEvents() {
    sessionStorage.setItem('mimo_community_tab', 'events')
    onNavigate('community')
  }

  function openMembers() {
    sessionStorage.setItem('mimo_community_tab', 'members')
    onNavigate('community')
  }

  const subtitle =
    events.length >= 2 ? `${events.length} מפגשים קרובים` :
    events.length === 1 ? 'מפגש אחד קרוב' :
    'מפגשים, הרצאות ואימונים, ביחד'

  return (
    <div className="bg-white" style={{ borderRadius: 26, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 12 }}>
        {/* Yahav 12.8.26: the rosa polvo moved off this circle and onto
            the date blocks below. A tinted disc up here was colour with
            nothing to say. On a date it means "this is when". */}
        <span
          className="rounded-full flex items-center justify-center flex-shrink-0"
          style={{ width: 54, height: 54, background: '#F7F2EA' }}
        >
          <MimoLeaf variant="blush" size={34} rotate={-12} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display" style={{ fontSize: 24, lineHeight: 1.05, fontWeight: 400, color: '#5E4938' }}>הקהילה של מימו</h2>
          <p className="font-semibold mt-1" style={{ fontSize: 13, color: '#957860' }}>{subtitle}</p>
        </div>
      </div>

      {/* Events */}
      <div className="flex flex-col mt-4" style={{ gap: 8 }}>
        {!loaded ? (
          <>
            <div className="skeleton" style={{ height: 64, borderRadius: 18 }} />
            <div className="skeleton" style={{ height: 64, borderRadius: 18 }} />
          </>
        ) : events.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: '#FAF7F1' }}>
            <MimoLeaf variant="sky-1" size={38} rotate={10} className="flex-shrink-0" />
            <div>
              <p className="font-semibold" style={{ fontSize: 15, color: '#443327' }}>לוח האירועים הבא בדרך</p>
              <p style={{ fontSize: 13, color: '#957860' }}>יוגה, הרצאות, קפה ביחד ועוד, ממש בקרוב</p>
            </div>
          </div>
        ) : (
          events.map(ev => {
            const isMine = ev.my_status === 'registered' || ev.my_status === 'attended'
            const spotsLeft = ev.capacity != null ? ev.capacity - ev.registered_count : null
            const d = new Date(ev.event_date + 'T12:00:00')
            const meta = [ev.start_time?.slice(0, 5), ev.location].filter(Boolean).join(' · ')
            return (
              <button
                key={ev.id}
                onClick={openEvents}
                className="w-full flex items-center text-right transition-shadow hover:shadow-sm"
                style={{ padding: 12, border: '1px solid #F0EBE3', borderRadius: 18, gap: 12 }}
              >
                {/* Date block. The rosa polvo wraps the date itself, so
                    the eye lands on when the thing happens. */}
                <span
                  className="flex flex-col items-center justify-center flex-shrink-0"
                  style={{ width: 46, paddingTop: 6, paddingBottom: 6, borderRadius: 14, background: '#EADBDD' }}
                >
                  <span className="font-bold" style={{ fontSize: 18, lineHeight: 1, color: '#5E4938' }}>{d.getDate()}</span>
                  <span className="font-semibold mt-0.5" style={{ fontSize: 12, color: '#8C6E63' }}>{MONTHS_HE[d.getMonth()]}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate" style={{ fontSize: 15, lineHeight: 1.3, color: '#443327' }}>{ev.title}</span>
                  {meta && <span className="block font-semibold truncate mt-0.5" style={{ fontSize: 13, color: '#957860' }}>{meta}</span>}
                </span>
                <span className="flex-shrink-0">
                  {isMine ? (
                    <span className="font-bold rounded-full" style={{ fontSize: 12, padding: '5px 10px', background: '#E6E6E0', color: '#434434' }}>רשומה</span>
                  ) : spotsLeft != null && spotsLeft <= 3 && spotsLeft > 0 ? (
                    <span className="font-bold rounded-full" style={{ fontSize: 12, padding: '5px 10px', background: '#A35C3D', color: '#fff' }}>
                      {spotsLeft === 1 ? 'מקום אחרון!' : `${spotsLeft} מקומות`}
                    </span>
                  ) : (
                    <span className="font-bold rounded-full" style={{ fontSize: 12, padding: '5px 10px', background: '#F0EBE3', color: '#8A6A2F' }}>
                      {ev.price > 0 ? `₪${ev.price}` : 'חינם'}
                    </span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Footer CTAs */}
      <div className="flex mt-3" style={{ gap: 10 }}>
        <button
          onClick={openEvents}
          className="flex-1 text-center font-bold transition-all hover:bg-sand-50"
          style={{ border: '1.5px solid #DCD4C8', color: '#7B604C', borderRadius: 14, padding: '9px 12px', fontSize: 13.5 }}
        >
          לכל האירועים
        </button>
        <button
          onClick={openMembers}
          className="flex-1 text-center font-bold transition-all hover:bg-sand-50"
          style={{ border: '1.5px solid #DCD4C8', color: '#7B604C', borderRadius: 14, padding: '9px 12px', fontSize: 13.5 }}
        >
          להכיר אמהות
        </button>
      </div>
    </div>
  )
}
