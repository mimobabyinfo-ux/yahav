import { useEffect, useState } from 'react'
import { ExternalLink, MessageCircle, ShoppingBag, Star, X, ChevronLeft } from 'lucide-react'
import { supabase, Workshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkshopsPage() {
  const { profile } = useAuth()
  const [workshops, setWorkshops] = useState<WorkshopExt[]>([])
  const [loading, setLoading] = useState(true)
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkshopExt | null>(null)

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

  const isPro = profile?.is_pro || profile?.is_admin

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🛠️</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">מוצרים וסדנאות</h1>
          <p className="text-sand-400 text-sm">לחצי על מוצר לפרטים נוספים</p>
        </div>

        {/* Paywall banner for non-pro */}
        {!isPro && (
          <div
            className="rounded-3xl p-5 text-center space-y-3 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #D4AA52 0%, #C49438 100%)' }}
            onClick={() => setUpgradeFeature('גישה לכל המוצרים')}
          >
            <Star className="w-8 h-8 text-white mx-auto" />
            <p className="font-bold text-white text-lg">שדרגי ל-Pro</p>
            <p className="text-mustard-100 text-sm">קבלי גישה בלתי מוגבלת לכל הסדנאות, תכנים וסרטונים</p>
            <div className="flex justify-center gap-3 text-sm text-white font-semibold">
              <span>✓ חודשי ₪49</span>
              <span>✓ שנתי ₪399</span>
            </div>
            <div className="bg-white text-mustard-700 font-bold px-6 py-2.5 rounded-2xl inline-block text-sm">
              הצטרפי עכשיו
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : workshops.length === 0 ? (
          <div className="text-center py-12 text-sand-400">
            <p className="text-4xl mb-3">🛠️</p>
            <p className="text-sm">אין מוצרים זמינים כרגע</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workshops.map(ws => {
              const locked = !isPro && ws.price != null && ws.price > 0
              return (
                <div
                  key={ws.id}
                  className={`bg-white rounded-3xl shadow-sm overflow-hidden transition-all cursor-pointer active:scale-[0.98] ${locked ? 'opacity-85' : 'hover:shadow-lg'}`}
                  onClick={() => locked ? setUpgradeFeature(ws.title) : setSelected(ws)}
                >
                  {/* Product image */}
                  {ws.image_url ? (
                    <div className="relative">
                      <img src={ws.image_url} alt={ws.title} className="w-full h-44 object-cover" />
                      {locked && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="bg-white/90 rounded-2xl px-4 py-2 text-sm font-bold text-sand-800">🔒 Pro בלבד</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-28 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
                      <ShoppingBag className="w-10 h-10 text-sand-300" />
                    </div>
                  )}

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sand-800 text-base leading-snug">{ws.title}</h3>
                      <ChevronLeft className="w-4 h-4 text-sand-300 flex-shrink-0 mt-0.5" />
                    </div>

                    {ws.description && (
                      <p className="text-sm text-sand-500 mt-1.5 leading-relaxed line-clamp-2">
                        {ws.description.split('\n')[0]}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-4 gap-2">
                      {ws.price != null && (
                        <span className="text-lg font-bold text-mustard-600">
                          {ws.price === 0 ? 'חינם' : `₪${ws.price}`}
                        </span>
                      )}
                      <div className="flex gap-2 flex-1 justify-end" onClick={e => e.stopPropagation()}>
                        <a
                          href={`https://wa.me/${ws.whatsapp_number ?? WA_NUMBER}?text=${encodeURIComponent(`היי! אני מעוניינת ב: ${ws.title}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2.5 rounded-2xl text-sm transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </a>
                        {ws.payment_link && (
                          <a
                            href={locked ? '#' : ws.payment_link}
                            target={locked ? undefined : '_blank'}
                            rel="noopener noreferrer"
                            onClick={locked ? (e) => { e.preventDefault(); setUpgradeFeature(ws.title) } : undefined}
                            className="flex items-center gap-1.5 text-white font-semibold px-4 py-2.5 rounded-2xl text-sm transition-all"
                            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                          >
                            <ExternalLink className="w-4 h-4" />
                            לרכישה
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected && <ProductModal ws={selected} onClose={() => setSelected(null)} />}

      {upgradeFeature && (
        <UpgradeModal featureName={upgradeFeature} onClose={() => setUpgradeFeature(null)} />
      )}
    </div>
  )
}
