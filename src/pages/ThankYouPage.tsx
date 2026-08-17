import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'
import { pixelTrack } from '../utils/metaPixel'

// ?thanks — where Morning sends her back after a successful payment.
//
// It used to say the same thing to everyone ("פרטים יישלחו בקבוצת
// ווטסאפ"), which is wrong for a 1:1 session (no group) and wrong for a
// physical product (nothing to meet about — there's a pickup to
// coordinate). So the page now resolves WHAT was bought and shows one
// of five templates, all editable in הגדרות:
//
//   group   — a workshop that runs in cohorts → WhatsApp group
//   meetup  — a one-off meeting (מפגש אבות, בוקר של מימו): it has
//             cohorts too, but NO dedicated group — details come
//             personally, so promising a group would be a lie
//   private — 1:1 / no cohorts → Brenda will be in touch to set a time
//   product — a physical add-on → coordinate pickup with Brenda
//   simple  — anything that is neither: the 30₪ דמי רצינות for a
//             community event. Whoever pays it is already IN the
//             community, so the community link would read as if nobody
//             was paying attention. Just a thank-you.
//
// The kind is auto-detected, but workshops.thanks_template overrides it
// per product — auto-detection can't tell a cohort with a group from a
// cohort without one.
//
// How it knows, best source first:
//   1. the lead id the site stashed in localStorage before redirecting
//      to payment (also flips that registration to שילמה), then
//   2. ?thanks=<workshop id or title> — what Brenda pastes into each
//      Morning link's success URL, which is the only signal available
//      for a payment link she sent by hand over WhatsApp.
//
// Every route into the app now records the registration BEFORE payment
// — the public form does it, and the in-app store does it too since
// 11.8 — so by the time she lands here we already know who she is. The
// page therefore never asks for details. Someone who paid from a raw
// WhatsApp link stays unknown to the app on purpose (Brenda, 11.8:
// "להוריד לגמרי") and Brenda marks that payment by hand, as before.

//   course  — a digital course. The only kind with nothing to wait for:
//             the content is already open and the login link is in her
//             inbox. Promising "פרטים יישלחו" here would be wrong.
type ThanksKind = 'group' | 'meetup' | 'private' | 'product' | 'simple' | 'course'

type ThanksContext = {
  found: boolean
  workshop_id?: string
  title?: string
  kind?: ThanksKind
  price?: number | null
  lead_found?: boolean
  lead_name?: string | null
  lead_status?: string | null
  cohort_start_date?: string | null
  cohort_start_time?: string | null
  cohort_label?: string | null
}

const COPY: Record<ThanksKind, { title: string; body: (owner: string) => string }> = {
  group: {
    title: 'ברוכה הבאה למימו 🐣',
    body: owner =>
      'מחכה לפגוש אותך ואת הבייבי שלך.\n' +
      'פרטים נוספים יישלחו בקבוצת ווטסאפ ייעודית לקראת מועד המפגש.\n' +
      'אני כאן בשבילך לכל שאלה, התייעצות או כל דבר קטן 🤍' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  meetup: {
    title: 'נרשמת, מחכה לך 🐣',
    body: owner =>
      'כל הפרטים לקראת המפגש יישלחו אלייך בוואטסאפ.\n' +
      'אני כאן לכל שאלה עד אז 🤍' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  private: {
    title: 'התשלום התקבל, תודה 🤍',
    body: owner =>
      'אני אחזור אלייך בוואטסאפ לתיאום המועד שמתאים לך ולבייבי.\n' +
      'אם יש משהו שחשוב שאדע לפני שניפגש, פשוט כתבי לי.' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  simple: {
    title: 'איזה כיף! 🐣',
    body: owner =>
      'קיבלנו את ההרשמה שלך.\n' +
      'נשמח לראות אותך 🤍' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  product: {
    title: 'תודה על הרכישה 🤍',
    body: owner =>
      'המוצר מחכה לך.\n' +
      'נתאם יחד איסוף. כתבי לי בוואטסאפ ונסגור מתי נוח לך.' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  course: {
    title: 'הקורס שלך פתוח 🤎',
    body: owner =>
      'התשלום התקבל ופתחנו לך גישה מלאה לקורס.\n' +
      'שלחנו לך מייל עם קישור כניסה ישיר, ואפשר גם להיכנס מכאן, עכשיו.\n\n' +
      'הקורס בנוי משיעורים קצרים שאפשר לעשות בקצב שלך. אין תאריך התחלה ואין מה לחכות לו.' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
}

// Settings keys per kind. group keeps the ORIGINAL keys so Brenda's
// existing text stays live without a data migration.
const KEYS: Record<ThanksKind, { title: string; body: string }> = {
  group:   { title: 'thank_you_title',         body: 'thank_you_body' },
  meetup:  { title: 'thank_you_title_meetup',  body: 'thank_you_body_meetup' },
  private: { title: 'thank_you_title_private', body: 'thank_you_body_private' },
  product: { title: 'thank_you_title_product', body: 'thank_you_body_product' },
  simple:  { title: 'thank_you_title_simple',  body: 'thank_you_body_simple' },
  course:  { title: 'thank_you_title_course',  body: 'thank_you_body_course' },
}

function waHref(number: string, text: string): string {
  const digits = number.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function cohortLine(ctx: ThanksContext): string | null {
  if (!ctx.cohort_start_date) return null
  const [y, m, d] = ctx.cohort_start_date.split('-')
  const time = ctx.cohort_start_time ? ` בשעה ${ctx.cohort_start_time.slice(0, 5)}` : ''
  return `המפגש הראשון: ${d}/${m}/${y}${time}`
}

export default function ThankYouPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const workshopKey = params.get('thanks') || ''

  const [ctx, setCtx] = useState<ThanksContext | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'תודה מ-Mimo' }, [])

  // A community event she paid for from inside the app. Read once, on
  // mount, before the effect below clears it.
  const [eventPaid, setEventPaid] = useState(false)
  // She paid, but we could not confirm her seat from this browser.
  const [eventUnconfirmed, setEventUnconfirmed] = useState(false)
  // Digital course: the lead that just paid, and how the claim went.
  const [paidLeadId, setPaidLeadId] = useState<string | null>(null)
  const [accessOpened, setAccessOpened] = useState(false)
  const [mailFailed, setMailFailed] = useState(false)

  useEffect(() => {
    let eventId: string | null = null
    try {
      const storedEvent = localStorage.getItem('mimo_pending_event_id')
      if (storedEvent && /^[0-9a-f-]{36}$/.test(storedEvent)) eventId = storedEvent
    } catch { /* private mode */ }

    if (eventId) {
      setEventPaid(true)
      const id = eventId
      supabase.rpc('mark_event_paid', { p_event_id: id }).then(({ data, error }) => {
        if (error) console.error('[thank-you] mark_event_paid failed:', error)
        // The RPC needs her session. Morning opens the payment page in a
        // new tab (and some phones open it in a private one), so she can
        // land here logged out — the RPC then answers 'unauthorized' and
        // her registration is never flipped to paid. Keep the pending id
        // so AuthContext can retry the moment she is signed in again, and
        // tell her on-screen instead of showing a silent "thank you".
        if (error || data === 'unauthorized') {
          // Reaching THIS page is the payment provider's success redirect,
          // so the payment did happen — we just have no session to record
          // it with. Promote the id to the confirmed key; AuthContext
          // retries that one, and only that one, once she signs in.
          try {
            localStorage.setItem('mimo_paid_event_id', id)
            localStorage.removeItem('mimo_pending_event_id')
          } catch { /* private mode */ }
          setEventUnconfirmed(true)
          return
        }
        try {
          localStorage.removeItem('mimo_pending_event_id')
          localStorage.removeItem('mimo_paid_event_id')
        } catch { /* ignore */ }
        // 'over_capacity' means her hold ran out mid-checkout and the
        // seat went to someone else. She is registered anyway: a woman
        // who has already paid is never the one turned away.
        if (data === 'over_capacity') console.warn('[thank-you] over capacity, Brenda should be told')
      })
    }

    let leadId: string | null = null
    try {
      const stored = localStorage.getItem('mimo_pending_lead_id')
      if (stored && /^[0-9a-f-]{36}$/.test(stored)) leadId = stored
    } catch { /* private mode — no stored lead */ }

    Promise.all([
      supabase.rpc('get_thankyou_context', { p_workshop_key: workshopKey || null, p_lead_id: leadId }),
      supabase.from('global_settings').select('setting_key, setting_value').in('setting_key', [
        'app_subtitle', 'owner_name', 'owner_whatsapp', 'whatsapp_community_link', 'instagram_link',
        KEYS.group.title, KEYS.group.body,
        KEYS.meetup.title, KEYS.meetup.body,
        KEYS.private.title, KEYS.private.body,
        KEYS.product.title, KEYS.product.body,
        KEYS.simple.title, KEYS.simple.body,
        KEYS.course.title, KEYS.course.body,
      ]),
    ]).then(([ctxRes, setRes]) => {
      setCtx((ctxRes.data as ThanksContext) ?? { found: false })
      const map: Record<string, string> = {}
      for (const r of (setRes.data ?? []) as { setting_key: string; setting_value: string }[]) {
        if (r.setting_value) map[r.setting_key] = r.setting_value
      }
      setSettings(map)
      setLoading(false)
    })

    // Flip her registration to שילמה, THEN hand her over to
    // claim-course-purchase. The order matters: the edge function refuses
    // any lead that is not already 'paid', which is exactly what stops
    // someone from claiming a course by guessing a lead id.
    //
    // The key is cleared first so a refresh can't re-fire it; the RPC only
    // touches 'pending' rows, and the claim is idempotent besides.
    if (leadId) {
      const id = leadId
      try { localStorage.removeItem('mimo_pending_lead_id') } catch { /* ignore */ }
      supabase.rpc('mark_lead_paid', { p_lead_id: id })
        .then(({ error }) => {
          if (error) console.error('[thank-you] mark_lead_paid failed:', error)
          setPaidLeadId(id)
          return claimPurchase(id)
        })
    }
  }, [workshopKey])

  // Open her account + access + welcome email. Fire-and-forget from her
  // point of view: she is already on the thank-you page and the Morning
  // webhook is the safety net if this call never lands.
  async function claimPurchase(id: string) {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-course-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id }),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) {
        console.error('[thank-you] claim failed:', res.status, out)
        return
      }
      // Nothing was opened and nothing was emailed → she has no way in.
      if (out.access_opened && !out.email_sent) setMailFailed(true)
      if (out.access_opened) setAccessOpened(true)
    } catch (e) {
      console.error('[thank-you] claim threw:', e)
    }
  }

  // ── Meta Purchase ─────────────────────────────────────────────────────────
  // The money lands HERE — Morning sends her to ?thanks, which is the app,
  // not the marketing site where the pixel normally lives. Without this the
  // campaign has no purchase signal at all.
  useEffect(() => {
    if (!paidLeadId || !ctx?.found) return
    pixelTrack('Purchase', {
      value: ctx.price != null ? Number(ctx.price) : 0,
      currency: 'ILS',
      content_name: ctx.title ?? '',
      content_ids: ctx.workshop_id ? [ctx.workshop_id] : [],
      content_type: 'product',
    })
  }, [paidLeadId, ctx])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  const subtitle = settings.app_subtitle || 'בית עוטף ומלטף'
  const owner = settings.owner_name || ''
  const ownerWa = settings.owner_whatsapp || ''
  // A community event is never a workshop, so it never gets the
  // WhatsApp-group copy. She is already inside the community.
  const kind: ThanksKind = eventPaid ? 'simple' : (ctx?.kind ?? 'group')
  const title = settings[KEYS[kind].title] || COPY[kind].title
  const body = settings[KEYS[kind].body] || COPY[kind].body(owner)
  const firstName = (ctx?.lead_name ?? '').trim().split(' ')[0]
  const meeting = (kind === 'group' || kind === 'meetup') ? cohortLine(ctx ?? { found: false }) : null

  const waProductText = ctx?.title
    ? `היי! רכשתי עכשיו ${ctx.title} ואשמח לתאם איסוף 🤍`
    : 'היי! רכשתי עכשיו מוצר ואשמח לתאם איסוף 🤍'
  const waPrivateText = ctx?.title
    ? `היי! נרשמתי עכשיו ל${ctx.title} 🤍`
    : 'היי! נרשמתי עכשיו 🤍'

  return (
    <div className="min-h-screen px-4 py-10" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <p className="text-sand-500 text-sm">{subtitle}</p>
        </div>

        <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-6 space-y-5 text-center">
          <h1 className="text-2xl font-bold text-sand-800 leading-tight">
            {firstName ? `${firstName}, ${title}` : title}
          </h1>

          {ctx?.title && (
            <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>{ctx.title}</p>
          )}

          <p className="text-sm text-sand-700 leading-relaxed whitespace-pre-line">{body}</p>

          {/* Paid, but the seat could not be confirmed from this browser
              (no session — private tab, or a new device). Say so instead of
              letting her walk away thinking she is registered. */}
          {eventUnconfirmed && (
            <div className="rounded-2xl py-3 px-3.5 text-right space-y-2"
              style={{ background: '#FDF3E3', border: '1px solid #E7C78A' }}>
              <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>התשלום התקבל 🤍</p>
              <p className="text-xs leading-relaxed" style={{ color: '#6E5836' }}>
                לא הצלחנו לאשר את מקומך מהדפדפן הזה. התחברי לאפליקציית מימו והמקום יאושר אוטומטית,
                או כתבי ל{owner || 'ברנדה'} ונסגור את זה ידנית.
              </p>
              {ownerWa && (
                <a
                  href={waHref(ownerWa, `היי! שילמתי עכשיו על ${ctx?.title ?? 'המפגש'} ולא קיבלתי אישור מקום 🤍`)}
                  target="_blank" rel="noopener noreferrer"
                  className="block w-full py-2.5 rounded-xl text-white font-bold text-xs text-center"
                  style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
                >
                  💬 לכתוב ל{owner || 'ברנדה'}
                </a>
              )}
            </div>
          )}

          {/* Digital course: her account is open. Give her the door right
              here — the email is the backup, not the only way in. */}
          {accessOpened && (
            <div className="rounded-2xl py-4 px-4 text-right space-y-3"
              style={{ background: '#FDF3E3', border: '1px solid #E7C78A' }}>
              <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>
                החשבון שלך מוכן והקורס פתוח 🤎
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#6E5836' }}>
                {mailFailed
                  ? 'שלחנו לך מייל עם קישור כניסה. אם הוא לא הגיע, פשוט היכנסי לאפליקציה והתחברי עם אותה כתובת מייל.'
                  : 'שלחנו לך מייל עם קישור כניסה ישיר. אפשר גם להיכנס מכאן:'}
              </p>
              {/* ?course opens the course itself, not the app home. She
                  bought a course; do not make her go looking for it. */}
              <a href={ctx?.workshop_id ? `/?course=${ctx.workshop_id}` : '/?course'}
                className="block w-full py-3 rounded-xl font-bold text-sm text-center text-[#4A3A28]"
                style={{ background: '#E7C78A' }}>
                כניסה לקורס ←
              </a>
            </div>
          )}

          {meeting && (
            <p className="text-sm font-bold rounded-2xl py-2.5 px-3" style={{ background: '#F6ECD8', color: '#6E5836' }}>
              {meeting}
            </p>
          )}

          <div className="space-y-2 pt-2">
            {/* A group workshop gets the community group. A 1:1 or a
                physical product gets Brenda directly — there is no
                group to join and saying otherwise confuses people. */}
            {kind === 'group' && settings.whatsapp_community_link && (
              <a
                href={settings.whatsapp_community_link}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
              >
                💬 הצטרפי לקהילת מימו בוואטסאפ
              </a>
            )}
            {kind !== 'group' && kind !== 'simple' && kind !== 'course' && ownerWa && (
              <a
                href={waHref(ownerWa, kind === 'product' ? waProductText : waPrivateText)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
              >
                {kind === 'product' ? '💬 לתיאום איסוף בוואטסאפ' : `💬 לכתוב ל${owner || 'ברנדה'} בוואטסאפ`}
              </a>
            )}
            {settings.instagram_link && (
              <a
                href={settings.instagram_link}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' }}
              >
                📸 עקבי אחרינו באינסטגרם
              </a>
            )}
          </div>
        </div>

        <a
          href="/"
          className="block text-center mt-6 text-xs text-sand-400 hover:text-sand-600 underline-offset-4 hover:underline"
        >
          פתחי את אפליקציית מימו
        </a>
      </div>
    </div>
  )
}
