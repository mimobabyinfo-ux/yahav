import { useEffect, useState } from 'react'
import { ChevronLeft, Clock, MapPin, Users } from 'lucide-react'
import { supabase, type CommunityEventRow } from '../../lib/supabase'
import type { Page } from '../../App'
import MimoDuck from '../MimoDuck'

// Community hero for the home dashboard (community-first, 2.8.26): the
// app's primary draw. Shows the next 3 upcoming events with the user's
// registration state + a standing CTA into the community page. Unlike
// the old teaser, this renders even with no events — the community is
// the front door now, so the door is always visible.

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'short' })
  const [, m, dd] = dateStr.split('-')
  return `${weekday} ${dd}/${m}`
}

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

  if (!loaded) return null

  return (
    <div className="rounded-3xl shadow-sm overflow-hidden" style={{ background: 'linear-gradient(160deg, #F5F1EB 0%, #F0E9DD 100%)' }}>
      {/* Hero header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MimoDuck variant="mama" size={46} className="duck-bob flex-shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-sand-800">הקהילה של מימו</h2>
              <p className="text-xs text-sand-500 mt-0.5">מפגשים, הרצאות ואימונים — ביחד</p>
            </div>
          </div>
          <button
            onClick={openMembers}
            className="text-[11px] font-bold text-mustard-700 bg-white px-3 py-1.5 rounded-full shadow-sm"
          >
            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />להכיר אמהות</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2">
        {events.length === 0 ? (
          <div className="bg-white/70 rounded-2xl p-4 text-center">
            <p className="text-sm font-semibold text-sand-700">לוח האירועים הבא בדרך ✨</p>
            <p className="text-xs text-sand-400 mt-0.5">יוגה, הרצאות, קפה ביחד ועוד — ממש בקרוב</p>
          </div>
        ) : (
          events.map(ev => {
            const isMine = ev.my_status === 'registered' || ev.my_status === 'attended'
            const spotsLeft = ev.capacity != null ? ev.capacity - ev.registered_count : null
            return (
              <button
                key={ev.id}
                onClick={openEvents}
                className="w-full bg-white/80 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all text-right flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-white">
                  {ev.emoji ?? '🎉'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-sand-800 truncate">{ev.title}</p>
                  <p className="text-[11px] text-sand-400 flex items-center gap-2 mt-0.5">
                    <span className="font-semibold">{shortDay(ev.event_date)}</span>
                    {ev.start_time && (
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{ev.start_time.slice(0, 5)}</span>
                    )}
                    {ev.location && (
                      <span className="flex items-center gap-0.5 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{ev.location}</span>
                    )}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {isMine ? (
                    <span className="text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: '#818267' }}>רשומה ✓</span>
                  ) : spotsLeft != null && spotsLeft <= 3 && spotsLeft > 0 ? (
                    <span className="text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: '#A35C3D' }}>
                      {spotsLeft === 1 ? 'מקום אחרון!' : `${spotsLeft} מקומות`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white" style={{ color: '#D9B978' }}>
                      {ev.price > 0 ? `₪${ev.price}` : 'חינם'}
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}

        {/* Standing CTA */}
        <button
          onClick={openEvents}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28] transition-all"
          style={{ background: '#E7C78A' }}
        >
          לכל האירועים
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
