import { useState } from 'react'
import { Mail, Send, Check } from 'lucide-react'
import { sendGiftCard, type GiftCard } from './giftCard'

// "לשלוח את זה לחברה" — the second half of a gift card, shown on the
// thank-you page right after payment and again in הרכישות שלי for anyone
// who closed the tab, changed her mind, or wants to resend.
//
// The form is three fields and nothing else: whoever just paid ₪800 for a
// friend should not have to fill in a form to finish giving it.

export default function GiftCardSendForm({
  card,
  onSent,
  compact = false,
}: {
  card: GiftCard
  onSent?: () => void
  compact?: boolean
}) {
  const alreadySent = card.status === 'sent' || card.status === 'redeemed'
  const [open, setOpen] = useState(!alreadySent)
  const [name, setName] = useState(card.recipient_name ?? '')
  const [email, setEmail] = useState(card.recipient_email ?? '')
  const [message, setMessage] = useState(card.personal_message ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    if (!email.trim()) { setError('צריך את המייל של החברה'); return }
    setBusy(true); setError('')
    const res = await sendGiftCard({
      giftCardId: card.id,
      recipientName: name,
      recipientEmail: email,
      message,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setDone(true)
    onSent?.()
  }

  if (done) {
    return (
      <div className="rounded-2xl p-4 text-center space-y-1.5"
        style={{ background: '#F1F3EA', border: '1px solid #C9D0B4' }}>
        <Check className="w-6 h-6 mx-auto" style={{ color: '#5F7A3E' }} />
        <p className="text-sm font-bold" style={{ color: '#4A5C31' }}>המתנה נשלחה 🤍</p>
        <p className="text-xs" style={{ color: '#6E7B55' }}>{email} קיבלה מייל עם כל הפרטים</p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="rounded-2xl p-3.5 space-y-2" style={{ background: '#FAF6EF', border: '1px solid #EFE4D3' }}>
        <p className="text-xs" style={{ color: '#6E5836' }}>
          נשלח ל{card.recipient_name ? `${card.recipient_name} · ` : ''}{card.recipient_email}
        </p>
        <button
          onClick={() => setOpen(true)}
          className="w-full py-2 rounded-xl text-xs font-bold"
          style={{ background: '#F4EDE1', color: '#6E5836' }}
        >
          לשלוח שוב / לכתובת אחרת
        </button>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl ${compact ? 'p-3.5' : 'p-4'} space-y-3 text-right`}
      style={{ background: '#FAF6EF', border: '1px solid #EFE4D3' }}>
      <div>
        <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>
          <Mail className="w-4 h-4 inline ml-1" />
          לשלוח את המתנה לחברה
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6E5836' }}>
          היא תקבל מייל ממימו עם {card.workshop_title} ופרטים ליצירת קשר למימוש.
        </p>
      </div>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="שם החברה (לא חובה)"
        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white border-2 border-sand-200 focus:outline-none focus:border-mustard-400"
      />
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="המייל של החברה"
        type="email"
        dir="ltr"
        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white border-2 border-sand-200 focus:outline-none focus:border-mustard-400 text-right"
      />
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="ברכה אישית (לא חובה)"
        rows={2}
        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white border-2 border-sand-200 focus:outline-none focus:border-mustard-400 resize-none"
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-40"
        style={{ background: '#E7C78A' }}
      >
        <Send className="w-4 h-4" />
        {busy ? 'שולחת...' : 'שליחת המתנה'}
      </button>

      {!compact && (
        <p className="text-[11px] text-center" style={{ color: '#8A7A63' }}>
          אפשר גם לשלוח מאוחר יותר — המתנה שמורה לך במוצרים ← הרכישות שלי
        </p>
      )}
    </div>
  )
}
