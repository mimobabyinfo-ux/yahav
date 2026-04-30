import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase, PartnerPerk } from '../lib/supabase'
import PerkDetailsModal from '../components/PerkDetailsModal'
import { useAuth } from '../contexts/AuthContext'

export default function BenefitsPage() {
  const { user } = useAuth()
  const [perks, setPerks] = useState<PartnerPerk[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PartnerPerk | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPerks()
  }, [])

  async function fetchPerks() {
    const { data } = await supabase
      .from('partner_perks')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
    setPerks(data ?? [])
    setLoading(false)
  }

  async function trackView(perk: PartnerPerk) {
    await supabase.from('perk_analytics').insert({
      perk_id: perk.id,
      user_id: user?.id ?? null,
      action_type: 'view',
    })
    setSelected(perk)
  }

  const filtered = perks.filter(p =>
    !search ||
    p.partner_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.short_description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen p-4 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🎁</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">הטבות</h1>
          <p className="text-sand-400 text-sm">הנחות ומבצעים בלעדיים</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="w-full pr-10 pl-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white text-sand-800"
          />
        </div>

        {/* Perks grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sand-400">
            <p className="text-4xl mb-3">🎁</p>
            <p className="text-sm">לא נמצאו הטבות</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(perk => (
              <button
                key={perk.id}
                onClick={() => trackView(perk)}
                className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all text-right"
              >
                {perk.logo_url ? (
                  <img
                    src={perk.logo_url}
                    alt={perk.partner_name}
                    className="w-12 h-12 rounded-2xl object-contain bg-sand-50 p-1.5 mb-3"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-mustard-100 flex items-center justify-center mb-3 text-2xl">
                    🎁
                  </div>
                )}
                <p className="text-sm font-bold text-sand-800 leading-tight">{perk.partner_name}</p>
                {perk.short_description && (
                  <p className="text-xs text-sand-400 mt-1 line-clamp-2 leading-relaxed">
                    {perk.short_description}
                  </p>
                )}
                {perk.discount_code && (
                  <div className="mt-2 bg-mustard-50 rounded-xl px-2 py-1 inline-block">
                    <span className="text-xs text-mustard-600 font-bold">{perk.discount_code}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <PerkDetailsModal perk={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
