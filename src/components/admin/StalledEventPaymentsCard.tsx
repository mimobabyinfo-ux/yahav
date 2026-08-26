import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, MessageCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * "נרשמו ולא השלימו תשלום" — the warmest leads there are.
 *
 * Yahav 26.8.26: "יש כמה שנרשמו לאירועים אבל לא שילמו... אולי שכחו מזה
 * וכדאי להקפיץ להם תזכורת."
 *
 * He is right, and the data is worse than he thought: every one of these
 * holds expired within HOURS of her registering. She picked the event,
 * opened the payment page, got interrupted, and the seat quietly went back
 * to the pool. Nobody told her. The row then sits as 'pending' forever —
 * not registered, not cancelled.
 *
 * Yahav 26.8.26 (second pass): "אחרי שאני לוחץ על שליחת הודעה זה לא יעלם
 * אלא יסומן כשנשלח." Right — the row vanishing was me optimising for a
 * short list instead of for him knowing what he did. WhatsApp does not
 * tell us whether she read it, so the only record that a nudge happened
 * is this row. Now it stays, greys out, shows the date, and can be undone
 * or sent again.
 *
 * Rendered both on the admin home and inside the community-events page,
 * because that is where he is standing when he thinks about an event.
 *
 * Sending is a wa.me link. See project memory: whatsapp_24h_window.
 */

type Row = {
  id: string
  user_id: string
  event_id: string
  created_at: string
  reminded_at: string | null
}

type EventRow = {
  id: string
  title: string
  event_date: string
  price: number | null
  payment_link: string | null
  capacity: number | null
}

function waHref(phone: string | null, text: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('972') ? digits : digits.replace(/^0/, '972')
  if (intl.length < 11) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

function firstName(full: string | null): string {
  if (!full) return ''
  return full.trim().split(/\s+/)[0] || full
}

function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}.${Number(m)}`
}

function agoHe(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  return `לפני ${Math.floor(days / 7)} שבועות`
}

export default function StalledEventPaymentsCard() {
  const [rows, setRows] = useState<Row[]>([])
  const [events, setEvents] = useState<Record<string, EventRow>>({})
  const [people, setPeople] = useState<Record<string, { name: string | null; phone: string | null }>>({})
  const [taken, setTaken] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)

    // Only paid events: a free event has nothing to complete.
    const { data: evs } = await supabase
      .from('community_events')
      .select('id, title, event_date, price, payment_link, capacity')
      .eq('is_active', true)
      .gte('event_date', today)
      .gt('price', 0)
    const eventList = (evs ?? []) as EventRow[]
    if (eventList.length === 0) { setLoading(false); return }

    const map: Record<string, EventRow> = {}
    for (const e of eventList) map[e.id] = e
    setEvents(map)

    const ids = eventList.map(e => e.id)
    const [{ data: stalled }, { data: confirmed }] = await Promise.all([
      // Reminded rows are kept. He needs to see that he already wrote to
      // her, not to have the evidence deleted the moment he acts on it.
      supabase
        .from('event_registrations')
        .select('id, user_id, event_id, created_at, reminded_at')
        .in('event_id', ids)
        .eq('status', 'pending')
        .eq('paid', false)
        .order('created_at'),
      // Seats genuinely gone, so "there is still room" is only said when true.
      supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', ids)
        .in('status', ['registered', 'attended']),
    ])

    const list = (stalled ?? []) as Row[]
    setRows(list)

    const counts: Record<string, number> = {}
    for (const r of (confirmed ?? []) as { event_id: string }[]) {
      counts[r.event_id] = (counts[r.event_id] ?? 0) + 1
    }
    setTaken(counts)

    if (list.length > 0) {
      const userIds = [...new Set(list.map(r => r.user_id))]
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, mother_name, phone_number')
        .in('id', userIds)
      const pm: Record<string, { name: string | null; phone: string | null }> = {}
      for (const p of (profs ?? []) as { id: string; mother_name: string | null; phone_number: string | null }[]) {
        pm[p.id] = { name: p.mother_name, phone: p.phone_number }
      }
      setPeople(pm)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Grouped by event, and inside each group the ones still waiting for a
  // message come first. The done ones stay visible underneath them.
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const arr = m.get(r.event_id) ?? []
      arr.push(r)
      m.set(r.event_id, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (!a.reminded_at && b.reminded_at) return -1
        if (a.reminded_at && !b.reminded_at) return 1
        return a.created_at.localeCompare(b.created_at)
      })
    }
    return [...m.entries()]
  }, [rows])

  const waiting = rows.filter(r => !r.reminded_at).length

  function seatsLeft(ev: EventRow): number | null {
    if (ev.capacity == null) return null
    return ev.capacity - (taken[ev.id] ?? 0)
  }

  function messageFor(r: Row): string {
    const ev = events[r.event_id]
    const who = firstName(people[r.user_id]?.name ?? null)
    const hi = who ? `היי ${who}` : 'היי'
    const left = seatsLeft(ev)
    const room = left == null || left > 0 ? ' יש עדיין מקום,' : ''
    const link = ev.payment_link ? `\n\n${ev.payment_link}` : ''
    return `${hi}, ראיתי שנרשמת ל${ev.title} ב-${dayMonth(ev.event_date)} וההרשמה נעצרה לפני התשלום.${room} ואפשר להשלים כאן:${link}`
  }

  async function setReminded(r: Row, at: string | null) {
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, reminded_at: at } : x))
    const { error } = await supabase
      .from('event_registrations')
      .update({ reminded_at: at })
      .eq('id', r.id)
    // Put the row back the way it was rather than showing a lie.
    if (error) setRows(prev => prev.map(x => x.id === r.id ? { ...x, reminded_at: r.reminded_at } : x))
  }

  if (loading || rows.length === 0) return null

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold flex items-center gap-1.5" style={{ fontSize: 16, color: '#443327' }}>
          <CreditCard className="w-4 h-4" style={{ color: '#C08A5A' }} />
          נרשמו ולא השלימו תשלום
        </h2>
        <span className="font-bold" style={{ fontSize: 13, color: '#C08A5A' }}>
          {waiting > 0 ? waiting : '✓'}
        </span>
      </div>
      <p className="mb-3" style={{ fontSize: 12, color: '#A2937D' }}>
        {waiting > 0
          ? 'בחרו אירוע, נעצרו לפני התשלום, ושמירת המקום פגה תוך שעות. אף אחת מהן לא יודעת.'
          : 'שלחת לכולן. הן נשארות כאן עד שישלימו תשלום או שההרשמה תתבטל.'}
      </p>

      <div className="space-y-3">
        {grouped.map(([eventId, list]) => {
          const ev = events[eventId]
          if (!ev) return null
          const left = seatsLeft(ev)
          return (
            <div key={eventId}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold" style={{ fontSize: 13, color: '#6E5836' }}>
                  {ev.title} · {dayMonth(ev.event_date)}
                </span>
                <span style={{ fontSize: 11, color: left != null && left <= 0 ? '#C08A5A' : '#7A8F63' }}>
                  {left == null ? `₪${ev.price}` : left <= 0 ? 'מלא' : `נותרו ${left} מקומות`}
                </span>
              </div>

              <div className="space-y-1.5">
                {list.map(r => {
                  const person = people[r.user_id]
                  const href = waHref(person?.phone ?? null, messageFor(r))
                  const sent = !!r.reminded_at
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-2xl px-3 py-2"
                      style={{ background: sent ? '#FDFBF8' : '#FBF8F3', opacity: sent ? 0.75 : 1 }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ fontSize: 13, color: sent ? '#8A7B67' : '#443327' }}>
                          {person?.name ?? 'לא ידוע'}
                        </p>
                        <p style={{ fontSize: 11, color: '#A2937D' }} dir="ltr">
                          {person?.phone ?? 'אין טלפון'}
                        </p>
                      </div>

                      {sent ? (
                        <>
                          <span
                            className="flex-shrink-0 font-bold rounded-full"
                            style={{ fontSize: 11, padding: '4px 9px', background: '#EAF0E4', color: '#4F6B3E' }}
                          >
                            נשלח {agoHe(r.reminded_at as string)}
                          </span>
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setReminded(r, new Date().toISOString())}
                              className="flex-shrink-0 rounded-xl font-semibold"
                              style={{ background: '#F0EAE0', color: '#6E5836', fontSize: 11, padding: '5px 8px' }}
                            >
                              שוב
                            </a>
                          )}
                          <button
                            onClick={() => setReminded(r, null)}
                            title="לא נשלח בסוף"
                            className="flex-shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" style={{ color: '#BCAE99' }} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: '#BCAE99' }} className="flex-shrink-0">
                            נרשמה {agoHe(r.created_at)}
                          </span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setReminded(r, new Date().toISOString())}
                              className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl font-bold text-white"
                              style={{ background: '#5C7A4A', fontSize: 12, padding: '6px 10px' }}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              הזכירי
                            </a>
                          ) : (
                            <button
                              onClick={() => setReminded(r, new Date().toISOString())}
                              className="flex-shrink-0 rounded-xl font-semibold"
                              style={{ background: '#F0EAE0', color: '#6E5836', fontSize: 12, padding: '6px 10px' }}
                            >
                              סמן
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
