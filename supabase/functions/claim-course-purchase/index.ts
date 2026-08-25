import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * claim-course-purchase
 *
 * Turns a paid lead into a mother who is inside the app:
 *   1. finds or creates her auth user
 *   2. fills her profile, links the lead, opens the access window
 *   3. sends her ONE welcome message with a link that logs her straight in
 *
 * The slug still says "course" for historical reasons - it now handles every
 * kind of purchase, and the difference between them matters:
 *
 *   COURSE  (a product with structured lesson content) - she bought content
 *           and wants the content. Her link opens the lessons directly.
 *           Dropping her on the home screen to hunt for what she paid for
 *           is how you lose her.
 *
 *   WORKSHOP (עטופים / מגלים / עיסוי / מפגש אבות) - she bought a place in a
 *           room, not a screen. There is nothing to "open". Her link opens
 *           the HOME screen, because the whole point of her being here is
 *           that she discovers the journal and the community exist. Sending
 *           her to a content screen produces an account that never gets used
 *           - which is exactly the leak this function exists to close.
 *
 * CHANNEL: WhatsApp first, email as the fallback.
 * WhatsApp is the channel these mothers actually open - it is where Brenda
 * already talks to them, from a number they recognise. Email is kept as the
 * fallback for anyone with no usable phone, and for the case where the
 * WhatsApp send fails (no session window, provider error, anything).
 * WhatsApp sending is gated on global_settings.welcome_whatsapp_enabled so
 * this can be deployed dark and switched on after a live test.
 *
 * THE LINK: `?welcome=<lead_id>` - NOT a Supabase magic link.
 * A magic link expires within the hour. A WhatsApp message gets read the
 * next morning. The welcome route calls this same function back with
 * want_link, mints a fresh sign-in link at the moment she taps, and lets her
 * in. The lead id is the credential, and this function refuses any lead that
 * is not already status='paid', so knowing an id grants nothing.
 *
 * Called from four places, all idempotent:
 *   - the thank-you page, right after Morning sends her back
 *   - the Morning webhook, which does not care if she closed the tab
 *   - the ?welcome= route, when she taps the link (want_link mode)
 *   - the admin card, when all of those somehow missed her
 *
 * The welcome message is latched PER LEAD: one purchase, one welcome,
 * whoever gets here first.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL   = Deno.env.get("APP_URL")   ?? "https://mimo-baby.co.il"
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "מימו <hello@mimo-baby.co.il>"

const GHL_BASE = "https://services.leadconnectorhq.com"
const GHL_VERSION = "2021-07-28"
const LOCATION_ID = "zcdg19h82AGIAbya6T0r"

type Kind = "course" | "workshop"

// Which of the five texts she gets. Yahav 24.8.26: the single "ברוכה הבאה"
// was wrong for two thirds of the people it was about to reach. A mother who
// has been in the app for three months does not need welcoming, and a mother
// whose workshop opens in ten days has nothing that "we already covered".
// So the copy turns on two facts: is her workshop running, and is she
// already inside.
//   welcome  - no cohort to reason about. The original text, unchanged, so
//              the live post-payment flow keeps behaving exactly as it did.
type Variant = "course" | "welcome" | "running_in" | "running_out" | "upcoming_in" | "upcoming_out"

// "2026-09-03" -> "3.9"
function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${Number(d)}.${Number(m)}`
}

// Today in Israel, not in UTC. A cohort that opens today must not read as
// upcoming to a mother who is already sitting in the room.
function todayInIsrael(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(" ")[0] ?? ""
}

// Israeli mobile -> E.164, the same rule sync-paid-to-crm uses so both
// functions land on the SAME GHL contact rather than creating a duplicate.
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  if (digits.startsWith("972")) return "+" + digits
  if (digits.startsWith("0") && digits.length >= 9) return "+972" + digits.slice(1)
  if (digits.length === 9) return "+972" + digits
  return null
}

async function ghl(
  path: string, method: string, apiKey: string, body?: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const res = await fetch(`${GHL_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Version": GHL_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) return { ok: false, status: res.status, error: `${res.status}: ${text}`.slice(0, 300) }
    return { ok: true, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 300) }
  }
}

// -- the 24-hour WhatsApp window ------------------------------------------
//
// THE BUG THIS EXISTS FOR (24.8.26): GHL answers HTTP 200 the moment it
// accepts a message. 200 means "queued", not "delivered". WhatsApp then
// rejected 27 of 33 messages ~27 seconds later with "more than 24 hours have
// passed since the customer last replied to this number", and because the
// function latched welcome_sent_at on the 200, those 27 mothers were recorded
// as welcomed and got nothing. Four of them had never once written to Brenda,
// so it could never have worked.
//
// Polling for the real status would mean blocking this webhook for ~30s, and
// the morning webhook already has a timeout problem. But the failure is not
// random: it is decidable BEFORE sending. Free-form WhatsApp only leaves the
// building within 24 hours of HER last inbound message. So we ask first.
//
// Deliberately conservative: only a WhatsApp inbound we can actually see
// counts. lastMessageDate would include our OWN outbound and would reopen
// the window on paper every time we wrote — the exact bug again. Anything we
// cannot prove is treated as closed, and closed means email, which always
// arrives. A mother getting an email she did not need is a small cost; a
// mother getting nothing after paying is the thing we are fixing.
async function whatsappWindow(apiKey: string, contactId: string): Promise<{
  open: boolean
  proven: boolean
  lastInbound: string | null
  hoursAgo: number | null
  note: string
}> {
  const r = await ghl(
    `/conversations/search?locationId=${LOCATION_ID}&contactId=${encodeURIComponent(contactId)}`,
    "GET", apiKey,
  )
  if (!r.ok) {
    return { open: false, proven: false, lastInbound: null, hoursAgo: null,
             note: `conversation lookup failed (${r.error ?? "unknown"})` }
  }
  const convos: any[] = Array.isArray(r.data?.conversations) ? r.data.conversations : []
  let newest: number | null = null
  for (const c of convos) {
    // Verified against the live API on 25.8.26: this is the only inbound
    // field GHL returns, and it is a millisecond epoch. Deliberately NOT
    // falling back to lastInboundMessageDate or lastMessageDate — an SMS
    // reply or our own outbound does not open a WhatsApp window.
    const v = c?.lastInboundWhatsappMessageDate ?? null
    if (!v) continue
    const t = typeof v === "number" ? v : Date.parse(String(v))
    if (Number.isFinite(t) && (newest === null || t > newest)) newest = t
  }
  if (newest === null) {
    return { open: false, proven: true, lastInbound: null, hoursAgo: null,
             note: convos.length === 0
               ? "she has never written to this number"
               : "no inbound message on record" }
  }
  const hoursAgo = Math.round(((Date.now() - newest) / 3_600_000) * 10) / 10
  return {
    open: hoursAgo < 24,
    proven: true,
    lastInbound: new Date(newest).toISOString(),
    hoursAgo,
    note: hoursAgo < 24 ? `she wrote ${hoursAgo}h ago` : `her last message was ${hoursAgo}h ago`,
  }
}

// -- message copy ---------------------------------------------------------
// Warm, short, and specific about what is waiting for her. The workshop
// version deliberately never says "app" first - it says her workshop lives
// there, which is the reason she has to care.

function waText(v: Variant, name: string, title: string, link: string, owner: string, startLabel: string): string {
  const hi = firstName(name) ? `היי ${firstName(name)} 🤍` : "היי יקירה 🤍"
  const sign = owner ? `\n${owner}` : ""

  if (v === "course") {
    return `${hi}
התשלום התקבל ופתחתי לך גישה מלאה ל${title}.
הקישור הבא פותח לך את השיעורים ישירות, בלי סיסמה ובלי הרשמה:

${link}

השיעורים קצרים ואפשר לעשות אותם בקצב שלך. אין תאריך התחלה ואין מה לחכות לו.
כאן לכל שאלה${owner ? `,\n${owner}` : ""}`
  }

  // Her workshop is running and she is already in the app. This is a change
  // of habit, not an introduction: until now the summaries came on WhatsApp.
  if (v === "running_in") {
    return `${hi}
משהו משתנה אצלנו: מהיום כל התכנים והסיכומים של ${title} נמצאים באפליקציה, במקום בוואטסאפ.
פתחתי לך את הגישה, והקישור הבא לוקח אותך ישר אליהם:

${link}

כל מה שכבר עברנו מחכה לך שם, ומה שנעבור בהמשך יתווסף.${sign}`
  }

  // Running, and she has never opened the app. Same change of habit, plus
  // the account she never had.
  if (v === "running_out") {
    return `${hi}
מהיום כל התכנים והסיכומים של ${title} נמצאים באפליקציה של מימו, במקום בוואטסאפ.
הקישור הבא פותח לך חשבון ומכניס אותך ישר אליהם:

${link}

כל מה שכבר עברנו מחכה לך שם, ומה שנעבור בהמשך יתווסף. בדרך תגלי גם יומן למעקב אחרי הבייבי ואת קהילת האמהות שלנו.${sign}`
  }

  // Her workshop has not opened yet. Nothing has "already been covered", so
  // the message points forward instead of back.
  if (v === "upcoming_in") {
    return `${hi}
נרשמת ל${title} שמתחילה ב-${startLabel}, ורציתי שתדעי מראש: כל התכנים והסיכומים של הסדנה יהיו אצלך באפליקציה ולא בוואטסאפ.
תיפתח כרגיל גם קבוצת וואטסאפ לסדנה, פשוט בלי הסיכומים.
פתחתי לך את האזור של הסדנה כבר עכשיו:

${link}

נתראה ב-${startLabel} 🤍${sign}`
  }

  if (v === "upcoming_out") {
    return `${hi}
נרשמת ל${title} שמתחילה ב-${startLabel}, וכיף שאת איתנו.
כל התכנים והסיכומים של הסדנה יחכו לך באפליקציה של מימו ולא בוואטסאפ. תיפתח כרגיל גם קבוצת וואטסאפ לסדנה, פשוט בלי הסיכומים.
הקישור הבא פותח לך חשבון, ושווה להיכנס כבר עכשיו:

${link}

בדרך תגלי גם יומן למעקב אחרי הבייבי ואת קהילת האמהות שלנו. נתראה ב-${startLabel} 🤍${sign}`
  }

  // "welcome" - no cohort to reason about. Unchanged from the original.
  return `${hi}
ברוכה הבאה למימו, כיף שאת איתנו.
כל התכנים והסיכומים של ${title} מחכים לך באפליקציה - וגם יומן למעקב אחרי הבייבי וקהילת האמהות שלנו.

הקישור הבא מכניס אותך פנימה:

${link}

נתראה בקרוב 🤍${owner ? `\n${owner}` : ""}`
}

function emailSubject(v: Variant, title: string, startLabel: string): string {
  if (v === "course") return `הגישה שלך ל${title} מוכנה 🤎`
  if (v === "running_in" || v === "running_out") return `הסיכומים של ${title} עברו לאפליקציה 🤎`
  if (v === "upcoming_in" || v === "upcoming_out") return `${title} מתחילה ב-${startLabel} 🐣`
  return `ברוכה הבאה למימו 🐣`
}

function emailHtml(v: Variant, name: string, title: string, link: string, startLabel: string): string {
  const first = firstName(name)
  const who = first ? esc(first) + ", " : ""

  let heading: string
  let lead: string
  let tail: string
  const cta = v === "course" ? "לצפייה בקורס ←" : "לכניסה לאפליקציה ←"

  if (v === "course") {
    heading = `${who}הקורס שלך מחכה לך 🤎`
    lead = `התשלום התקבל ופתחנו לך גישה מלאה ל<strong>${esc(title)}</strong>.
            הכפתור למטה פותח את השיעורים ישירות, בלי סיסמה ובלי הרשמה.`
    tail = `הקורס שלך לתמיד, בקצב שלך. ואם תרצי, יש שם גם יומן מעקב
            לשינה ולהנקה וקהילה של אמהות. בלי לחץ, בלי תוספת תשלום.`
  } else if (v === "running_in" || v === "running_out") {
    heading = `${who}הסיכומים עברו לאפליקציה 🤎`
    lead = `מהיום כל התכנים והסיכומים של <strong>${esc(title)}</strong> נמצאים באפליקציה, במקום בוואטסאפ.
            ${v === "running_in" ? "פתחנו לך את הגישה, והכפתור למטה לוקח אותך ישר אליהם." : "הכפתור למטה פותח לך חשבון ומכניס אותך ישר אליהם."}`
    tail = `כל מה שכבר עברנו מחכה לך שם, ומה שנעבור בהמשך יתווסף.
            אפשר להיכנס מכל טלפון, ולהוסיף את מימו למסך הבית כדי שתהיה בהישג יד.`
  } else if (v === "upcoming_in" || v === "upcoming_out") {
    heading = `${who}${esc(title)} מתחילה ב-${esc(startLabel)} 🐣`
    lead = `כל התכנים והסיכומים של הסדנה יהיו אצלך באפליקציה ולא בוואטסאפ.
            תיפתח כרגיל גם קבוצת וואטסאפ לסדנה, פשוט בלי הסיכומים.
            ${v === "upcoming_in" ? "פתחנו לך את האזור של הסדנה כבר עכשיו." : "הכפתור למטה פותח לך חשבון, ושווה להיכנס כבר עכשיו."}`
    tail = `נתראה ב-${esc(startLabel)}. אפשר להיכנס מכל טלפון, ולהוסיף את מימו
            למסך הבית כדי שתהיה בהישג יד.`
  } else {
    heading = `${who}ברוכה הבאה למימו 🐣`
    lead = `כיף שאת איתנו. כל התכנים והסיכומים של <strong>${esc(title)}</strong> מחכים לך באפליקציה,
            וגם יומן למעקב אחרי הבייבי וקהילת האמהות שלנו.
            הכפתור למטה מכניס אותך פנימה.`
    tail = `אפשר להיכנס מכל טלפון, ולהוסיף את מימו למסך הבית כדי שתהיה בהישג יד.`
  }

  return `
<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;background:#F8F4EC;padding:28px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:24px;padding:32px 28px;">
    <h1 style="margin:0 0 8px;font-size:22px;color:#3D2E20;">${heading}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#6E5836;">${lead}</p>
    <a href="${esc(link)}"
       style="display:block;text-align:center;background:#E7C78A;color:#4A3A28;
              text-decoration:none;font-weight:700;font-size:16px;
              padding:16px 20px;border-radius:16px;">
      ${cta}
    </a>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#8A8370;">
      שמרי את המייל הזה. הקישור ממתין לך ולא פג תוקף.
    </p>
    <hr style="border:none;border-top:1px solid #EFE8DC;margin:24px 0;" />
    <p style="margin:0;font-size:14px;line-height:1.8;color:#6E5836;">${tail}</p>
    <p style="margin:20px 0 0;font-size:13px;color:#8A8370;">
      נתקעת? פשוט השיבי למייל הזה 🤍
    </p>
  </div>
</div>`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405)

  let leadId = ""
  let wantLink = false
  let dry = false
  try {
    const body = await req.json()
    leadId = String(body?.lead_id ?? "")
    wantLink = body?.want_link === true
    dry = body?.dry === true
  } catch {
    return json({ ok: false, reason: "bad_json" }, 400)
  }
  if (!UUID.test(leadId)) return json({ ok: false, reason: "bad_lead_id" }, 400)

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // 1 - the lead
  const { data: lead, error: leadErr } = await admin
    .from("registration_leads")
    .select("id, name, email, phone, normalized_phone, status, selected_workshop_id, user_id, cohort_id")
    .eq("id", leadId)
    .maybeSingle()

  if (leadErr) return json({ ok: false, reason: "lead_query_failed", detail: leadErr.message }, 500)
  if (!lead)   return json({ ok: false, reason: "lead_not_found" }, 404)
  if (lead.status !== "paid") return json({ ok: false, reason: "lead_not_paid", status: lead.status }, 409)
  if (!lead.email)            return json({ ok: false, reason: "lead_has_no_email" }, 422)

  // 2 - what did she actually buy?
  //
  // This used to be inferred from the product having sectioned content in
  // workshop_content. That inference broke the moment עטופים and מגלים got
  // their session summaries loaded into the app: a workshop with chapters
  // would have started reading as a course, and its mothers would have been
  // dropped on a content screen instead of the home screen - the exact
  // outcome this whole flow exists to avoid.
  //
  // workshops.thanks_template is the app's own explicit marker for "this
  // product behaves like a self-serve course", it is editable from the
  // admin, and it does not move when content is added.
  let kind: Kind = "workshop"
  let title = "מימו"
  if (lead.selected_workshop_id) {
    const { data: w } = await admin
      .from("workshops").select("title, thanks_template")
      .eq("id", lead.selected_workshop_id).maybeSingle()
    if (w?.title) title = w.title
    if (w?.thanks_template === "course") kind = "course"
  }

  // 2b - when does her workshop open? Drives which text she gets.
  let cohortStart: string | null = null
  if (lead.cohort_id) {
    const { data: c } = await admin
      .from("workshop_cohorts").select("start_date")
      .eq("id", lead.cohort_id).maybeSingle()
    cohortStart = (c?.start_date as string | null) ?? null
  }
  const startLabel = cohortStart ? dayMonth(cohortStart) : ""

  // 3 - her user
  let userId: string | null = lead.user_id ?? null
  let createdUser = false

  if (!userId) {
    const { data: found } = await admin.rpc("find_auth_user_by_email", { p_email: lead.email })
    userId = (found as string | null) ?? null
  }

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: lead.email,
      email_confirm: true,   // she proved the address by paying with it
      user_metadata: { mother_name: lead.name, phone: lead.phone, source: `${kind}_purchase` },
    })
    if (createErr || !created?.user) {
      const { data: retry } = await admin.rpc("find_auth_user_by_email", { p_email: lead.email })
      userId = (retry as string | null) ?? null
      if (!userId) {
        return json({ ok: false, reason: "create_user_failed", detail: createErr?.message }, 500)
      }
    } else {
      userId = created.user.id
      createdUser = true
    }
  }

  // 3b - is she already living in the app?
  //
  // Must be read BEFORE attach_paid_lead, which creates the profile row.
  // Reading it after would make every mother look like a returning one.
  // An auth user with no finished onboarding is NOT "already in the app":
  // she started signing up and dropped out, and the welcome text is still
  // the right thing to send her.
  let alreadyInApp = false
  if (userId && !createdUser) {
    const { data: prof } = await admin
      .from("user_profiles").select("onboarding_completed_at")
      .eq("id", userId).maybeSingle()
    alreadyInApp = !!prof?.onboarding_completed_at
  }

  let variant: Variant = kind === "course" ? "course" : "welcome"
  if (kind === "workshop" && cohortStart) {
    const running = cohortStart <= todayInIsrael()
    variant = running
      ? (alreadyInApp ? "running_in" : "running_out")
      : (alreadyInApp ? "upcoming_in" : "upcoming_out")
  }

  // 4 - profile, linkage, access
  const { data: attached, error: attachErr } = await admin.rpc("attach_paid_lead", {
    p_lead_id: leadId,
    p_user_id: userId,
  })
  if (attachErr) return json({ ok: false, reason: "attach_failed", detail: attachErr.message }, 500)
  const report = attached as { ok: boolean; reason?: string; access_was_new?: boolean }
  if (!report?.ok) return json({ ok: false, reason: report?.reason ?? "attach_rejected" }, 409)

  // Where she lands once signed in. A course opens its lessons; a workshop
  // opens the home screen, on purpose - see the header comment.
  const landing = kind === "course" && lead.selected_workshop_id
    ? `${APP_URL}/?course=${lead.selected_workshop_id}`
    : `${APP_URL}/`

  // -- want_link mode: she just tapped the ?welcome= link ----------------
  // Mint a fresh sign-in link NOW and hand it back. Nothing is sent and the
  // welcome latch is untouched, so this stays safe to call repeatedly.
  if (wantLink) {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: lead.email,
      options: { redirectTo: landing },
    })
    if (linkErr) console.error("[claim] generateLink failed:", linkErr.message)
    return json({
      ok: true, mode: "link", user_id: userId, kind,
      action_link: linkData?.properties?.action_link ?? null,
      fallback_url: landing,
    })
  }

  // 5 - the welcome latch. One welcome per purchase, whoever arrives first.
  const welcomeUrl = `${APP_URL}/?welcome=${leadId}`
  const ownerName = await admin
    .from("global_settings").select("setting_value").eq("setting_key", "owner_name").maybeSingle()
    .then(r => r.data?.setting_value ?? "")

  const waEnabled = await admin
    .from("global_settings").select("setting_value").eq("setting_key", "welcome_whatsapp_enabled").maybeSingle()
    .then(r => String(r.data?.setting_value ?? "").toLowerCase() === "true")

  const phone = normalizePhone(lead.normalized_phone ?? lead.phone)

  if (dry) {
    // Dry mode also answers the question that actually decides the channel:
    // is her WhatsApp window open? It upserts the contact (idempotent, and
    // the real run does it anyway) but sends nothing.
    let dryWindow: unknown = null
    const dryKey = Deno.env.get("GHL_API_KEY")
    if (waEnabled && phone && dryKey) {
      const up = await ghl("/contacts/upsert", "POST", dryKey, {
        locationId: LOCATION_ID, phone,
        ...(lead.name ? { name: lead.name } : {}),
        ...(lead.email ? { email: lead.email } : {}),
      })
      const cid = up.data?.contact?.id ?? up.data?.id ?? null
      dryWindow = cid ? await whatsappWindow(dryKey, cid) : { error: up.error ?? "no_contact_id" }
    }
    return json({
      wa_window: dryWindow,
      ok: true, mode: "dry", kind, variant, title, user_id: userId,
      created_user: createdUser, access_opened: report.access_was_new,
      would_send: waEnabled && phone ? "whatsapp" : "email",
      phone, welcome_url: welcomeUrl, landing,
      wa_preview: waText(variant, lead.name ?? "", title, welcomeUrl, ownerName, startLabel),
    })
  }

  const { data: won, error: latchErr } = await admin.rpc("claim_welcome_email_slot", { p_lead_id: leadId })
  if (latchErr) console.error("[claim] latch failed:", latchErr.message)
  if (won !== true) {
    return json({
      ok: true, user_id: userId, kind, access_opened: report.access_was_new,
      sent: false, already_sent: true,
    })
  }

  // 6 - WhatsApp first. Her channel, from a number she recognises.
  let channel: "whatsapp" | "email" | null = null
  let waError: string | null = null
  let waMessageId: string | null = null
  let waWindow: Awaited<ReturnType<typeof whatsappWindow>> | null = null

  const GHL_API_KEY = Deno.env.get("GHL_API_KEY")
  if (waEnabled && phone && GHL_API_KEY) {
    // Upsert dedupes on GHL's side, so this lands on the same contact
    // sync-paid-to-crm already tags rather than creating a second one.
    const up = await ghl("/contacts/upsert", "POST", GHL_API_KEY, {
      locationId: LOCATION_ID,
      phone,
      ...(lead.name ? { name: lead.name } : {}),
      ...(lead.email ? { email: lead.email } : {}),
    })
    const contactId = up.data?.contact?.id ?? up.data?.id ?? null
    if (!up.ok || !contactId) {
      waError = up.error ?? "no_contact_id"
    } else {
      const win = await whatsappWindow(GHL_API_KEY, contactId)
      waWindow = win
      if (!win.open) {
        // Not an error. WhatsApp simply cannot carry this one, so we do not
        // spend a message finding that out 27 seconds later.
        waError = `outside the 24h window: ${win.note}`
      } else {
        const send = await ghl("/conversations/messages", "POST", GHL_API_KEY, {
          type: "WhatsApp",
          contactId,
          message: waText(variant, lead.name ?? "", title, welcomeUrl, ownerName, startLabel),
        })
        // Still only "queued". The window check above is what makes it
        // trustworthy; this id is kept so a delivery can be traced later.
        if (send.ok) {
          channel = "whatsapp"
          waMessageId = send.data?.messageId ?? send.data?.msgId ?? null
        } else {
          waError = send.error ?? "send_failed"
        }
      }
    }
    if (waError) console.error("[claim] whatsapp failed, falling back to email:", waError)
  }

  // 7 - email fallback: no phone, WhatsApp off, or the send failed.
  let mailDetail: string | null = null
  if (!channel) {
    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) {
      console.error("[claim] RESEND_API_KEY missing - access granted, nothing sent")
      await admin.rpc("release_welcome_email_slot", { p_lead_id: leadId })
      return json({
        ok: true, user_id: userId, kind, created_user: createdUser,
        sent: false, reason: "no_mail_key", wa_error: waError,
      })
    }
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: lead.email,
          subject: emailSubject(variant, title, startLabel),
          html: emailHtml(variant, lead.name ?? "", title, welcomeUrl, startLabel),
        }),
      })
      if (r.ok) channel = "email"
      else {
        mailDetail = `${r.status} ${await r.text()}`.slice(0, 300)
        console.error("[claim] resend failed:", mailDetail)
      }
    } catch (e) {
      mailDetail = String(e).slice(0, 300)
      console.error("[claim] resend threw:", mailDetail)
    }
  }

  // Nothing reached her at all - unlatch so the next run retries.
  if (!channel) await admin.rpc("release_welcome_email_slot", { p_lead_id: leadId })
  else {
    const detail = channel === "whatsapp"
      ? `whatsapp · ${waWindow?.note ?? "window open"}${waMessageId ? ` · ${waMessageId}` : ""}`
      : `email · ${waError ?? (waEnabled ? (phone ? "whatsapp unavailable" : "no phone") : "whatsapp disabled")}`
    const { error: chErr } = await admin
      .from("registration_leads")
      .update({ welcome_channel: channel, welcome_detail: detail.slice(0, 500) })
      .eq("id", leadId)
    if (chErr) console.error("[claim] welcome_channel update failed:", chErr.message)
  }

  return json({
    ok: true,
    user_id: userId,
    kind,
    variant,
    created_user: createdUser,
    access_opened: report.access_was_new,
    sent: channel !== null,
    channel,
    wa_error: waError,
    wa_window: waWindow,
    wa_message_id: waMessageId,
    mail_error: mailDetail,
  })
})
