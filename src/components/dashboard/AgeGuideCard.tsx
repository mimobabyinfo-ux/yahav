import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase, type BabyAgeGuide, type BabyAgeGuideItem } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// "מה קורה אצל X היום" — one line a day about the baby's stage.
//
// Yahav 24.8.26, twice. First: showing the whole stage at once was a wall
// of text, spread it over days. Then, after seeing it: opening the full
// stage was still too much to read. So there is no full view any more.
// The card is the whole feature, in the shape of the old daily tip.
//
// baby_age_guide still holds the full stage text, because that is what
// baby_age_guide_items was derived from and how it stays editable. It is
// just not rendered anywhere. Putting a full view back is one component.
//
// Which line: deterministic from the baby's age in days, never stored per
// mother. Day N inside a band shows item N. Two mothers whose babies are
// the same age see the same line on the same day, which is what makes it
// worth talking about in the WhatsApp group. No write on read, no drift
// when a device is offline.
//
// Everything in the items comes from Brenda's own course material.

const SECTION_LABEL: Record<string, string> = {
  development: 'התפתחות',
  senses: 'החושים',
  communication: 'תקשורת ושפה',
  feeding_sleep: 'אכילה ושינה',
  reflexes: 'רפלקסים',
  what_to_do: 'מה אפשר לעשות',
}

export default function AgeGuideCard() {
  const { selectedChild } = useAuth()
  const [bands, setBands] = useState<BabyAgeGuide[]>([])
  const [items, setItems] = useState<BabyAgeGuideItem[]>([])

  const dob = selectedChild?.dob ?? null

  const ageDays = useMemo(() => {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / 86_400_000)
  }, [dob])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('baby_age_guide')
      .select('id, age_start_days, age_end_days, display_order')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (!cancelled) setBands((data ?? []) as BabyAgeGuide[])
      })
    return () => { cancelled = true }
  }, [])

  const band = useMemo(() => {
    if (ageDays == null || bands.length === 0) return null
    // Before birth (a due date sitting in dob) and past the last band both
    // mean "no card", not "show the nearest one". Guessing here would put
    // three-year-old content in front of a mother of a newborn.
    if (ageDays < 0) return null
    return bands.find(b => ageDays >= b.age_start_days && ageDays <= b.age_end_days) ?? null
  }, [ageDays, bands])

  useEffect(() => {
    if (!band) { setItems([]); return }
    let cancelled = false
    supabase
      .from('baby_age_guide_items')
      .select('*')
      .eq('band_id', band.id)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (!cancelled) setItems((data ?? []) as BabyAgeGuideItem[])
      })
    return () => { cancelled = true }
  }, [band])

  // Day N inside the band shows item N. Bands run longer than their item
  // lists, so the tail of a long band wraps and repeats rather than going
  // blank. Repeating a true sentence beats showing nothing.
  const today = useMemo(() => {
    if (!band || ageDays == null || items.length === 0) return null
    const dayInBand = ageDays - band.age_start_days
    return items[((dayInBand % items.length) + items.length) % items.length]
  }, [band, ageDays, items])

  if (!today || !selectedChild) return null

  const firstName = selectedChild.name.trim().split(/\s+/)[0]
  const kicker = today.context ?? SECTION_LABEL[today.section] ?? null

  return (
    <div
      className="w-full text-right"
      style={{ background: '#FFFFFF', borderRadius: 26, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
    >
      <div className="flex items-start" style={{ gap: 12 }}>
        <span
          className="rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ width: 46, height: 46, background: '#F0EBE3' }}
        >
          <Sparkles style={{ width: 22, height: 22, color: '#8A6A2F' }} strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold" style={{ fontSize: 13, color: '#957860' }}>
            מה קורה אצל {firstName} היום
          </p>
          {kicker && (
            <p className="font-bold mt-1" style={{ fontSize: 13, color: '#8A6A2F' }}>{kicker}</p>
          )}
          <p className="mt-0.5 leading-relaxed" style={{ fontSize: 14, color: '#443327' }}>
            {today.body}
          </p>
        </div>
      </div>
    </div>
  )
}
