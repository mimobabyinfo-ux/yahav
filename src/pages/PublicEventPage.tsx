import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, MapPin, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'
import { useOwnerSettings } from '../hooks/useOwnerSettings'

// ?event=<id> — registering for a community event WITHOUT the app.
//
// Yahav 11.9.26: "אני רוצה לתת אופציה להירשם לאירועי קהילה מבחוץ מי שאין
// לה אפליקציה אבל אין לי לינק להרשמה חיצוני".
//
// A registration needs an account (event_registrations.user_id is NOT
// NULL), so the page asks for name, phone and email, and the edge function
// public-event-register creates the account and holds the seat exactly the
// way the app does: ten minutes, then Morning. The morning-paid webhook
// confirms the seat by her email or phone, so no session is needed here.
//
// After she goes to Morning, THIS tab stays open and polls her status by
// claim token. Once the payment lands, the page says so and offers a door
// into the app (a fresh magic link, minted only for a paid seat). The
// thank-you page Morning redirects to is not involved: it would need her
// session, which a guest does not have.
//
// The seat count is deliberately not shown (Yahav: "כמה מקומות נשארו אין
// צורך להציג"); a full event simply has no button.

type PublicEvent = {
  id: string
  title: string
  emoji: string | null
  description: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  location_link: string | null
  price: number
  image_url: string | null
  is_open: boolean
}

type Phase = 'form' | 'hold' | 'done' | 'expired'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-event-register`
const POLL_MS = 5_000
const HOLD_MS = 10 * 60_000

const inputCls = 'w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400'
const labelCls = 'block text-xs font-semibold text-sand-600 mb-1.5'

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
function isValidPhone(s: string) {
  const d = s.replace(/\D/g, '')
  return d.length === 9 || d.length === 10 || (d.startsWith('972') && d.length === 12)
}
function dateLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function timeLabel(from: string | null, to: string | null): string | null {
  if (!from) return null
  const f = from.slice(0, 5)
  return to ? `${f} עד ${to.slice(0, 5)}` : f
}

async function callFn(body: Record<string, unknown>): Promise<{ status: number; out: Record<string, unknown> | null }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  return { status: res.status, out }
}

export default function PublicEventPage({ eventId }: { eventId: string }) {
  const { ownerName, ownerWhatsapp } = useOwnerSettings()
  const [ev, setEv] = useState<PublicEvent | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [phase, setPhase] = useState<Phase>('form')
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [already, setAlready] = useState(false)
  const holdStartedAt = useRef<number>(0)

  useEffect(() => { document.title = 'הרשמה למפגש · Mimo' }, [])

  useEffect(() => {
    supabase.rpc('get_public_event', { p_event_id: eventId }).then(({ data }) => {
      const row = Array.isArray(data) ? (data[0] as PublicEvent | undefined) : null
      setEv(row ? { ...row, price: Number(row.price) } : null)
      setLoading(false)
    })
  }, [eventId])

  // While she is at Morning: ask every few seconds whether the webhook
  // has confirmed her seat. Stops on its own when the hold is over.
  useEffect(() => {
    if (phase !== 'hold' || !claimToken) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      const { out } = await callFn({ mode: 'status', claim_token: claimToken })
      if (stopped) return
      if (out?.status === 'registered') { setPhase('done'); return }
      if (out?.status === 'expired' || Date.now() - holdStartedAt.current > HOLD_MS) { setPhase('expired'); return }
    }
    const id = setInterval(tick, POLL_MS)
    return () => { stopped = true; clearInterval(id) }
  }, [phase, claimToken])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ev) return
    if (name.trim().length < 2) { setError('איך קוראים לך?'); return }
    if (!isValidPhone(phone)) { setError('מספר הטלפון לא נראה תקין'); return }
    if (!isValidEmail(email)) { setError('כתובת המייל לא נראית תקינה'); return }
    setError(null)
    setBusy(true)

    // Open the payment tab NOW, inside the click, or mobile Safari blocks
    // it after the await. Same trick as EventsTab.
    const payTab = ev.price > 0 ? window.open('', '_blank') : null
    if (payTab) { try { payTab.opener = null } catch { /* cross-origin */ } }

    const { status, out } = await callFn({ event_id: ev.id, name: name.trim(), phone: phone.trim(), email: email.trim() })
    setBusy(false)

    if (!out?.ok) {
      payTab?.close()
      const reason = String(out?.reason ?? '')
      setError(
        reason === 'full' ? 'המפגש התמלא בדיוק עכשיו' :
        reason === 'past' ? 'המפגש כבר עבר' :
        reason === 'bad_email' ? 'כתובת המייל לא נראית תקינה' :
        reason === 'bad_phone' ? 'מספר הטלפון לא נראה תקין' :
        `משהו השתבש (${status}). אפשר לנסות שוב או לכתוב ל${ownerName}.`,
      )
      return
    }

    setClaimToken((out.claim_token as string | null) ?? null)
    const link = (out.payment_link as string | null) ?? null
    setPaymentLink(link)

    if (out.status === 'already') {
      payTab?.close()
      setAlready(true)
      setPhase('done')
      return
    }
    if (out.status === 'registered') {
      payTab?.close()
      setPhase('done')
      return
    }
    // pending: a seat is held for ten minutes. Send her to pay.
    holdStartedAt.current = Date.now()
    setPhase('hold')
    if (link && payTab) payTab.location.href = link
    else payTab?.close()
  }

  async function openApp() {
    if (!claimToken) return
    setBusy(true)
    const { out } = await callFn({ mode: 'link', claim_token: claimToken })
    setBusy(false)
    const target = (out?.action_link as string | undefined) ?? null
    if (target) window.location.assign(target)
    else window.location.assign('/')
  }

  const waHref = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! יש לי שאלה לגבי ${ev?.title ?? 'המפגש'}`)}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F4EC' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  if (!ev) {
    return (
      <div className="min-h-screen px-4 py-8 flex items-center justify-center" dir="rtl" style={{ background: '#F8F4EC' }}>
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6"><MimoLogo size={120} /></div>
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center space-y-3">
            <h2 className="text-lg font-bold text-sand-800">המפגש לא נמצא</h2>
            <p className="text-sm text-sand-600 leading-relaxed">אולי הקישור ישן. אפשר לכתוב ל{ownerName} ונמצא לך מפגש.</p>
            <a href={waHref} className="block mt-2 py-3 rounded-2xl text-sm font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
              לכתוב בוואטסאפ
            </a>
          </div>
        </div>
      </div>
    )
  }

  const time = timeLabel(ev.start_time, ev.end_time)

  return (
    <div className="min-h-screen px-4 py-8" dir="rtl" style={{ background: '#F8F4EC' }}>
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center">
          <div className="flex justify-center mb-2"><MimoLogo size={100} /></div>
          <p className="text-sand-500 text-xs">מפגש של קהילת מימו</p>
        </div>

        {/* The event */}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          {ev.image_url && (
            <img src={ev.image_url} alt="" className="w-full object-cover" style={{ maxHeight: 220 }} />
          )}
          <div className="p-6 space-y-3">
            <h1 className="text-xl font-bold text-sand-800">
              {ev.emoji ? `${ev.emoji} ` : ''}{ev.title}
            </h1>
            <div className="space-y-1.5 text-sm text-sand-700">
              <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sand-400" />{dateLabel(ev.event_date)}</p>
              {time && <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-sand-400" />{time}</p>}
              {ev.location && (
                <p className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sand-400" />
                  {ev.location_link
                    ? <a href={ev.location_link} target="_blank" rel="noopener noreferrer" className="underline">{ev.location}</a>
                    : ev.location}
                </p>
              )}
            </div>
            {ev.description && (
              <p className="text-sm text-sand-600 leading-relaxed whitespace-pre-line">{ev.description}</p>
            )}
            <p className="font-bold text-sand-800">
              {ev.price > 0 ? `₪${ev.price}` : 'ללא עלות'}
            </p>
          </div>
        </div>

        {/* The form / the hold / the confirmation */}
        {phase === 'form' && !ev.is_open && (
          <div className="bg-white rounded-3xl shadow-sm p-6 text-center space-y-3">
            <p className="text-sm font-bold text-sand-800">ההרשמה למפגש הזה סגורה</p>
            <p className="text-xs text-sand-500 leading-relaxed">אפשר לכתוב ל{ownerName} ולשמוע על המפגש הבא.</p>
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="block py-3 rounded-2xl text-sm font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
              לכתוב בוואטסאפ
            </a>
          </div>
        )}

        {phase === 'form' && ev.is_open && (
          <form onSubmit={submit} className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
            <p className="text-sm font-bold text-sand-800">אני מגיעה!</p>
            <div>
              <label className={labelCls}>שם מלא</label>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label className={labelCls}>טלפון</label>
              <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>מייל</label>
              <input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="email" dir="ltr" />
              <p className="text-[11px] text-sand-400 mt-1">איתו נפתח לך גם כניסה לאפליקציית מימו, בלי סיסמה.</p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full py-3.5 rounded-2xl text-sm font-bold disabled:opacity-60"
              style={{ background: '#E7C78A', color: '#4A3A28' }}>
              {busy ? 'רגע...' : ev.price > 0 ? `להרשמה ותשלום · ₪${ev.price}` : 'להרשמה'}
            </button>
            {ev.price > 0 && (
              <p className="text-[11px] text-sand-400 leading-relaxed text-center">
                המקום נשמר לך ל-10 דקות עד סיום התשלום. התשלום נפתח בחלון חדש.
              </p>
            )}
          </form>
        )}

        {phase === 'hold' && (
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
            <p className="text-sm font-bold text-sand-800">המקום שמור לך ל-10 דקות 🤍</p>
            <p className="text-xs text-sand-600 leading-relaxed">
              התשלום נפתח בחלון חדש. אחרי שתסיימי, הדף הזה יתעדכן לבד.
            </p>
            {paymentLink && (
              <a href={paymentLink} target="_blank" rel="noopener noreferrer"
                className="block py-3 rounded-2xl text-sm font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
                החלון לא נפתח? לתשלום
              </a>
            )}
            <p className="text-[11px] text-sand-400 animate-pulse">ממתינים לאישור התשלום...</p>
          </div>
        )}

        {phase === 'expired' && (
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
            <p className="text-sm font-bold text-sand-800">לא קיבלנו אישור תשלום</p>
            <p className="text-xs text-sand-600 leading-relaxed">
              אם שילמת, הכל בסדר: המקום שלך יאושר ונעדכן אותך. אם לא, אפשר לנסות שוב.
            </p>
            <button onClick={() => setPhase('form')}
              className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: '#E7C78A', color: '#4A3A28' }}>
              לנסות שוב
            </button>
            <a href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! נרשמתי ל${ev.title} ולא קיבלתי אישור`)}`}
              target="_blank" rel="noopener noreferrer" className="block text-xs text-sand-500 underline">
              לכתוב ל{ownerName}
            </a>
          </div>
        )}

        {phase === 'done' && (
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3 text-center">
            <p className="text-3xl">🤍</p>
            <p className="text-sm font-bold text-sand-800">
              {already ? 'את כבר רשומה למפגש הזה' : 'נתראה במפגש!'}
            </p>
            <p className="text-xs text-sand-600 leading-relaxed">
              {dateLabel(ev.event_date)}{time ? `, ${time}` : ''}{ev.location ? `, ${ev.location}` : ''}.
            </p>
            <div className="rounded-2xl p-4 text-right space-y-2" style={{ background: '#FDF3E3', border: '1px solid #E7C78A' }}>
              <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>החשבון שלך במימו מוכן</p>
              <p className="text-xs leading-relaxed" style={{ color: '#6E5836' }}>
                שם רואים את כל מפגשי הקהילה, נרשמים בלחיצה, ויש גם יומן לתינוק.
              </p>
              <button onClick={openApp} disabled={busy}
                className="block w-full py-3 rounded-xl font-bold text-sm text-center text-[#4A3A28] disabled:opacity-60"
                style={{ background: '#E7C78A' }}>
                {busy ? 'רגע...' : 'כניסה לאפליקציה'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-sand-400">
          שאלות? <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline">לכתוב ל{ownerName}</a>
        </p>
      </div>
    </div>
  )
}
