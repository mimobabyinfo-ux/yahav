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
//
// Yahav 11.8.26, three fixes:
//  · it kept recommending a workshop she had ALREADY signed up for.
//    get_my_workshop_registrations resolves her registrations by phone
//    (registration_leads has no user_id) and those products drop out.
//  · tapping it opened the whole store. It now opens that product.
//  · the card wore the mustard used by half the app; it moves to the
//    brand's celeste so "this one is for your baby" reads as its own
//    thing.

// Brenda 17.8.26: the celeste was shouting next to the cream cards. She
// picked the palest of the four options put to her, so the card now sits
// just off the page background and earns attention from its content
// rather than its fill. Ink darkened to hold contrast on the light tint.
const CARD_BG = '#E4EAED'
const INK_STRONG = '#22333A'
const INK = '#2A3F49'
const INK_SOFT = '#465C66'

function cohortDateLabel(c: PublicCohort): string {
  const [, m, d] = c.start_date.split('-')
  const t = c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}${t}`
}

// "לידה עד 3 חודשים" / "3–6 חודשים" / "מגיל 6 חודשים".
// A range starting at 0 is not "גילאי 0" — it starts at birth.
function ageRangeLabel(from: number, to: number | null): string {
  const f = Number.isInteger(from) ? from : from.toFixed(1)
  const t = to == null ? null : (Number.isInteger(to) ? to : to.toFixed(1))
  if (from === 0) return t == null ? 'מלידה' : `לידה עד ${t} חודשים`
  if (t == null) return `מגיל ${f} חודשים`
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

    Promise.all([
      supabase
        .from('workshops')
        .select('*')
        .eq('is_active', true)
        .not('workshop_type', 'is', null)
        .not('age_range_start_months', 'is', null)
        .order('display_order'),
      supabase.rpc('get_my_workshop_registrations'),
    ]).then(([wsRes, myRes]) => {
      if (cancelled) return
      // Anything she already registered for — at any status — is not a
      // recommendation. Suggesting a workshop she is enrolled in reads
      // as the app not knowing her.
      const mine = new Set(
        ((myRes.data ?? []) as { workshop_id: string }[]).map(r => r.workshop_id),
      )
      const ws = ((wsRes.data ?? []) as Workshop[]).find(w =>
        !mine.has(w.id) &&
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

  // Brenda 17.8.26: first name only. children.name is stored as
  // "first last" (onboarding joins the two fields), and a full name in a
  // warm one-liner reads like a form, not like her baby.
  const childFirstName = selectedChild.name.trim().split(/\s+/)[0]

  const spotsLeft = nextCohort && nextCohort.capacity != null
    ? nextCohort.capacity - nextCohort.registered_count
    : null

  // Open THIS product, not the store. The store reads the key on mount
  // and opens the matching product straight away.
  function openProduct() {
    try { sessionStorage.setItem('mimo_open_product', match!.id) } catch { /* private mode */ }
    onNavigate('workshops')
  }

  return (
    <button
      onClick={openProduct}
      className="w-full text-right transition-all hover:shadow-md active:scale-[0.99]"
      style={{ background: CARD_BG, borderRadius: 26, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <span className="rounded-2xl flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46, background: '#FFFFFF' }}>
          <Baby style={{ width: 24, height: 24, color: INK }} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold" style={{ fontSize: 13, color: INK }}>
            מתאים בדיוק לגיל של {childFirstName}
          </p>
          <p className="font-bold truncate mt-0.5" style={{ fontSize: 17, color: INK_STRONG }}>{match.title}</p>
          <p className="font-semibold mt-0.5" style={{ fontSize: 13, color: INK_SOFT }}>
            {/* Brenda 17.8.26: no price here. The card's job is "this one
                fits your baby"; a number turns it into an ad before she
                has even opened the product. */}
            {ageRangeLabel(match.age_range_start_months!, match.age_range_end_months)}
          </p>
          {nextCohort && (
            <p className="flex items-center gap-1 font-semibold mt-1" style={{ fontSize: 13, color: INK }}>
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
        <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: INK }} />
      </div>
    </button>
  )
}
