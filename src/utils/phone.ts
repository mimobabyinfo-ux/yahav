// One place that turns a phone number as a mother typed it into the
// digits wa.me actually accepts.
//
// Brenda 18.8.26: "in קהילה > חברות it won't let me send you a WhatsApp
// message — it says you don't have WhatsApp."
//
// She was reading WhatsApp's own error, and it was right: the community
// screens built the link straight from the stored number, so
// "0545243363" went to wa.me as "0545243363". wa.me has no idea which
// country that is; a national number with a leading zero is not a
// number it can resolve, so it answers "this phone number is not on
// WhatsApp" — about a number that very much is.
//
// The admin screens already did the 0 → 972 swap inline, in eight
// separate copies. This is that rule, once, so the member-facing screens
// cannot be the ones that get it wrong.

/** Digits only, in international form, ready to drop into a wa.me URL.
 *  Accepts 05x-xxxxxxx, +972…, 972…, and anything with spaces or dashes.
 *  Returns null when there is nothing usable to dial. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  // Already international for some other country, or a local number
  // typed without its zero — leave it alone rather than guess wrong.
  return digits
}

/** Full wa.me link, or null when the number is unusable. */
export function waLink(phone: string | null | undefined, text?: string): string | null {
  const n = waNumber(phone)
  if (!n) return null
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
