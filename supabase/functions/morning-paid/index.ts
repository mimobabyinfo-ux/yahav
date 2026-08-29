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
 * -- ANSWER FIRST, WORK AFTER (v15, 24.8.26) ----------------------------
 * Everything below the token check now runs in the BACKGROUND and Morning
 * gets its 200 immediately. This is not a nicety, it is what keeps the
 * webhook alive.
 *
 * v14 did the matching, the seat confirmation and the whole
 * claim-course-purchase round trip - GHL included - while Morning waited
 * on the socket. GHL is slow enough that Morning gave up mid-call, counted
 * a failure and retried on a widening backoff: the same 1-shekel test
 * delivery landed five times overnight at 60, 90, 120 and 150 minute
 * intervals, each one logged as a clean success on our side. After enough
 * consecutive "failures" Morning switched the endpoint to לא פעיל, and
 * from 05:58 on 24.8 it stopped delivering anything at all. Two real
 * payments that day never arrived and two mothers got nothing.
 *
 * So: the token is still checked synchronously (a bad token deserves a
 * real 401), and everything else is fire-and-forget. Outcomes live in
 * morning_webhook_log, which is the only place worth reading anyway.
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
 * v16 (29.8.26) adds the second thing a paid row can still owe: an EXTRA
 * ticket bought after registration (buy_extra_event_seat). Its hold is
 * extra_hold_expires_at, and confirm_event_payment_for_user turns it into
 * a seat exactly the way the thank-you page does.
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

/**
 * Keep the isolate alive for work that outlives the response. Without
 * waitUntil the runtime may tear us down the moment we answer Morning.
 */
function background(p: Promise<unknown>) {
  const rt = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void }
  }).EdgeRuntime
  const guarded = p.catch((e) => console.error("[morning-paid] background failed:", String(e)))
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(guarded)
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

/**
 * Everything that used to happen while Morning waited. Returns nothing:
 * the record of what happened is morning_webhook_log plus the console.
 */
async function process(payload: MorningPayload): Promise<void> {
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
      .from("community_events").select("id, title, price")
      .or(`morning_product_id.eq.${productId},morning_product_id_pair.eq.${productId}`)

    const candidates = evs ?? []
    if (candidates.length > 0) {
      // ONE LINK, SEVERAL EVENTS. Brenda runs a standing deposit link and a
      // standing double-deposit link and hangs every meeting at that price
      // on them, which is the sane way to run Morning - a new product per
      // event would be a new link to paste every week. So a product id no
      // longer identifies an event by itself; it narrows the field, and the
      // held seat decides. v10 treated this as a fatal ambiguity and
      // refused every payment that came in on a shared link.
      const payer = await findPayerAccount()

      const since = new Date(Date.now() - HOLD_WINDOW_MIN * 60_000).toISOString()
      const nowIso = new Date().toISOString()
      const ids = candidates.map(e => e.id)
      // Two kinds of seat can be owing money on one row (v16, 29.8.26):
      // the registration itself, or an EXTRA ticket bought after she was
      // already registered and paid. The old query said .eq("paid", false)
      // and so could not see the second kind at all - a mother who bought
      // a second ticket and lost the redirect would have had her payment
      // logged as no_seat_match.
      const { data: holds } = await admin
        .from("event_registrations")
        .select("event_id, user_id, status, paid, updated_at, hold_expires_at, extra_guest_names, extra_hold_expires_at")
        .in("event_id", ids)
        .in("status", ["pending", "registered"])
        .order("updated_at", { ascending: false })

      // Whichever hold is the open one decides both questions below.
      const owing = (h: { paid?: boolean; extra_guest_names?: string[] | null }) =>
        !h.paid || (h.extra_guest_names ?? []).length > 0
      const holdEnd = (h: { paid?: boolean; hold_expires_at?: string | null; extra_hold_expires_at?: string | null }) =>
        h.paid ? h.extra_hold_expires_at : h.hold_expires_at

      const unpaid = (holds ?? []).filter(owing)
      const live = unpaid.filter(h => {
        const until = holdEnd(h)
        return h.updated_at >= since && (!until || until > nowIso)
      })

      const titleOf = (id: string) => candidates.find(e => e.id === id)?.title ?? id
      const priceOf = (id: string) => Number(candidates.find(e => e.id === id)?.price ?? 0)
      const scope = candidates.map(e => e.title).join(" / ")

      let eventId: string | null = null
      let userId: string | null = null
      let via = ""

      // 1 - the payer is the registrant. The clean case, and the only one
      //     that survives several holds being open at once.
      const mine = payer ? unpaid.filter(h => h.user_id === payer.id) : []
      if (mine.length === 1) {
        eventId = mine[0].event_id
        userId = payer!.id
        via = `payer_hold_${payer!.via}`
      } else if (mine.length > 1) {
        console.error("[morning-paid] payer holds seats on several events at this price:", scope)
        await record("community_event", `ambiguous_payer_holds(${mine.length}):${scope}`)
        return
      }

      // 2 - somebody else paid for a seat held moments ago. One live hold
      //     and one payment for its product is one purchase.
      if (!userId && live.length === 1) {
        eventId = live[0].event_id
        userId = live[0].user_id
        via = "single_live_hold"
      }

      // 3 - several people are mid-checkout. Guessing here is how the Bit
      //     bug happened. Refuse and let Brenda assign it by hand.
      if (!userId && live.length > 1) {
        console.error("[morning-paid] several live holds, cannot tell whose:", scope)
        await record("community_event", `ambiguous_holds(${live.length}):${scope}`)
        return
      }

      // 4 - nobody is mid-checkout and we know the payer: a link paid cold.
      //     Only possible when the link belongs to exactly one event; on a
      //     shared link there is nothing to say which meeting she meant.
      if (!userId && live.length === 0 && payer && candidates.length === 1) {
        eventId = candidates[0].id
        userId = payer.id
        via = `payer_new_${payer.via}`
      }

      if (!userId || !eventId) {
        console.log("[morning-paid] event payment, cannot tell whose seat:", email, payerPhone, scope)
        await record("community_event", `no_seat_match:${scope}`)
        return
      }

      // A total that is neither the price nor twice it means the link in
      // Morning is not the link Brenda thinks it is. Confirm the seat
      // anyway - she was charged, she is coming - but shout about it.
      const price = priceOf(eventId)
      const priceOff = paidTotal != null && price > 0
        && paidTotal !== price && paidTotal !== price * 2
      const flag = priceOff ? ` !price_mismatch(paid ${paidTotal} vs ${price})` : ""

      const { data: result, error: confErr } = await admin.rpc("confirm_event_payment_for_user", {
        p_event_id: eventId, p_user_id: userId, p_amount: paidTotal,
      })
      if (confErr) {
        console.error("[morning-paid] confirm failed:", confErr.message)
        await record("community_event", `confirm_failed:${confErr.message}`)
        return
      }
      console.log("[morning-paid] event payment confirmed:", titleOf(eventId), via, result)
      await record("community_event", `${result}:${titleOf(eventId)} (via ${via})${flag}`)
      return
    }
  }

  // -- B - digital course -------------------------------------------------
  if (!email) {
    await record("unmatched", "no_email_in_payload")
    return
  }

  // Which products may have a lead CONJURED for them from a bare product id
  // (see below). Only self-serve digital courses qualify: they have no
  // cohort, so a lead with nothing but an email is still a complete record.
  // A workshop invented this way would be a seat in a room with no meeting
  // attached, which is worse than no record at all.
  //
  // This used to be "any product with sectioned content in workshop_content".
  // Loading the עטופים and מגלים session summaries into the app would have
  // quietly pulled both of them into this list. thanks_template is the
  // explicit marker instead, and it does not move when content is added.
  const { data: courseRows } = await admin
    .from("workshops").select("id").eq("thanks_template", "course")
  const courseIds = (courseRows ?? []).map((r: { id: string }) => r.id)

  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const { data: leads, error: leadErr } = await admin
    .from("registration_leads")
    .select("id, status, created_at, selected_workshop_id")
    // No .in(selected_workshop_id, courseIds) any more. Restricting the
    // safety net to course products is what left workshop buyers with NO
    // fallback at all: a mother who paid for עטופים and then closed her
    // browser got an account only if the thank-you page happened to run in
    // the same tab. That gap is the single biggest source of paid mothers
    // who never reached the app.
    .ilike("email", email)
    .gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1)
  if (leadErr) {
    await record("unmatched", `lead_query_failed:${leadErr.message}`)
    return
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
    return
  }

  // mark_lead_paid flips status to 'paid'. The DB trigger
  // registration_leads_welcome_on_paid deliberately skips service_role
  // callers, which is us, so the claim call below is still ours to make.
  const { error: paidErr } = await admin.rpc("mark_lead_paid", { p_lead_id: leadId })
  if (paidErr) console.error("[morning-paid] mark_lead_paid failed:", paidErr.message)

  const claimRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/claim-course-purchase`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId }) },
  )
  const claim = await claimRes.json().catch(() => null)
  console.log("[morning-paid] claim result:", JSON.stringify(claim))

  await record(
    "digital_course",
    `${createdLead ? "created_lead" : "matched_lead"} claim:${claim?.channel ?? "none"}${claim?.sent ? "" : " !not_sent"}`,
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const url = new URL(req.url)
  const expected = Deno.env.get("MORNING_WEBHOOK_TOKEN")
  const given = url.searchParams.get("token") ?? ""

  if (req.method === "GET") {
    return json({
      ok: true, alive: true, version: 16,
      handles: ["community_event", "digital_course", "workshop"],
      seat_match: ["payer_hold", "single_live_hold", "payer_new"],
      shared_product_ids: true,
      responds: "immediately, work runs in background",
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

  // Answer Morning now. Anything slower than this - GHL above all - is
  // what got the endpoint switched off on 24.8.
  background(process(payload))
  return json({ ok: true, queued: true })
})
