import { useEffect, useState } from 'react'
import { ExternalLink, MessageCircle, ShoppingBag, Star, X, Sparkles, CreditCard, Zap } from 'lucide-react'
import { supabase, Workshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const WA_NUMBER = '972559904274'

type WorkshopExt = Workshop & { whatsapp_number?: string }

// ── Product detail modal ──────────────────────────────────────────────────────
function ProductModal({ ws, onClose }: { ws: WorkshopExt; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Image or placeholder */}
        {ws.image_url ? (
          <div className="relative">
            <img src={ws.image_url} alt={ws.title} className="w-full h-52 object-cover rounded-t-3xl" />
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow"
            >
              <X className="w-5 h-5 text-sand-700" />
            </button>
          </div>
        ) : (
          <div className="relative w-full h-24 flex items-center justify-center rounded-t-3xl" style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
            <ShoppingBag className="w-10 h-10 text-sand-300" />
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow"
            >
              <X className="w-5 h-5 text-sand-700" />
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Title + price */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-bold text-sand-800 text-xl leading-tight">{ws.title}</h2>
            {ws.price != null && (
              <span className="text-xl font-bold text-mustard-600 flex-shrink-0">
                {ws.price === 0 ? 'חינם' : `₪${ws.price}`}
              </span>
            )}
          </div>

          {/* Full description — preserve newlines */}
          {ws.description && (
            <div className="text-sm text-sand-600 leading-relaxed whitespace-pre-line">
              {ws.description}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <a
              href={`https://wa.me/${ws.whatsapp_number ?? WA_NUMBER}?text=${encodeURIComponent(`היי! אני מעוניינת ב: ${ws.title}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>

            {ws.payment_link && (
              <a
                href={ws.payment_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
                style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
              >
                <ExternalLink className="w-4 h-4" />
                להרשמה
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const CATEGORIES = [
  { key: 'all',      label: 'הכל' },
  { key: 'תינוקות', label: 'תינוקות' },
  { key: 'אימהות',  label: 'אימהות' },
  { key: 'ביי',     label: 'ביי' },
]

// ── Main page ─────────────────────────────────────────────────────────────────
type PurchasedRow = {
  id: string
  purchase_date: string
  amount_paid: number | null
  workshops: Workshop
}

export default function WorkshopsPage() {
  const { profile, user } = useAuth()
  const [workshops, setWorkshops] = useState<WorkshopExt[]>([])
  const [purchases, setPurchases] = useState<PurchasedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<WorkshopExt | null>(null)
  const [category, setCategory] = useState('all')
  const [tab, setTab] = useState<'store' | 'purchases'>('store')

  useEffect(() => {
    supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        setWorkshops((data ?? []) as WorkshopExt[])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('purchased_workshops')
      .select('*, workshops(*)')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
      .then(({ data }) => setPurchases((data ?? []) as PurchasedRow[]))
  }, [user])

  const isPro = profile?.is_pro || profile?.is_admin

  const filtered = category === 'all'
    ? workshops
    : workshops.filter(w => (w.workshop_type ?? '').includes(category))

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* Dark header */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(160deg, #4A3F35 0%, #3a302a 100%)' }}>
        <div className="max-w-sm mx-auto flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">מוצרים מיוחדים</h1>
            <p className="text-sm mt-1" style={{ color: '#C49438' }}>נבחרו במיוחד עבורך</p>
          </div>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="max-w-sm mx-auto mt-4 flex bg-white/10 rounded-2xl p-1 gap-1">
          <button
            onClick={() => setTab('store')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'store' ? 'bg-white text-sand-800' : 'text-white/70'}`}
          >
            החנות
          </button>
          <button
            onClick={() => setTab('purchases')}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'purchases' ? 'bg-white text-sand-800' : 'text-white/70'}`}
          >
            הרכישות שלי {purchases.length > 0 && `(${purchases.length})`}
          </button>
        </div>

        {/* Category filters — store only */}
        {tab === 'store' && (
          <div className="max-w-sm mx-auto flex gap-2 mt-4 overflow-x-auto scroll-hide pb-1">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all"
                style={category === c.key
                  ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)', color: 'white' }
                  : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-sm mx-auto px-4 pt-4 space-y-3">
        {tab === 'store' ? (
          <>
            {!isPro && (
              <a
                href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('היי! אני רוצה לשדרג לחברות Pro 🌟')}`}
                target="_blank" rel="noopener noreferrer"
                className="block rounded-3xl p-4 mb-1"
                style={{ background: 'linear-gradient(135deg, #4A3F35, #3a302a)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">שדרגי לחברות Pro</p>
                    <p className="text-xs" style={{ color: '#C49438' }}>גישה לכל הסרטונים והתכנים הבלעדיים</p>
                  </div>
                  <span className="text-white text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>שלחי הודעה →</span>
                </div>
              </a>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sand-400">
                <p className="text-4xl mb-3">🛍️</p>
                <p className="text-sm">אין מוצרים בקטגוריה זו</p>
              </div>
            ) : (
              filtered.map(ws => {
                const isFeatured = ws.display_order === 1
                return (
                  <div key={ws.id} className="bg-white rounded-3xl shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:shadow-md" onClick={() => setSelected(ws)}>
                    <div className="flex gap-3 p-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {ws.workshop_type && (
                          <span className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#FDF3E3', color: '#C49438' }}>
                            {ws.workshop_type}
                          </span>
                        )}
                        <h3 className="font-bold text-sm leading-snug" style={{ color: '#4A3F35' }}>{ws.title}</h3>
                        {ws.description && (
                          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#9B8E80' }}>{ws.description.split('\n')[0]}</p>
                        )}
                        {ws.price != null && (
                          <p className="text-lg font-black" style={{ color: '#C49438' }}>{ws.price === 0 ? 'חינם' : `₪${ws.price}`}</p>
                        )}
                      </div>
                      <div className="relative flex-shrink-0">
                        {ws.image_url ? (
                          <img src={ws.image_url} alt={ws.title} className="w-24 h-24 object-cover rounded-2xl" />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
                            <ShoppingBag className="w-8 h-8 text-sand-300" />
                          </div>
                        )}
                        {isFeatured && (
                          <div className="absolute -top-2 -right-2 flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#4A3F35' }}>
                            <Star className="w-2.5 h-2.5" /> מומלץ
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 px-4 pb-4" onClick={e => e.stopPropagation()}>
                      <a href={`https://wa.me/${ws.whatsapp_number ?? WA_NUMBER}?text=${encodeURIComponent(`היי! אני מעוניינת ב: ${ws.title}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white"
                        style={{ background: '#4A3F35' }}>
                        <MessageCircle className="w-4 h-4" /> וואטסאפ
                      </a>
                      {ws.payment_link && (
                        <a href={ws.payment_link} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                          <CreditCard className="w-4 h-4" /> רכישה
                        </a>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </>
        ) : (
          /* Purchases tab */
          purchases.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <ShoppingBag className="w-12 h-12 text-sand-200 mx-auto" />
              <p className="text-sand-400 text-sm">עדיין אין רכישות</p>
              <p className="text-xs text-sand-300">רכישות שתבצעי יופיעו כאן</p>
            </div>
          ) : (
            purchases.map(p => (
              <div key={p.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                {p.workshops.image_url && (
                  <img src={p.workshops.image_url} alt={p.workshops.title} className="w-full h-32 object-cover" />
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sand-800">{p.workshops.title}</p>
                      <p className="text-xs text-sand-400 mt-0.5">
                        {p.amount_paid != null ? `שולם: ₪${p.amount_paid}` : ''}
                        {' · '}{new Date(p.purchase_date).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                    {p.workshops.price != null && (
                      <span className="text-sm font-bold text-mustard-600">₪{p.workshops.price}</span>
                    )}
                  </div>
                  <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`היי! יש לי שאלה לגבי: ${p.workshops.title}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all">
                    <MessageCircle className="w-4 h-4" /> צרי קשר על הסדנה
                  </a>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {selected && <ProductModal ws={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
