import { useEffect, useState } from 'react'
import { ExternalLink, MessageCircle, ShoppingBag, Star } from 'lucide-react'
import { supabase, Workshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'

const WA_NUMBER = '972559904274'

export default function WorkshopsPage() {
  const { profile } = useAuth()
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [loading, setLoading] = useState(true)
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        setWorkshops(data ?? [])
        setLoading(false)
      })
  }, [])

  const isPro = profile?.is_pro || profile?.is_admin

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🛠️</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">מוצרים וסדנאות</h1>
          <p className="text-sand-400 text-sm">תכנים מקצועיים ורכישות</p>
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
                <div key={ws.id} className={`bg-white rounded-3xl shadow-sm overflow-hidden transition-all ${locked ? 'opacity-80' : 'hover:shadow-lg'}`}>
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
                    <div className="w-full h-32 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
                      <ShoppingBag className="w-12 h-12 text-sand-300" />
                    </div>
                  )}

                  <div className="p-5">
                    <h3 className="font-bold text-sand-800 text-base">{ws.title}</h3>
                    {ws.description && (
                      <p className="text-sm text-sand-500 mt-1.5 leading-relaxed line-clamp-3">{ws.description}</p>
                    )}

                    <div className="flex items-center justify-between mt-4 gap-2">
                      {ws.price != null && (
                        <span className="text-lg font-bold text-mustard-600">
                          {ws.price === 0 ? 'חינם' : `₪${ws.price}`}
                        </span>
                      )}

                      <div className="flex gap-2 flex-1 justify-end">
                        {/* WhatsApp button */}
                        <a
                          href={`https://wa.me/${(ws as unknown as { whatsapp_number?: string }).whatsapp_number ?? WA_NUMBER}?text=${encodeURIComponent(`היי! אני מעוניינת ב: ${ws.title}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2.5 rounded-2xl text-sm transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </a>

                        {/* Buy button */}
                        {ws.payment_link ? (
                          <a
                            href={ws.payment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={locked ? (e) => { e.preventDefault(); setUpgradeFeature(ws.title) } : undefined}
                            className="flex items-center gap-1.5 text-white font-semibold px-4 py-2.5 rounded-2xl text-sm transition-all"
                            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                          >
                            <ExternalLink className="w-4 h-4" />
                            {locked ? '🔒 לרכישה' : 'לרכישה'}
                          </a>
                        ) : (
                          <a
                            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`שלום, אני רוצה לרכוש: ${ws.title}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-white font-semibold px-4 py-2.5 rounded-2xl text-sm transition-all"
                            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                          >
                            הזמנה
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

      {upgradeFeature && (
        <UpgradeModal featureName={upgradeFeature} onClose={() => setUpgradeFeature(null)} />
      )}
    </div>
  )
}
