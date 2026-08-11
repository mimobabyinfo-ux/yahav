import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

// ?thanks — where Morning sends her back after a successful payment.
//
// It used to say the same thing to everyone ("פרטים יישלחו בקבוצת
// ווטסאפ"), which is wrong for a 1:1 session (no group) and wrong for a
// physical product (nothing to meet about — there's a pickup to
// coordinate). So the page now resolves WHAT was bought and shows one
// of four templates, all editable in הגדרות:
//
//   group   — a workshop that runs in cohorts → WhatsApp group
//   meetup  — a one-off meeting (מפגש אבות, בוקר של מימו): it has
//             cohorts too, but NO dedicated group — details come
//             personally, so promising a group would be a lie
//   private — 1:1 / no cohorts → Brenda will be in touch to set a time
//   product — a physical add-on → coordinate pickup with Brenda
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
// In case 2 there is no registration in the app at all, so the page
// asks for name + phone and opens one as שילמה (claim_thankyou_-
// registration matches an existing lead for the same phone+product
// before creating a new one, so registering on another device doesn't
// produce a duplicate).

type ThanksKind = 'group' | 'meetup' | 'private' | 'product'

type ThanksContext = {
  found: boolean
  workshop_id?: string
  title?: string
  kind?: ThanksKind
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
      'אם יש משהו שחשוב שאדע לפני שניפגש — פשוט כתבי לי.' +
      (owner ? `\nבאהבה, ${owner}` : ''),
  },
  product: {
    title: 'תודה על הרכישה 🤍',
    body: owner =>
      'המוצר מחכה לך.\n' +
      'נתאם יחד איסוף — כתבי לי בוואטסאפ ונסגור מתי נוח לך.' +
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

  // Claim form (only when we don't already know who she is).
  const [claimName, setClaimName] = useState('')
  const [claimPhone, setClaimPhone] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [claimError, setClaimError] = useState('')

  useEffect(() => { document.title = 'תודה — Mimo' }, [])

  useEffect(() => {
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

    // Flip her registration to שילמה. The key is cleared first so a
    // refresh can't re-fire it; the RPC only touches 'pending' rows.
    if (leadId) {
      try { localStorage.removeItem('mimo_pending_lead_id') } catch { /* ignore */ }
      supabase.rpc('mark_lead_paid', { p_lead_id: leadId }).then(({ error }) => {
        if (error) console.error('[thank-you] mark_lead_paid failed:', error)
      })
    }
  }, [workshopKey])

  async function submitClaim(ev: React.FormEvent) {
    ev.preventDefault()
    const phoneDigits = claimPhone.replace(/\D/g, '')
    if (!/^0?5\d{8}$/.test(phoneDigits) && !/^9725\d{8}$/.test(phoneDigits)) {
      setClaimError('מספר טלפון ישראלי לא תקין')
      return
    }
    if (!ctx?.workshop_id) return
    setClaimError('')
    setClaiming(true)
    const { error } = await supabase.rpc('claim_thankyou_registration', {
      p_name: claimName.trim(),
      p_phone: claimPhone,
      p_workshop_id: ctx.workshop_id,
      p_cohort_id: null,
    })
    setClaiming(false)
    if (error) {
      console.error('[thank-you] claim failed:', error)
      setClaimError('משהו השתבש — אפשר פשוט לכתוב לי בוואטסאפ')
      return
    }
    setClaimed(true)
  }

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
  const kind: ThanksKind = ctx?.kind ?? 'group'
  const title = settings[KEYS[kind].title] || COPY[kind].title
  const body = settings[KEYS[kind].body] || COPY[kind].body(owner)
  const firstName = (ctx?.lead_name ?? '').trim().split(' ')[0]
  const meeting = (kind === 'group' || kind === 'meetup') ? cohortLine(ctx ?? { found: false }) : null

  // Whether to ask who she is: we know the product but have no
  // registration behind it — she came straight from a payment link.
  const needsClaim = !!ctx?.found && !ctx.lead_found && !claimed

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

          {meeting && (
            <p className="text-sm font-bold rounded-2xl py-2.5 px-3" style={{ background: '#F6ECD8', color: '#6E5836' }}>
              {meeting}
            </p>
          )}

          {claimed && (
            <p className="text-sm font-bold rounded-2xl py-2.5 px-3" style={{ background: '#EDEDE6', color: '#4F5040' }}>
              רשמנו אותך ✓ נתראה בקרוב
            </p>
          )}

          {/* Payment links sent by hand carry no registration — ask, so
              it lands in the system as שילמה like any other purchase. */}
          {needsClaim && (
            <form onSubmit={submitClaim} className="space-y-2 text-right rounded-2xl p-4" style={{ background: '#FFFFFF' }}>
              <p className="text-sm font-bold text-sand-800">רק שנדע שזו את 🤍</p>
              <p className="text-xs text-sand-500 leading-relaxed">
                כדי שנשמור את הרכישה על השם שלך ולא נצטרך להטריד אותך אחר כך.
              </p>
              <input
                value={claimName}
                onChange={e => setClaimName(e.target.value)}
                placeholder="השם שלך"
                className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
              />
              <input
                value={claimPhone}
                onChange={e => setClaimPhone(e.target.value)}
                placeholder="050-0000000"
                dir="ltr"
                inputMode="tel"
                className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm text-right focus:outline-none focus:border-mustard-400"
              />
              {claimError && <p className="text-xs font-semibold" style={{ color: '#8B4A30' }}>{claimError}</p>}
              <button
                type="submit"
                disabled={claiming || !claimName.trim() || !claimPhone.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: '#C8A460', color: '#33281B' }}
              >
                {claiming ? '...' : 'סיימנו'}
              </button>
            </form>
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
            {kind !== 'group' && ownerWa && (
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
