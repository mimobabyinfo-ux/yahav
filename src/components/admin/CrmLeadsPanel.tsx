import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Phone, MessageCircle, RefreshCw, Check, X, CalendarDays, StickyNote, UserPlus, ChevronDown, EyeOff, PhoneOff, Search, Sparkles, Flame, Clock, Coffee, ScrollText, ArrowLeftRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import CallScript, { CallInsights } from './CallScript'

/**
 * Admin "לידים" screen: the workshop leads from the CRM (MoreThan / GHL),
 * ordered by what to do now, with the outcome buttons writing straight back
 * into the CRM.
 *
 * Yahav 23.9.26: "המערכת CRM ... איטית ומסורבלת, לא תמיד ברור לי לאיזה ליד
 * להתקשר ראשון ... אתה מרכז לי הכל מתעדף לי אני מחזיר לך מה היה בשיחה" and
 * "שיתעדכן כל הזמן ... ולא תלוי בריצות שלך".
 *
 * Data:
 * - crm_leads   : mirror of every open opportunity, refreshed every 5 min by
 *                 the crm-leads-sync edge function (and by the ⟳ button).
 *                 brief_* columns are Claude's cards from the 10:00 / 17:00
 *                 rounds; when a card is fresh it sets the order and text.
 * - crm_inbound : people whose last WhatsApp was to us and who have no open
 *                 opportunity (e.g. "אשמח לשמוע פרטים" that never became a lead).
 * - crm-lead-action edge function: every outcome button. It updates the
 *                 opportunity, adds a dated note "<actor> - ...", closes the
 *                 chosen tasks and logs to crm_lead_actions.
 * Without a fresh card the order comes from simple rules (rulesFor below), so
 * a lead that arrives at noon is on the list at noon.
 *
 * Yahav 24.9.26: the queue is split into דחוף / בינוני / נמוך instead of one
 * long list, and every card opens with WHY it is there and the date behind it.
 * "לא רלוונטי" now requires one of the CRM's lost reasons (crm_lost_reasons).
 *
 * 24.9.26 (later): "📞 שיחה עם תסריט" opens CallScript (sales script + call log,
 * stats in the "למידה" tab). Leads can be handed to Brenda (crm_lead_owner); the
 * יהב / ברנדה switch now shows only that person's leads ("כל הלידים" shows everyone).
 */

type Note = { date: string; body: string }
type Task = { id: string; title: string; due: string | null }
type Lead = {
  opp_id: string
  contact_id: string | null
  pipeline: 'main' | 'followup'
  pipeline_id: string
  stage_id: string
  stage_name: string | null
  name: string | null
  phone: string | null
  phone_local: string | null
  tags: string[] | null
  source: string | null
  products: string[] | null
  no_answer: string | null
  follow_up_date: string | null
  note_callback_date: string | null
  last_inbound_by_bot: boolean | null
  crm_created_at: string | null
  stage_changed_at: string | null
  notes: Note[] | null
  open_tasks: Task[] | null
  last_inbound_at: string | null
  last_inbound_text: string | null
  app_summary: string | null
  app_paid_future: boolean | null
  brief_rank: number | null
  brief_bucket: string | null
  brief_action: string | null
  brief_why: string | null
  brief_known: string | null
  brief_if_no_answer: string | null
  brief_at: string | null
  last_action_at: string | null
  last_action_label: string | null
  retry_at: string | null
  synced_at: string | null
}
type Inbound = {
  contact_id: string
  name: string | null
  phone: string | null
  phone_local: string | null
  last_message_at: string
  last_message_text: string | null
  dismissed_at: string | null
}
type LostReason = { id: string; label: string | null; example: string | null; uses: number | null }
type Cohort = { workshop: string; start_date: string; start_time: string | null; capacity: number | null; paid: number }
/** 27.9.26: filled the registration page, went to Morning, never paid. From
 *  v_stalled_registrations: only after 48h (the automatic email goes at ~24h,
 *  remind-stalled-registrations), and never if she paid under another row. */
type Stalled = {
  id: string
  name: string | null
  phone: string | null
  normalized_phone: string | null
  created_at: string
  reminded_at: string | null
  workshop_title: string
  price: number | null
  payment_link: string | null
  is_product: boolean
  cohort_start: string | null
}
const shortTitle = (t: string) => t.replace('ליווי התפתחותי - ', '')
function stalledRule(s: Stalled): Rule {
  const when = s.cohort_start ? ` (מחזור ${ddmm(s.cohort_start)})` : ''
  return {
    level: 'high', order: 1.5,
    reason: `נרשמה ל${shortTitle(s.workshop_title)}${when} ולא הסדירה תשלום`,
    action: s.reminded_at ? `קיבלה מייל תזכורת ${ddmm(s.reminded_at)} ולא שילמה. לברר מה נתקע` : 'לברר מה נתקע בתשלום',
    date: s.created_at, dateLabel: `נרשמה ${ago(s.created_at)}`,
  }
}

const MAIN_STAGES: Array<{ id: string; name: string }> = [
  { id: 'aba91039-5ea0-4a93-9d1e-b38efa2695d2', name: 'ליד חדש' },
  { id: 'bdf56a06-8930-4097-b791-55a462010239', name: 'אין מענה' },
  { id: '741be362-a202-4510-950e-e857088df019', name: 'המשך טיפול לסבב הקרוב' },
  { id: 'f778a38f-b28d-4447-9c8b-5328e21bc63a', name: 'רלוונטי בהמשך' },
  { id: 'cf13ba8f-f20b-42be-a74e-ad1aae1b736d', name: 'פולואו אפ' },
]
const FOLLOWUP_STAGES: Array<{ id: string; name: string }> = [
  { id: '1fd2b172-bb7e-4a1f-b0a0-cd7243699708', name: 'סיימה עטופים' },
  { id: '26f94c8f-6b5f-4811-9f7f-ebc0209c45a2', name: 'נשלח פולואו-אפ מגלים' },
  { id: '329b295e-32e3-43b1-94fd-a0e113bd8510', name: 'סיימה מגלים' },
  { id: '543fa6b0-00a0-4551-a83f-735c8deeb12a', name: 'פרטני, ממתינה לפולואו-אפ' },
  { id: '9c6a4229-dda2-432a-96ed-8b63e8b1152d', name: 'דורש טיפול ידני' },
]
const STAGE_NEW = 'aba91039-5ea0-4a93-9d1e-b38efa2695d2'
const STAGE_NO_ANSWER = 'bdf56a06-8930-4097-b791-55a462010239'
const STAGE_ATUFIM_DONE = '1fd2b172-bb7e-4a1f-b0a0-cd7243699708'
const STAGE_CONTINUE = '741be362-a202-4510-950e-e857088df019'
const STAGE_LATER = 'f778a38f-b28d-4447-9c8b-5328e21bc63a'
const STAGE_FOLLOW_UP = 'cf13ba8f-f20b-42be-a74e-ad1aae1b736d'
const STAGE_FU_MEGALIM_SENT = '26f94c8f-6b5f-4811-9f7f-ebc0209c45a2'
const STAGE_MEGALIM_DONE = '329b295e-32e3-43b1-94fd-a0e113bd8510'
/** Brenda 28.9.26: Mary Edrei (סיימה מגלים, bought everything) wrote a warm
 *  update about her baby and jumped to the top of the queue as "דחוף".
 *  A mother who finished מגלים has nothing left to buy: she is a customer,
 *  not a lead. Her messages get their own quiet list, never the sales queue. */
const customerOnly = (l: Lead) => l.pipeline === 'followup' && l.stage_id === STAGE_MEGALIM_DONE
const WORK_STAGES = [STAGE_NEW, STAGE_NO_ANSWER, STAGE_CONTINUE, STAGE_LATER]
const ACTORS = ['יהב', 'ברנדה']
const BRIEF_FRESH_HOURS = 14

// ── helpers ────────────────────────────────────────────────────────────
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const hoursAgo = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity)
const isToday = (iso: string | null) => !!iso && new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) === todayIso()
function ddmm(iso: string | null): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}
function prettyPhone(local: string | null): string {
  if (!local) return ''
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3)}` : local
}
// Yahav 27.9.26: "לחפש ליד לפי טלפון או שם". Digits match anywhere in the phone, in any
// format (054-..., 054..., +97254...); letters match the name, case-insensitive.
function searchDigits(s: string): string {
  let d = s.replace(/\D/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return d
}
function matchesSearch(name: string | null, phoneLocal: string | null, s: string): boolean {
  const t = s.trim().toLowerCase()
  if (!t) return false
  const d = searchDigits(t)
  if (d.length >= 3 && (phoneLocal ?? '').includes(d)) return true
  const letters = t.replace(/[\d\s+\-()]/g, '')
  return !!letters && (name ?? '').toLowerCase().includes(t)
}
function telHref(p: string | null) { return p ? `tel:${p.replace(/[^\d+]/g, '')}` : undefined }
function waHref(p: string | null) {
  if (!p) return undefined
  const d = p.replace(/\D/g, '')
  const intl = d.startsWith('972') ? d : d.replace(/^0/, '972')
  return `https://wa.me/${intl}`
}
function ago(iso: string | null): string {
  const h = hoursAgo(iso)
  if (!isFinite(h)) return ''
  if (h < 1) return 'לפני פחות משעה'
  if (h < 24) return `לפני ${Math.round(h)} שעות`
  const d = Math.round(h / 24)
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`
}
const briefFresh = (l: Lead) => !!l.brief_at && hoursAgo(l.brief_at) < BRIEF_FRESH_HOURS
// Yahav 27.9.26: "אמהות שדיברתי איתן בבוקר ולא ענו, או ששלחתי הודעה ולא ענו, אני רוצה לנסות
// שוב בערב. הלו"ז שלי הוא 10 או 17". A lead can be put back on the list for the next
// calling slot (17:00 today, or 10:00 on the next working day) with crm_leads.retry_at.
// It is a screen-only reminder: nothing about it is written to the CRM.
function ilOffset(d: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' })
    .formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+3'
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  return m ? `${m[1]}${m[2].padStart(2, '0')}:${m[3] ?? '00'}` : '+03:00'
}
function ilAt(ymd: string, hhmm: string): string {
  return new Date(`${ymd}T${hhmm}:00${ilOffset(new Date(`${ymd}T12:00:00Z`))}`).toISOString()
}
/** Next calling slot: 17:00 today if it is before 17:00, otherwise 10:00 on the next Sun-Thu. */
function nextSlot(): { at: string; label: string } {
  const today = todayIso()
  const hourIl = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }))
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = Sunday
  if (hourIl < 17 && dow <= 4) return { at: ilAt(today, '17:00'), label: 'היום ב-17:00' }
  let d = new Date(`${today}T12:00:00Z`)
  do { d = new Date(d.getTime() + 86400000) } while (d.getUTCDay() > 4)
  const ymd = d.toISOString().slice(0, 10)
  const days = Math.round((d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000)
  return { at: ilAt(ymd, '10:00'), label: days === 1 ? 'מחר ב-10:00' : `ב-${ddmm(ymd)} ב-10:00` }
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })
/** Retry is due: its time came, and nothing was done with her since it was set. */
const retryDue = (l: Lead) => !!l.retry_at && new Date(l.retry_at).getTime() <= Date.now() && hoursAgo(l.retry_at) < 24
  && !(l.last_action_at && l.last_action_at > l.retry_at)
const retryWaiting = (l: Lead) => !!l.retry_at && new Date(l.retry_at).getTime() > Date.now()
  && !(l.last_action_at && l.last_action_at > l.retry_at)
const handledSinceBrief = (l: Lead) => !!l.last_action_at && (!l.brief_at || l.last_action_at > l.brief_at)

type Level = 'high' | 'medium' | 'low'
type Rule = { level: Level; order: number; reason: string; action: string; date?: string | null; dateLabel?: string }
const LEVELS: Array<{ id: Level; title: string; hint: string; icon: React.ReactNode; bar: string; chip: string }> = [
  { id: 'high', title: 'דחוף', hint: 'כתבה ולא קיבלה מענה, ליד חדש, או שקבענו לחזור היום', icon: <Flame className="w-4 h-4" />, bar: 'bg-[#C8553D]', chip: 'bg-[#F7DED6] text-[#8B2E1C]' },
  { id: 'medium', title: 'בינוני', hint: 'ניסיון חוזר, משימה שעבר זמנה, בטיפול בלי תאריך', icon: <Clock className="w-4 h-4" />, bar: 'bg-mustard-400', chip: 'bg-mustard-100 text-sand-800' },
  { id: 'low', title: 'נמוך', hint: 'כשיש זמן: 3 ניסיונות בלי מענה, פולואו אפ שלא נענה, תקועים', icon: <Coffee className="w-4 h-4" />, bar: 'bg-sand-300', chip: 'bg-beige-100 text-sand-600' },
]
const daysSince = (iso: string | null) => Math.floor(hoursAgo(iso) / 24)
function dateWord(iso: string): string {
  const today = todayIso()
  if (iso === today) return `היום ${ddmm(iso)}`
  const diff = Math.round((new Date(today).getTime() - new Date(iso).getTime()) / 86400000)
  if (diff === 1) return `אתמול ${ddmm(iso)}`
  if (diff > 1) return `${ddmm(iso)}, לפני ${diff} ימים`
  return ddmm(iso)
}

/** Why this lead is on the list today, and how urgent. null = not today. */
function rulesFor(l: Lead): Rule | null {
  const today = todayIso()
  if (l.app_paid_future) return null
  // Any sign we already dealt with her: a button on this screen, a stage change or a
  // note in the CRM (answers sent from the phone leave only those, Yarden 23.9.26).
  const lastTouch = [l.last_action_at, l.stage_changed_at, l.notes?.[0]?.date ?? null]
    .filter((x): x is string => !!x).sort().pop() ?? null
  // A person actually worked her (button or note). A stage change alone can be the CRM's own doing.
  const humanTouch = [l.last_action_at, l.notes?.[0]?.date ?? null].filter((x): x is string => !!x).sort().pop() ?? null
  const main = l.pipeline === 'main'
  const inWork = main && WORK_STAGES.includes(l.stage_id)
  const callback = l.follow_up_date ?? l.note_callback_date
  const fromNote = !l.follow_up_date && !!l.note_callback_date
  const tries = parseInt((l.no_answer ?? '').replace(/\D/g, '')) || 0
  // Something already scheduled for later (callback date or open task): she waits for it.
  const scheduled = (!!callback && callback > today) || (l.open_tasks ?? []).some(t => t.due && t.due.slice(0, 10) > today)

  // A thank-you right after we set a future callback is her answer to that call, not a new
  // question (Ofir 24.9.26: callback for 27/9 at 17:27, "תודה… אסתכל על זה השבוע" at 17:31).
  const replyToOurCall = scheduled && !!humanTouch && !!l.last_inbound_at && l.last_inbound_at > humanTouch
    && (new Date(l.last_inbound_at).getTime() - new Date(humanTouch).getTime()) / 3600000 < 12

  // ── דחוף
  if (l.last_inbound_at && hoursAgo(l.last_inbound_at) < 72 && (!lastTouch || l.last_inbound_at > lastTouch) && !replyToOurCall)
    return { level: 'high', order: 1, reason: l.last_inbound_by_bot ? 'כתבה לנו, ורק הבוט ענה לה' : 'כתבה לנו ולא קיבלה מענה', action: 'לענות לה (ווטסאפ או שיחה)', date: l.last_inbound_at, dateLabel: ago(l.last_inbound_at) }
  // Yahav 27.9.26: "למה עדי מלאך לא בראש סדר העדיפות ולידים חדשים שאין לי מושג מה הסטטוס שלהם כן?
  // היא יותר פוטנציאלית לסגירה ועוד רשמתי תאריך חזרה היום". A callback we promised comes
  // before a brand-new lead, and a warm one (המשך טיפול לסבב הקרוב) before the rest.
  if ((inWork || !main) && callback && callback <= today)
    return { level: 'high', order: l.stage_id === STAGE_CONTINUE ? 2 : 2.5, reason: `קבענו לחזור אליה${fromNote ? ' (לפי ההערה)' : ''}`, action: 'שיחת המשך', date: callback, dateLabel: dateWord(callback) }
  if (main && l.stage_id === STAGE_NEW && !humanTouch && hoursAgo(l.crm_created_at) < 48)
    return { level: 'high', order: 3, reason: 'ליד חדש, עוד לא דיברו איתה', action: 'שיחה ראשונה', date: l.crm_created_at, dateLabel: `נכנס ${ago(l.crm_created_at)}` }
  // Brenda 28.9.26: "נשלח פולואו-אפ מגלים" had no rule, so Yuval and Hadas sat
  // there 3+ weeks without anyone seeing them. A week with no movement = a card.
  if (l.stage_id === STAGE_FU_MEGALIM_SENT && daysSince(lastTouch ?? l.crm_created_at) >= 7)
    return { level: 'low', order: 9.5, reason: `נשלח פולואו-אפ מגלים, ${daysSince(lastTouch ?? l.crm_created_at)} ימים בלי תזוזה`, action: 'הודעה אישית, או לסמן נרשמה / לא רלוונטי', date: lastTouch ?? l.crm_created_at, dateLabel: `מגע אחרון ${ago(lastTouch ?? l.crm_created_at)}` }
  if (!main) return null

  // ── בינוני
  if ((l.stage_id === STAGE_NO_ANSWER || tries > 0) && tries < 3 && inWork && !scheduled && hoursAgo(lastTouch) > 4)
    return { level: 'medium', order: 4, reason: `לא ענתה${tries ? ` (ניסיון ${tries})` : ''}`, action: 'ניסיון נוסף', date: lastTouch ?? l.stage_changed_at, dateLabel: `ניסיון אחרון ${ago(lastTouch)}` }
  if (l.stage_id === STAGE_NEW && !humanTouch)
    return { level: 'medium', order: 5, reason: 'ליד חדש שעוד לא דיברו איתה', action: 'שיחה ראשונה', date: l.crm_created_at, dateLabel: `נכנס ${ago(l.crm_created_at)}` }
  const overdue = (l.open_tasks ?? []).filter(t => t.due && t.due.slice(0, 10) <= today).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0]
  if (overdue && inWork && !scheduled)
    return { level: 'medium', order: 6, reason: `משימה שעבר זמנה: ${overdue.title}`, action: 'לבצע ולסגור את המשימה', date: overdue.due, dateLabel: dateWord(overdue.due!.slice(0, 10)) }
  if (l.stage_id === STAGE_CONTINUE && !callback && daysSince(lastTouch) >= 2)
    return { level: 'medium', order: 7, reason: 'בהמשך טיפול, בלי תאריך חזרה', action: 'לבדוק איפה היא עומדת ולקבוע תאריך', date: lastTouch ?? l.stage_changed_at, dateLabel: `מגע אחרון ${ago(lastTouch)}` }

  // ── נמוך
  if (tries >= 3 && inWork && !scheduled)
    return { level: 'low', order: 8, reason: '3 ניסיונות בלי מענה', action: 'הודעה אחרונה, או לסגור עם סיבה', date: lastTouch ?? l.stage_changed_at, dateLabel: `ניסיון אחרון ${ago(lastTouch)}` }
  // Brenda 28.9.26: a follow-up that got no answer used to vanish from every list
  // (9 of 21 in פולואו אפ had a date 2+ weeks old). A week after the date with no
  // reply from her: decide, close with a reason or set a new date.
  if (l.stage_id === STAGE_FOLLOW_UP && callback && daysSince(callback) >= 7
      && !(l.last_inbound_at && l.last_inbound_at.slice(0, 10) >= callback) && !scheduled)
    return { level: 'low', order: 9, reason: `הפולואו אפ יצא ב-${ddmm(callback)} ולא ענתה`, action: 'לסגור עם סיבה, או לקבוע תאריך חדש', date: callback, dateLabel: dateWord(callback) }
  // Brenda 28.9.26: no manual "הגיע תאריך הפולואו אפ" card. The CRM workflow already
  // sends the follow-up WhatsApp at ~08:00 on that date (seen in the conversations of
  // Carol Rosenstock and מיטל קרמני, 28.9). If she answers, the "כתבה לנו" rule above
  // brings her back as דחוף.
  if (l.stage_id === STAGE_LATER && !callback && daysSince(lastTouch) >= 14)
    return { level: 'low', order: 10, reason: `רלוונטי בהמשך, בלי תאריך ובלי מגע ${daysSince(lastTouch)} ימים`, action: 'לקבוע תאריך חזרה', date: lastTouch ?? l.stage_changed_at, dateLabel: `מגע אחרון ${ago(lastTouch)}` }
  return null
}

// ── component ──────────────────────────────────────────────────────────
export default function CrmLeadsPanel({ partnerLeads }: { partnerLeads?: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [inbound, setInbound] = useState<Inbound[]>([])
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [stalled, setStalled] = useState<Stalled[]>([])
  const [reasons, setReasons] = useState<LostReason[]>([])
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [actor, setActor] = useState<string>(() => { try { return localStorage.getItem('crm_actor') || 'יהב' } catch { return 'יהב' } })
  const [view, setView] = useState<'queue' | 'upcoming' | 'graduates' | 'all' | 'calls'>('queue')
  const [q, setQ] = useState('')
  const [closedHits, setClosedHits] = useState<Array<{ opp_id: string; name: string | null; phone_local: string | null; stage_name: string | null; status: string | null; crm_updated_at: string | null }>>([])
  const [toast, setToast] = useState<string | null>(null)
  const reloadTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    const [l, i, c, r, o, s, dm] = await Promise.all([
      supabase.from('crm_leads').select('*').eq('is_open', true),
      supabase.from('crm_inbound').select('*').order('last_message_at', { ascending: false }),
      supabase.rpc('crm_cohort_occupancy'),
      supabase.from('crm_lost_reasons').select('id, label, example, uses').eq('active', true).order('sort').order('uses', { ascending: false }),
      supabase.from('crm_lead_owner').select('opp_id, owner'),
      supabase.from('v_stalled_registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_task_dismissals').select('task_key').like('task_key', 'stalled:%'),
    ])
    // 6.10.26: "טופל" on a stalled card is a dismissal, not a status.
    const done = new Set(((dm.data ?? []) as { task_key: string }[]).map(d => d.task_key))
    setStalled(((s.data ?? []) as Stalled[]).filter(x => !done.has(`stalled:${x.id}`)))
    setOwners(Object.fromEntries(((o.data ?? []) as Array<{ opp_id: string; owner: string }>).map(x => [x.opp_id, x.owner])))
    setReasons((r.data ?? []) as LostReason[])
    setLeads((l.data ?? []) as Lead[])
    setInbound((i.data ?? []) as Inbound[])
    setCohorts((c.data ?? []) as Cohort[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('crm-leads-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads' }, () => {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(load, 800)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_lead_owner' }, () => {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(load, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_inbound' }, () => {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(load, 800)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  function pickActor(a: string) {
    setActor(a)
    try { localStorage.setItem('crm_actor', a) } catch { /* private mode */ }
  }

  async function syncNow() {
    setSyncing(true)
    const { data, error } = await supabase.functions.invoke('crm-leads-sync', { body: {} })
    setSyncing(false)
    if (error || data?.ok === false) setToast('הסנכרון נכשל: ' + (error?.message ?? data?.error ?? ''))
    await load()
  }

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3500)
  }

  const ownerOf = useCallback((l: Lead) => owners[l.opp_id] ?? 'יהב', [owners])
  const mine = useCallback((l: Lead) => ownerOf(l) === actor, [ownerOf, actor])
  async function setOwner(l: Lead, to: string) {
    const { error } = to === 'יהב'
      ? await supabase.from('crm_lead_owner').delete().eq('opp_id', l.opp_id)
      : await supabase.from('crm_lead_owner').upsert({ opp_id: l.opp_id, owner: to, set_by: actor, set_at: new Date().toISOString() })
    if (error) { flash('לא הצלחתי להעביר: ' + error.message); return }
    setOwners(o => { const n = { ...o }; if (to === 'יהב') delete n[l.opp_id]; else n[l.opp_id] = to; return n })
    // Leave a trace in the CRM too, so it is visible there.
    supabase.functions.invoke('crm-lead-action', { body: { action: 'note', opp_id: l.opp_id, contact_id: l.contact_id, actor, note: `הועבר לטיפול ${to}` } })
    flash(`${l.name}: עבר לטיפול ${to}`)
  }
  const cardProps = { owner: ownerOf, onOwner: setOwner, cohorts }

  // ── derived lists ──
  const lastSync = useMemo(() => leads.reduce<string | null>((m, l) => (!m || (l.synced_at ?? '') > m ? l.synced_at : m), null), [leads])
  const freshRound = useMemo(() => leads.some(briefFresh), [leads])

  // A stalled registration whose phone has an open CRM lead is shown ON that
  // lead (with this as its reason); the rest get a card of their own.
  const stalledByPhone = useMemo(() => {
    const m = new Map<string, Stalled>()
    for (const x of stalled) if (x.normalized_phone && !m.has(x.normalized_phone)) m.set(x.normalized_phone, x)
    return m
  }, [stalled])
  const openPhones = useMemo(() => new Set(leads.map(l => l.phone_local).filter(Boolean) as string[]), [leads])
  const visibleStalled = useMemo(() => stalled.filter(x => !x.normalized_phone || !openPhones.has(x.normalized_phone)), [stalled, openPhones])

  // Re-evaluate every minute so a 17:00 retry appears at 17:00 without a reload.
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => setTick(x => x + 1), 60000); return () => window.clearInterval(t) }, [])

  const queue = useMemo(() => {
    const items: Array<{ lead: Lead; rule: Rule; order: number }> = []
    for (const l of leads) {
      if (l.app_paid_future || !mine(l) || customerOnly(l)) continue
      const due = retryDue(l)
      if (retryWaiting(l)) continue
      if (!due && isToday(l.last_action_at) && !(l.last_inbound_at && l.last_action_at && l.last_inbound_at > l.last_action_at)) continue
      const st = l.phone_local ? stalledByPhone.get(l.phone_local) : undefined
      let rule = st ? stalledRule(st) : rulesFor(l)
      if (due) rule = { level: 'high', order: 1.5, reason: `ביקשת לנסות שוב (${l.last_action_label ?? 'ניסיון קודם'})`, action: 'ניסיון נוסף: שיחה, ואם לא עונה הודעה', date: l.retry_at, dateLabel: `מ-${hhmm(l.retry_at!)}` }
      const card = briefFresh(l) && l.brief_bucket === 'today' && !handledSinceBrief(l)
      // A card from Claude's round with no rule behind it still belongs on today's list.
      if (!rule && card) rule = { level: 'medium', order: 7, reason: l.brief_why ?? 'מהסבב של Claude', action: l.brief_action ?? '' }
      if (!rule) continue
      items.push({ lead: l, rule, order: rule.order * 100 + (card ? l.brief_rank ?? 50 : 60) })
    }
    const sorted = items.sort((a, b) => a.order - b.order || String(a.lead.crm_created_at).localeCompare(String(b.lead.crm_created_at)))
    return {
      high: sorted.filter(x => x.rule.level === 'high'),
      medium: sorted.filter(x => x.rule.level === 'medium'),
      low: sorted.filter(x => x.rule.level === 'low'),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, mine, stalledByPhone, tick])
  // Customers (not leads) who wrote and nobody answered yet, last 7 days.
  const customerMessages = useMemo(() => leads.filter(l => {
    if (!customerOnly(l) || !mine(l) || !l.last_inbound_at || hoursAgo(l.last_inbound_at) > 168) return false
    const touch = [l.last_action_at, l.notes?.[0]?.date ?? null].filter((x): x is string => !!x).sort().pop()
    return !touch || l.last_inbound_at > touch
  }).sort((a, b) => String(b.last_inbound_at).localeCompare(String(a.last_inbound_at))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [leads, mine, tick])
  const retryLater = useMemo(() => leads.filter(l => mine(l) && retryWaiting(l)).sort((a, b) => String(a.retry_at).localeCompare(String(b.retry_at))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, mine, tick])
  const queueCount = queue.high.length + queue.medium.length + queue.low.length + visibleStalled.length

  const registeredInApp = useMemo(() => leads.filter(l => l.app_paid_future && l.pipeline === 'main' && mine(l)), [leads, mine])
  const handledToday = useMemo(() => leads.filter(l => isToday(l.last_action_at)), [leads])
  const upcoming = useMemo(() => {
    const today = todayIso()
    const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const d = (l: Lead) => l.follow_up_date ?? l.note_callback_date
    return leads.filter(l => { const x = d(l); return mine(l) && !!x && x > today && x <= in7 })
      .sort((a, b) => String(d(a)).localeCompare(String(d(b))))
  }, [leads, mine])
  const graduates = useMemo(() => leads.filter(l => l.pipeline === 'followup' && l.stage_id === STAGE_ATUFIM_DONE && !l.app_paid_future && mine(l)), [leads, mine])
  const othersCount = useMemo(() => leads.filter(l => !mine(l)).length, [leads, mine])
  // People who wrote with no lead yet are Yahav's until someone opens a lead.
  const visibleInbound = useMemo(() => actor !== 'יהב' ? [] : inbound.filter(i => !i.dismissed_at || i.last_message_at > i.dismissed_at), [inbound, actor])
  const all = useMemo(() => [...leads].sort((a, b) => String(b.crm_created_at).localeCompare(String(a.crm_created_at))), [leads])

  // Search covers every open lead (both owners), plus leads that were open at some point
  // since the screen started (23.9.26) and have since been closed.
  const searching = q.trim().length > 0
  const searchHits = useMemo(() => searching
    ? leads.filter(l => matchesSearch(l.name, l.phone_local, q)).sort((a, b) => String(b.crm_created_at).localeCompare(String(a.crm_created_at)))
    : [], [leads, q, searching])
  useEffect(() => {
    const t = q.trim()
    if (!t) { setClosedHits([]); return }
    const timer = window.setTimeout(async () => {
      const d = searchDigits(t)
      const safe = t.replace(/[,()%*]/g, ' ').trim()
      const filters = [safe ? `name.ilike.%${safe}%` : '', d.length >= 3 ? `phone_local.ilike.%${d}%` : ''].filter(Boolean).join(',')
      if (!filters) { setClosedHits([]); return }
      const { data } = await supabase.from('crm_leads')
        .select('opp_id, name, phone_local, stage_name, status, crm_updated_at')
        .eq('is_open', false).or(filters).order('crm_updated_at', { ascending: false }).limit(20)
      setClosedHits((data ?? []).filter((r: any) => matchesSearch(r.name, r.phone_local, t)))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [q])

  async function dismissInbound(i: Inbound) {
    await supabase.from('crm_inbound').update({ dismissed_at: new Date().toISOString() }).eq('contact_id', i.contact_id)
    load()
  }
  // 6.10.26: this used to set registration_leads.status = 'handled', which is
  // "מומש" (she attended): an unpaid mother silently turned into a
  // customer. Now it only hides the card (same table as the home "טופל");
  // the registration stays "ממתינה" everywhere else.
  async function markStalledHandled(x: Stalled) {
    const { error } = await supabase.from('admin_task_dismissals').upsert(
      { task_key: `stalled:${x.id}`, dismissed_at: new Date().toISOString() }, { onConflict: 'task_key' })
    if (error) { flash('לא הצלחתי לסמן: ' + error.message); return }
    setStalled(list => list.filter(y => y.id !== x.id))
    flash(`${x.name ?? ''}: סומן כטופל`)
  }
  function stalledWa(x: Stalled): string | undefined {
    const base = waHref(x.phone)
    if (!base) return undefined
    const first = (x.name ?? '').trim().split(/\s+/)[0]
    const text = `היי${first ? ` ${first}` : ''}, ראיתי שהתחלת להירשם ל${shortTitle(x.workshop_title)} והתשלום לא הושלם. הכל בסדר? אפשר לעזור במשהו?${x.payment_link ? `\nהקישור לתשלום: ${x.payment_link}` : ''}`
    return `${base}?text=${encodeURIComponent(text)}`
  }
  async function createLead(i: Inbound) {
    const { data, error } = await supabase.functions.invoke('crm-lead-action', {
      body: { action: 'create_lead', contact_id: i.contact_id, lead_name: i.name, actor, note: `כתבה בווטסאפ: "${(i.last_message_text ?? '').slice(0, 120)}"` },
    })
    if (error || !data?.ok) { flash('לא הצלחתי לפתוח ליד ב-CRM'); return }
    flash(`נפתח ליד חדש ל${i.name ?? ''}. הוא יופיע ברשימה בסנכרון הבא`)
    syncNow()
  }

  if (loading) return <p className="text-center text-sand-400 text-sm py-8">טוען לידים...</p>

  const tabs: Array<{ id: typeof view; label: string; n: number }> = [
    { id: 'queue', label: 'לטפל עכשיו', n: queueCount + visibleInbound.length },
    { id: 'upcoming', label: 'בשבוע הקרוב', n: upcoming.length },
    { id: 'graduates', label: 'בוגרות עטופים', n: graduates.length },
    { id: 'all', label: 'כל הלידים', n: leads.length },
    { id: 'calls', label: 'למידה', n: -1 },
  ]

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-3xl p-4 lg:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-bold text-sand-800 text-lg">לידים</h2>
            <p className="text-xs text-sand-500">
              מסונכרן עם ה-CRM {lastSync ? ago(lastSync) : ''}
              {freshRound ? ' · כולל הכרטיסים מהסבב של Claude' : ''}
            </p>
            <p className="text-xs text-sand-600 mt-0.5">מציג את הלידים של <b>{actor}</b>{othersCount ? ` · ${othersCount} אצל ${actor === 'יהב' ? 'ברנדה' : 'יהב'}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-beige-100 p-0.5">
              {ACTORS.map(a => (
                <button key={a} onClick={() => pickActor(a)}
                  className={`px-3 py-1 rounded-full text-xs font-bold ${actor === a ? 'bg-mustard-400 text-sand-900' : 'text-sand-500'}`}>{a}</button>
              ))}
            </div>
            <button onClick={syncNow} disabled={syncing} title="לסנכרן עכשיו"
              className="w-9 h-9 rounded-full bg-beige-100 flex items-center justify-center text-sand-600 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {cohorts.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {cohorts.slice(0, 8).map(c => {
              const left = c.capacity != null ? c.capacity - Number(c.paid) : null
              const name = c.workshop.replace('ליווי התפתחותי - ', '').replace('סדנת ', '')
              return (
                <span key={c.workshop + c.start_date + c.start_time}
                  className={`text-[11px] font-bold px-2 py-1 rounded-full ${left != null && left <= 0 ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-sand-700'}`}>
                  {name} {ddmm(c.start_date)} · {c.paid}{c.capacity != null ? `/${c.capacity}` : ''}
                  {left != null && left > 0 ? ` (נשארו ${left})` : left != null ? ' (מלא)' : ''}
                </span>
              )
            })}
          </div>
        )}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${view === t.id ? 'bg-sand-800 text-white' : 'bg-beige-100 text-sand-600'}`}>
              {t.label}{t.n >= 0 ? ` · ${t.n}` : ''}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-sand-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש ליד לפי שם או טלפון"
            className="w-full rounded-full bg-beige-50 pr-9 pl-9 py-2 text-sm border border-beige-300" />
          {searching && (
            <button onClick={() => setQ('')} title="לנקות" className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-sand-500 hover:bg-beige-200">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {searching && (
        <Section title={`תוצאות חיפוש · ${searchHits.length + closedHits.length}`} hint={searchHits.length + closedHits.length ? 'כל הלידים הפתוחים של יהב וברנדה, ולמטה לידים שנסגרו.' : 'לא נמצא ליד. אפשר לחפש לפי חלק מהשם או 3 ספרות ומעלה מהטלפון.'}>
          <div className="grid gap-3 lg:grid-cols-2">
            {searchHits.map(l => <LeadCard key={l.opp_id} lead={l} rule={rulesFor(l)} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
          </div>
          {closedHits.length > 0 && (
            <div className="space-y-1.5 mt-3">
              <p className="text-xs font-bold text-sand-500 px-1">לידים שנסגרו</p>
              {closedHits.map(c => (
                <div key={c.opp_id} className="bg-white rounded-xl px-3 py-2 text-sm flex justify-between items-center gap-2">
                  <span className="min-w-0">
                    <b className="text-sand-700">{c.name}</b>
                    <span className="text-xs text-sand-500"> · <span dir="ltr">{prettyPhone(c.phone_local)}</span> · {c.stage_name ?? c.status}{c.crm_updated_at ? ` · ${ddmm(c.crm_updated_at)}` : ''}</span>
                  </span>
                  <ContactButtons phone={c.phone_local} />
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {!searching && view === 'queue' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map(lv => {
              const n = queue[lv.id].length + (lv.id === 'high' ? visibleInbound.length + visibleStalled.length : 0)
              return (
                <a key={lv.id} href={`#lvl-${lv.id}`} className={`rounded-2xl px-3 py-2 ${lv.chip} flex items-center justify-between`}>
                  <span className="flex items-center gap-1.5 font-bold text-sm">{lv.icon}{lv.title}</span>
                  <span className="text-xl font-bold">{n}</span>
                </a>
              )
            })}
          </div>

          {LEVELS.map(lv => {
            const list = queue[lv.id]
            const inboundHere = lv.id === 'high' ? visibleInbound : []
            const stalledHere = lv.id === 'high' ? visibleStalled : []
            if (!list.length && !inboundHere.length && !stalledHere.length) return null
            return (
              <div key={lv.id} id={`lvl-${lv.id}`} className="space-y-2 scroll-mt-4">
                <div className={`rounded-2xl px-3 py-2 ${lv.chip}`}>
                  <h3 className="font-bold text-sm flex items-center gap-1.5">{lv.icon}{lv.title} · {list.length + inboundHere.length + stalledHere.length}</h3>
                  <p className="text-[11px] opacity-80">{lv.hint}</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {stalledHere.map(x => {
                    const rule = stalledRule(x)
                    return (
                      <div key={x.id} className="bg-white rounded-2xl shadow-sm overflow-hidden flex">
                        <div className={`w-1.5 shrink-0 ${lv.bar}`} />
                        <div className="p-4 space-y-2 flex-1 min-w-0">
                          <div className={`rounded-xl px-3 py-2 ${lv.chip}`}>
                            <p className="text-sm font-bold">{rule.reason}</p>
                            <p className="text-xs">{rule.dateLabel}{x.price ? ` · ₪${Number(x.price)}` : ''}</p>
                          </div>
                          <div>
                            <p className="font-bold text-sand-800">{x.name}</p>
                            <p className="text-xs text-sand-500" dir="ltr">{prettyPhone(x.normalized_phone)}</p>
                          </div>
                          <p className="text-xs text-sand-600">{rule.action}</p>
                          <div className="flex gap-2 flex-wrap">
                            {x.phone && <a href={telHref(x.phone)} className="btn-chip bg-sand-800 text-white"><Phone className="w-3.5 h-3.5" />חיוג</a>}
                            {stalledWa(x) && <a href={stalledWa(x)} target="_blank" rel="noopener noreferrer" className="btn-chip bg-[#25D366] text-white"><MessageCircle className="w-3.5 h-3.5" />ווטסאפ</a>}
                            <button onClick={() => markStalledHandled(x)} className="btn-chip bg-beige-100 text-sand-600"><Check className="w-3.5 h-3.5" />טופל</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {inboundHere.map(i => (
                    <div key={i.contact_id} className="bg-white rounded-2xl shadow-sm overflow-hidden flex">
                      <div className={`w-1.5 shrink-0 ${lv.bar}`} />
                      <div className="p-4 space-y-2 flex-1 min-w-0">
                        <div className={`rounded-xl px-3 py-2 ${lv.chip}`}>
                          <p className="text-sm font-bold">כתבה לנו ואין לה ליד פתוח</p>
                          <p className="text-xs">{ago(i.last_message_at)}</p>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-sand-800">{i.name}</p>
                            <p className="text-xs text-sand-500" dir="ltr">{prettyPhone(i.phone_local)}</p>
                          </div>
                        </div>
                        {i.last_message_text && <p className="text-sm text-sand-700 bg-beige-50 rounded-xl px-3 py-2">"{i.last_message_text}"</p>}
                        <div className="flex gap-2 flex-wrap">
                          <ContactButtons phone={i.phone} />
                          <button onClick={() => createLead(i)} className="btn-chip bg-mustard-400 text-sand-900"><UserPlus className="w-3.5 h-3.5" />לפתוח ליד</button>
                          <button onClick={() => dismissInbound(i)} className="btn-chip bg-beige-100 text-sand-500"><EyeOff className="w-3.5 h-3.5" />להסתיר</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {list.map(({ lead, rule }) => (
                    <LeadCard key={lead.opp_id} lead={lead} rule={rule} actor={actor} reasons={reasons} {...cardProps} onDone={(m) => { flash(m); load() }} />
                  ))}
                </div>
              </div>
            )
          })}
          {queueCount === 0 && visibleInbound.length === 0 && <p className="text-center text-sand-400 text-sm py-6">אין כרגע לידים שמחכים לטיפול 🎉</p>}

          {registeredInApp.length > 0 && (
            <Section title="נרשמו באפליקציה, עדיין פתוחות ב-CRM" hint="שילמו למחזור עתידי. לסמן נרשמה כדי לסגור את הליד.">
              <div className="grid gap-3 lg:grid-cols-2">
                {registeredInApp.map(l => <LeadCard key={l.opp_id} lead={l} rule={null} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
              </div>
            </Section>
          )}

          {customerMessages.length > 0 && (
            <Collapsible title={`לקוחות שכתבו (לא ליד) · ${customerMessages.length}`}>
              <p className="text-xs text-sand-500 mb-2">סיימו מגלים. לא מכירה, רק לא לשכוח לענות.</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {customerMessages.map(l => <LeadCard key={l.opp_id} lead={l} rule={null} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
              </div>
            </Collapsible>
          )}

          {retryLater.length > 0 && (
            <Collapsible title={`יחזרו לרשימה בסבב הבא · ${retryLater.length}`}>
              <div className="space-y-1.5">
                {retryLater.map(l => (
                  <div key={l.opp_id} className="bg-white rounded-xl px-3 py-2 text-sm flex justify-between items-center gap-2">
                    <span className="min-w-0"><b className="text-sand-700">{l.name}</b> <span className="text-xs text-sand-500">· {l.last_action_label}</span></span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-sand-500">חוזרת ב-{hhmm(l.retry_at!)}{isToday(l.retry_at) ? '' : ` (${ddmm(l.retry_at)})`}</span>
                      <button onClick={async () => { await supabase.from('crm_leads').update({ retry_at: new Date().toISOString() }).eq('opp_id', l.opp_id); load() }}
                        className="btn-chip bg-beige-100 text-sand-600">עכשיו</button>
                    </span>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {handledToday.length > 0 && (
            <Collapsible title={`טופלו היום · ${handledToday.length}`}>
              <div className="space-y-1.5">
                {handledToday.map(l => (
                  <div key={l.opp_id} className="bg-white rounded-xl px-3 py-2 text-sm flex justify-between gap-2">
                    <span className="font-bold text-sand-700">{l.name}</span>
                    <span className="text-sand-500 text-xs">{l.last_action_label}</span>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}
        </>
      )}

      {!searching && view === 'upcoming' && (
        <Section title="תאריך חזרה בשבעת הימים הקרובים">
          <div className="grid gap-3 lg:grid-cols-2">
            {upcoming.map(l => <LeadCard key={l.opp_id} lead={l} rule={null} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
          </div>
        </Section>
      )}

      {!searching && view === 'graduates' && (
        <Section title="סיימו עטופים ולא רשומות לאף מגלים עתידי" hint="הזדמנות להמשך. ההרשמות נבדקות מול האפליקציה.">
          <div className="grid gap-3 lg:grid-cols-2">
            {graduates.map(l => <LeadCard key={l.opp_id} lead={l} rule={null} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
          </div>
        </Section>
      )}

      {!searching && view === 'all' && (
        <Section title="כל הלידים הפתוחים">
          <div className="grid gap-3 lg:grid-cols-2">
            {all.map(l => <LeadCard key={l.opp_id} lead={l} rule={rulesFor(l)} actor={actor} reasons={reasons} {...cardProps} compact onDone={(m) => { flash(m); load() }} />)}
          </div>
        </Section>
      )}

      {!searching && view === 'calls' && <CallInsights />}

      {partnerLeads && (
        <Collapsible title="לידים מספקים (שיתופי פעולה)">{partnerLeads}</Collapsible>
      )}

      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 bg-sand-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">{toast}</div>
      )}
      <style>{`.btn-chip{display:inline-flex;align-items:center;gap:.3rem;font-size:12px;font-weight:700;padding:.4rem .7rem;border-radius:9999px}`}</style>
    </div>
  )
}

// ── pieces ─────────────────────────────────────────────────────────────
function Section({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="px-1">
        <h3 className="font-bold text-sand-800 text-sm">{title}</h3>
        {hint && <p className="text-xs text-sand-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-beige-50 rounded-2xl p-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-bold text-sand-600">
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

function ContactButtons({ phone }: { phone: string | null }) {
  if (!phone) return null
  return (
    <>
      <a href={telHref(phone)} className="btn-chip bg-sand-800 text-white"><Phone className="w-3.5 h-3.5" />חיוג</a>
      <a href={waHref(phone)} target="_blank" rel="noopener noreferrer" className="btn-chip bg-[#25D366] text-white"><MessageCircle className="w-3.5 h-3.5" />ווטסאפ</a>
    </>
  )
}

type Outcome = 'no_answer' | 'callback' | 'registered' | 'not_relevant' | 'note'
const OUTCOMES: Array<{ id: Outcome; label: string; icon: React.ReactNode; cls: string }> = [
  { id: 'no_answer', label: 'לא ענתה', icon: <PhoneOff className="w-3.5 h-3.5" />, cls: 'bg-beige-100 text-sand-700' },
  { id: 'callback', label: 'לחזור ב...', icon: <CalendarDays className="w-3.5 h-3.5" />, cls: 'bg-beige-100 text-sand-700' },
  { id: 'registered', label: 'נרשמה', icon: <Check className="w-3.5 h-3.5" />, cls: 'bg-[#E3EFE0] text-[#3D6B35]' },
  { id: 'not_relevant', label: 'לא רלוונטי', icon: <X className="w-3.5 h-3.5" />, cls: 'bg-[#F5E3DC] text-[#8B4A30]' },
  { id: 'note', label: 'הערה', icon: <StickyNote className="w-3.5 h-3.5" />, cls: 'bg-beige-100 text-sand-700' },
]

function LeadCard({ lead: l, rule, index, actor, reasons, compact, onDone, owner, onOwner, cohorts }: {
  lead: Lead; rule: Rule | null; index?: number; actor: string; reasons: LostReason[]; compact?: boolean; onDone: (msg: string) => void
  owner: (l: Lead) => string; onOwner: (l: Lead, to: string) => void; cohorts: Cohort[]
}) {
  const [calling, setCalling] = useState(false)
  const who = owner(l)
  const other = who === 'ברנדה' ? 'יהב' : 'ברנדה'
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [stage, setStage] = useState('')
  const [closeTasks, setCloseTasks] = useState(true)
  const [retry, setRetry] = useState(true)
  const slot = nextSlot()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)

  const fresh = briefFresh(l) && !handledSinceBrief(l)
  const lv = rule ? LEVELS.find(x => x.id === rule.level)! : null
  const why = fresh && l.brief_why ? l.brief_why : rule?.reason
  const what = fresh && l.brief_action ? l.brief_action : rule?.action
  const known = fresh ? l.brief_known : null
  const ifNo = fresh ? l.brief_if_no_answer : null
  const notes = l.notes ?? []
  const tasks = l.open_tasks ?? []
  const stages = l.pipeline === 'main' ? MAIN_STAGES : FOLLOWUP_STAGES

  async function submit() {
    if (!outcome) return
    if (outcome === 'callback' && !date) { setErr('צריך לבחור תאריך'); return }
    if (outcome === 'note' && !note.trim()) { setErr('מה לרשום?'); return }
    if (outcome === 'not_relevant' && !reason) { setErr('צריך לבחור סיבת אבדן'); return }
    const reasonRow = reasons.find(r => r.id === reason)
    setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('crm-lead-action', {
      body: {
        action: outcome, opp_id: l.opp_id, contact_id: l.contact_id, actor,
        note: note.trim() || undefined,
        callback_date: outcome === 'callback' ? date : undefined,
        target_stage_id: outcome === 'callback' && stage ? stage : undefined,
        complete_task_ids: closeTasks && outcome !== 'note' ? tasks.map(t => t.id) : [],
        lost_reason_id: outcome === 'not_relevant' ? reason : undefined,
        lost_reason_label: outcome === 'not_relevant' ? reasonRow?.label ?? undefined : undefined,
      },
    })
    setBusy(false)
    if (error || !data?.ok) {
      setErr('משהו לא נשמר ב-CRM. ' + (error?.message ?? JSON.stringify(data?.steps ?? {})).slice(0, 160))
      return
    }
    const wantsRetry = retry && (outcome === 'no_answer' || outcome === 'note')
    if (wantsRetry) await supabase.from('crm_leads').update({ retry_at: slot.at }).eq('opp_id', l.opp_id)
    setOutcome(null); setNote(''); setDate(''); setStage(''); setReason('')
    onDone(`${l.name}: ${data.label} · נשמר ב-CRM${wantsRetry ? ` · תחזור לרשימה ${slot.label}` : ''}`)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex">
      {lv && <div className={`w-1.5 shrink-0 ${lv.bar}`} />}
      <div className="p-4 space-y-2.5 flex-1 min-w-0">
      {rule && lv && !compact && (
        <div className={`rounded-xl px-3 py-2 ${lv.chip} flex items-start justify-between gap-2`}>
          <p className="text-sm font-bold leading-snug">{rule.reason}</p>
          {rule.dateLabel && <span className="shrink-0 text-xs font-bold bg-white/70 rounded-full px-2 py-0.5">{rule.dateLabel}</span>}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sand-800 leading-tight">
            {index != null && <span className="text-mustard-700 ml-1">{index}.</span>}
            {l.name}
          </p>
          <p className="text-xs text-sand-500 mt-0.5">
            <span dir="ltr">{prettyPhone(l.phone_local)}</span>
            {' · '}{l.stage_name}
            {l.no_answer ? ` · ${l.no_answer}` : ''}
            {l.follow_up_date ? ` · חזרה ${ddmm(l.follow_up_date)}` : l.note_callback_date ? ` · חזרה ${ddmm(l.note_callback_date)} (מההערה)` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {who === 'ברנדה' && <span className="text-[11px] font-bold bg-[#EDE3F5] text-[#5B3B7A] rounded-full px-2 py-0.5">בטיפול ברנדה</span>}
          {fresh && <span title="מהסבב של Claude" className="text-mustard-600"><Sparkles className="w-4 h-4" /></span>}
        </div>
      </div>

      {(what || why) && (
        <div className="bg-mustard-50 rounded-xl px-3 py-2 space-y-0.5">
          {what && <p className="text-sm text-sand-800"><b>מה לעשות:</b> {what}</p>}
          {why && (compact || why !== rule?.reason) && <p className="text-xs text-sand-600"><b>למה עכשיו:</b> {why}</p>}
        </div>
      )}
      {known && <p className="text-xs text-sand-700 leading-relaxed"><b>מה ידוע:</b> {known}</p>}
      {ifNo && <p className="text-xs text-sand-500"><b>אם לא עונה:</b> {ifNo}</p>}
      {l.app_summary && <p className="text-xs text-[#3D6B35] bg-[#EEF5EC] rounded-lg px-2 py-1">באפליקציה: {l.app_summary}</p>}
      {l.last_inbound_text && hoursAgo(l.last_inbound_at) < 24 * 7 && (
        <p className="text-xs text-sand-700 bg-beige-50 rounded-lg px-2 py-1">כתבה {ago(l.last_inbound_at)}: "{l.last_inbound_text.slice(0, 160)}"</p>
      )}
      {!compact && !known && notes[0] && (
        <p className="text-xs text-sand-600 leading-relaxed whitespace-pre-line"><b>הערה אחרונה ({ddmm(notes[0].date)}):</b> {notes[0].body.slice(0, 280)}</p>
      )}
      {(l.products?.length ?? 0) > 0 && (
        <div className="flex gap-1 flex-wrap">{l.products!.map(p => <span key={p} className="text-[11px] bg-beige-100 text-sand-600 rounded-full px-2 py-0.5">{p}</span>)}</div>
      )}
      {l.last_action_label && <p className="text-[11px] text-sand-400">טיפול אחרון: {l.last_action_label}</p>}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCalling(true)} className="btn-chip bg-mustard-400 text-sand-900"><ScrollText className="w-3.5 h-3.5" />שיחה עם תסריט</button>
        <ContactButtons phone={l.phone} />
        <button onClick={() => onOwner(l, other)} className="btn-chip bg-beige-50 text-sand-600"><ArrowLeftRight className="w-3.5 h-3.5" />להעביר ל{other}</button>
        {(notes.length > 0 || tasks.length > 0) && (
          <button onClick={() => setShowNotes(s => !s)} className="btn-chip bg-beige-50 text-sand-500">
            הערות{tasks.length ? ' ומשימות' : ''} ({notes.length + tasks.length})
          </button>
        )}
      </div>
      {showNotes && (
        <div className="space-y-1.5 border-t border-beige-200 pt-2">
          {tasks.map(t => <p key={t.id} className="text-xs text-[#8B4A30]">משימה פתוחה{t.due ? ` (${ddmm(t.due)})` : ''}: {t.title}</p>)}
          {notes.map((n, i) => <p key={i} className="text-xs text-sand-600 whitespace-pre-line"><b>{ddmm(n.date)}:</b> {n.body}</p>)}
        </div>
      )}

      {/* Outcome */}
      <div className="flex gap-1.5 flex-wrap pt-1 border-t border-beige-100">
        {OUTCOMES.map(o => (
          <button key={o.id} onClick={() => { setOutcome(outcome === o.id ? null : o.id); setRetry(o.id === 'no_answer'); setErr(null) }}
            className={`btn-chip ${o.cls} ${outcome === o.id ? 'ring-2 ring-sand-700' : ''}`}>{o.icon}{o.label}</button>
        ))}
      </div>
      {outcome && (
        <div className="bg-beige-50 rounded-xl p-3 space-y-2">
          {outcome === 'callback' && (
            <div className="flex gap-2 flex-wrap items-center">
              <input type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)} className="rounded-lg border border-beige-300 px-2 py-1 text-sm" />
              <select value={stage} onChange={e => setStage(e.target.value)} className="rounded-lg border border-beige-300 px-2 py-1 text-sm">
                <option value="">להשאיר בשלב: {l.stage_name}</option>
                {stages.filter(s => s.id !== l.stage_id).map(s => <option key={s.id} value={s.id}>להעביר ל: {s.name}</option>)}
              </select>
            </div>
          )}
          {outcome === 'not_relevant' && (
            <div className="space-y-1">
              <select value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border border-beige-300 px-2 py-1.5 text-sm">
                <option value="">סיבת אבדן (חובה)</option>
                {reasons.map(r => (
                  <option key={r.id} value={r.id}>{r.label ?? `סיבה ללא שם${r.example ? `, כמו אצל ${r.example}` : ''}`}</option>
                ))}
              </select>
              {reasons.length === 0 && <p className="text-[11px] text-[#8B4A30]">רשימת הסיבות עוד לא נטענה, אי אפשר לסגור כאבוד.</p>}
            </div>
          )}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder={outcome === 'note' ? 'מה לרשום?' : 'מה היה בשיחה? (לא חובה)'}
            className="w-full rounded-lg border border-beige-300 px-2 py-1.5 text-sm" />
          {(outcome === 'no_answer' || outcome === 'note') && (
            <label className="flex items-center gap-2 text-xs text-sand-700 font-bold">
              <input type="checkbox" checked={retry} onChange={e => setRetry(e.target.checked)} />
              להחזיר אותה לרשימה {slot.label}
            </label>
          )}
          {tasks.length > 0 && outcome !== 'note' && (
            <label className="flex items-center gap-2 text-xs text-sand-600">
              <input type="checkbox" checked={closeTasks} onChange={e => setCloseTasks(e.target.checked)} />
              לסגור {tasks.length === 1 ? 'את המשימה הפתוחה' : `את ${tasks.length} המשימות הפתוחות`}
            </label>
          )}
          {err && <p className="text-xs text-[#8B4A30]">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="btn-chip bg-sand-800 text-white disabled:opacity-50">{busy ? 'שומר...' : `לשמור ב-CRM (${actor})`}</button>
            <button onClick={() => setOutcome(null)} className="btn-chip bg-white text-sand-500">ביטול</button>
          </div>
        </div>
      )}
      {calling && <CallScript lead={l} actor={actor} reasons={reasons} cohorts={cohorts} onClose={() => setCalling(false)} onDone={onDone} />}
      </div>
    </div>
  )
}
