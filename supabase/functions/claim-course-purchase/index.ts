import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * claim-course-purchase
 *
 * Turns a paid lead into a mother who is inside the course:
 *   1. finds or creates her auth user
 *   2. fills her profile, links the lead, opens the access window
 *   3. emails her a one-click link that lands INSIDE the course
 *
 * That last word matters. Plenty of women will buy the course and have no
 * interest in a baby-tracking app; dropping them on the app home screen to
 * hunt for what they paid for is how you lose them. The magic link carries
 * ?course=<workshop id>, which opens the lessons directly. The journal and
 * the community are one tap away if she ever wants them.
 *
 * Called from three places, all idempotent:
 *   - the thank-you page, right after Morning sends her back
 *   - the Morning webhook, which does not care if she closed the tab
 *   - the admin card, when both of those somehow missed her
 *
 * The email is latched PER LEAD, not per access grant: one purchase, one
 * welcome, whoever gets here first.
 *
 * verify_jwt is off: she is not logged in yet, that is the point. The lead
 * id is the credential, and the function refuses any lead not already
 * status='paid', so knowing an id grants nothing.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL   = Deno.env.get("APP_URL")   ?? "https://mimo-baby.co.il"
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "מימו <hello@mimo-baby.co.il>"

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

function emailHtml(name: string, title: string, link: string): string {
  const first = (name ?? "").trim().split(" ")[0]
  return `
<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;background:#F8F4EC;padding:28px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:24px;padding:32px 28px;">
    <h1 style="margin:0 0 8px;font-size:22px;color:#3D2E20;">
      ${first ? esc(first) + ", " : ""}הקורס שלך מחכה לך 🤎
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#6E5836;">
      התשלום התקבל ופתחנו לך גישה מלאה ל<strong>${esc(title)}</strong>.
      הכפתור למטה פותח את השיעורים ישירות — בלי סיסמה ובלי הרשמה.
    </p>
    <a href="${esc(link)}"
       style="display:block;text-align:center;background:#E7C78A;color:#4A3A28;
              text-decoration:none;font-weight:700;font-size:16px;
              padding:16px 20px;border-radius:16px;">
      לצפייה בקורס ←
    </a>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#8A8370;">
      שמרי את המייל הזה. אם הקישור פג תוקף, היכנסי ל-${esc(APP_URL)}
      והתחברי עם כתובת המייל הזו — הקורס מחכה לך שם תמיד.
    </p>
    <hr style="border:none;border-top:1px solid #EFE8DC;margin:24px 0;" />
    <p style="margin:0;font-size:14px;line-height:1.8;color:#6E5836;">
      הקורס שלך לתמיד, בקצב שלך. ואם תרצי — יש שם גם יומן מעקב
      לשינה ולהנקה וקהילה של אמהות. בלי לחץ, בלי תוספת תשלום.
    </p>
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
  try {
    const body = await req.json()
    leadId = String(body?.lead_id ?? "")
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
    .select("id, name, email, phone, status, selected_workshop_id, user_id")
    .eq("id", leadId)
    .maybeSingle()

  if (leadErr) return json({ ok: false, reason: "lead_query_failed", detail: leadErr.message }, 500)
  if (!lead)   return json({ ok: false, reason: "lead_not_found" }, 404)
  if (lead.status !== "paid") return json({ ok: false, reason: "lead_not_paid", status: lead.status }, 409)
  if (!lead.email)            return json({ ok: false, reason: "lead_has_no_email" }, 422)

  // 2 - her user
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
      user_metadata: { mother_name: lead.name, phone: lead.phone, source: "course_purchase" },
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

  // 3 - profile, linkage, access
  const { data: attached, error: attachErr } = await admin.rpc("attach_paid_lead", {
    p_lead_id: leadId,
    p_user_id: userId,
  })
  if (attachErr) return json({ ok: false, reason: "attach_failed", detail: attachErr.message }, 500)
  const report = attached as { ok: boolean; reason?: string; access_was_new?: boolean }
  if (!report?.ok) return json({ ok: false, reason: report?.reason ?? "attach_rejected" }, 409)

  // 4 - the email latch. One welcome per purchase, whoever arrives first.
  const { data: won, error: latchErr } = await admin.rpc("claim_welcome_email_slot", { p_lead_id: leadId })
  if (latchErr) console.error("[claim] latch failed:", latchErr.message)
  if (won !== true) {
    return json({
      ok: true, user_id: userId, access_opened: report.access_was_new,
      email_sent: false, already_emailed: true,
    })
  }

  // 5 - her way in: straight into the lessons, not the app home screen.
  const courseUrl = lead.selected_workshop_id
    ? `${APP_URL}/?course=${lead.selected_workshop_id}`
    : `${APP_URL}/?course`
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: lead.email,
    options: { redirectTo: courseUrl },
  })
  const loginLink = linkData?.properties?.action_link ?? courseUrl
  if (linkErr) console.error("[claim] generateLink failed:", linkErr.message)

  const resendKey = Deno.env.get("RESEND_API_KEY")
  if (!resendKey) {
    console.error("[claim] RESEND_API_KEY missing - access granted, no email sent")
    await admin.rpc("release_welcome_email_slot", { p_lead_id: leadId })
    return json({ ok: true, user_id: userId, created_user: createdUser, email_sent: false, reason: "no_mail_key" })
  }

  const { data: w } = await admin
    .from("workshops").select("title").eq("id", lead.selected_workshop_id).maybeSingle()
  const title = w?.title ?? "הקורס הדיגיטלי"

  let emailSent = false
  let mailDetail: string | null = null
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: lead.email,
        subject: `הגישה שלך ל${title} מוכנה 🤎`,
        html: emailHtml(lead.name ?? "", title, loginLink),
      }),
    })
    emailSent = r.ok
    if (!r.ok) {
      mailDetail = `${r.status} ${await r.text()}`.slice(0, 300)
      console.error("[claim] resend failed:", mailDetail)
    }
  } catch (e) {
    mailDetail = String(e).slice(0, 300)
    console.error("[claim] resend threw:", mailDetail)
  }

  if (!emailSent) await admin.rpc("release_welcome_email_slot", { p_lead_id: leadId })

  return json({
    ok: true,
    user_id: userId,
    created_user: createdUser,
    access_opened: report.access_was_new,
    email_sent: emailSent,
    mail_error: mailDetail,
  })
})
