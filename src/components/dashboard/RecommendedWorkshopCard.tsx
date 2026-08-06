import { useEffect, useState } from 'react'
import { ChevronLeft, CalendarDays, Baby } from 'lucide-react'
import { supabase, Workshop, type PublicCohort } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Page } from '../../App'

// Age-matched product recommendation for the home dashboard.
// Matches the selected child's age (in months) against the admin-set
// age_range_start_months / age_range_end_months on active store
// products, and surfaces the best match with its next upcoming cohort —
// so a mom sees what fits her baby without digging through the store.

function cohortDateLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}`
}

// "3–6 חודשים" / "מגיל 6 חודשים" — compact Hebrew range label.
function ageRangeLabel(from: number, to: number | null): string {
  const f = Number.isInteger(from) ? from : from.toFixed(1)
  if (to == null) return `מגיל ${f} חודשים`
  const t = Number.isInteger(to) ? to : to.toFixed(1)
  return `לגילאי ${f}–${t} חודשים`
}

export default function RecommendedWorkshopCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { selectedChild } = useAuth()
  const [match, setMatch] = useState<Workshop | null>(null)
  const [nextCohort, setNextCohort] = useState<PublicCohort | null>(null)

  const dob = selectedChild?.dob ?? null

  useEffect(() => {
    if (!dob) { setMatch(null); setNextCohort(null); return }
    let cancelled = false
    const ageMonths = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    if (ageMonths < 0) { setMatch(null); setNextCohort(null); return }

    supabase
      .from('workshops')
      .select('*')
      .eq('is_active', true)
      .not('workshop_type', 'is', null)
      .not('age_range_start_months', 'is', null)
      .order('display_order')
      .then(({ data }) => {
        if (cancelled) return
        const ws = ((data ?? []) as Workshop[]).find(w =>
          w.age_range_start_months != null &&
          ageMonths >= w.age_range_start_months &&
          (w.age_range_end_months == null || ageMonths <= w.age_range_end_months)
        ) ?? null
        setMatch(ws)
        if (!ws) { setNextCohort(null); return }
        supabase.rpc('get_public_cohorts', { p_workshop_ids: [ws.id] }).then(({ data: cs }) => {
          if (cancelled) return
          const list = (cs ?? []) as PublicCohort[]
          // RPC returns upcoming cohorts sorted by start date — prefer the
          // first one that still has room.
          const open = list.find(c => c.capacity == null || c.capacity - c.registered_count > 0)
          setNextCohort(open ?? list[0] ?? null)
        })
      })

    return () => { cancelled = true }
  }, [dob])

  if (!match || !selectedChild) return null

  const spotsLeft = nextCohort && nextCohort.capacity != null
    ? nextCohort.capacity - nextCohort.registered_count
    : null

  return (
    <button
      onClick={() => onNavigate('workshops')}
      className="w-full text-right transition-all hover:shadow-md active:scale-[0.99]"
      style={{ background: '#F6ECD8', borderRadius: 26, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        {/* Quiet icon tile (no duck — the home feed already has one on
            the community card) */}
        <span className="rounded-2xl flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, background: '#FFFFFF' }}>
          <Baby style={{ width: 24, height: 24, color: '#8A6A2F' }} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold" style={{ fontSize: 13, color: '#8A6A2F' }}>
            מתאים בדיוק לגיל של {selectedChild.name} 💛
          </p>
          <p className="font-bold truncate mt-0.5" style={{ fontSize: 17, color: '#4A3A28' }}>{match.title}</p>
          <p className="font-semibold mt-0.5" style={{ fontSize: 13, color: '#957860' }}>
            {ageRangeLabel(match.age_range_start_months!, match.age_range_end_months)}
            {match.price != null && ` · ${match.price === 0 ? 'חינם' : `₪${match.price}`}`}
          </p>
          {nextCohort && (
            <p className="flex items-center gap-1 font-semibold mt-1" style={{ fontSize: 13, color: '#6E5836' }}>
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              המחזור הקרוב: {cohortDateLabel(nextCohort)}
              {spotsLeft != null && spotsLeft > 0 && spotsLeft <= 3 && (
                <span className="font-bold" style={{ color: '#A35C3D' }}>
                  · {spotsLeft === 1 ? 'מקום אחרון!' : `נותרו ${spotsLeft} מקומות`}
                </span>
              )}
            </p>
          )}
        </div>
        <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#8A6A2F' }} />
      </div>
    </button>
  )
}
