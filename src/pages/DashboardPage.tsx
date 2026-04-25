import { useEffect, useState } from 'react'
import { ChevronLeft, UserPlus, Copy, Check, Settings as SettingsIcon } from 'lucide-react'
import { supabase, DailyTip, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge, getIsraelHour } from '../utils/dateUtils'
import PerkDetailsModal from '../components/PerkDetailsModal'
import ChildSwitcher from '../components/ChildSwitcher'
import MyTasksPanel from '../components/MyTasksPanel'
import type { Page } from '../App'

type Props = {
  onNavigate: (page: Page) => void
}

const APP_BASE = 'https://mimoapp.vercel.app'

export default function DashboardPage({ onNavigate }: Props) {
  const { profile, selectedChild, children, family, createFamily, createFamilyInvite, hasActiveWorkshopAccess, activeAccessUntil } = useAuth()
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [featuredPerks, setFeaturedPerks] = useState<PartnerPerk[]>([])
  const [selectedPerk, setSelectedPerk] = useState<PartnerPerk | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

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

  async function handleCreateInvite() {
    if (!selectedChild) return
    setInviteLoading(true)
    if (!family) {
      await createFamily(profile?.mother_name ?? 'המשפחה שלי')
    }
    const token = await createFamilyInvite(selectedChild.id)
    setInviteLoading(false)
    if (token) setInviteLink(`${APP_BASE}?join=${token}`)
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const greeting = () => {
    const h = getIsraelHour()
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
          <a
            href="?settings"
            className="p-2 rounded-xl text-sand-300 hover:text-mustard-500 hover:bg-mustard-50 transition-colors mt-1"
            title="הגדרות"
          >
            <SettingsIcon className="w-5 h-5" />
          </a>
        </div>

        {/* Active workshop access badge */}
        {hasActiveWorkshopAccess && activeAccessUntil && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)', color: 'white' }}>
            <span>⭐</span>
            <span>גישה לסדנה פתוחה עד {new Date(activeAccessUntil + 'T12:00:00').toLocaleDateString('he-IL')}</span>
          </div>
        )}

        {/* Child Switcher */}
        {children.length > 0 && <ChildSwitcher />}

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

        {/* Quick access */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('journal')}
            className="bg-white rounded-3xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right"
          >
            <span className="text-3xl block mb-2">📔</span>
            <p className="font-bold text-sand-800">יומן</p>
            <p className="text-xs text-sand-400 mt-0.5">האכלות, שינה ועוד</p>
          </button>
          <button
            onClick={() => onNavigate('community')}
            className="bg-white rounded-3xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right"
          >
            <span className="text-3xl block mb-2">🌸</span>
            <p className="font-bold text-sand-800">קהילה</p>
            <p className="text-xs text-sand-400 mt-0.5">אמהות בשלב דומה</p>
          </button>
          <button
            onClick={() => onNavigate('workshops')}
            className="bg-white rounded-3xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-right"
          >
            <span className="text-3xl block mb-2">🛍️</span>
            <p className="font-bold text-sand-800">מוצרים</p>
            <p className="text-xs text-sand-400 mt-0.5">סדנאות ורכישות</p>
          </button>
        </div>

        {/* Family invite */}
        {selectedChild && (
          <div className="bg-white rounded-3xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-mustard-50 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-4 h-4 text-mustard-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sand-800">שתפי את היומן</p>
                <p className="text-xs text-sand-400">הזמיני אבא, סבתא — בלי הרשמה</p>
              </div>
              {inviteLink ? (
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק!' : 'העתק'}
                </button>
              ) : (
                <button
                  onClick={handleCreateInvite}
                  disabled={inviteLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                >
                  {inviteLoading ? '...' : 'צור קישור'}
                </button>
              )}
            </div>
            {inviteLink && (
              <p className="text-[10px] text-sand-400 mt-2 break-all">{inviteLink}</p>
            )}
          </div>
        )}

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
    </div>
  )
}
