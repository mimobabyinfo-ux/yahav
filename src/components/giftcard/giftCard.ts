import { supabase } from '../../lib/supabase'

// ── גיפט קארד ────────────────────────────────────────────────────────────────
// A gift bought for someone else. Deliberately NOT a registration: no seat
// is held and no cohort is filled, because the friend has not agreed to
// anything yet. She contacts Brenda, and Brenda registers her by hand.
//
// The lifecycle is four states and one rule — nothing is emailed before
// the money is confirmed (Brenda, 19.8.26: "רק אחרי שהתשלום אושר"):
//
//   pending  → she tapped buy, the payment page opened. Not a gift yet.
//   paid     → the money is confirmed. Now she may name a friend.
//   sent     → the friend has the email.
//   redeemed → Brenda registered the friend (admin marks this).

export type GiftCardStatus = 'pending' | 'paid' | 'sent' | 'redeemed' | 'cancelled'

export type GiftCard = {
  id: string
  code: string
  buyer_user_id: string
  buyer_name: string | null
  buyer_email: string | null
  workshop_id: string | null
  workshop_title: string
  cohort_id: string | null
  cohort_label: string | null
  amount: number
  status: GiftCardStatus
  recipient_name: string | null
  recipient_email: string | null
  personal_message: string | null
  paid_at: string | null
  sent_at: string | null
  send_error: string | null
  redeemed_at: string | null
  admin_notes: string | null
  created_at: string
}

// The id lives here between tapping "לרכישה" and landing on the thank-you
// page. It is INTENT, never payment — the same trap that minted free
// credits on 17.8.26 (see mimo-community-credits): only ThankYouPage may
// act on it, and only inside the TTL.
export const PENDING_GIFT_KEY = 'mimo_pending_gift_id'
export const PENDING_GIFT_AT_KEY = 'mimo_pending_gift_at'
export const GIFT_INTENT_TTL_MS = 60 * 60 * 1000 // one hour — a checkout, not a week

export function rememberGiftIntent(id: string) {
  try {
    localStorage.setItem(PENDING_GIFT_KEY, id)
    localStorage.setItem(PENDING_GIFT_AT_KEY, String(Date.now()))
  } catch { /* private mode */ }
}

export function clearGiftIntent() {
  try {
    localStorage.removeItem(PENDING_GIFT_KEY)
    localStorage.removeItem(PENDING_GIFT_AT_KEY)
  } catch { /* private mode */ }
}

/** The fresh, unspent intent — or null. Does NOT clear it. */
export function readGiftIntent(): string | null {
  try {
    const id = localStorage.getItem(PENDING_GIFT_KEY)
    const at = Number(localStorage.getItem(PENDING_GIFT_AT_KEY) ?? '0')
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null
    if (!(at > 0 && Date.now() - at < GIFT_INTENT_TTL_MS)) { clearGiftIntent(); return null }
    return id
  } catch { return null }
}

/**
 * Store the friend's details, then mail her. Two steps on purpose: a mail
 * failure must not lose the address the buyer just typed — she presses
 * send again and nothing is re-entered.
 */
export async function sendGiftCard(opts: {
  giftCardId: string
  recipientName: string
  recipientEmail: string
  message: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: saved, error: saveErr } = await supabase.rpc('set_gift_card_recipient', {
    p_gift_card_id: opts.giftCardId,
    p_recipient_name: opts.recipientName,
    p_recipient_email: opts.recipientEmail,
    p_message: opts.message,
  })
  if (saveErr) return { ok: false, error: 'שגיאה בשמירת הפרטים. נסי שוב' }
  if (saved === 'bad_email') return { ok: false, error: 'כתובת המייל לא נראית תקינה' }
  if (saved === 'not_paid') return { ok: false, error: 'התשלום עדיין לא אושר. נשלח ברגע שיאושר' }
  if (saved !== 'ok') return { ok: false, error: 'לא הצלחנו לשמור את הפרטים' }

  const { data, error } = await supabase.functions.invoke('send-gift-card', {
    body: { gift_card_id: opts.giftCardId },
  })
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    return { ok: false, error: 'הפרטים נשמרו אבל המייל לא יצא. נסי שוב בעוד רגע' }
  }
  return { ok: true }
}
