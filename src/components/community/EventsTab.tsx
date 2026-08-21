import { useCallback, useEffect, useState } from 'react'
import { MapPin, Clock, ExternalLink, Check, X, CalendarHeart, CalendarDays, List, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase, type CommunityEventRow, type MyWaitlist, type MyCredit } from '../../lib/supabase'
import { useTracker } from '../../hooks/useTracker'
import { MimoLeafPair } from '../MimoLeaf'
import MembershipCard from './MembershipCard'
import EventRemindersCard from './EventRemindersCard'

// "הקהילה של מימו" — user-facing community events. Two views:
// רשימה (monthly-grouped cards + month chips) and יומן (month calendar
// grid with prev/next navigation). One-tap register/cancel through
// SECURITY DEFINER RPCs (capacity enforced server-side).
//
// Brenda 19.8.26: "לא לאפשר לראות מי מגיעה לכל אירוע — זה גם מראה כשזה
// ריק וגם מראה כמות נרשמות". The "מי מגיעה" list was the last place the
// head count leaked: on a new event it announced that nobody had signed
// up, and on a full one it counted the room. Registrants are now an
// admin-only view (EventsAdminPanel + the vendor check-in page).

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


/** Park the event she is about to pay for, with the time she tapped.
 *
 *  This is INTENT, not payment. ThankYouPage promotes it only if the
 *  provider's success redirect arrives within INTENT_TTL_MS and is not
 *  carrying a different product — a stale key from an abandoned checkout
 *  used to be treated as proof of payment by the next thank-you page she
 *  ever landed on, whatever she had bought, which minted a free seat and
 *  then a real credit when she cancelled it.
 */
export const PENDING_EVENT_KEY = 'mimo_pending_event_id'
export const PENDING_EVENT_AT_KEY = 'mimo_pending_event_at'
export const INTENT_TTL_MS = 45 * 60 * 1000

function rememberPaymentIntent(eventId: string) {
  try {
    localStorage.setItem(PENDING_EVENT_KEY, eventId)
    localStorage.setItem(PENDING_EVENT_AT_KEY, String(Date.now()))
  } catch { /* private mode */ }
}

export default function EventsTab() {
  // Brenda 21.8.26 wants to know what a mother actually does in here, not
  // just that she reached the tab: which events she opened, and which of
  // those turned into a registration.
  const { track } = useTracker()
  const [events, setEvents] = useState<CommunityEventRow[]>([])
  // Entry-ticket modal for a registered event (digital card).
  const [ticketEvent, setTicketEvent] = useState<CommunityEventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Which event is showing the "how do you want to leave" sheet, and
  // the name typed into it.
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Brenda 21.8.26 chose to ask for notification permission "ברגע שיש
  // למה" — the second after she registers for something, not from a
  // settings screen she will never open. Until now the opt-in lived
  // inside ההזמנות שלי and only 3 mothers out of 57 had ever found it.
  const [justRegistered, setJustRegistered] = useState(false)
  // Month chips (list view) — null = show all months
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  // רשימה / יומן view toggle + calendar month navigation
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calYm, setCalYm] = useState<{ y: number; m: number }>(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })
  const [calSelectedId, setCalSelectedId] = useState<string | null>(null)
  // Guests a mother is bringing, per event, while she is still editing.
  // Yahav 12.8.26: community events have no questionnaire and no WhatsApp
  // group, so bringing a partner or a friend is only a name and a seat.
  // Falls back to what the server already has for her.
  const [guestDrafts, setGuestDrafts] = useState<Record<string, string[]>>({})
  const [guestOpen, setGuestOpen] = useState<Record<string, boolean>>({})

  // My waitlist entries (event_id → position). Simple waitlist: joining
  // is possible only when full; when a spot frees the card highlights
  // "התפנה מקום" and registering auto-converts the entry (DB trigger).
  const [waitlists, setWaitlists] = useState<Record<string, MyWaitlist>>({})

  // Open credits from cancelled paid events. Brenda 17.8.26: credits are
  // NOT pooled — one credit pays for one event costing the same or less,
  // never more. So we hold the list, not a sum, and each event asks
  // whether a single credit covers it.
  const [credits, setCredits] = useState<MyCredit[]>([])

  const loadCredit = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_credits')
    setCredits((data ?? []) as MyCredit[])
  }, [])

  // How many hours before an event a cancellation still earns a credit.
  // Admin setting (global_settings.credit_cancel_hours) so Brenda can move
  // it without a deploy; 48 is the default she chose.
  const [creditHours, setCreditHours] = useState(48)
  useEffect(() => {
    supabase.from('global_settings').select('setting_value')
      .eq('setting_key', 'credit_cancel_hours').maybeSingle()
      .then(({ data }) => {
        const n = Number(data?.setting_value)
        if (Number.isFinite(n) && n > 0) setCreditHours(n)
      })
  }, [])

  /** The credit that would pay for this event, or null.
   *  Mirrors redeem_credit_for_event's choice exactly — soonest to expire,
   *  then smallest — so the amount on the button is the amount that gets
   *  spent. A UI that promised one credit and burned another would be
   *  worse than no button. */
  function creditFor(total: number): MyCredit | null {
    if (total <= 0) return null
    return credits
      .filter(c => Number(c.amount) >= total)
      .sort((a, b) => a.expires_at.localeCompare(b.expires_at) || Number(a.amount) - Number(b.amount))[0] ?? null
  }

  /** Is a cancellation still early enough to earn the credit back?
   *  Same rule as cancel_event_registration, so the sheet can tell her the
   *  truth before she taps instead of after. */
  function creditStillDue(ev: CommunityEventRow): boolean {
    const start = new Date(`${ev.event_date}T${(ev.start_time ?? '00:00').slice(0, 5)}:00`)
    return Date.now() <= start.getTime() - creditHours * 3600_000
  }

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

  useEffect(() => { load(); loadCredit() }, [load, loadCredit])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function toggleExpand(ev: CommunityEventRow) {
    const opening = expandedId !== ev.id
    setExpandedId(opening ? ev.id : null)
    if (opening) track('event_open', { event_id: ev.id, title: ev.title, price: ev.price })
  }

  /** Names she is bringing: her unsaved edits first, else what is stored. */
  function guestsOf(ev: CommunityEventRow): string[] {
    return guestDrafts[ev.id] ?? ev.my_guests ?? []
  }

  function setGuests(eventId: string, next: string[]) {
    setGuestDrafts(prev => ({ ...prev, [eventId]: next }))
  }

  function cleanGuests(ev: CommunityEventRow): string[] {
    return guestsOf(ev).map(g => g.trim()).filter(Boolean).slice(0, 3)
  }

  /** An open guest field with nothing typed in it. She has said she is
   *  bringing someone but not who, so the seat count and the price
   *  cannot be trusted yet. */
  function hasBlankGuest(ev: CommunityEventRow): boolean {
    return (guestOpen[ev.id] ?? false) && guestsOf(ev).some(g => g.trim() === '')
  }

  /** Morning links carry a fixed amount, so the link itself has to
   *  change with the number of seats. Two has its own link when Brenda
   *  set one; anything else pays through the single-seat link, more
   *  than once, and the card says so out loud. */
  function paymentLinkFor(ev: CommunityEventRow, seats: number): string | null {
    if (seats === 2 && ev.payment_link_pair) return ev.payment_link_pair
    return ev.payment_link
  }

  /** True when the link she will be sent to actually charges for
   *  everyone coming. */
  function paymentIsExact(ev: CommunityEventRow, seats: number): boolean {
    if (ev.price <= 0) return true
    if (seats === 1) return true
    return seats === 2 && !!ev.payment_link_pair
  }

  async function register(ev: CommunityEventRow) {
    const guests = cleanGuests(ev)

    // Safari on iOS only lets a tab open while the tap is still being
    // handled. Waiting for the RPC and then calling window.open lost that
    // permission, so on an iPhone — most of this audience — she tapped
    // "אני מגיעה!", no payment page appeared, and the toast cheerfully
    // told her the seat was held pending a payment she was never shown.
    // So the tab is opened NOW, empty, and pointed at the link once the
    // server answers; if the seat is not held after all, it is closed.
    // NOTE: no 'noopener' here. The spec says window.open returns null
    // when noopener is set, so the handle would always be null and this
    // whole mechanism would silently do nothing — while still leaving an
    // about:blank tab behind and then opening a SECOND one after the
    // await. opener is severed manually instead.
    const payTab = ev.price > 0 ? window.open('', '_blank') : null
    if (payTab) { try { payTab.opener = null } catch { /* cross-origin */ } }

    setBusyId(ev.id)
    const { data, error } = await supabase.rpc('register_for_event', {
      p_event_id: ev.id,
      p_guest_names: guests,
    })
    setBusyId(null)
    if (error) { payTab?.close(); showToast('שגיאה. נסי שוב'); return }
    if (data === 'full') {
      // With guests this is usually "not enough room for all of you"
      // rather than "the event filled up", so say which one it is.
      payTab?.close()
      showToast(guests.length > 0 ? 'אין מספיק מקומות לכולכן 😢' : 'האירוע התמלא בדיוק עכשיו 😢')
      load()
      return
    }
    if (data === 'pending') {
      // Paid event: nothing is booked yet. The row holds the seat for
      // ten minutes, which is the length of a checkout, and only the
      // return from the thank-you page makes her registered. The id is
      // left where the thank-you page will look for it.
      track('event_register', { event_id: ev.id, title: ev.title, price: ev.price, paid: true })
      setJustRegistered(true)
      rememberPaymentIntent(ev.id)
      const link = paymentLinkFor(ev, guests.length + 1)
      if (link && payTab) payTab.location.href = link
      else if (link) window.open(link, '_blank', 'noopener')
      else payTab?.close()
      showToast(link
        ? 'המקום שמור לך ל-10 דקות. משלימות תשלום ואת בפנים 🤎'
        // No Morning link on the event. Silently holding a seat she cannot
        // pay for reads as a broken app; say so and point at WhatsApp.
        : 'המקום שמור לך. אין כאן קישור תשלום, כתבי לנו ונסדר את זה 🤎')
      setGuestDrafts(prev => { const n = { ...prev }; delete n[ev.id]; return n })
      setGuestOpen(prev => ({ ...prev, [ev.id]: false }))
      load()
      return
    }
    if (data === 'unauthorized' || data === 'not_found') {
      // Session expired, or the event was unpublished while she looked at
      // it. Both used to fall off the end of this function: no toast, no
      // reload, and an about:blank tab left open.
      payTab?.close()
      showToast(data === 'unauthorized' ? 'צריך להתחבר מחדש' : 'האירוע כבר לא זמין')
      load()
      return
    }
    if (data === 'registered' || data === 'already' || data === 'updated') {
      payTab?.close()
      if (data !== 'already') {
        track('event_register', { event_id: ev.id, title: ev.title, price: ev.price, paid: false })
        setJustRegistered(true)
      }
      // Only FREE events land here: register_for_event returns 'pending'
      // for anything priced, handled above. No payment link is opened on
      // this path — that is what kept sending a paid mother back to
      // checkout a second time.
      const seats = guests.length + 1
      showToast(
        data === 'already' ? 'את כבר רשומה לאירוע 🤎'
        : seats > 1 ? 'נתראה שם, שתיכן! 🤎'
        : 'נתראה שם! 🤎',
      )
      setGuestDrafts(prev => { const n = { ...prev }; delete n[ev.id]; return n })
      setGuestOpen(prev => ({ ...prev, [ev.id]: false }))
      load()
    }
  }

  /** Brenda 17.8.26: "I want the credit kept in the app, and if I want to
   *  register I can use the credit or pay again." So a paid event shows a
   *  second button when her open balance covers the whole thing. Partial
   *  redemption is deliberately not offered — Morning cannot produce a
   *  payment link for the remainder, so half-paying would strand her. */
  async function redeemCredit(ev: CommunityEventRow) {
    setBusyId(ev.id)
    const { data, error } = await supabase.rpc('redeem_credit_for_event', {
      p_event_id: ev.id,
      p_guest_names: cleanGuests(ev),
    })
    setBusyId(null)
    if (error) { showToast('שגיאה. נסי שוב'); return }
    if (data === 'insufficient') { showToast('אין לך זיכוי שמכסה את האירוע הזה'); loadCredit(); return }
    if (data === 'full') { showToast('האירוע התמלא בדיוק עכשיו 😢'); load(); return }
    if (data === 'already') { showToast('את כבר רשומה לאירוע 🤎'); load(); return }
    if (data !== 'redeemed') { showToast('שגיאה. נסי שוב'); return }
    showToast('שילמנו עם הזיכוי שלך. נתראה שם! 🤎')
    setGuestDrafts(prev => { const n = { ...prev }; delete n[ev.id]; return n })
    setGuestOpen(prev => ({ ...prev, [ev.id]: false }))
    loadCredit()
    load()
  }

  async function cancel(ev: CommunityEventRow) {
    setBusyId(ev.id)
    const { data, error } = await supabase.rpc('cancel_event_registration', { p_event_id: ev.id })
    setBusyId(null)
    setCancelling(null)
    if (error) { showToast('שגיאה. נסי שוב'); return }
    showToast(
      data === 'cancelled_with_credit'
        ? 'ההרשמה בוטלה. הכסף שמור לך כזיכוי באפליקציה לחודש הקרוב 🤎'
        : data === 'cancelled_too_late'
          ? 'ההרשמה בוטלה. הביטול מאוחר מדי לזיכוי'
          : 'ההרשמה בוטלה. המקום התפנה למישהי אחרת',
    )
    loadCredit()
    load()
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

  // ── "מי מגיעה איתך" editor ──
  // A plain function and not a component on purpose: a component declared
  // inside this one is a new type on every render, so React would remount
  // the inputs and the field would lose focus after each keystroke.
  function guestEditor(ev: CommunityEventRow, saveLabel: string | null) {
    const list = guestsOf(ev)
    const open = guestOpen[ev.id] ?? false
    const seats = cleanGuests(ev).length + 1

    // Brenda 17.8.26: "coming with someone else — make it smaller, to the
    // side." It was a full-width filled button sitting directly above the
    // register button, so the card offered two equally loud choices when
    // bringing a friend is the rare one. It is a quiet inline link now, and
    // it says מישהו/י because partners come too.
    if (!open) {
      if (list.length === 0) {
        return (
          <button
            onClick={() => { setGuests(ev.id, ['']); setGuestOpen(prev => ({ ...prev, [ev.id]: true })) }}
            className="mb-2 text-[12px] font-semibold px-1 transition-colors hover:brightness-95"
            style={{ color: '#9C8A74' }}
          >
            + מגיעה עם עוד מישהו/י
          </button>
        )
      }
      return (
        <button
          onClick={() => setGuestOpen(prev => ({ ...prev, [ev.id]: true }))}
          className="mb-2 text-[12px] font-semibold px-1 text-right transition-colors hover:brightness-95"
          style={{ color: '#9C8A74' }}
        >
          מגיעה עם {list.join(', ')} · לשינוי
        </button>
      )
    }

    return (
      <div className="mb-2 space-y-1.5">
        {list.map((g, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={g}
              onChange={e => setGuests(ev.id, list.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="השם של מי שמגיע/ה איתך"
              maxLength={40}
              className="flex-1 px-3 py-2 rounded-2xl text-[13px] font-semibold outline-none"
              style={{ background: '#FFFFFF', border: '1.5px solid #E4DACB', color: '#4A3A28' }}
            />
            <button
              onClick={() => {
                const next = list.filter((_, j) => j !== i)
                setGuests(ev.id, next)
                if (next.length === 0) setGuestOpen(prev => ({ ...prev, [ev.id]: false }))
              }}
              className="p-2 rounded-2xl"
              style={{ background: '#F4EDE1', color: '#8A7A63' }}
              title="הסרה"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          {list.length < 3 ? (
            <button
              onClick={() => setGuests(ev.id, [...list, ''])}
              className="text-[12px] font-semibold"
              style={{ color: '#9C8A74' }}
            >
              + עוד אחד/ת
            </button>
          ) : <span />}
        </div>
        {ev.price > 0 && seats > 1 && !paymentIsExact(ev, seats) && (
          <p className="text-[13px] font-semibold leading-snug" style={{ color: '#8C6E63' }}>
            קישור התשלום הוא לאחת, אז צריך לעבור בו {seats} פעמים, סה״כ ₪{ev.price * seats}.
          </p>
        )}
        {saveLabel && (
          <button
            onClick={() => register(ev)}
            disabled={busyId === ev.id || hasBlankGuest(ev)}
            className="w-full py-2 rounded-2xl text-[13px] font-bold disabled:opacity-40"
            style={{ background: '#818267', color: '#FFFFFF' }}
          >
            {busyId === ev.id ? 'רגע...' : hasBlankGuest(ev) ? 'צריך למלא את השם' : saveLabel}
          </button>
        )}
      </div>
    )
  }

  // ── Single event card (shared by list + calendar views) ──
  function eventCard(ev: CommunityEventRow) {
    const spotsLeft = ev.capacity != null ? ev.capacity - ev.registered_count : null
    const isFull = spotsLeft != null && spotsLeft <= 0
    const isMine = ev.my_status === 'registered' || ev.my_status === 'attended'
    // Started paying and has not come back. Not a registration.
    const isHolding = ev.my_status === 'pending'
    const onWaitlist = waitlists[ev.id]
    // A seat freed and it is hers for the hour. It counts against the
    // room, so without this the card would tell her the event is full.
    const myOffer = onWaitlist?.offer_expires_at ?? null
    const offerUntil = myOffer
      ? new Date(myOffer).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : null
    const expanded = expandedId === ev.id

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
                {/* Brenda 17.8.26: "leave the cost on the card top-left in
                    red, and nowhere else on the card." The price used to be
                    repeated on the guest row and inside the register button;
                    saying it three times made the card read as a checkout.
                    One chip, one number. */}
                <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={ev.price > 0
                    ? { background: '#FBEBE7', color: '#C1392C' }
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

              {/* Scarcity only. Brenda 17.8.26: drop the head count and the
                  "היי הראשונה!" line — on a new event both of them announce
                  that nobody is coming, which is the opposite of social
                  proof. What is left says only how little room is left. */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
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

          {/* Expanded: description + location link. No registrant list —
              see the note at the top of the file. */}
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
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="px-4 pb-4">
          {isHolding ? (
            <div className="space-y-2">
              <p className="text-center text-[13px] font-bold" style={{ color: '#A35C3D' }}>
                {ev.my_payment_claimed_at
                  ? 'קיבלנו! מאשרות את התשלום ושומרות לך את המקום 🤎'
                  : 'להשלמת ההרשמה אנא השלימי את התשלום.'}
              </p>
              <div className="flex gap-2">
                {!ev.my_payment_claimed_at && (
                  <a
                    href={paymentLinkFor(ev, (ev.my_guests?.length ?? 0) + 1) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => rememberPaymentIntent(ev.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28] transition-all hover:brightness-95"
                    style={{ background: '#E7C78A' }}
                  >
                    <ExternalLink className="w-4 h-4" /> להשלמת התשלום
                  </a>
                )}
                <button
                  onClick={() => cancel(ev)}
                  disabled={busyId === ev.id}
                  className={`px-3 py-2.5 rounded-2xl bg-[#F4EDE1] text-sand-600 text-xs font-bold disabled:opacity-40 whitespace-nowrap ${ev.my_payment_claimed_at ? 'flex-1' : ''}`}
                >
                  לביטול הרשמה
                </button>
              </div>
              {/* BUG 3: a mother mid-payment could not switch to a credit —
                  the option only existed before she tapped register. The
                  RPC always allowed it, the button just was not there. */}
              {(() => {
                const credit = creditFor(ev.price * ((ev.my_guests?.length ?? 0) + 1))
                if (!credit || ev.my_payment_claimed_at) return null
                return (
                  <button
                    onClick={() => redeemCredit(ev)}
                    disabled={busyId === ev.id}
                    className="w-full py-2 rounded-2xl text-[13px] font-bold disabled:opacity-40"
                    style={{ background: '#FFFFFF', border: '2px solid #E7C78A', color: '#8A6A2F' }}
                  >
                    או לשלם עם הזיכוי שלי (₪{Number(credit.amount)})
                  </button>
                )
              })()}
              {/* Brenda 17.8.26, later the same day: she removed Bit, Apple
                  Pay and Google Pay from Morning, leaving card only — and a
                  card payment always returns through the thank-you page, so
                  the app sees it by itself. The "I paid by Bit" button was
                  a workaround for payments that never came back; with none
                  of those left it would only invite a false claim.
                  claim_event_payment and the admin confirm queue stay in
                  place, unused, for the rare payment that still goes
                  missing (a crashed tab) and for the day Bit comes back. */}
            </div>
          ) : isMine ? (
            <>
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
                onClick={() => setCancelling(cur => cur === ev.id ? null : ev.id)}
                disabled={busyId === ev.id}
                className="px-3 py-2.5 rounded-2xl bg-[#F4EDE1] text-sand-600 text-xs font-bold disabled:opacity-40 whitespace-nowrap"
              >
                לביטול הרשמה
              </button>
              </div>
              {/* Brenda 17.8.26: no "send someone in my place" — cancelling
                  offers one outcome, a credit inside the app. */}
              {cancelling === ev.id && (
                <div className="mt-2 rounded-2xl p-3 space-y-2" style={{ background: '#FAF7F1' }}>
                  <p className="text-[13px] font-bold" style={{ color: '#5E4938' }}>
                    לא מסתדר לך להגיע?
                  </p>
                  {ev.price > 0 && ev.my_paid && (
                    creditStillDue(ev) ? (
                      <p className="text-[12px] leading-relaxed" style={{ color: '#8C6E63' }}>
                        הסכום ששילמת יישמר לך כזיכוי <b>באפליקציה</b> לחודש הקרוב, לשימוש באירוע קהילה
                        אחר באותו מחיר או פחות.
                      </p>
                    ) : (
                      <p className="text-[12px] leading-relaxed font-semibold" style={{ color: '#A35C3D' }}>
                        הזיכוי ניתן עד {creditHours} שעות לפני האירוע, והמועד עבר. אפשר לבטל,
                        אבל הפעם בלי זיכוי.
                      </p>
                    )
                  )}
                  <button
                    onClick={() => cancel(ev)}
                    disabled={busyId === ev.id}
                    className="w-full py-2 rounded-2xl text-[13px] font-bold disabled:opacity-40"
                    style={{ background: '#FFFFFF', border: '1.5px solid #E4DACB', color: '#8C6E63' }}
                  >
                    {ev.price > 0 && ev.my_paid && creditStillDue(ev) ? 'ביטול וקבלת זיכוי' : 'ביטול ההרשמה'}
                  </button>
                </div>
              )}
              {/* Brenda 17.8.26: "after I registered you can't add someone —
                  cancel that option". It also had a money hole behind it:
                  a guest added after payment was a seat nobody paid for,
                  which is what produced the ₪60 credit on a ₪30 purchase. */}
            </>
          ) : isFull && !myOffer ? (
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
                  {offerUntil
                    ? `🎉 התפנה מקום והוא שמור לך עד ${offerUntil}`
                    : '🎉 התפנה מקום! מהרי להירשם'}
                </p>
              )}
              {guestEditor(ev, null)}
              <button
                onClick={() => register(ev)}
                disabled={busyId === ev.id || hasBlankGuest(ev)}
                className="w-full py-2.5 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-40 transition-all"
                style={{ background: '#E7C78A' }}
              >
                {busyId === ev.id ? 'רגע...' : hasBlankGuest(ev) ? 'צריך למלא את השם'
                  : cleanGuests(ev).length + 1 > 1 ? 'אנחנו מגיעות!' : 'אני מגיעה!'}
              </button>
              {(() => {
                // One credit covers one event, same price or less. If none
                // of her credits reaches this total she pays normally —
                // credits are not added together.
                const credit = creditFor(ev.price * (cleanGuests(ev).length + 1))
                if (!credit) return null
                return (
                  <button
                    onClick={() => redeemCredit(ev)}
                    disabled={busyId === ev.id || hasBlankGuest(ev)}
                    className="mt-2 w-full py-2.5 rounded-2xl text-sm font-bold disabled:opacity-40 transition-all"
                    style={{ background: '#FFFFFF', border: '2px solid #E7C78A', color: '#8A6A2F' }}
                  >
                    לשימוש בזיכוי שלי (₪{Number(credit.amount)})
                  </button>
                )
              })()}
            </>
          )}
          {/* Brenda 17.8.26: this was the "it still asks me to pay after I
              used a credit" bug — the condition never looked at whether
              anything was owed. It stays for the one case that needs it:
              a mother Brenda registered by hand who has not paid yet. */}
          {isMine && ev.price > 0 && !ev.my_paid && paymentLinkFor(ev, (ev.my_guests?.length ?? 0) + 1) && (
            <a href={paymentLinkFor(ev, (ev.my_guests?.length ?? 0) + 1)!} target="_blank" rel="noopener noreferrer"
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
      {/* Asked at the only moment it makes sense: she has just taken a
          seat, so "shall we remind you the day before?" is an answer to a
          question she already has. EventRemindersCard renders nothing at
          all when push is unsupported or already on. */}
      {justRegistered && (
        <div className="rounded-3xl p-4 space-y-2.5 animate-rise" style={{ background: '#FFFFFF', border: '1px solid #E7C78A' }}>
          <p className="font-bold text-sm" style={{ color: '#6E5836' }}>נרשמת, מחכות לך 🤎</p>
          <EventRemindersCard />
        </div>
      )}
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
                  // Yahav 12.8.26: a day with something on it wears the
                  // brand's rosa polvo, so the month reads at a glance.
                  // Empty days stay the quiet sand they were.
                  <div
                    key={day}
                    className={`min-h-[50px] rounded-xl p-1 text-center ${isToday ? 'bg-mustard-50 ring-1 ring-mustard-300' : ''}`}
                    style={isToday ? undefined : { background: dayEvents.length > 0 ? '#EADBDD' : 'rgba(244,237,225,.7)' }}
                  >
                    <p
                      className={`text-[13px] font-bold ${isToday ? 'text-mustard-700' : ''}`}
                      style={isToday ? undefined : { color: dayEvents.length > 0 ? '#5E4938' : '#A2937D' }}
                    >{day}</p>
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      {dayEvents.map(ev => {
                        const mine = ev.my_status === 'registered' || ev.my_status === 'attended'
                        return (
                          <button key={ev.id}
                            onClick={() => { setCalSelectedId(cur => cur === ev.id ? null : ev.id); setExpandedId(ev.id) }}
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
