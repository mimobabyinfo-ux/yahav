import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, ShoppingBag, GraduationCap } from 'lucide-react'
import { supabase, type Workshop } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useOwnerSettings } from '../../hooks/useOwnerSettings'
import { formatDate } from '../../utils/dateUtils'
import GiftCardSendForm from '../giftcard/GiftCardSendForm'
import type { GiftCard } from '../giftcard/giftCard'

// הרכישות שלי — Brenda 12.9.26: out of the store (the חנות / הרכישות שלי
// tab switcher is gone) and into the settings page, under ניהול שיתופים.
// Same data, same cards, moved from WorkshopsPage. The one change:
// "לצפייה בתכנים" is a link to /?course, because the settings page is its
// own URL and has no in-app navigation to hand it.

type PurchasedRow = {
  id: string
  purchase_date: string
  amount_paid: number | null
  access_start_date: string | null
  access_end_date: string | null
  workshops: Workshop
}

export default function MyPurchasesSection() {
  const { user } = useAuth()
  const { ownerWhatsapp } = useOwnerSettings()
  const [purchases, setPurchases] = useState<PurchasedRow[]>([])
  const [giftCards, setGiftCards] = useState<GiftCard[]>([])

  const loadGiftCards = useCallback(() => {
    if (!user) return
    supabase.rpc('get_my_gift_cards').then(({ data }) => setGiftCards((data ?? []) as GiftCard[]))
  }, [user])

  useEffect(() => { loadGiftCards() }, [loadGiftCards])

  useEffect(() => {
    if (!user) return
    supabase
      .from('purchased_workshops')
      .select('*, workshops(*)')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
      .then(({ data }) => setPurchases((data ?? []) as PurchasedRow[]))
  }, [user])

  return (
    <div className="space-y-3">
      {(
          purchases.length === 0 && giftCards.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <ShoppingBag className="w-12 h-12 text-sand-200 mx-auto" />
              <p className="text-sand-600 text-sm">עדיין אין רכישות</p>
              <p className="text-xs text-sand-500">רכישות שתבצעי יופיעו כאן</p>
            </div>
          ) : (
            <>
            {/* Gift cards she bought. A 'paid' card with no recipient is
                the one that matters — the gift is paid for and nobody
                knows about it yet. */}
            {giftCards.filter(g => g.status !== 'cancelled').map(g => (
              <div key={g.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sand-800 flex items-center gap-1.5">🎁 גיפט קארד</p>
                      <p className="text-xs text-sand-600 mt-0.5">{g.workshop_title}</p>
                      <p className="text-[11px] text-sand-500 mt-0.5" dir="ltr" style={{ textAlign: 'right' }}>{g.code}</p>
                    </div>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: '#B98F4E' }}>₪{g.amount}</span>
                  </div>

                  {g.status === 'pending' ? (
                    <p className="text-xs rounded-2xl py-2.5 px-3 leading-relaxed"
                      style={{ background: '#FDF3E3', color: '#6E5836' }}>
                      עדיין לא אישרנו את התשלום. ברגע שהוא יאושר תוכלי לשלוח את המתנה מכאן.
                    </p>
                  ) : g.status === 'redeemed' ? (
                    <p className="text-xs rounded-2xl py-2.5 px-3" style={{ background: '#F1F3EA', color: '#4A5C31' }}>
                      המתנה מומשה 🤍
                    </p>
                  ) : (
                    <GiftCardSendForm card={g} onSent={loadGiftCards} compact />
                  )}
                </div>
              </div>
            ))}
            {purchases.map(p => (
              <div key={p.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                {p.workshops.image_url && (
                  <img src={p.workshops.image_url} alt={p.workshops.title} className="w-full h-32 object-cover" />
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sand-800">{p.workshops.title}</p>
                      <p className="text-xs text-sand-600 mt-0.5">
                        {p.amount_paid != null ? `שולם: ₪${p.amount_paid}` : ''}
                        {' · '}{new Date(p.purchase_date).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                    {p.workshops.price != null && (
                      <span className="text-sm font-bold text-mustard-600">₪{p.workshops.price}</span>
                    )}
                  </div>
                  {/* Access is open today → the way into the content she
                      paid for. The pro area has no nav tab, so without this
                      button a course buyer has no route to her course. */}
                  {p.access_start_date && p.access_end_date &&
                   p.access_start_date <= formatDate(new Date()) &&
                   p.access_end_date >= formatDate(new Date()) && (
                    <a href="/?course"
                      className="w-full flex items-center justify-center gap-2 font-bold py-2.5 rounded-2xl text-sm text-[#4A3A28]"
                      style={{ background: '#E7C78A' }}>
                      <GraduationCap className="w-4 h-4" /> לצפייה בתכנים ←
                    </a>
                  )}
                  <a href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי! יש לי שאלה לגבי: ${p.workshops.title}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-musgo-500 hover:bg-musgo-600 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all">
                    <MessageCircle className="w-4 h-4" /> צרי קשר על הסדנה
                  </a>
                </div>
              </div>
            ))}
            </>
          )
      )}
    </div>
  )
}
