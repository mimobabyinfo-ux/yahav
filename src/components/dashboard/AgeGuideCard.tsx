import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { supabase, type BabyAgeGuide, type BabyAgeGuideItem } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import BottomSheet from '../BottomSheet'

// "מה קורה אצל X היום" — the age guide on the home dashboard.
//
// Brenda 24.8.26: the first version showed the whole stage at once and it
// read as a wall of text. The point of the guide is to give a mother a
// reason to open the app every morning, so the card shows ONE thing a day
// and the full stage sits one tap behind it.
//
// Which thing: deterministic from the baby's age in days, never stored per
// mother. Day N inside a band shows item N. That means two mothers whose
// babies are the same age see the same line on the same day, which is what
// makes it worth talking about in the WhatsApp group. It also means no
// write on read, and no drift when a device is offline.
//
// Everything in baby_age_guide / baby_age_guide_items comes from Brenda's
// own course material. Sections her material does not cover at a given age
// are null and simply do not render.

const SECTIONS: { key: keyof BabyAgeGuide; label: string }[] = [
  { key: 'development', label: 'מה קורה עכשיו' },
  { key: 'senses', label: 'החושים' },
  { key: 'communication', label: 'תקשורת ושפה' },
  { key: 'feeding_sleep', label: 'אכילה ושינה' },
  { key: 'reflexes', label: 'רפלקסים' },
  { key: 'what_to_do', label: 'מה אפשר לעשות' },
  { key: 'red_flags', label: 'מה חשוב לשים לב אליו' },
]

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
  const [open, setOpen] = useState(false)

  const dob = selectedChild?.dob ?? null

  // Age in whole days. Recomputed per render is fine: the card only cares
  // about the day, and a mother who leaves the app open past midnight gets
  // the new day's item on her next navigation.
  const ageDays = useMemo(() => {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / 86_400_000)
  }, [dob])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('baby_age_guide')
      .select('*')
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
    // mean "no guide", not "show the nearest one". Guessing here would put
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

  // Day N inside the band shows item N. Bands are longer than their item
  // lists, so the tail of a long band wraps and repeats rather than going
  // blank. Repeating a true sentence beats showing nothing.
  const today = useMemo(() => {
    if (!band || ageDays == null || items.length === 0) return null
    const dayInBand = ageDays - band.age_start_days
    return items[((dayInBand % items.length) + items.length) % items.length]
  }, [band, ageDays, items])

  if (!band || !selectedChild) return null

  const firstName = selectedChild.name.trim().split(/\s+/)[0]
  const filled = SECTIONS.filter(s => {
    const v = band[s.key]
    return typeof v === 'string' && v.trim().length > 0
  })
  const kicker = today ? (today.context ?? SECTION_LABEL[today.section] ?? band.title) : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-right transition-all hover:shadow-md active:scale-[0.99]"
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

            {today ? (
              <>
                {kicker && (
                  <p className="font-bold mt-1" style={{ fontSize: 13, color: '#8A6A2F' }}>{kicker}</p>
                )}
                <p className="mt-0.5 leading-relaxed" style={{ fontSize: 14, color: '#443327' }}>
                  {today.body}
                </p>
              </>
            ) : (
              <p className="font-bold mt-0.5" style={{ fontSize: 17, color: '#443327' }}>{band.title}</p>
            )}

            <p className="flex items-center gap-1 font-semibold mt-2" style={{ fontSize: 13, color: '#957860' }}>
              כל מה שקורה ב{band.title}
              <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0" />
            </p>
          </div>
        </div>
      </button>

      <BottomSheet open={open} title={band.title} onClose={() => setOpen(false)}>
        <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
          {band.subtitle && (
            <p className="font-semibold mb-4" style={{ fontSize: 13, color: '#957860' }}>
              {band.subtitle}
            </p>
          )}
          <div className="flex flex-col gap-5">
            {filled.map(s => (
              <section key={s.key}>
                <h3 className="font-bold mb-1.5" style={{ fontSize: 14, color: '#8A6A2F' }}>
                  {s.label}
                </h3>
                <p
                  className="text-sand-700 leading-relaxed whitespace-pre-line"
                  style={{ fontSize: 14 }}
                >
                  {(band[s.key] as string).trim()}
                </p>
              </section>
            ))}
          </div>
          <p className="mt-6 pt-4 border-t border-sand-100 text-sand-400 leading-relaxed" style={{ fontSize: 12 }}>
            התכנים כאן מבוססים על החומרים של מימו. כל תינוק מתפתח בקצב שלו, והמדריך הוא כיוון ולא אבחנה.
          </p>
        </div>
      </BottomSheet>
    </>
  )
}
