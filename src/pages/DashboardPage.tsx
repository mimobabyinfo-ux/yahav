import { useEffect, useState } from 'react'
import { LogOut, ChevronLeft, Share2 } from 'lucide-react'
import { supabase, DailyTip, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'
import PerkDetailsModal from '../components/PerkDetailsModal'
import ChildSwitcher from '../components/ChildSwitcher'
import MyTasksPanel from '../components/MyTasksPanel'
import ShareBabyModal from '../components/ShareBabyModal'
import type { Page } from '../App'

type Props = {
  onNavigate: (page: Page) => void
}

export default function DashboardPage({ onNavigate }: Props) {
  const { profile, signOut, selectedChild, children } = useAuth()
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [featuredPerks, setFeaturedPerks] = useState<PartnerPerk[]>([])
  const [selectedPerk, setSelectedPerk] = useState<PartnerPerk | null>(null)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    fetchTip()
    fetchPerks()
  }, [])

  async function fetchTip() {
    const { data } = await supabase
      .from('daily_tips')
      .select('*')
      .eq('is_active', true)
      .limit(50)
    if (data && data.length > 0) {
      const random = data[Math.floor(Math.random() * data.length)]
      setTip(random)
    }
  }

  async function fetchPerks() {
    const { data } = await supabase
      .from('partner_perks')
      .select('*')
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order')
    setFeaturedPerks(data ?? [])
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 5) return 'לילה טוב'
    if (h < 12) return 'בוקר טוב'
    if (h < 17) return 'צהריים טובים'
    if (h < 21) return 'ערב טוב'
    return 'לילה טוב'
  }

  return (
    <div className="min-h-screen p-5 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🍼</span>
      </div>

      <div className="relative z-10 space-y-5 max-w-sm mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-sand-400 text-sm">{greeting()},</p>
            <h1 className="text-2xl font-bold text-sand-800">
              {profile?.mother_name ?? 'אמא'}! 👋
            </h1>
            {selectedChild && (
              <p className="text-sand-500 text-sm mt-0.5">
                {selectedChild.name}
                {selectedChild.dob && ` · ${getBabyAge(selectedChild.dob)}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {selectedChild && (
              <button
                onClick={() => setShowShare(true)}
                className="p-2 rounded-xl hover:bg-sand-100 text-sand-300 hover:text-sand-500 transition-colors"
                title="שתפי את פרופיל התינוק"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={signOut}
              className="p-2 rounded-xl hover:bg-sand-100 text-sand-300 hover:text-sand-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Child Switcher */}
        {children.length > 0 && <ChildSwitcher />}

        {/* Share baby card */}
        {selectedChild && (
          <button
            onClick={() => setShowShare(true)}
            className="w-full flex items-center gap-3 bg-white rounded-3xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right border border-mustard-100"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sand-800 text-sm">שתפי את {selectedChild.name} 🐣</p>
              <p className="text-xs text-sand-400">שלחי לינק עם פרטי התינוק/ת</p>
            </div>
          </button>
        )}

        {/* Assigned tasks */}
        <MyTasksPanel />

        {/* Daily Tip */}
        {tip && (
          <div className="bg-gradient-to-r from-mustard-50 to-beige-50 rounded-3xl p-5 border border-mustard-100">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <p className="text-xs font-semibold text-mustard-600 mb-1">טיפ היום</p>
                <p className="text-sm text-sand-700 leading-relaxed">{tip.tip_text}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick-action shortcuts */}
        <div className="space-y-3">
          <button
            onClick={() => onNavigate('journal')}
            className="w-full flex items-center gap-4 bg-white rounded-3xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right"
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              <span className="text-2xl">📔</span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sand-800">הוסף רשומה ליומן</p>
              <p className="text-xs text-sand-400 mt-0.5">תעדי האכלות, שינה ועוד</p>
            </div>
            <ChevronLeft className="w-5 h-5 text-sand-300 flex-shrink-0" />
          </button>
          <button
            onClick={() => onNavigate('workshops')}
            className="w-full flex items-center gap-4 bg-white rounded-3xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right"
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
              <span className="text-2xl">▶️</span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sand-800">המשך את הסדנה שלך</p>
              <p className="text-xs text-sand-400 mt-0.5">מוצרים וסדנאות</p>
            </div>
            <ChevronLeft className="w-5 h-5 text-sand-300 flex-shrink-0" />
          </button>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('journal')}
            className="bg-white rounded-3xl p-5 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-right"
          >
            <span className="text-3xl block mb-2">📔</span>
            <p className="font-bold text-sand-800">יומן</p>
            <p className="text-xs text-sand-400 mt-0.5">עקבי אחר פעילויות</p>
          </button>
          <button
            onClick={() => onNavigate('benefits')}
            className="bg-white rounded-3xl p-5 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-right"
          >
            <span className="text-3xl block mb-2">🎁</span>
            <p className="font-bold text-sand-800">הטבות</p>
            <p className="text-xs text-sand-400 mt-0.5">הנחות ומבצעים</p>
          </button>
          <button
            onClick={() => onNavigate('workshops')}
            className="bg-white rounded-3xl p-5 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-right"
          >
            <span className="text-3xl block mb-2">🛠️</span>
            <p className="font-bold text-sand-800">מוצרים</p>
            <p className="text-xs text-sand-400 mt-0.5">סדנאות ורכישות</p>
          </button>
          {profile?.is_pro || profile?.is_admin ? (
            <button
              onClick={() => onNavigate('pro')}
              className="bg-gradient-to-br from-mustard-400 to-mustard-600 rounded-3xl p-5 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-right"
            >
              <span className="text-3xl block mb-2">🎬</span>
              <p className="font-bold text-white">סרטונים</p>
              <p className="text-xs text-mustard-100 mt-0.5">תכנים אקסקלוסיביים</p>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('pro')}
              className="bg-gradient-to-br from-sand-200 to-sand-300 rounded-3xl p-5 text-right hover:from-mustard-100 hover:to-mustard-200 transition-all"
            >
              <span className="text-3xl block mb-2">🔒</span>
              <p className="font-bold text-sand-700">סרטונים</p>
              <p className="text-xs text-sand-500 mt-0.5">שדרגי ל-Pro</p>
            </button>
          )}
        </div>

        {/* Featured Perks */}
        {featuredPerks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-sand-800">הטבות מומלצות</h2>
              <button
                onClick={() => onNavigate('benefits')}
                className="flex items-center gap-1 text-xs text-mustard-600 font-medium"
              >
                הכל
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto scroll-hide pb-1">
              {featuredPerks.map(perk => (
                <button
                  key={perk.id}
                  onClick={() => setSelectedPerk(perk)}
                  className="flex-shrink-0 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all w-44 text-right"
                >
                  {perk.logo_url ? (
                    <img
                      src={perk.logo_url}
                      alt={perk.partner_name}
                      className="w-10 h-10 rounded-xl object-contain mb-3 bg-sand-50 p-1"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-mustard-100 flex items-center justify-center mb-3 text-xl">
                      🎁
                    </div>
                  )}
                  <p className="text-sm font-bold text-sand-800 truncate">{perk.partner_name}</p>
                  {perk.short_description && (
                    <p className="text-xs text-sand-400 mt-0.5 line-clamp-2">{perk.short_description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="bg-white rounded-3xl p-5 shadow-sm text-right">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div className="flex-1">
              <p className="font-semibold text-sand-800 text-sm">יש שאלה?</p>
              <p className="text-xs text-sand-400">אנחנו כאן בשבילך</p>
            </div>
            <a
              href="https://wa.me/972559904274"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      {selectedPerk && (
        <PerkDetailsModal perk={selectedPerk} onClose={() => setSelectedPerk(null)} />
      )}
      {showShare && <ShareBabyModal onClose={() => setShowShare(false)} />}
    </div>
  )
}
