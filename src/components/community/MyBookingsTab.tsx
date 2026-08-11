import { useEffect, useState } from 'react'
import { CalendarPlus, MapPin, Clock, Ticket, CalendarDays } from 'lucide-react'
import { supabase, type CommunityEventRow } from '../../lib/supabase'
import { downloadIcs, icsFilename, type CalendarEvent } from '../../utils/calendarIcs'
import MembershipCard from './MembershipCard'

// "ההזמנות שלי" — everything she signed up for, in one place.
//
// Reads the same get_community_events RPC the events tab uses (it
// already returns my_status per user), so there is no second source of
// truth to keep in sync: whatever the events tab considers "registered"
// is what shows up here.
//
// Each row can go straight into her calendar as an .ics — see
// utils/calendarIcs for why a file and not a Google link.

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long' })
  const [, m, dd] = dateStr.split('-')
  return `${weekday} · ${dd}/${m}`
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toCalendarEvent(ev: CommunityEventRow): CalendarEvent {
  const parts = [ev.description, ev.vendor_name ? `עם ${ev.vendor_name}` : null, 'הקהילה של מימו 🐣']
  return {
    uid: ev.id,
    title: `${ev.emoji ? `${ev.emoji} ` : ''}${ev.title}`,
    date: ev.event_date,
    startTime: ev.start_time,
    endTime: ev.end_time,
    location: ev.location,
    description: parts.filter(Boolean).join('\n'),
  }
}

export default function MyBookingsTab() {
  const [events, setEvents] = useState<CommunityEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketEvent, setTicketEvent] = useState<CommunityEventRow | null>(null)

  useEffect(() => {
    supabase.rpc('get_community_events').then(({ data }) => {
      const rows = ((data ?? []) as CommunityEventRow[])
        .filter(e => e.my_status === 'registered' || e.my_status === 'attended')
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
      setEvents(rows)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  const today = todayIso()
  const upcoming = events.filter(e => e.event_date >= today)
  const past = events.filter(e => e.event_date < today)

  if (events.length === 0) {
    return (
      <div className="text-center py-14 space-y-2">
        <CalendarDays className="w-12 h-12 mx-auto" style={{ color: '#DCD4C8' }} />
        <p className="text-sm font-semibold" style={{ color: '#7B604C' }}>עוד לא נרשמת לאירועים</p>
        <p className="text-xs" style={{ color: '#A2937D' }}>כל מה שתירשמי אליו יופיע כאן, עם אפשרות להוסיף ליומן.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {upcoming.length > 1 && (
        <button
          onClick={() => downloadIcs(upcoming.map(toCalendarEvent), 'המפגשים שלי במימו.ics')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all hover:brightness-95"
          style={{ background: '#F6ECD8', color: '#6E5836' }}
        >
          <CalendarPlus className="w-4 h-4" />
          הוספת כל {upcoming.length} המפגשים ליומן
        </button>
      )}

      {upcoming.map(ev => (
        <div key={ev.id} className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex flex-col items-center justify-center flex-shrink-0 rounded-2xl" style={{ width: 56, padding: '8px 0', background: '#F6F3ED' }}>
              <span className="font-display" style={{ fontSize: 18, lineHeight: 1, color: '#443327' }}>
                {ev.event_date.split('-')[2]}/{ev.event_date.split('-')[1]}
              </span>
              <span className="font-semibold" style={{ fontSize: 10.5, color: '#8A7A63' }}>
                {new Date(ev.event_date + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short' })}
              </span>
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sand-800 text-base leading-snug">
                {ev.emoji && `${ev.emoji} `}{ev.title}
              </p>
              <p className="text-xs text-sand-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {hhmm(ev.start_time) ?? dayLabel(ev.event_date)}</span>
                {ev.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{ev.location}</span></span>}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => downloadIcs([toCalendarEvent(ev)], icsFilename(ev.title, ev.event_date))}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold transition-all hover:brightness-95"
              style={{ background: '#F6ECD8', color: '#6E5836' }}
            >
              <CalendarPlus className="w-4 h-4" /> הוספה ליומן
            </button>
            <button
              onClick={() => setTicketEvent(ev)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-95"
              style={{ background: '#818267' }}
            >
              <Ticket className="w-4 h-4" /> כרטיס הכניסה
            </button>
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="font-bold" style={{ fontSize: 13, color: '#8A7A63' }}>היינו שם</p>
          {past.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: '#F5F1EB' }}>
              <span className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 14, color: '#7B604C' }}>
                {ev.emoji && `${ev.emoji} `}{ev.title}
              </span>
              <span className="flex-shrink-0" style={{ fontSize: 12, color: '#A2937D' }}>{dayLabel(ev.event_date)}</span>
            </div>
          ))}
        </div>
      )}

      {ticketEvent && (
        <MembershipCard
          event={{
            title: ticketEvent.title,
            emoji: ticketEvent.emoji,
            dateLabel: dayLabel(ticketEvent.event_date),
            timeLabel: hhmm(ticketEvent.start_time) ?? undefined,
            location: ticketEvent.location,
          }}
          onClose={() => setTicketEvent(null)}
        />
      )}
    </div>
  )
}
