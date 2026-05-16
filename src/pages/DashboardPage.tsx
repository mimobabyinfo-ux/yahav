import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, Settings as SettingsIcon } from 'lucide-react'
import { supabase, DailyTip, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { getBabyAge } from '../utils/dateUtils'
import PerkDetailsModal from '../components/PerkDetailsModal'
import ChildSwitcher from '../components/ChildSwitcher'
import MyTasksPanel from '../components/MyTasksPanel'
import ActivityTimers from '../components/ActivityTimers'
import LogEntryModal from '../components/LogEntryModal'
import TodaysJournalPanel from '../components/dashboard/TodaysJournalPanel'
import type { Page } from '../App'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  onNavigate: (page: Page) => void
}


export default function DashboardPage({ onNavigate }: Props) {
  const { profile, selectedChild, children, hasActiveWorkshopAccess, activeAccessUntil } = useAuth()
  const { ownerName, ownerWhatsapp } = useOwnerSettings()
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [featuredPerks, setFeaturedPerks] = useState<PartnerPerk[]>([])
  const [selectedPerk, setSelectedPerk] = useState<PartnerPerk | null>(null)
  const [modalType, setModalType] = useState<EntryType | null>(null)
  const [presetFeedingType, setPresetFeedingType] = useState<'breast' | 'bottle' | 'solid' | undefined>(undefined)
  const [refetchKey, setRefetchKey] = useState(0)
  const handleEntrySaved = useCallback(() => {
    setRefetchKey(k => k + 1)
  }, [])

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

  return (
    <div className="min-h-screen p-5 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🍼</span>
      </div>

      <div className="relative z-10 space-y-5 max-w-sm mx-auto">
        {/* Header — child name large + age small. Settings cog in corner. */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <h1 className="text-2xl font-bold text-sand-800">
              {selectedChild?.name ?? profile?.mother_name ?? 'ברוכה הבאה'}
            </h1>
            {selectedChild?.dob && (
              <p className="text-sand-500 text-sm mt-0.5">{getBabyAge(selectedChild.dob)}</p>
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

        {/* Child Switcher — moved above the action bar */}
        {children.length > 0 && <ChildSwitcher />}

        {/* Quick-add bar (above the fold for tired moms) */}
        {selectedChild && (
          <div className="bg-[#F5F1EB] rounded-3xl p-3 shadow-sm">
            <ActivityTimers
              onEntrySaved={handleEntrySaved}
              refetchKey={refetchKey}
              onModalRequest={(t, preset) => {
                setModalType(t as EntryType)
                setPresetFeedingType(preset?.feedingType)
              }}
              onOpenLogPage={(logType) => {
                if (logType === 'sleep') onNavigate('log-sleep')
                else if (logType === 'tummy_time') onNavigate('log-tummy')
                else if (logType === 'feeding-breast') onNavigate('log-feeding-breast')
                else if (logType === 'feeding-bottle') onNavigate('log-feeding-bottle')
                else if (logType === 'feeding-solid') onNavigate('log-feeding-solid')
                else if (logType === 'diaper') onNavigate('log-diaper')
                else if (logType === 'doctor_visit') onNavigate('log-medical')
                else if (logType === 'milestone') onNavigate('log-milestone')
                else if (logType === 'note') onNavigate('log-note')
              }}
            />
          </div>
        )}

        {/* Today's Journal panel (Phase 3 / C1) — one-glance summary of
            every action category for today. refetchKey shares the same
            counter that drives the quick-add bar's "time since" badges,
            so saving an entry refreshes both. */}
        {selectedChild && (
          <TodaysJournalPanel
            refetchKey={refetchKey}
            onNavigate={target => {
              if (target === 'journal') onNavigate('journal')
            }}
          />
        )}

        {/* Active workshop access badge */}
        {hasActiveWorkshopAccess && activeAccessUntil && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: '#E7C78A', color: 'white' }}>
            <span>⭐</span>
            <span>גישה לסדנה פתוחה עד {new Date(activeAccessUntil + 'T12:00:00').toLocaleDateString('he-IL')}</span>
          </div>
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

        {/* Featured Perks — compact 2-per-row grid */}
        {featuredPerks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-sand-800">הטבות מומלצות</h2>
              <button
                onClick={() => onNavigate('benefits')}
                className="flex items-center gap-1 text-xs text-mustard-600 font-medium"
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
                  className="bg-[#F5F1EB] rounded-2xl p-3 shadow-sm hover:shadow-md transition-all text-right"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {perk.logo_url ? (
                      <img src={perk.logo_url} alt={perk.partner_name} className="w-7 h-7 rounded-lg object-contain bg-sand-50 p-0.5 flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-mustard-100 flex items-center justify-center text-sm flex-shrink-0">🎁</div>
                    )}
                    <p className="text-sm font-bold text-sand-800 truncate">{perk.partner_name}</p>
                  </div>
                  {perk.short_description && (
                    <p className="text-[11px] text-musgo-600 line-clamp-2 leading-snug">{perk.short_description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm text-right">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: 'rgba(163,92,61,0.1)' }}>💬</div>
            <div className="flex-1">
              <p className="font-semibold text-sand-800 text-sm">יש שאלה?</p>
              <p className="text-xs text-musgo-600">{ownerName} כאן לכל שאלה או התייעצות</p>
            </div>
            <a
              href={`https://wa.me/${ownerWhatsapp}`}
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
