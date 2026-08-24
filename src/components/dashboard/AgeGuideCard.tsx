import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { supabase, type BabyAgeGuide } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import BottomSheet from '../BottomSheet'

// "מה קורה בגיל הזה" — the age-based status guide on the home dashboard.
//
// Same shape as the pregnancy weekly guide, one step later in the mother's
// life: match the selected child's age in days against a band, show what
// Brenda's own course material says about that band.
//
// Every sentence in baby_age_guide comes from Brenda's training documents
// (סגמנט לידה עד 4 חודשים / סגמנט 4-8 חודשים / טבלת אבני הדרך). Nothing here
// is filled in from general knowledge, which is why several sections are
// null at several ages: her material genuinely says nothing there, and an
// empty section is honest where invented text would not be. The renderer
// therefore skips nulls rather than showing a placeholder.

const SECTIONS: { key: keyof BabyAgeGuide; label: string }[] = [
  { key: 'development', label: 'מה קורה עכשיו' },
  { key: 'senses', label: 'החושים' },
  { key: 'communication', label: 'תקשורת ושפה' },
  { key: 'feeding_sleep', label: 'אכילה ושינה' },
  { key: 'reflexes', label: 'רפלקסים' },
  { key: 'what_to_do', label: 'מה אפשר לעשות' },
  { key: 'red_flags', label: 'מה חשוב לשים לב אליו' },
]

export default function AgeGuideCard() {
  const { selectedChild } = useAuth()
  const [bands, setBands] = useState<BabyAgeGuide[]>([])
  const [open, setOpen] = useState(false)

  const dob = selectedChild?.dob ?? null

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
    if (!dob || bands.length === 0) return null
    const days = Math.floor((Date.now() - new Date(dob).getTime()) / 86_400_000)
    // Before birth (a due date entered as dob) and past the last band both
    // mean "no guide", not "show the nearest one". Guessing here would put
    // three-year-old content in front of a mother of a newborn.
    if (days < 0) return null
    return bands.find(b => days >= b.age_start_days && days <= b.age_end_days) ?? null
  }, [dob, bands])

  if (!band || !selectedChild) return null

  const firstName = selectedChild.name.trim().split(/\s+/)[0]
  const filled = SECTIONS.filter(s => {
    const v = band[s.key]
    return typeof v === 'string' && v.trim().length > 0
  })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-right transition-all hover:shadow-md active:scale-[0.99]"
        style={{ background: '#FFFFFF', borderRadius: 26, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <span
            className="rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ width: 46, height: 46, background: '#F0EBE3' }}
          >
            <Sparkles style={{ width: 22, height: 22, color: '#8A6A2F' }} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold" style={{ fontSize: 13, color: '#957860' }}>
              מה קורה אצל {firstName} עכשיו
            </p>
            <p className="font-bold truncate mt-0.5" style={{ fontSize: 17, color: '#443327' }}>
              {band.title}
            </p>
            {band.subtitle && (
              <p className="font-semibold truncate mt-0.5" style={{ fontSize: 13, color: '#7B604C' }}>
                {band.subtitle}
              </p>
            )}
          </div>
          <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#957860' }} />
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
