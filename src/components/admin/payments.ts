// ─── Payments per registration (6.10.26) ─────────────────────────────
// lead_payments holds every payment recorded against a registration, in
// any method. registration_leads.price_due is the agreed price when it is
// not the list/offer price (a friends' discount, a returning mother).
//
// The rule that keeps this honest: a balance exists ONLY for a registration
// that has at least one payment row. Everything paid before 6.10.26, or
// paid by card and matched automatically, has no rows and is read as fully
// paid, exactly as before. No false debts.

import { supabase } from '../../lib/supabase'

export type PaymentMethod = 'card' | 'cash' | 'bit' | 'transfer' | 'credit' | 'other'

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'כרטיס',
  cash: 'מזומן',
  bit: 'ביט',
  transfer: 'העברה',
  credit: 'זיכוי',
  other: 'אחר',
}

export const METHOD_ORDER: PaymentMethod[] = ['cash', 'bit', 'transfer', 'card', 'credit', 'other']

export type LeadPayment = {
  id: string
  lead_id: string
  amount: number
  method: PaymentMethod
  paid_at: string
  note: string | null
  morning_log_id: string | null
  created_at: string
}

export type Balance = {
  due: number | null       // agreed price (null = unknown)
  paid: number             // sum of recorded payments
  left: number | null      // due - paid, floored at 0; null when unknown
  hasRows: boolean
}

export function computeBalance(payments: { amount: number }[], due: number | null): Balance {
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const hasRows = payments.length > 0
  if (!hasRows || due == null) return { due, paid, left: null, hasRows }
  return { due, paid, left: Math.max(0, Math.round((due - paid) * 100) / 100), hasRows }
}

/** Morning payments that look like hers (same email or same phone) and are
 *  not attached to any registration yet. Offered as "לצרף" in her card. */
export type MorningSuggestion = {
  id: string
  received_at: string
  total: number
  description: string | null
  payer_name: string | null
  outcome: string | null
}

export async function findMorningSuggestions(email: string | null, phone: string | null): Promise<MorningSuggestion[]> {
  const ors: string[] = []
  const em = email?.trim().toLowerCase()
  if (em && em.includes('@') && !/[,()"]/.test(em)) ors.push(`payer_email.ilike."${em}"`)
  const digits = (phone ?? '').replace(/\D/g, '')
  const last9 = digits.slice(-9)
  if (last9.length === 9) ors.push(`payer_phone.ilike.%${last9}`)
  if (ors.length === 0) return []
  const { data } = await supabase
    .from('morning_webhook_log')
    .select('id, received_at, total, description, payer_name, outcome')
    .or(ors.join(','))
    .gte('received_at', new Date(Date.now() - 180 * 86400000).toISOString())
    .order('received_at', { ascending: false })
    .limit(20)
  const rows = ((data ?? []) as MorningSuggestion[]).filter(r => Number(r.total) >= 5 && r.outcome !== 'dismissed')
  if (rows.length === 0) return []
  const { data: used } = await supabase.from('lead_payments').select('morning_log_id').in('morning_log_id', rows.map(r => r.id))
  const usedIds = new Set(((used ?? []) as { morning_log_id: string }[]).map(u => u.morning_log_id))
  return rows.filter(r => !usedIds.has(r.id))
}

export function ilsShort(n: number): string {
  return `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

export function dayMonth(isoOrTs: string): string {
  const d = isoOrTs.length <= 10 ? new Date(isoOrTs + 'T12:00:00') : new Date(isoOrTs)
  return d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' })
}
