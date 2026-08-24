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

// -- message copy ---------------------------------------------------------
// Warm, short, and specific about what is waiting for her. The workshop
// version deliberately never says "app" first - it says her workshop lives
// there, which is the reason she has to care.

function waText(kind: Kind, name: string, title: string, link: string, owner: string): string {
  const hi = firstName(name) ? `היי ${firstName(name)} 🤍` : "היי יקירה 🤍"
  if (kind === "course") {
    return `${hi}
התשלום התקבל ופתחתי לך גישה מלאה ל${title}.
הקישור הבא פותח לך את השיעורים ישירות, בלי סיסמה ובלי הרשמה:

${link}

השיעורים קצרים ואפשר לעשות אותם בקצב שלך. אין תאריך התחלה ואין מה לחכות לו.
כאן לכל שאלה${owner ? `,\n${owner}` : ""}`
  }
  return `${hi}
ברוכה הבאה למימו, כיף שאת איתנו.
כל התכנים והסיכומים של ${title} מחכים לך באפליקציה - וגם יומן למעקב אחרי הבייבי וקהילת האמהות שלנו.

הקישור הבא מכניס אותך פנימה, בלי סיסמה ובלי הרשמה:

${link}

נתראה בקרוב 🤍${owner ? `\n${owner}` : ""}`
}

function emailSubject(kind: Kind, title: string): string {
  return kind === "course" ? `הגישה שלך ל${title} מוכנה 🤎` : `ברוכה הבאה למימו 🐣`
}

function emailHtml(kind: Kind, name: string, title: string, link: string): string {
  const first = firstName(name)
  const heading = kind === "course"
    ? `${first ? esc(first) + ", " : ""}הקורס שלך מחכה לך 🤎`
    : `${first ? esc(first) + ", " : ""}ברוכה הבאה למימו 🐣`
  const lead = kind === "course"
    ? `התשלום התקבל ופתחנו לך גישה מלאה ל<strong>${esc(title)}</strong>.
       הכפתור למטה פותח את השיעורים ישירות - בלי סיסמה ובלי הרשמה.`
    : `כיף שאת איתנו. כל התכנים והסיכומים של <strong>${esc(title)}</strong> מחכים לך באפליקציה,
       וגם יומן למעקב אחרי הבייבי וקהילת האמהות שלנו.
       הכפתור למטה מכניס אותך פנימה - בלי סיסמה ובלי הרשמה.`
  const cta = kind === "course" ? "לצפייה בקורס ←" : "לכניסה לאפליקציה ←"
  const tail = kind === "course"
    ? `הקורס שלך לתמיד, בקצב שלך. ואם תרצי - יש שם גם יומן מעקב
       לשינה ולהנקה וקהילה של אמהות. בלי לחץ, בלי תוספת תשלום.`
    : `אפשר להיכנס מכל טלפון, ולהוסיף את מימו למסך הבית כדי שתהיה בהישג יד.`

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
    .select("id, name, email, phone, normalized_phone, status, selected_workshop_id, user_id")
    .eq("id", leadId)
    .maybeSingle()

  if (leadErr) return json({ ok: false, reason: "lead_query_failed", detail: leadErr.message }, 500)
  if (!lead)   return json({ ok: false, reason: "lead_not_found" }, 404)
  if (lead.status !== "paid") return json({ ok: false, reason: "lead_not_paid", status: lead.status }, 409)
  if (!lead.email)            return json({ ok: false, reason: "lead_has_no_email" }, 422)

  // 2 - what did she actually buy? A product carrying structured lesson
  // content is a course; everything else is a room she booked a place in.
  let kind: Kind = "workshop"
  let title = "מימו"
  if (lead.selected_workshop_id) {
    const [{ data: w }, { data: contentRows }] = await Promise.all([
      admin.from("workshops").select("title").eq("id", lead.selected_workshop_id).maybeSingle(),
      admin.from("workshop_content").select("id")
        .eq("workshop_id", lead.selected_workshop_id).not("section", "is", null).limit(1),
    ])
    if (w?.title) title = w.title
    if ((contentRows ?? []).length > 0) kind = "course"
  }

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
    return json({
      ok: true, mode: "dry", kind, title, user_id: userId,
      created_user: createdUser, access_opened: report.access_was_new,
      would_send: waEnabled && phone ? "whatsapp" : "email",
      phone, welcome_url: welcomeUrl, landing,
      wa_preview: waText(kind, lead.name ?? "", title, welcomeUrl, ownerName),
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
      const send = await ghl("/conversations/messages", "POST", GHL_API_KEY, {
        type: "WhatsApp",
        contactId,
        message: waText(kind, lead.name ?? "", title, welcomeUrl, ownerName),
      })
      if (send.ok) channel = "whatsapp"
      else waError = send.error ?? "send_failed"
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
          subject: emailSubject(kind, title),
          html: emailHtml(kind, lead.name ?? "", title, welcomeUrl),
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
    const { error: chErr } = await admin
      .from("registration_leads").update({ welcome_channel: channel }).eq("id", leadId)
    if (chErr) console.error("[claim] welcome_channel update failed:", chErr.message)
  }

  return json({
    ok: true,
    user_id: userId,
    kind,
    created_user: createdUser,
    access_opened: report.access_was_new,
    sent: channel !== null,
    channel,
    wa_error: waError,
    mail_error: mailDetail,
  })
})
