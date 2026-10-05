import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Link2, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  METHOD_LABEL, METHOD_ORDER, computeBalance, findMorningSuggestions, ilsShort, dayMonth,
  type LeadPayment, type PaymentMethod, type MorningSuggestion,
} from './payments'

/**
 * Payments of ONE registration, inside the customer card (6.10.26).
 *
 * Yahav: "כשיש לי תשלום חלקי וחלק במזומן אין לי אופציה לעשות את זה".
 * Every payment is a row (amount, method, date). The agreed price starts
 * as the list/offer price and can be changed (a friends' discount, a
 * returning mother at 720). Yahav 6.10: "תשלום חוזר עם הנחה הוא גם לא
 * אותו דבר", so a discount is never shown as debt: "זה המחיר המלא" sets
 * the agreed price to what she paid.
 *
 * Recording a payment on a registration that is still "ממתינה" marks it
 * "שילמה": the seat is hers, the balance stays visible until it is paid.
 */

const inputClass = 'w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm text-sand-800 focus:outline-none focus:border-mustard-400 bg-white'

function todayIl(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

export default function LeadPaymentsSection({ leadId, listPrice, email, phone, status, onChanged }: {
  leadId: string
  /** Product price after her offer, null when the product has no price. */
  listPrice: number | null
  email: string | null
  phone: string | null
  status: 'pending' | 'paid' | 'handled'
  onChanged: () => void
}) {
  const [rows, setRows] = useState<LeadPayment[]>([])
  const [priceDue, setPriceDue] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<MorningSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidAt, setPaidAt] = useState(todayIl())
  const [note, setNote] = useState('')
  const [asFull, setAsFull] = useState(false)
  const [editDue, setEditDue] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: p }, { data: l }, sugg] = await Promise.all([
      supabase.from('lead_payments').select('*').eq('lead_id', leadId).order('paid_at'),
      supabase.from('registration_leads').select('price_due').eq('id', leadId).maybeSingle(),
      findMorningSuggestions(email, phone),
    ])
    setRows(((p ?? []) as LeadPayment[]).map(r => ({ ...r, amount: Number(r.amount) })))
    const pd = (l as { price_due: number | null } | null)?.price_due
    setPriceDue(pd == null ? null : Number(pd))
    setSuggestions(sugg)
    setLoading(false)
  }, [leadId, email, phone])
  useEffect(() => { setLoading(true); load() }, [load])

  const due = priceDue ?? listPrice
  const bal = computeBalance(rows, due)

  function openAdd() {
    setError(null)
    setAmount(bal.left != null && bal.left > 0 ? String(bal.left) : due != null && !bal.hasRows ? String(due) : '')
    setMethod('cash'); setPaidAt(todayIl()); setNote(''); setAsFull(false)
    setAdding(true)
  }

  async function markPaidIfPending() {
    if (status === 'pending') {
      await supabase.from('registration_leads').update({ status: 'paid' }).eq('id', leadId)
    }
  }

  async function add() {
    const n = Number(amount.replace(/[^\d.]/g, ''))
    if (!n || n <= 0) { setError('סכום לא תקין'); return }
    setBusy(true); setError(null)
    const { error: e } = await supabase.from('lead_payments').insert({
      lead_id: leadId, amount: n, method, paid_at: paidAt, note: note.trim() || null,
    })
    if (e) { setBusy(false); setError('השמירה נכשלה'); return }
    if (asFull) {
      await supabase.from('registration_leads').update({ price_due: bal.paid + n }).eq('id', leadId)
    }
    await markPaidIfPending()
    setAdding(false); setBusy(false)
    await load(); onChanged()
  }

  // "Full" when it covers the agreed price (or nothing is known); a smaller
  // amount is a part payment and the balance stays visible.
  async function attach(s: MorningSuggestion) {
    setBusy(true); setError(null)
    const covers = due == null || Number(s.total) + bal.paid >= due - 0.5
    const { data, error: e } = await supabase.rpc('admin_assign_payment', {
      p_log_id: s.id, p_lead_id: leadId, p_as_full: covers,
    })
    setBusy(false)
    if (e || (data as { ok?: boolean } | null)?.ok === false) { setError('הצירוף נכשל'); return }
    await load(); onChanged()
  }

  async function remove(id: string) {
    setBusy(true)
    await supabase.from('lead_payments').delete().eq('id', id)
    setConfirmDel(null); setBusy(false)
    await load(); onChanged()
  }

  async function saveDue() {
    if (editDue == null) return
    const n = editDue.trim() === '' ? null : Number(editDue.replace(/[^\d.]/g, ''))
    setBusy(true)
    await supabase.from('registration_leads').update({ price_due: n && n > 0 ? n : null }).eq('id', leadId)
    setEditDue(null); setBusy(false)
    await load(); onChanged()
  }

  async function closeAsDiscount() {
    setBusy(true)
    await supabase.from('registration_leads').update({ price_due: bal.paid }).eq('id', leadId)
    setBusy(false)
    await load(); onChanged()
  }

  if (loading) {
    return <div className="py-2"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#BCAE99' }} /></div>
  }

  return (
    <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: '#F8F4EC', border: '1px solid #EDE5D8' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold" style={{ fontSize: 13.5, color: '#443327' }}>תשלומים</p>
        {!adding && (
          <button onClick={openAdd} className="inline-flex items-center gap-1 font-bold rounded-xl" style={{ fontSize: 12.5, padding: '5px 10px', background: '#fff', color: '#6E5836', border: '1px solid #E4DAD0' }}>
            <Plus className="w-3.5 h-3.5" /> רישום תשלום
          </button>
        )}
      </div>

      {/* Agreed price */}
      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13 }}>
        <span style={{ color: '#8A7A63', fontWeight: 600 }}>המחיר שסוכם:</span>
        {editDue != null ? (
          <>
            <input value={editDue} onChange={e => setEditDue(e.target.value)} inputMode="decimal" className={inputClass} style={{ width: 100 }} dir="ltr" placeholder={listPrice != null ? String(listPrice) : ''} />
            <button onClick={saveDue} disabled={busy} className="font-bold" style={{ color: '#6E5836' }}>שמירה</button>
            <button onClick={() => setEditDue(null)} style={{ color: '#8A7A63' }}>ביטול</button>
          </>
        ) : (
          <>
            <span className="font-bold" style={{ color: '#443327' }}>{due != null ? ilsShort(due) : 'לא ידוע'}</span>
            {priceDue != null && listPrice != null && priceDue !== listPrice && (
              <span style={{ color: '#A2937D' }}>(מחירון {ilsShort(listPrice)})</span>
            )}
            <button onClick={() => setEditDue(due != null ? String(due) : '')} className="font-bold hover:underline" style={{ fontSize: 12, color: '#8A6A2F' }}>שינוי</button>
          </>
        )}
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: '#8A7A63' }}>
          {status === 'pending' ? 'עוד לא נרשם תשלום.' : 'סומנה כשילמה, בלי פירוט תשלומים (נחשב כתשלום מלא).'}
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white" style={{ fontSize: 13 }}>
              <span className="font-bold" style={{ color: '#443327' }}>{ilsShort(r.amount)}</span>
              <span className="rounded-full px-2 py-0.5 font-bold" style={{ fontSize: 11.5, background: '#F1EBE1', color: '#6E5836' }}>{METHOD_LABEL[r.method] ?? r.method}</span>
              <span style={{ color: '#8A7A63' }}>{dayMonth(r.paid_at)}</span>
              {r.note && <span className="truncate min-w-0" style={{ color: '#A2937D' }}>· {r.note}</span>}
              <span className="flex-1" />
              {confirmDel === r.id ? (
                <span className="inline-flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => remove(r.id)} disabled={busy} className="font-bold" style={{ fontSize: 12, color: '#8B4A30' }}>למחוק</button>
                  <button onClick={() => setConfirmDel(null)} style={{ fontSize: 12, color: '#8A7A63' }}>ביטול</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(r.id)} className="flex-shrink-0 p-1" title="מחיקת התשלום" aria-label="מחיקת התשלום">
                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#BCAE99' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Balance */}
      {bal.hasRows && bal.left != null && (
        bal.left > 0 ? (
          <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2" style={{ background: '#F5E2D8' }}>
            <span className="font-bold" style={{ fontSize: 13, color: '#713924' }}>
              שולם {ilsShort(bal.paid)} מתוך {ilsShort(bal.due!)} · יתרה {ilsShort(bal.left)}
            </span>
            <span className="flex-1" />
            <button onClick={closeAsDiscount} disabled={busy} className="font-bold hover:underline" style={{ fontSize: 12, color: '#8B4A30' }}
              title="קיבלה הנחה: מה ששילמה הוא המחיר המלא">
              זו הנחה, אין יתרה
            </button>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1 font-bold" style={{ fontSize: 13, color: '#4F5040' }}>
            <Check className="w-4 h-4" /> שולם במלואו · {ilsShort(bal.paid)}
          </p>
        )
      )}

      {/* Add form */}
      {adding && (
        <div className="rounded-xl bg-white p-3 space-y-2.5" style={{ border: '1px solid #E4DAD0' }}>
          <div className="flex gap-2">
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="סכום" className={inputClass} dir="ltr" style={{ maxWidth: 120 }} autoFocus />
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className={inputClass} style={{ maxWidth: 160 }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {METHOD_ORDER.map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)} className="font-bold rounded-full"
                style={{ fontSize: 12.5, padding: '5px 12px', background: method === m ? '#C8A460' : '#F6F3ED', color: method === m ? '#33281B' : '#7B604C' }}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="הערה (לא חובה), למשל: היתרה במזומן במפגש הראשון" className={inputClass} />
          <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12.5, color: '#6E5836', fontWeight: 600 }}>
            <input type="checkbox" checked={asFull} onChange={e => setAsFull(e.target.checked)} />
            זה התשלום המלא (כולל הנחה), בלי יתרה
          </label>
          {status === 'pending' && (
            <p style={{ fontSize: 12, color: '#8A7A63' }}>ההרשמה תסומן כ"שילמה" והמקום שלה נשמר. היתרה, אם יש, תמשיך להופיע.</p>
          )}
          {error && <p style={{ fontSize: 12, color: '#8B4A30', fontWeight: 700 }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={add} disabled={busy} className="font-bold rounded-xl disabled:opacity-50" style={{ fontSize: 13, padding: '7px 16px', background: '#C8A460', color: '#33281B' }}>
              {busy ? 'שומר...' : 'שמירת התשלום'}
            </button>
            <button onClick={() => setAdding(false)} className="font-semibold" style={{ fontSize: 13, color: '#7B604C' }}>ביטול</button>
          </div>
        </div>
      )}

      {/* Morning payments that look like hers */}
      {/* Only when it can matter: she has not paid yet, a balance is being
          tracked, or Morning could not place the payment. Otherwise every
          card payment the webhook already matched would nag here forever. */}
      {(status === 'pending' || bal.hasRows ? suggestions : suggestions.filter(s => s.outcome === 'unmatched')).length > 0 && (
        <div className="space-y-1">
          <p style={{ fontSize: 12, color: '#8A7A63', fontWeight: 700 }}>תשלומים ממורנינג שנראים שלה (עוד לא מחוברים להרשמה):</p>
          {(status === 'pending' || bal.hasRows ? suggestions : suggestions.filter(x => x.outcome === 'unmatched')).slice(0, 4).map(s => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ fontSize: 12.5, background: '#EEF2F4' }}>
              <span className="font-bold" style={{ color: '#35505C' }}>{ilsShort(Number(s.total))}</span>
              <span style={{ color: '#35505C' }}>{dayMonth(s.received_at)}</span>
              <span className="truncate min-w-0 flex-1" style={{ color: '#5B7480' }}>{s.description ?? ''}</span>
              <button onClick={() => attach(s)} disabled={busy} className="flex-shrink-0 inline-flex items-center gap-1 font-bold rounded-lg disabled:opacity-50" style={{ padding: '4px 10px', background: '#fff', color: '#35505C' }}>
                <Link2 className="w-3.5 h-3.5" /> לצרף
              </button>
            </div>
          ))}
        </div>
      )}
      {error && !adding && <p style={{ fontSize: 12, color: '#8B4A30', fontWeight: 700 }}>{error}</p>}
    </div>
  )
}
