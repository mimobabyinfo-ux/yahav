import { useCallback, useEffect, useState } from 'react'
import { Gift, ChevronDown, Check, Send, X, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { GiftCard } from '../giftcard/giftCard'

// גיפט קארדים — Brenda's side of the gift flow.
//
// A gift card is never registered automatically: the friend calls, and
// Brenda puts her into a cohort by hand. So this panel exists to answer
// three questions, in this order of urgency:
//
//   1. Who paid and the gift never went out? (paid, no recipient) — money
//      taken, nobody told. This is the one that has to be visible.
//   2. Which gifts are out there unredeemed? (sent) — expect these calls.
//   3. Who claimed one? (redeemed) — history.
//
// Everything here writes straight to the table: the admin RLS policy
// allows it, and unlike the buyer side there is no honesty problem to
// defend against.

const STATUS_LABEL: Record<string, string> = {
  pending: 'ממתין לתשלום',
  paid: 'שולם · טרם נשלח',
  sent: 'נשלח לחברה',
  redeemed: 'מומש',
  cancelled: 'בוטל',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  pending: { background: '#F4EDE1', color: '#8A7A63' },
  paid: { background: '#FBEBE7', color: '#C1392C' },
  sent: { background: '#F6ECD8', color: '#8A6A2F' },
  redeemed: { background: '#F1F3EA', color: '#4A5C31' },
  cancelled: { background: '#F4EDE1', color: '#A09484' },
}

function dt(s: string | null): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function GiftCardsPanel() {
  const [cards, setCards] = useState<GiftCard[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('gift_cards').select('*').order('created_at', { ascending: false }).limit(200)
    setCards((data ?? []) as GiftCard[])
  }, [])

  useEffect(() => { load() }, [load])

  // Money in, nobody told — the reason this panel opens itself.
  const waiting = cards.filter(c => c.status === 'paid')
  useEffect(() => { if (waiting.length > 0) setOpen(true) }, [waiting.length])

  async function update(id: string, patch: Partial<GiftCard>) {
    setBusyId(id); setNote('')
    const { error } = await supabase.from('gift_cards').update(patch).eq('id', id)
    setBusyId(null)
    if (error) { setNote('שגיאה בעדכון'); return }
    load()
  }

  async function resend(card: GiftCard) {
    if (!card.recipient_email) { setNote('אין מייל של החברה בכרטיס הזה'); return }
    setBusyId(card.id); setNote('')
    const { data, error } = await supabase.functions.invoke('send-gift-card', {
      body: { gift_card_id: card.id },
    })
    setBusyId(null)
    if (error || !(data as { ok?: boolean } | null)?.ok) { setNote('המייל לא יצא. נסי שוב'); return }
    setNote(`נשלח ל${card.recipient_email}`)
    load()
  }

  if (cards.length === 0) return null

  return (
    <div className="bg-white rounded-3xl shadow-sm overflow-hidden mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-right"
      >
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: '#F6ECD8' }}>
          🎁
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: '#3D2E20' }}>גיפט קארדים</p>
          <p className="text-xs mt-0.5" style={{ color: '#7B604C' }}>
            {waiting.length > 0
              ? `${waiting.length} שולמו וטרם נשלחו לחברה`
              : `${cards.length} סה"כ`}
          </p>
        </div>
        {waiting.length > 0 && (
          <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full" style={STATUS_STYLE.paid}>
            {waiting.length}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: '#8A7A63' }} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5">
          {note && <p className="text-xs" style={{ color: '#8A6A2F' }}>{note}</p>}
          {cards.map(c => (
            <div key={c.id} className="rounded-2xl p-3.5" style={{ background: '#FAF8F4', border: '1px solid #EFE7DC' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: '#3D2E20' }}>{c.workshop_title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7B604C' }}>
                    מ{c.buyer_name || c.buyer_email || 'לקוחה'}{c.buyer_phone ? <> · <span dir="ltr">{c.buyer_phone}</span></> : ''}{c.buyer_user_id ? '' : ' · בלי חשבון'} · ₪{c.amount} · {dt(c.created_at)}
                  </p>
                  {c.cohort_label && (
                    <p className="text-xs mt-0.5" style={{ color: '#8A7A63' }}>מחזור מבוקש: {c.cohort_label}</p>
                  )}
                  <p className="text-[11px] mt-1" dir="ltr" style={{ color: '#8A7A63', textAlign: 'right' }}>{c.code}</p>
                </div>
                <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full" style={STATUS_STYLE[c.status]}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>

              {c.recipient_email && (
                <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: '#5E4938' }}>
                  <Mail className="w-3.5 h-3.5" />
                  {c.recipient_name ? `${c.recipient_name} · ` : ''}
                  <span dir="ltr">{c.recipient_email}</span>
                  {c.sent_at && <span style={{ color: '#8A7A63' }}>· נשלח {dt(c.sent_at)}</span>}
                </p>
              )}
              {c.send_error && (
                <p className="text-xs mt-1 text-red-500">המייל נכשל. אפשר לנסות שוב</p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {c.status === 'pending' && (
                  <button
                    onClick={() => update(c.id, { status: 'paid', paid_at: new Date().toISOString() })}
                    disabled={busyId === c.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: '#E7C78A', color: '#4A3A28' }}
                  >
                    <Check className="w-3.5 h-3.5 inline ml-1" /> אישור תשלום
                  </button>
                )}
                {(c.status === 'paid' || c.status === 'sent') && c.recipient_email && (
                  <button
                    onClick={() => resend(c)}
                    disabled={busyId === c.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: '#F4EDE1', color: '#6E5836' }}
                  >
                    <Send className="w-3.5 h-3.5 inline ml-1" /> {c.status === 'sent' ? 'שליחה חוזרת' : 'שליחת המייל'}
                  </button>
                )}
                {(c.status === 'sent' || c.status === 'paid') && (
                  <button
                    onClick={() => update(c.id, { status: 'redeemed', redeemed_at: new Date().toISOString() })}
                    disabled={busyId === c.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: '#F1F3EA', color: '#4A5C31' }}
                  >
                    <Check className="w-3.5 h-3.5 inline ml-1" /> מומש
                  </button>
                )}
                {c.status !== 'cancelled' && c.status !== 'redeemed' && (
                  <button
                    onClick={() => update(c.id, { status: 'cancelled' })}
                    disabled={busyId === c.id}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40"
                    style={{ background: '#F4EDE1', color: '#A09484' }}
                  >
                    <X className="w-3.5 h-3.5 inline ml-1" /> ביטול
                  </button>
                )}
              </div>
            </div>
          ))}
          <p className="text-[11px] pt-1" style={{ color: '#8A7A63' }}>
            <Gift className="w-3 h-3 inline ml-1" />
            גיפט קארד לא תופס מקום במחזור. כשהחברה יוצרת קשר, רשמי אותה ידנית וסמני "מומש".
          </p>
        </div>
      )}
    </div>
  )
}
