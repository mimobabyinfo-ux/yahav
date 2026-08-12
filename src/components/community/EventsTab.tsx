import { useCallback, useEffect, useState } from 'react'
import { MapPin, Clock, Users, ExternalLink, Check, X, CalendarHeart, CalendarDays, List, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase, type CommunityEventRow, type EventAttendee, type MyWaitlist } from '../../lib/supabase'
import { getBabyAge } from '../../utils/dateUtils'
import CommunityMemberSheet from './CommunityMemberSheet'
import { MimoLeafPair } from '../MimoLeaf'
import MembershipCard from './MembershipCard'

// "הקהילה של מימו" — user-facing community events. Two views:
// רשימה (monthly-grouped cards + month chips) and יומן (month calendar
// grid with prev/next navigation). One-tap register/cancel through
// SECURITY DEFINER RPCs (capacity enforced server-side). "מי מגיעה"
// attendees are tappable — each opens the same CommunityMemberSheet
// used by the members directory, so moms can connect with each other
// before the event (direct WhatsApp only with community_consent).

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function monthKey(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return `${MONTHS_HE[m - 1]} ${y}`
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long' })
  const [, m, dd] = dateStr.split('-')
  return `${weekday} · ${dd}/${m}`
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const genderEmoji = (g: string | null) => g === 'boy' ? '👶🏻' : g === 'girl' ? '👧' : '👶'

export default function EventsTab() {
  const [events, setEvents] = useState<CommunityEventRow[]>([])
  // Entry-ticket modal for a registered event (digital card).
  const [ticketEvent, setTicketEvent] = useState<CommunityEventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attendees, setAttendees] = useState<Record<string, EventAttendee[]>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Month chips (list view) — null = show all months
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  // רשימה / יומן view toggle + calendar month navigation
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calYm, setCalYm] = useState<{ y: number; m: number }>(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })
  const [calSelectedId, setCalSelectedId] = useState<string | null>(null)
  // Tapped attendee — opens the community profile bottom-sheet
  const [openAttendee, setOpenAttendee] = useState<{ attendee: EventAttendee; eventTitle: string } | null>(null)

  // My waitlist entries (event_id → position). Simple waitlist: joining
  // is possible only when full; when a spot frees the card highlights
  // "התפנה מקום" and registering auto-converts the entry (DB trigger).
  const [waitlists, setWaitlists] = useState<Record<string, MyWaitlist>>({})

  const load = useCallback(async () => {
    const [{ data }, { data: wl }] = await Promise.all([
      supabase.rpc('get_community_events'),
      supabase.rpc('get_my_waitlists'),
    ])
    setEvents((data ?? []) as CommunityEventRow[])
    const m: Record<string, MyWaitlist> = {}
    for (const w of (wl ?? []) as MyWaitlist[]) m[w.event_id] = w
    setWaitlists(m)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function loadAttendees(eventId: string) {
    const { data } = await supabase.rpc('get_event_attendees', { p_event_id: eventId })
    setAttendees(prev => ({ ...prev, [eventId]: (data ?? []) as EventAttendee[] }))
  }

  function toggleExpand(ev: CommunityEventRow) {
    const next = expandedId === ev.id ? null : ev.id
    setExpandedId(next)
    if (next && !attendees[ev.id]) loadAttendees(ev.id)
  }

  async function register(ev: CommunityEventRow) {
    setBusyId(ev.id)
    const { data, error } = await supabase.rpc('register_for_event', { p_event_id: ev.id })
    setBusyId(null)
    if (error) { showToast('שגיאה. נסי שוב'); return }
    if (data === 'full') { showToast('האירוע התמלא בדיוק עכשיו 😢'); load(); return }
    if (data === 'registered' || data === 'already') {
      showToast(ev.price > 0 ? 'שמרנו לך מקום! נשאר רק להשלים תשלום 🤎' : 'נתראה שם! 🤎')
      if (ev.price > 0 && ev.payment_link) {
        window.open(ev.payment_link, '_blank', 'noopener')
      }
      load()
      if (attendees[ev.id]) loadAttendees(ev.id)
    }
  }

  async function cancel(ev: CommunityEventRow) {
    setBusyId(ev.id)
    const { error } = await supabase.rpc('cancel_event_registration', { p_event_id: ev.id })
    setBusyId(null)
    if (error) { showToast('שגיאה. נסי שוב'); return }
    showToast('ההרשמה בוטלה. המקום התפנה למישהי אחרת')
    load()
    if (attendees[ev.id]) loadAttendees(ev.id)
  }

  async function joinWaitlist(ev: CommunityEventRow) {
    setBusyId(ev.id)
    const { data, error } = await supabase.rpc('join_event_waitlist', { p_event_id: ev.id })
    setBusyId(null)
    if (error) { showToast('שגיאה. נסי שוב'); return }
    if (data === 'not_full') { showToast('התפנה מקום! אפשר להירשם 🤎'); load(); return }
    if (data === 'already_registered') { showToast('את כבר רשומה לאירוע 🤎'); load(); return }
    if (data === 'ok') {
      showToast('נכנסת לרשימת ההמתנה. נעדכן אותך אם יתפנה מקום 🤍')
      load()
    }
  }

  async function leaveWaitlist(ev: CommunityEventRow) {
    setBusyId(ev.id)
    await supabase.rpc('leave_event_waitlist', { p_event_id: ev.id })
    setBusyId(null)
    showToast('ירדת מרשימת ההמתנה')
    load()
  }

  function calMove(delta: number) {
    setCalYm(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
    })
    setCalSelectedId(null)
  }

  // ── Single event card (shared by list + calendar views) ──
  function eventCard(ev: CommunityEventRow) {
    const spotsLeft = ev.capacity != null ? ev.capacity - ev.registered_count : null
    const isFull = spotsLeft != null && spotsLeft <= 0
    const isMine = ev.my_status === 'registered' || ev.my_status === 'attended'
    const onWaitlist = waitlists[ev.id]
    const expanded = expandedId === ev.id
    const names = attendees[ev.id]

    return (
      <div key={ev.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 cursor-pointer" onClick={() => toggleExpand(ev)}>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 bg-[#F4EDE1]">
              {ev.emoji ?? '🎉'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-sand-800 text-sm leading-snug">{ev.title}</p>
                <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={ev.price > 0
                    ? { background: '#F4EDE1', color: '#A35C3D' }
                    : { background: '#F4EDE1', color: '#818267' }}>
                  {ev.price > 0 ? `₪${ev.price}` : 'חינם'}
                </span>
              </div>
              <p className="text-xs text-sand-500 mt-1 flex items-center gap-1 flex-wrap">
                <span className="font-semibold">{dayLabel(ev.event_date)}</span>
                {hhmm(ev.start_time) && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {hhmm(ev.start_time)}{hhmm(ev.end_time) ? `–${hhmm(ev.end_time)}` : ''}
                  </span>
                )}
              </p>
              {ev.location && (
                <p className="text-xs text-sand-600 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {ev.location}
                </p>
              )}
              {ev.vendor_name && (
                <p className="text-xs text-sand-600 mt-0.5">בהנחיית {ev.vendor_name}</p>
              )}

              {/* Spots + social proof */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="flex items-center gap-1 text-[13px] font-semibold text-sand-500">
                  <Users className="w-3 h-3" />
                  {ev.registered_count > 0 ? `${ev.registered_count} נרשמו` : 'היי הראשונה!'}
                </span>
                {spotsLeft != null && !isFull && spotsLeft <= 3 && (
                  <span className="text-[13px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: '#A35C3D' }}>
                    {spotsLeft === 1 ? 'מקום אחרון!' : `נותרו ${spotsLeft} מקומות`}
                  </span>
                )}
                {isFull && !isMine && (
                  <span className="text-[13px] font-bold text-sand-500 px-2 py-0.5 rounded-full bg-[#F4EDE1]">האירוע מלא</span>
                )}
              </div>
            </div>
          </div>

          {/* Expanded: description + who's coming (tappable profiles) */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-sand-200 space-y-2">
              {ev.description && (
                <p className="text-xs text-sand-600 leading-relaxed whitespace-pre-line">{ev.description}</p>
              )}
              {ev.location_link && (
                <a href={ev.location_link} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-mustard-600">
                  <ExternalLink className="w-3 h-3" /> ניווט למיקום
                </a>
              )}
              {names && names.length > 0 && (
                <div>
                  <p className="text-[13px] font-bold text-sand-500 mb-1">מי מגיעה? 🤎 <span className="font-normal text-sand-600">(לחצי להכיר)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {names.map(a => (
                      <button
                        key={a.user_id}
                        onClick={e => { e.stopPropagation(); setOpenAttendee({ attendee: a, eventTitle: ev.title }) }}
                        className="flex items-center gap-1 text-[13px] bg-[#F4EDE1] text-sand-700 px-2.5 py-1 rounded-full font-semibold shadow-sm hover:shadow transition-all"
                      >
                        <span>{genderEmoji(a.child_gender)}</span>
                        {(a.mother_name ?? 'אמא').split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="px-4 pb-4">
          {isMine ? (
            <div className="flex gap-2">
              <button
                onClick={() => setTicketEvent(ev)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-95"
                style={{ background: '#818267' }}
                title="הצגת כרטיס הכניסה"
              >
                <Check className="w-4 h-4" /> רשומה · הכרטיס שלי
              </button>
              <button
                onClick={() => cancel(ev)}
                disabled={busyId === ev.id}
                className="px-3 py-2.5 rounded-2xl bg-[#F4EDE1] text-sand-600 text-xs font-semibold disabled:opacity-40"
                title="ביטול הרשמה"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : isFull ? (
            /* Full event — waitlist instead of a dead-end */
            onWaitlist ? (
              <div className="flex gap-2">
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold" style={{ background: '#F4EDE1', color: '#6E5836' }}>
                  ⏳ ברשימת ההמתנה (מקום {onWaitlist.my_position})
                </div>
                <button
                  onClick={() => leaveWaitlist(ev)}
                  disabled={busyId === ev.id}
                  className="px-3 py-2.5 rounded-2xl bg-[#F4EDE1] text-sand-600 text-xs font-semibold disabled:opacity-40"
                  title="ירידה מרשימת ההמתנה"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => joinWaitlist(ev)}
                disabled={busyId === ev.id}
                className="w-full py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40 transition-all"
                style={{ background: '#FFFFFF', border: '2px solid #E7C78A', color: '#8A6A2F' }}
              >
                {busyId === ev.id ? 'רגע...' : 'האירוע מלא. שמרי לי מקום בהמתנה 🤍'}
              </button>
            )
          ) : (
            <>
              {/* A spot just freed while she's on the waitlist */}
              {onWaitlist && (
                <p className="text-center text-[13px] font-bold mb-2" style={{ color: '#A35C3D' }}>
                  🎉 התפנה מקום! מהרי להירשם
                </p>
              )}
              <button
                onClick={() => register(ev)}
                disabled={busyId === ev.id}
                className="w-full py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-40 transition-all"
                style={{ background: '#E7C78A' }}
              >
                {busyId === ev.id ? 'רגע...' : ev.price > 0 ? `אני מגיעה! (₪${ev.price})` : 'אני מגיעה!'}
              </button>
            </>
          )}
          {isMine && ev.price > 0 && ev.payment_link && (
            <a href={ev.payment_link} target="_blank" rel="noopener noreferrer"
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-2xl text-xs font-bold text-mustard-700 bg-[#F4EDE1]">
              <ExternalLink className="w-3.5 h-3.5" /> להשלמת התשלום
            </a>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-3 animate-rise">
        <div className="flex justify-center"><MimoLeafPair size={72} /></div>
        <p className="font-semibold text-sand-700 text-sm">אירועי הקהילה הבאים בדרך 🎉</p>
        <p className="text-xs text-sand-600">ברגע שנפרסם את לוח האירועים החודשי, הוא יופיע כאן</p>
      </div>
    )
  }

  // Group by month, preserving RPC date order.
  const groups: { key: string; items: CommunityEventRow[] }[] = []
  for (const ev of events) {
    const key = monthKey(ev.event_date)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(ev)
    else groups.push({ key, items: [ev] })
  }
  const visibleGroups = monthFilter ? groups.filter(g => g.key === monthFilter) : groups

  // Calendar helpers
  const eventsByDate: Record<string, CommunityEventRow[]> = {}
  for (const ev of events) (eventsByDate[ev.event_date] ??= []).push(ev)
  const calFirstDow = new Date(calYm.y, calYm.m - 1, 1).getDay() // 0 = Sunday
  const calDays = new Date(calYm.y, calYm.m, 0).getDate()
  const calDateStr = (day: number) => `${calYm.y}-${String(calYm.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const calSelected = calSelectedId ? events.find(e => e.id === calSelectedId) ?? null : null

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-5 right-1/2 translate-x-1/2 z-50 bg-sand-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Events sub-header: context line + list/calendar icon pair.
          Small and adjacent to the content it controls — it's a
          rendering choice, not navigation (IA handoff §3). */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <p className="flex-1 font-semibold" style={{ fontSize: 15, color: '#7B604C' }}>
          {(() => {
            const now = new Date()
            const mk = `${MONTHS_HE[now.getMonth()]} ${now.getFullYear()}`
            const n = events.filter(ev => monthKey(ev.event_date) === mk).length
            return n > 0 ? 'האירועים הקרובים' : 'האירועים הקרובים'
          })()}
        </p>
        <div className="flex flex-none" style={{ background: '#F0EBE3', borderRadius: 12, padding: 3 }}>
          {([['list', List], ['calendar', CalendarDays]] as const).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-label={v === 'list' ? 'רשימה' : 'יומן'}
              style={view === v
                ? { background: '#FFF', color: '#4A3A28', borderRadius: 9, padding: '7px 10px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }
                : { color: '#7B604C', padding: '7px 10px' }}
            >
              <Icon style={{ width: 17, height: 17 }} />
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-5">
          {/* Month filter chips — only when events span multiple months */}
          {groups.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
              {[null, ...groups.map(g => g.key)].map(k => (
                <button
                  key={k ?? 'all'}
                  onClick={() => setMonthFilter(k)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${monthFilter === k ? 'text-[#4A3A28] shadow-sm' : 'bg-[#F4EDE1] text-sand-500'}`}
                  style={monthFilter === k ? { background: '#E7C78A' } : {}}
                >
                  {k ?? 'הכל'}
                </button>
              ))}
            </div>
          )}

          {visibleGroups.map(group => (
            <div key={group.key} className="space-y-3">
              <h2 className="text-sm font-bold text-sand-500 flex items-center gap-1.5">
                <CalendarHeart className="w-4 h-4 text-mustard-500" />
                אירועי {group.key}
              </h2>
              {group.items.map(ev => eventCard(ev))}
            </div>
          ))}
        </div>
      ) : (
        /* ── יומן — month calendar grid ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white rounded-2xl px-3 py-2 shadow-sm">
            <button onClick={() => calMove(-1)} className="p-1.5 rounded-xl text-sand-600 hover:bg-[#EFE6D6] transition-colors" title="חודש קודם">
              <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-sand-800">{MONTHS_HE[calYm.m - 1]} {calYm.y}</p>
            <button onClick={() => calMove(1)} className="p-1.5 rounded-xl text-sand-600 hover:bg-[#EFE6D6] transition-colors" title="חודש הבא">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-3xl p-3 shadow-sm">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => (
                <div key={d} className="text-center text-[13px] font-bold text-sand-600 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calFirstDow }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: calDays }, (_, i) => i + 1).map(day => {
                const ds = calDateStr(day)
                const dayEvents = eventsByDate[ds] ?? []
                const isToday = ds === todayLocalIso()
                return (
                  <div key={day} className={`min-h-[50px] rounded-xl p-1 text-center ${isToday ? 'bg-mustard-50 ring-1 ring-mustard-300' : 'bg-[#F4EDE1]/70'}`}>
                    <p className={`text-[13px] font-bold ${isToday ? 'text-mustard-700' : 'text-sand-600'}`}>{day}</p>
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      {dayEvents.map(ev => {
                        const mine = ev.my_status === 'registered' || ev.my_status === 'attended'
                        return (
                          <button key={ev.id}
                            onClick={() => { setCalSelectedId(cur => cur === ev.id ? null : ev.id); setExpandedId(ev.id); if (!attendees[ev.id]) loadAttendees(ev.id) }}
                            title={ev.title}
                            className={`w-full text-sm leading-none py-0.5 rounded-lg transition-all ${calSelectedId === ev.id ? 'bg-mustard-100 ring-2 ring-mustard-300' : 'hover:bg-[#EFE6D6]'} ${mine ? 'ring-1 ring-musgo-300' : ''}`}>
                            {ev.emoji ?? '🎉'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {calSelected
            ? eventCard(calSelected)
            : <p className="text-center text-xs text-sand-600">לחצי על אירוע ביומן כדי לראות פרטים ולהירשם 👆</p>}
        </div>
      )}

      {/* Attendee profile bottom-sheet — same component as the members directory */}
      {openAttendee && (() => {
        const a = openAttendee.attendee
        const firstName = (a.mother_name ?? 'אמא').split(' ')[0]
        const secondary = a.child_dob
          ? `אמא ל${a.child_gender === 'girl' ? 'תינוקת' : 'תינוק'} (${getBabyAge(a.child_dob)})`
          : 'אמא בקהילה'
        return (
          <CommunityMemberSheet
            member={a}
            avatarEmoji={genderEmoji(a.child_gender)}
            secondaryLine={secondary}
            whatsappGreeting={`היי ${firstName}! ראיתי שאת רשומה ל"${openAttendee.eventTitle}" וגם אני מגיעה! 🎉`}
            fallbackGreeting={`היי! רציתי להתחבר עם אמא שנרשמה ל"${openAttendee.eventTitle}" 🎉`}
            onClose={() => setOpenAttendee(null)}
          />
        )
      })()}

      {/* Event ticket — the member's entry card for a closed community event */}
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
