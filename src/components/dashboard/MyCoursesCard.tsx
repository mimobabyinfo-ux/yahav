import { useEffect, useState } from 'react'
import { GraduationCap, ChevronLeft } from 'lucide-react'
import { supabase, Workshop } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../utils/dateUtils'
import type { Page } from '../../App'

/**
 * "התכנים שלך" — the way in to a purchased course.
 *
 * The pro area (ProAreaPage) has no tab in the bottom nav, so without this
 * card a mother who buys the digital course has literally no route to it.
 * Shown only when she has at least one workshop whose access window is open
 * today, so it stays invisible for everyone else.
 */
export default function MyCoursesCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { purchasedWorkshops, profile } = useAuth()
  const [titles, setTitles] = useState<string[]>([])
  // The pro area shows admins every active workshop, so Brenda and Yahav
  // need this card too — otherwise there is no way to check a course
  // without granting themselves a purchase first.
  const isAdmin = !!profile?.is_admin

  const today = formatDate(new Date())
  const active = purchasedWorkshops.filter(pw =>
    pw.access_start_date && pw.access_end_date &&
    pw.access_start_date <= today && pw.access_end_date >= today
  )
  const activeIds = active.map(pw => pw.workshop_id)
  // Latest closing date across her open products — the old dashboard badge
  // showed this, so it must not disappear when that badge went away.
  const until = active
    .map(pw => pw.access_end_date as string)
    .sort()
    .slice(-1)[0]

  const key = activeIds.join(',')
  useEffect(() => {
    if (activeIds.length === 0) { setTitles([]); return }
    let cancelled = false
    supabase.from('workshops').select('id, title').in('id', activeIds)
      .then(({ data }) => {
        if (!cancelled) setTitles(((data ?? []) as Pick<Workshop, 'id' | 'title'>[]).map(w => w.title))
      })
    return () => { cancelled = true }
    // activeIds is rebuilt every render; key is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (activeIds.length === 0 && !isAdmin) return null

  return (
    <button
      onClick={() => onNavigate('pro')}
      className="w-full flex items-center gap-3 rounded-3xl p-4 shadow-sm text-right transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ background: 'linear-gradient(135deg, #F7E8C0, #EDD898)' }}
    >
      <span className="w-11 h-11 rounded-2xl bg-white/70 flex items-center justify-center flex-shrink-0">
        <GraduationCap className="w-5 h-5" style={{ color: '#8A6A2F' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm" style={{ color: '#4A3A28' }}>התכנים שלך</span>
        <span className="block text-xs truncate" style={{ color: '#6E5836' }}>
          {titles.length > 0
            ? titles.join(' · ')
            : activeIds.length > 0
              ? `${activeIds.length} תכנים פתוחים עבורך`
              : 'תצוגת אדמין — כל התכנים'}
        </span>
        {until && (
          <span className="block text-[11px] mt-0.5" style={{ color: '#8A6A2F' }}>
            פתוח עד {new Date(until + 'T12:00:00').toLocaleDateString('he-IL')}
          </span>
        )}
      </span>
      <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#8A6A2F' }} />
    </button>
  )
}
