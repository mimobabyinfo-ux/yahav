import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * public-event-register
 *
 * A mother with no app registers for a community event from a public link
 * (/?event=<id>). Yahav 11.9.26: "אני רוצה לתת אופציה להירשם לאירועי קהילה
 * מבחוץ מי שאין לה אפליקציה".
 *
 * event_registrations.user_id is NOT NULL, so the only honest way in is to
 * give her an account first. This function does what claim-course-purchase
 * does for a paid lead, minus the welcome message:
 *
 *   register  {event_id, name, phone, email, guest_names?}
 *             guest_names: up to 3 people she brings (Yahav 11.9.26:
 *             "אם רוצים להגיע שתיים"). One guest on an event with a pair
 *             link pays through that link; otherwise pay_times says how
 *             many times to pass through the single link, as the app does.
 *             find-or-create her auth user by email, write a profile row
 *             (name, phone, email - what morning-paid matches the payment
 *             against), and call register_for_event_as. A priced event
 *             returns 'pending' with the Morning link (ten-minute hold,
 *             same as in the app); a free one returns 'registered'.
 *             Answers with a claim_token: her handle on her own row.
 *
 *   status    {claim_token}
 *             'pending' | 'registered' | 'expired'. The page polls this
 *             while she is at Morning; the webhook flips the row to paid.
 *
 *   link      {claim_token}
 *             A fresh magic link into the app. ONLY once the seat is real
 *             (paid, or a free event). Before that, the token proves
 *             nothing: anyone can type any email into the form, so a
 *             sign-in link for an unpaid row would be a way into somebody
 *             else's account.
 *
 * Why the account is created before payment and not after: the webhook
 * needs a profile to match on, and the seat hold needs a user_id. The
 * profile row has no onboarding_completed_at, so the app still treats her
 * as new the first time she signs in.
 *
 * Deployed with verify_jwt: false, like the other public functions.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APP_URL = Deno.env.get("APP_URL") ?? "https://mimo-baby.co.il"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("972") && digits.length === 12) return "0" + digits.slice(3)
  if (digits.startsWith("0") && digits.length === 10) return digits
  if (digits.length === 9) return "0" + digits
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ ok: false, reason: "bad_json" }, 400) }
  const mode = String(body.mode ?? "register")

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // ---- status / link: by claim token ------------------------------------
  if (mode === "status" || mode === "link") {
    const token = String(body.claim_token ?? "")
    if (!UUID.test(token)) return json({ ok: false, reason: "bad_token" }, 400)

    const { data: row } = await admin
      .from("event_registrations")
      .select("event_id, user_id, status, paid, hold_expires_at, community_events(price, title)")
      .eq("claim_token", token)
      .maybeSingle()
    if (!row) return json({ ok: false, reason: "not_found" }, 404)

    const ev = row.community_events as unknown as { price: number; title: string } | null
    const free = Number(ev?.price ?? 0) === 0
    const seated = row.status === "registered" || row.status === "attended"
    const real = seated && (free || row.paid === true)
    const holdOver = row.status === "pending" && row.hold_expires_at && row.hold_expires_at < new Date().toISOString()

    if (mode === "status") {
      return json({
        ok: true,
        status: real ? "registered" : holdOver ? "expired" : row.status,
        title: ev?.title ?? null,
      })
    }

    if (!real) return json({ ok: false, reason: "not_paid" }, 409)

    const { data: u } = await admin.auth.admin.getUserById(row.user_id)
    const email = u?.user?.email
    if (!email) return json({ ok: false, reason: "no_email" }, 500)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_URL}/` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[public-event] generateLink failed:", linkErr?.message)
      return json({ ok: false, reason: "link_failed" }, 500)
    }
    return json({ ok: true, action_link: linkData.properties.action_link })
  }

  // ---- register ----------------------------------------------------------
  const eventId = String(body.event_id ?? "")
  const name = String(body.name ?? "").trim()
  const email = String(body.email ?? "").trim().toLowerCase()
  const phone = cleanPhone(String(body.phone ?? ""))
  const guests = (Array.isArray(body.guest_names) ? body.guest_names : [])
    .map(g => String(g ?? "").trim()).filter(g => g.length > 0).slice(0, 3)

  if (!UUID.test(eventId)) return json({ ok: false, reason: "bad_event" }, 400)
  if (name.length < 2) return json({ ok: false, reason: "bad_name" }, 422)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, reason: "bad_email" }, 422)
  if (!phone) return json({ ok: false, reason: "bad_phone" }, 422)

  const { data: ev } = await admin
    .from("community_events")
    .select("id, title, price, payment_link, payment_link_pair, is_active, event_date")
    .eq("id", eventId).maybeSingle()
  if (!ev || !ev.is_active) return json({ ok: false, reason: "not_found" }, 404)

  // 1 - her user. By email, like every other door into the app.
  let userId: string | null = null
  {
    const { data: found } = await admin.rpc("find_auth_user_by_email", { p_email: email })
    userId = (found as string | null) ?? null
  }
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      // Not confirmed: she has not proved the address yet. The magic link
      // she gets after paying confirms it.
      email_confirm: false,
      user_metadata: { mother_name: name, phone, source: "public_event" },
    })
    if (createErr || !created?.user) {
      const { data: retry } = await admin.rpc("find_auth_user_by_email", { p_email: email })
      userId = (retry as string | null) ?? null
      if (!userId) return json({ ok: false, reason: "create_user_failed", detail: createErr?.message }, 500)
    } else {
      userId = created.user.id
    }
  }

  // 2 - her profile. This is what morning-paid matches the payment on
  //     (email first, phone second), so it must exist before she pays.
  //     An existing profile keeps its own name and phone.
  const { data: prof } = await admin
    .from("user_profiles").select("id, mother_name, phone_number").eq("id", userId).maybeSingle()
  if (!prof) {
    const { error: profErr } = await admin.from("user_profiles").insert({
      id: userId, email, mother_name: name, phone_number: phone,
      acquisition_source: "public_event",
    })
    if (profErr) return json({ ok: false, reason: "profile_failed", detail: profErr.message }, 500)
  } else if (!prof.phone_number) {
    await admin.from("user_profiles").update({ phone_number: phone }).eq("id", userId)
  }

  // 3 - the seat
  const { data: result, error: regErr } = await admin.rpc("register_for_event_as", {
    p_user_id: userId, p_event_id: eventId, p_guest_names: guests,
  })
  if (regErr) return json({ ok: false, reason: "register_failed", detail: regErr.message }, 500)
  const status = String(result)
  if (status === "full" || status === "past" || status === "not_found") {
    return json({ ok: false, reason: status }, 409)
  }

  const { data: reg } = await admin
    .from("event_registrations").select("claim_token")
    .eq("event_id", eventId).eq("user_id", userId).maybeSingle()

  const seats = 1 + guests.length
  const priced = Number(ev.price) > 0
  const pair = seats === 2 && ev.payment_link_pair ? ev.payment_link_pair : null
  return json({
    ok: true,
    status,                              // 'pending' | 'registered' | 'already'
    claim_token: reg?.claim_token ?? null,
    payment_link: priced ? (pair ?? ev.payment_link) : null,
    pay_times: priced && !pair ? seats : 1,
    seats,
    title: ev.title,
  })
})
