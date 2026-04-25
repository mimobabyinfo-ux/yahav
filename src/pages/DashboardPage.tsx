import { useEffect, useState } from 'react'
import { ChevronLeft, UserPlus, Copy, Check } from 'lucide-react'
import { supabase, DailyTip, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'
import PerkDetailsModal from '../components/PerkDetailsModal'
import ChildSwitcher from '../components/ChildSwitcher'
import MyTasksPanel from '../components/MyTasksPanel'
import type { Page } from '../App'

type Props = {
  onNavigate: (page: Page) => void
}

const APP_BASE = 'https://mimoapp.vercel.app'

export default function DashboardPage({ onNavigate }: Props) {
  const { profile, selectedChild, children, family, createFamily, createFamilyInvite, user, refreshProfile, hasActiveWorkshopAccess, activeAccessUntil } = useAuth()
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [featuredPerks, setFeaturedPerks] = useState<PartnerPerk[]>([])
  const [selectedPerk, setSelectedPerk] = useState<PartnerPerk | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [lastFeedingAt, setLastFeedingAt] = useState<Date | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    fetchTip()
    fetchPerks()
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // Pull most recent feeding entry from the journal — refresh on user/child change and every minute.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function loadLastFeeding() {
      if (!user) return
      let q = supabase
        .from('daily_log_entries')
        .select('entry_date, entry_time')
        .eq('entry_type', 'feeding')
        .order('entry_date', { ascending: false })
        .order('entry_time', { ascending: false })
        .limit(1)
      if (selectedChild) q = q.eq('child_id', selectedChild.id)
      else q = q.eq('user_id', user.id)
      const { data } = await q
      if (cancelled) return
      const row = data?.[0]
      if (row?.entry_date && row?.entry_time) {
        setLastFeedingAt(new Date(`${row.entry_date}T${row.entry_time}:00`))
      } else {
        setLastFeedingAt(null)
      }
    }
    loadLastFeeding()
    const t = setInterval(loadLastFeeding, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [user, selectedChild])

  async function saveFeedingInterval(hours: number) {
    if (!user) return
    await supabase.from('user_profiles').update({ feeding_interval_hours: hours }).eq('id', user.id)
    refreshProfile()
  }

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

        {/* Next feeding card */}
        {selectedChild && (() => {
          const intervalHours = profile?.feeding_interval_hours ?? 3
          const intervalMs = intervalHours * 3600 * 1000
          const todayStr = new Date().toISOString().slice(0, 10)
          const loggedToday = !!(lastFeedingAt && lastFeedingAt.toISOString().slice(0, 10) === todayStr)
          const elapsedMs = lastFeedingAt ? now.getTime() - lastFeedingAt.getTime() : null
          const remainingMs = elapsedMs != null ? intervalMs - elapsedMs : null

          // 4 states: no entry today / overdue / soon (within 15min) / normal
          let status: 'none' | 'overdue' | 'soon' | 'normal' = 'none'
          if (lastFeedingAt && elapsedMs != null && remainingMs != null) {
            if (remainingMs <= 0) status = 'overdue'
            else if (remainingMs <= 15 * 60 * 1000) status = 'soon'
            else status = 'normal'
          }

          function formatRemaining(ms: number) {
            const totalMin = Math.round(ms / 60000)
            if (totalMin < 60) return `${totalMin} דקות`
            const h = Math.floor(totalMin / 60)
            const m = totalMin % 60
            if (m === 0) return `${h} שעות`
            return `${h} שעות ו-${m} דקות`
          }
          function formatElapsed(ms: number) {
            const totalMin = Math.round(ms / 60000)
            if (totalMin < 60) return `${totalMin} דקות`
            const h = Math.round(totalMin / 60 * 10) / 10
            return `${h} שעות`
          }

          return (
            <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${status === 'overdue' ? 'bg-orange-100' : 'bg-mustard-50'}`}>
                  🍼
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-sand-800">מעקב האכלה</p>
                  <p className="text-xs text-sand-400">
                    {loggedToday
                      ? `האכלה אחרונה: ${lastFeedingAt!.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
                      : 'רשמי האכלה ביומן כדי לעקוב'}
                  </p>
                </div>
              </div>
              {/* TODO: Reconsider whether feeding interval setting belongs on dashboard vs. journal page */}
              <div>
                <p className="text-xs text-sand-400 mb-1.5">מרווח בין האכלות</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[2, 2.5, 3, 3.5, 4].map(h => (
                    <button
                      key={h}
                      onClick={() => saveFeedingInterval(h)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${intervalHours === h ? 'text-white shadow-sm' : 'bg-sand-100 text-sand-500'}`}
                      style={intervalHours === h ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
                    >
                      {h}ש׳
                    </button>
                  ))}
                </div>
              </div>

              {/* Feeding interval status indicator */}
              <div className="pt-1">
                {!loggedToday && (
                  <p className="text-xs text-sand-400">עוד לא תועדה האכלה היום</p>
                )}
                {status === 'normal' && remainingMs != null && (
                  <p className="text-xs text-sand-600">
                    ההאכלה הבאה בעוד {formatRemaining(remainingMs)}
                  </p>
                )}
                {status === 'soon' && (
                  <p className="text-xs font-semibold text-mustard-700">
                    ההאכלה הבאה: בקרוב
                  </p>
                )}
                {status === 'overdue' && elapsedMs != null && (
                  <div className="rounded-xl px-3 py-2" style={{ background: '#FFF4E6', border: '1px solid #F5C77E' }}>
                    <p className="text-sm font-bold" style={{ color: '#C2410C' }}>🍼 הגיע זמן ההאכלה</p>
                    <p className="text-xs mt-0.5" style={{ color: '#9A3412' }}>
                      (חלפו {formatElapsed(elapsedMs)} מההאכלה האחרונה)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

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
