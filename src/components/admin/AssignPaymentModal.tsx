import { useEffect, useMemo, useState } from 'react'
import { X, Search, Link2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ilsShort, dayMonth } from './payments'

/**
 * "הגיע תשלום ולא יודעים למי הוא שייך" (Yahav 6.10.26).
 *
 * A Morning payment the webhook could not place. Of the 15 in the log on
 * 6.10, 9 belonged to a registration that had already been marked paid by
 * hand, so the home kept nagging about money that was in fact placed. Here
 * the likely registrations are ranked (same phone, same email, same name,
 * the product named in the payment, the amount) and one tap attaches the
 * payment: a lead_payments row, the registration becomes "שילמה" if it was
 * waiting, and the log row stops being "unmatched".
 */

export type AssignablePayment = {
  id: string
  received_at: string
  total: number | null
  payer_name: string | null
  payer_email: string | null
  payer_phone?: string | null
  description?: string | null
}

type Cand = {
  id: string
  name: string
  phone: string
  email: string
  status: 'pending' | 'paid' | 'handled'
  created_at: string
  workshops: { title: string; price: number | null } | null
  workshop_cohorts: { start_date: string; start_time: string | null } | null
}

const STATUS_HE = { pending: 'ממתינה לתשלום', paid: 'שילמה', handled: 'מומש' } as const

function last9(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d.slice(-9) : ''
}

function tokens(s: string | null | undefined): string[] {
  return (s ?? '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(t => t.length >= 2)
}

// Words that name a product in a Morning description ("סדנת מגלים - 10% הנחה").
const PRODUCT_WORDS = ['עטופים', 'מגלים', 'אבות', 'עיסוי', 'פרטני', 'ליווי', 'דיגיטלי', 'רצפת']

function score(c: Cand, p: AssignablePayment): { score: number; why: string[] } {
  const why: string[] = []
  let s = 0
  const p9 = last9(p.payer_phone)
  if (p9 && last9(c.phone) === p9) { s += 6; why.push('אותו טלפון') }
  if (p.payer_email && c.email && c.email.trim().toLowerCase() === p.payer_email.trim().toLowerCase()) { s += 6; why.push('אותו מייל') }
  const pt = tokens(p.payer_name), ct = tokens(c.name)
  const common = pt.filter(t => ct.includes(t)).length
  if (common >= 2) { s += 4; why.push('אותו שם') } else if (common === 1) { s += 2; why.push('שם דומה') }
  const title = c.workshops?.title ?? ''
  const desc = p.description ?? ''
  if (PRODUCT_WORDS.some(w => desc.includes(w) && title.includes(w))) { s += 2; why.push('אותו מוצר') }
  const price = c.workshops?.price
  if (p.total != null && price) {
    if (Math.abs(p.total - price) < 1) { s += 1; why.push('אותו סכום') }
    else if (p.total < price && p.total >= price * 0.75) { s += 1; why.push('סכום עם הנחה') }
  }
  if (c.status === 'pending') { s += 1 }
  const days = Math.abs(new Date(c.created_at).getTime() - new Date(p.received_at).getTime()) / 86400000
  if (days <= 3) { s += 1; why.push('נרשמה באותם ימים') }
  return { score: s, why }
}

function cohortHe(c: Cand['workshop_cohorts']): string {
  if (!c) return ''
  const d = new Date(c.start_date + 'T12:00:00')
  const day = d.toLocaleDateString('he-IL', { weekday: 'short' })
  return ` · ${day} ${dayMonth(c.start_date)}${c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''}`
}

export default function AssignPaymentModal({ payment, onClose, onDone }: {
  payment: AssignablePayment
  onClose: () => void
  onDone: () => void
}) {
  const [cands, setCands] = useState<Cand[]>([])
  const [full, setFull] = useState<AssignablePayment>(payment)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [asFull, setAsFull] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeNote, setCloseNote] = useState('')

  useEffect(() => {
    ;(async () => {
      const since = new Date(new Date(payment.received_at).getTime() - 120 * 86400000).toISOString()
      const [{ data: l }, { data: log }] = await Promise.all([
        supabase.from('registration_leads')
          .select('id, name, phone, email, status, created_at, workshops:selected_workshop_id(title, price), workshop_cohorts:cohort_id(start_date, start_time)')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(400),
        supabase.from('morning_webhook_log').select('id, received_at, total, payer_name, payer_email, payer_phone, description').eq('id', payment.id).maybeSingle(),
      ])
      setCands((l ?? []) as unknown as Cand[])
      if (log) setFull({ ...(log as AssignablePayment), total: (log as AssignablePayment).total != null ? Number((log as AssignablePayment).total) : null })
      setLoading(false)
    })()
  }, [payment.id, payment.received_at])

  const ranked = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = cands.map(c => ({ c, ...score(c, full) }))
    if (term) {
      const digits = term.replace(/\D/g, '')
      return list.filter(({ c }) =>
        c.name.toLowerCase().includes(term) || c.email?.toLowerCase().includes(term) ||
        (digits.length >= 3 && c.phone?.replace(/\D/g, '').includes(digits)))
        .sort((a, b) => b.score - a.score).slice(0, 15)
    }
    return list.filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 6)
  }, [cands, full, q])

  async function attach(leadId: string) {
    setBusy(true); setError(null)
    const { data, error: e } = await supabase.rpc('admin_assign_payment', { p_log_id: payment.id, p_lead_id: leadId, p_as_full: asFull })
    setBusy(false)
    if (e) { setError('השיוך נכשל. נסה שוב'); return }
    if ((data as { ok?: boolean; reason?: string } | null)?.ok === false) { setError('התשלום הזה כבר משויך להרשמה'); return }
    onDone(); onClose()
  }

  async function closeWithout() {
    setBusy(true)
    await supabase.rpc('admin_close_payment', { p_log_id: payment.id, p_note: closeNote.trim() || null })
    setBusy(false)
    onDone(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6" style={{ background: 'rgba(40,30,20,0.45)' }} onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col min-h-0" style={{ maxHeight: '85dvh' }}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold" style={{ fontSize: 17, color: '#443327' }}>למי שייך התשלום?</h3>
            <p className="mt-1" style={{ fontSize: 13.5, color: '#6E5836', fontWeight: 700 }}>
              {full.total != null ? ilsShort(full.total) : ''} · {full.payer_name || full.payer_email || 'ללא שם'} · {dayMonth(full.received_at)}
            </p>
            <p className="truncate" style={{ fontSize: 12.5, color: '#8A7A63' }}>
              {[full.description, full.payer_email, full.payer_phone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-sand-100" aria-label="סגירה"><X className="w-4 h-4" style={{ color: '#8A7A63' }} /></button>
        </div>

        <div className="px-5 pb-2 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2" style={{ background: '#F8F4EC', border: '1px solid #E4DAD0', borderRadius: 14, padding: '0 12px', height: 40 }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#7B604C' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש הרשמה לפי שם, טלפון או מייל" className="flex-1 min-w-0 bg-transparent focus:outline-none" style={{ fontSize: 14 }} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: '#6E5836', fontWeight: 600 }}>
            <input type="checkbox" checked={asFull} onChange={e => setAsFull(e.target.checked)} />
            זה התשלום המלא (כולל הנחה). בטל את הסימון אם זה רק חלק מהסכום
          </label>
          {error && <p style={{ fontSize: 12.5, color: '#8B4A30', fontWeight: 700 }}>{error}</p>}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-3 space-y-1.5">
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#BCAE99' }} /></div>
          ) : ranked.length === 0 ? (
            <p className="text-center py-6" style={{ fontSize: 13.5, color: '#8A7A63' }}>
              {q ? 'לא נמצאה הרשמה כזו' : 'לא נמצאה הרשמה שנראית מתאימה. חפש לפי שם, או סגור בלי שיוך.'}
            </p>
          ) : ranked.map(({ c, why }) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: '#F5F1EB' }}>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate" style={{ fontSize: 14, color: '#443327' }}>{c.name}</p>
                <p className="truncate" style={{ fontSize: 12.5, color: '#7B604C', fontWeight: 600 }}>
                  {c.workshops?.title ?? 'ללא מוצר'}{cohortHe(c.workshop_cohorts)} · {STATUS_HE[c.status]}
                </p>
                {why.length > 0 && <p className="truncate" style={{ fontSize: 11.5, color: '#3F5B39', fontWeight: 700 }}>{why.join(' · ')}</p>}
              </div>
              <button onClick={() => attach(c.id)} disabled={busy} className="flex-shrink-0 inline-flex items-center gap-1 font-bold rounded-xl disabled:opacity-50" style={{ fontSize: 13, padding: '7px 12px', background: '#C8A460', color: '#33281B' }}>
                <Link2 className="w-3.5 h-3.5" /> שיוך
              </button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 flex-shrink-0 border-t border-[#F0EBE3]">
          {closing ? (
            <div className="flex items-center gap-2">
              <input value={closeNote} onChange={e => setCloseNote(e.target.value)} placeholder="למה? (בדיקה, תשלום פרטי...)" className="flex-1 min-w-0 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm" autoFocus />
              <button onClick={closeWithout} disabled={busy} className="font-bold" style={{ fontSize: 13, color: '#4F5040' }}>סגירה</button>
              <button onClick={() => setClosing(false)} style={{ fontSize: 13, color: '#8A7A63' }}>ביטול</button>
            </div>
          ) : (
            <button onClick={() => setClosing(true)} className="font-bold hover:underline" style={{ fontSize: 13, color: '#7B604C' }}>
              לא שייך להרשמה, לסגור בלי שיוך
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
