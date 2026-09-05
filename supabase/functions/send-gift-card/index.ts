// Edge Function: send-gift-card
//
// Brenda 19.8.26: "ואז לתת אופציה של שליחת ההודעה הזאת לחברה — לשים את
// המייל של החברה ואז היא תקבל מייל ממימו: היי, קיבלת גיפט קארד ל<שם
// המוצר>, למימוש צרי קשר עם ברנדה והמספר טלפון שלה."
//
// Called with { gift_card_id } by the buyer right after she pays (from
// the thank-you page) or later from "הרכישות שלי", and by Brenda from the
// admin panel — including the resend, which is the whole reason this is a
// function and not a database trigger.
//
// Rules it enforces, in order:
//   1. The caller is either signed in and the BUYER or an admin, or (no
//      account, public page) holds the card's secret claim_token. Anyone
//      could otherwise mail anyone by guessing a uuid.
//   2. The card is PAID. Brenda chose "רק אחרי שהתשלום אושר" — a pending
//      card is an intent, not a gift, and mailing it would promise a
//      workshop nobody paid for.
//   3. A recipient email exists (set_gift_card_recipient already
//      validated its shape).
//
// A send failure is written to send_error and the card stays 'paid', so
// the button can simply be pressed again.
//
// Secrets: RESEND_API_KEY, plus the platform-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** 972533041277 → 053-304-1277. What a mother can actually dial. */
function displayPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  const local = digits.startsWith('972') ? '0' + digits.slice(3) : digits
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
  return local || raw
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function emailHtml(opts: {
  recipientName: string | null
  buyerName: string | null
  productTitle: string
  cohortLabel: string | null
  message: string | null
  code: string
  ownerName: string
  phone: string
  waPhone: string
}): string {
  const hi = opts.recipientName ? `היי ${esc(opts.recipientName)},` : 'היי,'
  const from = opts.buyerName ? `${esc(opts.buyerName)} חשבה עלייך ושלחה לך מתנה 🤍` : 'קיבלת מתנה 🤍'
  return `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:24px;background:#FAF6EF;font-family:Arial,Helvetica,sans-serif;color:#443327;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 2px 12px rgba(68,51,39,0.08);">
    <div style="background:#F4EDE1;padding:28px 24px;text-align:center;">
      <div style="font-size:40px;line-height:1;">🎁</div>
      <div style="font-size:22px;font-weight:bold;margin-top:10px;">קיבלת גיפט קארד ממימו</div>
    </div>
    <div style="padding:24px;font-size:16px;line-height:1.7;">
      <p style="margin:0 0 8px;">${hi}</p>
      <p style="margin:0 0 18px;">${from}</p>

      <div style="background:#FAF6EF;border:1px solid #EFE4D3;border-radius:18px;padding:18px;margin-bottom:18px;">
        <div style="font-size:13px;color:#7B604C;">המתנה שלך</div>
        <div style="font-size:19px;font-weight:bold;margin-top:4px;">${esc(opts.productTitle)}</div>
        ${opts.cohortLabel ? `<div style="font-size:14px;color:#7B604C;margin-top:6px;">מחזור מוצע: ${esc(opts.cohortLabel)}</div>` : ''}
        <div style="font-size:14px;color:#7B604C;margin-top:10px;">קוד המתנה: <span style="font-weight:bold;letter-spacing:1px;direction:ltr;display:inline-block;">${esc(opts.code)}</span></div>
      </div>

      ${opts.message ? `<div style="border-right:3px solid #E7C78A;padding:2px 14px;margin-bottom:18px;color:#5C4A38;white-space:pre-line;">${esc(opts.message)}</div>` : ''}

      <p style="margin:0 0 6px;font-weight:bold;">איך ממשים?</p>
      <p style="margin:0 0 18px;">
        למימוש המתנה צרי קשר עם ${esc(opts.ownerName)} בטלפון
        <a href="tel:+${esc(opts.waPhone)}" style="color:#A35C3D;font-weight:bold;text-decoration:none;direction:ltr;display:inline-block;">${esc(opts.phone)}</a>
        ונתאם לך את המועד המתאים.
      </p>

      <div style="text-align:center;margin-bottom:6px;">
        <a href="https://wa.me/${esc(opts.waPhone)}?text=${encodeURIComponent(`היי ${opts.ownerName}! קיבלתי גיפט קארד למימו (${opts.code}) ל${opts.productTitle} ואשמח לממש 🤍`)}"
           style="display:inline-block;background:#818267;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:16px;">
          לשליחת הודעה ב-WhatsApp
        </a>
      </div>
    </div>
    <div style="padding:16px 24px 24px;text-align:center;color:#8A7A63;font-size:12px;">
      באהבה, מימו 🌿
    </div>
  </div>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  if (!resendKey) return json({ error: 'missing_resend_key' }, 500)

  // Two kinds of caller, since 5.9.26:
  //   - signed in (the in-app flow, and Brenda): a JWT, and the card must
  //     be hers or she must be admin;
  //   - no account (the public ?giftcard page): the card's claim_token,
  //     which only the buyer's own browser holds. verify_jwt is OFF for
  //     this function so the request can arrive with just the anon key.
  let body: { gift_card_id?: string; claim_token?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_body' }, 400) }

  const admin = createClient(url, serviceKey)
  let card: Record<string, any> | null = null

  if (body.claim_token) {
    if (!/^[0-9a-f-]{36}$/.test(body.claim_token)) return json({ error: 'bad_token' }, 400)
    const { data } = await admin.from('gift_cards').select('*')
      .eq('claim_token', body.claim_token).is('buyer_user_id', null).maybeSingle()
    if (!data) return json({ error: 'not_found' }, 404)
    card = data
  } else {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'unauthorized' }, 401)
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await asUser.auth.getUser(jwt)
    const user = userData?.user
    if (!user) return json({ error: 'unauthorized' }, 401)

    const cardId = body.gift_card_id
    if (!cardId) return json({ error: 'missing_gift_card_id' }, 400)
    const { data } = await admin.from('gift_cards').select('*').eq('id', cardId).maybeSingle()
    if (!data) return json({ error: 'not_found' }, 404)
    const { data: prof } = await admin
      .from('user_profiles').select('is_admin').eq('id', user.id).maybeSingle()
    const isAdmin = prof?.is_admin === true
    if (data.buyer_user_id !== user.id && !isAdmin) return json({ error: 'not_yours' }, 403)
    card = data
  }
  const cardId = card!.id as string

  // Payment first — Brenda's rule, and the only thing standing between an
  // unpaid checkout and a promise in a stranger's inbox.
  if (card.status === 'pending') return json({ error: 'not_paid' }, 409)
  if (card.status === 'cancelled') return json({ error: 'cancelled' }, 409)
  if (!card.recipient_email) return json({ error: 'no_recipient' }, 400)

  const { data: settings } = await admin
    .from('global_settings').select('setting_key, setting_value')
    .in('setting_key', ['owner_name', 'owner_whatsapp'])
  const get = (k: string, fallback: string) =>
    settings?.find(s => s.setting_key === k)?.setting_value || fallback
  const ownerName = get('owner_name', 'ברנדה')
  const waPhone = get('owner_whatsapp', '972533041277').replace(/\D/g, '')

  const html = emailHtml({
    recipientName: card.recipient_name,
    buyerName: card.buyer_name,
    productTitle: card.workshop_title,
    cohortLabel: card.cohort_label,
    message: card.personal_message,
    code: card.code,
    ownerName,
    phone: displayPhone(waPhone),
    waPhone,
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [card.recipient_email],
      reply_to: card.buyer_email ?? undefined,
      subject: `${card.recipient_name ? card.recipient_name + ', ' : ''}קיבלת גיפט קארד ממימו 🎁`,
      html,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    await admin.from('gift_cards').update({ send_error: detail.slice(0, 500) }).eq('id', cardId)
    return json({ error: 'send_failed', detail: detail.slice(0, 300) }, 502)
  }

  await admin.from('gift_cards')
    .update({ status: 'sent', sent_at: new Date().toISOString(), send_error: null })
    .eq('id', cardId)

  return json({ ok: true, sent_to: card.recipient_email })
})
