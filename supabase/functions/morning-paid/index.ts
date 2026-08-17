import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * morning-paid - the safety net. Event: payment/received.
 *
 * The thank-you page handles the happy path. This handles everything else:
 * she closed the tab, her phone died, the redirect failed, she paid with
 * Bit or Apple Pay which never return to the browser, or she paid a raw
 * Morning link Brenda sent over WhatsApp and never saw the site.
 *
 * Payload, from a live delivery:
 *   { id, channel: "payment-link", productId, description, total,
 *     payer: { name, phone, email }, transactions: [...] }
 *
 * -- WHOSE SEAT IS THIS? -------------------------------------------------
 * The hard part is not the payment, it is the person. Brenda's Bit test on
 * 17.8 proved why: she registered on one account and Bit reported a
 * different email, so a brand-new paid seat was minted for the payer while
 * the registration she was looking at still said "complete your payment".
 * A partner paying for a mother does exactly the same thing.
 *
 * The payer's identity is therefore the LAST signal, not the first:
 *   1. the payer's account already holds an unpaid seat here -> that seat
 *   2. exactly ONE live hold on this event               -> that seat
 *      (a seat held 40 seconds ago and a payment for its product now are
 *      the same purchase, whoever's card it was)
 *   3. several live holds  -> refuse. Log it, touch nothing.
 *   4. no hold at all, payer known -> create one (a raw link paid cold)
 *   5. otherwise -> refuse.
 *
 * v10 changes what v9 got wrong. v9 fell through to "create a seat for the
 * payer" whenever more than one hold was open, which is exactly the Bit
 * case again - an abandoned hold from an hour earlier was enough to bring
 * the bug back. Now ambiguity refuses, and the window is short enough that
 * an abandoned hold falls out of it. A missing seat is a message to
 * Brenda; a wrong seat is a mother turned away at the door.
 *
 * A hold is "live" when it is unpaid, still pending/registered, its
 * hold_expires_at has not passed, and it was touched inside HOLD_WINDOW.
 *
 * COURSES are matched separately, after events: a lead by email, or
 * workshops.morning_product_id for a raw link (the lead is created).
 *
 * Every delivery is written to morning_webhook_log, matched or not, and a
 * total that does not equal the event price (or twice it, for a pair) is
 * flagged there - that is how a live 1-shekel test link gets noticed.
 *
 * SECURITY: ?token= must equal MORNING_WEBHOOK_TOKEN. Both paths can mint
 * a purchase, so the token is the whole gate.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

/** How long a held seat stays claimable by an incoming payment. */
const HOLD_WINDOW_MIN = 20

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Israeli numbers arrive in every shape; the last 9 digits are stable. */
function phoneKey(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  return digits.length >= 9 ? digits.slice(-9) : null
}

type MorningPayload = {
  id?: string; channel?: string; productId?: string; description?: string
  total?: number
  payer?: { name?: string; phone?: string; email?: string }
  transactions?: Array<{ gatewayTransactionId?: string; total?: number }>
}

function scanForEmail(v: unknown, depth = 0): string | null {
  if (depth > 6 || v == null) return null
  if (typeof v === "string") {
    const m = v.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    return m ? m[0].toLowerCase() : null
  }
  if (Array.isArray(v)) {
    for (const x of v) { const r = scanForEmail(x, depth + 1); if (r) return r }
    return null
  }
  if (typeof v === "object") {
    for (const k of Object.keys(v as Record<string, unknown>)) {
      const r = scanForEmail((v as Record<string, unknown>)[k], depth + 1)
      if (r) return r
    }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const url = new URL(req.url)
  const expected = Deno.env.get("MORNING_WEBHOOK_TOKEN")
  const given = url.searchParams.get("token") ?? ""

  if (req.method === "GET") {
    return json({
      ok: true, alive: true, version: 10,
      handles: ["community_event", "digital_course"],
      seat_match: ["payer_hold", "single_live_hold", "payer_new"],
      hold_window_min: HOLD_WINDOW_MIN,
      logs_to: "morning_webhook_log",
      secret_configured: !!expected,
      token_supplied: given.length > 0,
      token_valid: !!expected && given.length > 0 && sameToken(given, expected),
    })
  }

  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405)
  if (!expected) return json({ ok: false, reason: "webhook_not_configured" }, 503)
  if (!sameToken(given, expected)) {
    console.error("[morning-paid] rejected: bad token")
    return json({ ok: false, reason: "bad_token" }, 401)
  }

  let payload: MorningPayload
  try { payload = await req.json() } catch {
    const text = await req.text().catch(() => "")
    console.error("[morning-paid] non-json body:", text.slice(0, 2000))
    return json({ ok: false, reason: "bad_json" }, 400)
  }

  console.log("[morning-paid] payload:", JSON.stringify(payload).slice(0, 4000))

  const email = (payload?.payer?.email ?? scanForEmail(payload) ?? "").trim().toLowerCase()
  const payerName  = (payload?.payer?.name ?? "").trim()
  const payerPhone = (payload?.payer?.phone ?? "").trim()
  const productId  = (payload?.productId ?? "").trim()
  const paidTotal  = typeof payload?.total === "number" ? payload.total : null

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  async function record(outcome: string, detail?: string) {
    try {
      await admin.from("morning_webhook_log").insert({
        product_id: productId || null,
        description: payload?.description ?? null,
        total: paidTotal,
        payer_email: email || null,
        payer_name: payerName || null,
        payer_phone: payerPhone || null,
        outcome, detail: detail ?? null, payload,
      })
    } catch (e) { console.error("[morning-paid] log insert failed:", String(e)) }
  }

  /** The payer's Mimo account, by email then phone. May be null. */
  async function findPayerAccount(): Promise<{ id: string; via: string } | null> {
    if (email) {
      const { data } = await admin
        .from("user_profiles").select("id").ilike("email", email).maybeSingle()
      if (data?.id) return { id: data.id, via: "email" }
    }
    const key = phoneKey(payerPhone)
    if (key) {
      const { data } = await admin
        .from("user_profiles").select("id, phone_number")
        .not("phone_number", "is", null)
        .ilike("phone_number", `%${key.slice(-7)}%`).limit(20)
      const hit = (data ?? []).find(p => phoneKey(p.phone_number ?? "") === key)
      if (hit?.id) return { id: hit.id, via: "phone" }
    }
    return null
  }

  // -- A - community event ----------------------------------------------
  if (productId) {
    const { data: evs } = await admin
      .from("community_events").select("id, title, price, morning_product_id_pair")
      .or(`morning_product_id.eq.${productId},morning_product_id_pair.eq.${productId}`)
      .limit(2)

    if (evs && evs.length > 1) {
      console.error("[morning-paid] product id is on more than one event:", productId)
      await record("unmatched", `ambiguous_product_id:${evs.map(e => e.title).join(" / ")}`)
      return json({ ok: false, reason: "ambiguous_product_id", product_id: productId }, 409)
    }

    const ev = evs?.[0]
    if (ev?.id) {
      // A total that is neither the price nor twice it means the link in
      // Morning is not the link Brenda thinks it is. Confirm the seat
      // anyway - she was charged, she is coming - but shout about it.
      const price = Number(ev.price ?? 0)
      const priceOff = paidTotal != null && price > 0
        && paidTotal !== price && paidTotal !== price * 2
      const flag = priceOff ? ` !price_mismatch(paid ${paidTotal} vs ${price})` : ""

      const payer = await findPayerAccount()

      const since = new Date(Date.now() - HOLD_WINDOW_MIN * 60_000).toISOString()
      const nowIso = new Date().toISOString()
      const { data: holds } = await admin
        .from("event_registrations")
        .select("user_id, status, updated_at, hold_expires_at")
        .eq("event_id", ev.id)
        .in("status", ["pending", "registered"])
        .eq("paid", false)
        .order("updated_at", { ascending: false })

      const unpaid = holds ?? []
      const live = unpaid.filter(h =>
        h.updated_at >= since && (!h.hold_expires_at || h.hold_expires_at > nowIso))

      let userId: string | null = null
      let via = ""

      // 1 - the payer is the registrant. The clean case, and the only one
      //     that survives several holds being open at once.
      if (payer && unpaid.some(h => h.user_id === payer.id)) {
        userId = payer.id
        via = `payer_hold_${payer.via}`
      }

      // 2 - somebody else paid for a seat held moments ago. One live hold
      //     and one payment for its product is one purchase.
      if (!userId && live.length === 1) {
        userId = live[0].user_id
        via = "single_live_hold"
      }

      // 3 - several people are mid-checkout. Guessing here is how the Bit
      //     bug happened. Refuse and let Brenda assign it.
      if (!userId && live.length > 1) {
        console.error("[morning-paid] several live holds, cannot tell whose:", ev.title)
        await record("community_event", `ambiguous_holds(${live.length}):${ev.title}${flag}`)
        return json({
          ok: true, matched: false, kind: "community_event",
          reason: "ambiguous_holds", event_id: ev.id, holds: live.length, email,
        })
      }

      // 4 - nobody is mid-checkout and we know the payer: a link paid cold.
      if (!userId && live.length === 0 && payer) {
        userId = payer.id
        via = `payer_new_${payer.via}`
      }

      if (!userId) {
        console.log("[morning-paid] event payment, cannot tell whose seat:", email, payerPhone, ev.title)
        await record("community_event", `no_seat_match:${ev.title}${flag}`)
        return json({
          ok: true, matched: false, kind: "community_event",
          reason: "no_seat_match", event_id: ev.id, email,
        })
      }

      const { data: result, error: confErr } = await admin.rpc("confirm_event_payment_for_user", {
        p_event_id: ev.id, p_user_id: userId, p_amount: paidTotal,
      })
      if (confErr) {
        console.error("[morning-paid] confirm failed:", confErr.message)
        await record("community_event", `confirm_failed:${confErr.message}`)
        return json({ ok: false, kind: "community_event", reason: "confirm_failed", detail: confErr.message }, 500)
      }
      console.log("[morning-paid] event payment confirmed:", ev.title, via, result)
      await record("community_event", `${result}:${ev.title} (via ${via})${flag}`)
      return json({
        ok: true, matched: true, kind: "community_event",
        event_id: ev.id, matched_via: via, result, price_mismatch: priceOff,
      })
    }
  }

  // -- B - digital course -------------------------------------------------
  if (!email) {
    await record("unmatched", "no_email_in_payload")
    return json({ ok: false, reason: "no_email_in_payload" }, 422)
  }

  const { data: contentRows } = await admin
    .from("workshop_content").select("workshop_id").not("section", "is", null)
  const courseIds = [...new Set((contentRows ?? []).map((r: { workshop_id: string }) => r.workshop_id))]
  if (courseIds.length === 0) {
    await record("unmatched", "no_course_products")
    return json({ ok: false, reason: "no_course_products" }, 404)
  }

  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const { data: leads, error: leadErr } = await admin
    .from("registration_leads")
    .select("id, status, created_at, selected_workshop_id")
    .ilike("email", email).in("selected_workshop_id", courseIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1)
  if (leadErr) {
    await record("unmatched", `lead_query_failed:${leadErr.message}`)
    return json({ ok: false, reason: "lead_query_failed", detail: leadErr.message }, 500)
  }

  let leadId: string | null = leads?.[0]?.id ?? null
  let createdLead = false

  if (!leadId && productId) {
    const { data: w } = await admin
      .from("workshops").select("id")
      .eq("morning_product_id", productId).in("id", courseIds).maybeSingle()
    if (w?.id) {
      const { data: made, error: makeErr } = await admin
        .from("registration_leads").insert({
          name: payerName || email.split("@")[0],
          phone: payerPhone || "", email,
          selected_workshop_id: w.id, status: "pending", source: "morning-webhook",
        }).select("id").single()
      if (makeErr) console.error("[morning-paid] lead insert failed:", makeErr.message)
      else { leadId = made.id; createdLead = true }
    }
  }

  if (!leadId) {
    await record("unmatched", "no_matching_lead_or_event")
    return json({ ok: true, matched: false, reason: "no_matching_lead", product_id: productId })
  }

  const { error: paidErr } = await admin.rpc("mark_lead_paid", { p_lead_id: leadId })
  if (paidErr) console.error("[morning-paid] mark_lead_paid failed:", paidErr.message)

  const claimRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/claim-course-purchase`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId }) },
  )
  const claim = await claimRes.json().catch(() => null)

  await record("digital_course", createdLead ? "created_lead" : "matched_lead")
  return json({ ok: true, matched: true, kind: "digital_course", lead_id: leadId, created_lead: createdLead, claim })
})
