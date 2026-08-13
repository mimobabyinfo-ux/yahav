import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, Settings as SettingsIcon, MessageCircle, Gift, Moon, Sun, Baby, Plus } from 'lucide-react'
import { supabase, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { useLastEntry } from '../hooks/useLastEntry'
import { formatTimeSince } from '../utils/timeSince'
import { getBabyAge } from '../utils/dateUtils'
import ChildSwitcher from '../components/ChildSwitcher'
import MyTasksPanel from '../components/MyTasksPanel'
import ActivityTimers from '../components/ActivityTimers'
import LogEntryModal from '../components/LogEntryModal'
import DailyTipCard from '../components/dashboard/DailyTipCard'
import UpcomingEventsCard from '../components/dashboard/UpcomingEventsCard'
import RecommendedWorkshopCard from '../components/dashboard/RecommendedWorkshopCard'
import MyCoursesCard from '../components/dashboard/MyCoursesCard'
import HomeAnnouncementsBanner from '../components/dashboard/HomeAnnouncementsBanner'
import MimoLeaf from '../components/MimoLeaf'
import PerkDetailsModal from '../components/PerkDetailsModal'
import type { Page } from '../App'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  onNavigate: (page: Page) => void
}

// ── Jerusalem-clock helpers (night mode trigger) ──────────────────────
function jerusalemHour(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
}
function jerusalemClock(): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}
function greetingByHour(h: number): string {
  if (h >= 5 && h < 12) return 'בוקר טוב'
  if (h >= 12 && h < 17) return 'צהריים טובים'
  if (h >= 17 && h < 21) return 'ערב טוב'
  return 'לילה טוב'
}
function hebrewToday(): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' }).format(new Date())
}

export type NightModePref = 'auto' | 'on' | 'off'
export function readNightPref(): NightModePref {
  const v = localStorage.getItem('mimo_night_mode')
  return v === 'on' || v === 'off' ? v : 'auto'
}

export default function DashboardPage({ onNavigate }: Props) {
  const { profile, selectedChild, children } = useAuth()
  const { ownerWhatsapp } = useOwnerSettings()
  const [modalType, setModalType] = useState<EntryType | null>(null)
  const [presetFeedingType, setPresetFeedingType] = useState<'breast' | 'bottle' | 'solid' | undefined>(undefined)
  const [refetchKey, setRefetchKey] = useState(0)
  const handleEntrySaved = useCallback(() => {
    setRefetchKey(k => k + 1)
  }, [])

  // Night mode: auto 21:00–06:00 Asia/Jerusalem, user-overridable from
  // settings (localStorage mimo_night_mode: 'auto' | 'on' | 'off').
  const [minuteTick, setMinuteTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMinuteTick(x => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  void minuteTick
  const hour = jerusalemHour()
  const nightPref = readNightPref()
  // Session-scoped escape hatch: the sun button on the night screen
  // switches to day view until the app is reopened (doesn't touch the
  // persistent preference — that lives in settings).
  const [dayOverride, setDayOverride] = useState(() => sessionStorage.getItem('mimo_night_override') === 'day')
  const wantsNight = nightPref === 'on' || (nightPref === 'auto' && (hour >= 21 || hour < 6))
  const isNight = wantsNight && !dayOverride
  const switchToDay = () => {
    sessionStorage.setItem('mimo_night_override', 'day')
    setDayOverride(true)
  }
  const switchToNight = () => {
    sessionStorage.removeItem('mimo_night_override')
    setDayOverride(false)
  }

  // Since-lines for the night rows.
  const lastSleep = useLastEntry('sleep', refetchKey)
  const lastFeeding = useLastEntry('feeding', refetchKey)

  // Home perks are admin-controlled (global_settings.show_home_perks).
  const [featuredPerks, setFeaturedPerks] = useState<PartnerPerk[]>([])
  const [selectedPerk, setSelectedPerk] = useState<PartnerPerk | null>(null)
  const [showPerks, setShowPerks] = useState(false)

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_value')
      .eq('setting_key', 'show_home_perks')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.setting_value !== 'true') return
        setShowPerks(true)
        supabase.from('partner_perks')
          .select('*')
          .eq('is_active', true)
          .eq('is_featured', true)
          .order('display_order')
          .then(({ data: perks }) => setFeaturedPerks(perks ?? []))
      })
  }, [])

  const openLogPage = (logType: string) => {
    if (logType === 'sleep') onNavigate('log-sleep')
    else if (logType === 'tummy_time') onNavigate('log-tummy')
    else if (logType === 'feeding-breast') onNavigate('log-feeding-breast')
    else if (logType === 'feeding-bottle') onNavigate('log-feeding-bottle')
    else if (logType === 'feeding-solid') onNavigate('log-feeding-solid')
    else if (logType === 'diaper') onNavigate('log-diaper')
    else if (logType === 'doctor_visit') onNavigate('log-medical')
    else if (logType === 'milestone') onNavigate('log-milestone')
    else if (logType === 'note') onNavigate('log-note')
  }

  // ── Night mode — 02:00, dark room, one hand. One job. ───────────────
  if (isNight) {
    const sleepSince = formatTimeSince(lastSleep, '')
    const feedSince = formatTimeSince(lastFeeding, '')
    return (
      <div className="min-h-screen pb-28" dir="rtl" style={{ background: '#221F1B', padding: '22px 20px 100px' }}>
        <div className="max-w-sm mx-auto flex flex-col" style={{ gap: 18 }}>
          {/* Header */}
          <div className="pt-2 flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#8A8370' }}>
                {jerusalemClock()} · {greetingByHour(hour)}
              </p>
              <h1 className="font-display mt-1 truncate" style={{ fontSize: 26, lineHeight: 1.15, fontWeight: 400, color: '#DCD4C8' }}>
                {selectedChild?.name ?? profile?.mother_name ?? 'לילה רגוע'}
              </h1>
            </div>
            <div className="flex flex-shrink-0" style={{ gap: 8 }}>
              <button
                onClick={switchToDay}
                className="rounded-full flex items-center justify-center transition-colors hover:brightness-125"
                style={{ width: 44, height: 44, background: '#2B2823' }}
                title="מעבר למצב יום"
                aria-label="מעבר למצב יום"
              >
                <Sun style={{ width: 20, height: 20, color: '#E7C78A' }} strokeWidth={2} />
              </button>
              <a
                href="?settings"
                className="rounded-full flex items-center justify-center transition-colors hover:brightness-125"
                style={{ width: 44, height: 44, background: '#2B2823' }}
                title="הגדרות"
              >
                <SettingsIcon style={{ width: 20, height: 20, color: '#8A8370' }} />
              </a>
            </div>
          </div>

          {/* Primary action — sleep */}
          <button
            onClick={() => openLogPage('sleep')}
            className="w-full flex items-center text-right"
            style={{ background: '#3A342B', borderRadius: 20, padding: '18px 20px', gap: 14 }}
          >
            <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, background: '#4A4237' }}>
              <Moon style={{ width: 22, height: 22, color: '#E7C78A' }} strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold" style={{ fontSize: 18, color: '#EFE8DC' }}>שינה</span>
              {sleepSince && <span className="block font-semibold mt-0.5" style={{ fontSize: 14, color: '#8A8370' }}>{sleepSince}</span>}
            </span>
          </button>

          {/* Secondary action — feeding */}
          <button
            onClick={() => openLogPage('feeding-breast')}
            className="w-full flex items-center text-right"
            style={{ background: '#31352F', borderRadius: 20, padding: '18px 20px', gap: 14 }}
          >
            <span className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, background: '#3F453C' }}>
              <Baby style={{ width: 22, height: 22, color: '#C3CDD2' }} strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold" style={{ fontSize: 18, color: '#EFE8DC' }}>הנקה</span>
              {feedSince && <span className="block font-semibold mt-0.5" style={{ fontSize: 14, color: '#8A8370' }}>{feedSince}</span>}
            </span>
          </button>

          {/* Third — anything else */}
          <button
            onClick={() => onNavigate('journal')}
            className="w-full flex items-center text-right"
            style={{ border: '1.5px solid #4A4237', borderRadius: 20, padding: '16px 20px', gap: 14 }}
          >
            <Plus style={{ width: 20, height: 20, color: '#8A8370' }} strokeWidth={2.2} />
            <span className="font-bold" style={{ fontSize: 16, color: '#8A8370' }}>פעולה אחרת</span>
          </button>

          {/* Reassurance strip */}
          <div className="flex items-center" style={{ background: '#2B2823', borderRadius: 22, padding: '16px 18px', gap: 14 }}>
            <MimoLeaf variant="sky-1" size={38} rotate={12} className="flex-shrink-0" />
            <p style={{ fontSize: 15, lineHeight: 1.55, color: '#A8A088' }}>
              גם באמצע הלילה, את לא לבד. רישום קצר וחזרה לישון 🤍
            </p>
          </div>

          <p className="text-center font-semibold" style={{ fontSize: 13, color: '#6B6658' }}>
            מצב לילה מופעל אוטומטית בין 21:00 ל־06:00 · <a href="?settings" className="underline" style={{ color: '#8A8370' }}>לשינוי בהגדרות</a>
          </p>
        </div>

        {modalType && (
          <LogEntryModal
            entryType={modalType}
            date={new Date().toISOString().split('T')[0]}
            presetFeedingType={presetFeedingType}
            onClose={() => { setModalType(null); setPresetFeedingType(undefined) }}
            onSaved={() => { handleEntrySaved(); setModalType(null); setPresetFeedingType(undefined) }}
          />
        )}
      </div>
    )
  }

  // ── Day mode — 3 tiers: act → content → footer ──────────────────────
  return (
    <div className="min-h-screen" dir="rtl" style={{ padding: '22px 20px 100px' }}>
      <div className="max-w-sm mx-auto flex flex-col" style={{ gap: 18 }}>

        {/* 1 · Header — plain, no card */}
        <div className="flex items-center justify-between pt-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#957860' }}>
              {greetingByHour(hour)}{profile?.mother_name ? `, ${profile.mother_name}` : ''}
            </p>
            <h1 className="font-display" style={{ fontSize: 26, lineHeight: 1.15, fontWeight: 400, color: '#5E4938' }}>
              {selectedChild?.name ?? 'ברוכה הבאה'}
            </h1>
            {selectedChild?.dob && (
              <p className="font-semibold" style={{ fontSize: 14, color: '#957860' }}>{getBabyAge(selectedChild.dob)}</p>
            )}
          </div>
          <div className="flex flex-shrink-0" style={{ gap: 8 }}>
            {wantsNight && dayOverride && (
              <button
                onClick={switchToNight}
                className="rounded-full flex items-center justify-center transition-colors hover:brightness-95"
                style={{ width: 44, height: 44, background: '#F0EBE3' }}
                title="חזרה למצב לילה"
                aria-label="חזרה למצב לילה"
              >
                <Moon style={{ width: 20, height: 20, color: '#7B604C' }} strokeWidth={2} />
              </button>
            )}
            <a
              href="?settings"
              className="rounded-full flex items-center justify-center transition-colors hover:brightness-95"
              style={{ width: 44, height: 44, background: '#F0EBE3' }}
              title="הגדרות"
            >
              <SettingsIcon style={{ width: 22, height: 22, color: '#7B604C' }} />
            </a>
          </div>
        </div>

        {/* Admin announcements — מבצעים/הנחות, top of the feed so they
            "pop" the moment the app opens */}
        <HomeAnnouncementsBanner onNavigate={onNavigate} />

        {/* 2 · Quick-log — Tier 1, always visible */}
        {selectedChild && (
          <div className="flex flex-col" style={{ background: '#F6ECD8', borderRadius: 26, padding: '18px 16px 14px', gap: 14 }}>
            <div className="flex items-center justify-between">
              <span className="font-bold" style={{ fontSize: 16, color: '#4A3A28' }}>רישום מהיר ביומן</span>
              <span className="font-semibold" style={{ fontSize: 13, color: '#8A6A2F' }}>היום · {hebrewToday()}</span>
            </div>
            {children.length > 1 && <ChildSwitcher />}
            <ActivityTimers
              hero
              onEntrySaved={handleEntrySaved}
              refetchKey={refetchKey}
              onModalRequest={(t, preset) => {
                setModalType(t as EntryType)
                setPresetFeedingType(preset?.feedingType)
              }}
              onOpenLogPage={openLogPage}
            />
          </div>
        )}

        {/* The way in to a purchased course. The pro area has no nav tab,
            so this card is a mother's only route to content she paid for. */}
        <MyCoursesCard onNavigate={onNavigate} />

        {/* Age-matched product recommendation — what fits the baby's age
            right now, without digging through the store */}
        <RecommendedWorkshopCard onNavigate={onNavigate} />

        {/* 3 · Community — Tier 2 */}
        <UpcomingEventsCard onNavigate={onNavigate} />

        {/* The "גישה לסדנה פתוחה עד…" badge used to live here. It looked
            like a button, wasn't one, and led nowhere — the first thing a
            tester tapped. Its date now sits inside MyCoursesCard above,
            which does navigate to the content. */}

        {/* Assigned tasks — Tier 2 */}
        <MyTasksPanel />

        {/* 4 · Daily tip — Tier 2 */}
        <DailyTipCard />

        {/* Featured Perks — Tier 2, admin-gated */}
        {showPerks && featuredPerks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold" style={{ fontSize: 16, color: '#443327' }}>הטבות מומלצות</h2>
              <button
                onClick={() => onNavigate('benefits')}
                className="flex items-center gap-1 font-semibold"
                style={{ fontSize: 13, color: '#8A6A2F' }}
              >
                הכל
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {featuredPerks.slice(0, 4).map(perk => (
                <button
                  key={perk.id}
                  onClick={() => setSelectedPerk(perk)}
                  className="bg-white rounded-2xl p-3 shadow-sm hover:shadow-md transition-all text-right"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {perk.logo_url ? (
                      <img src={perk.logo_url} alt={perk.partner_name} className="w-7 h-7 rounded-lg object-contain bg-sand-50 p-0.5 flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-mustard-100 flex items-center justify-center flex-shrink-0">
                        <Gift className="w-4 h-4" style={{ color: '#8A6A2F' }} />
                      </div>
                    )}
                    <p className="font-bold truncate" style={{ fontSize: 15, color: '#443327' }}>{perk.partner_name}</p>
                  </div>
                  {perk.short_description && (
                    <p className="line-clamp-2 leading-snug" style={{ fontSize: 13, color: '#5F5741' }}>{perk.short_description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5 · Contact — Tier 3, quiet footer row. No card, no fill.
             Yahav 11.8.26: the whole row used to be one link with a
             "שלחי הודעה" on the far side, which read as two separate
             links to the same place. The sentence is now plain text and
             only the button opens WhatsApp. */}
        <div className="flex items-center" style={{ gap: 12, padding: '10px 6px', minHeight: 44 }}>
          <MessageCircle style={{ width: 20, height: 20, color: '#818267' }} />
          <span className="font-semibold" style={{ fontSize: 14, color: '#7B604C' }}>
            יש לך שאלה? מוזמנת לפנות אלינו
          </span>
          <a
            href={`https://wa.me/${ownerWhatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold mr-auto whitespace-nowrap"
            style={{ fontSize: 14, color: '#A35C3D' }}
          >
            שלחי הודעה בוואטסאפ
          </a>
        </div>
      </div>

      {selectedPerk && (
        <PerkDetailsModal perk={selectedPerk} onClose={() => setSelectedPerk(null)} />
      )}

      {modalType && (
        <LogEntryModal
          entryType={modalType}
          date={new Date().toISOString().split('T')[0]}
          presetFeedingType={presetFeedingType}
          onClose={() => { setModalType(null); setPresetFeedingType(undefined) }}
          onSaved={() => {
            handleEntrySaved()
            setModalType(null)
            setPresetFeedingType(undefined)
          }}
        />
      )}
    </div>
  )
}
