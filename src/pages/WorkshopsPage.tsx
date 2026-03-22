import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { supabase, Workshop } from '../lib/supabase'

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen p-4 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🛠️</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">סדנאות</h1>
          <p className="text-sand-400 text-sm">ורקשופים ותכנים מקצועיים</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : workshops.length === 0 ? (
          <div className="text-center py-12 text-sand-400">
            <p className="text-4xl mb-3">🛠️</p>
            <p className="text-sm">אין סדנאות זמינות כרגע</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workshops.map(ws => (
              <div key={ws.id} className="bg-white rounded-3xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
                {ws.image_url && (
                  <img
                    src={ws.image_url}
                    alt={ws.title}
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-5">
                  <h3 className="font-bold text-sand-800 text-base">{ws.title}</h3>
                  {ws.description && (
                    <p className="text-sm text-sand-500 mt-1.5 leading-relaxed line-clamp-3">
                      {ws.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-4">
                    {ws.price != null && (
                      <span className="text-lg font-bold text-mustard-600">
                        {ws.price === 0 ? 'חינם' : `₪${ws.price}`}
                      </span>
                    )}
                    {ws.payment_link && (
                      <a
                        href={ws.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-gradient-to-r from-mustard-500 to-mustard-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:from-mustard-600 hover:to-mustard-700 transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                        הרשמה
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
