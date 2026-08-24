import { useEffect, useMemo, useState } from 'react'
import { Sparkles, ChevronLeft, X, ChevronDown } from 'lucide-react'
import { supabase, type AgeStage, type AgeStageTopic } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// "מה קורה אצל X עכשיו" — the age guide, in the shape Yahav asked for on
// 24.8.26 after two rounds of cutting.
//
// The rule that drives the whole thing: development happens over a RANGE,
// not on a day. "במשך כל הטווח הזה הם יקבלו את אותו מידע - מכיוון
// שהתפתחות היא קוראת בטווח ולא ביום יומיים או אפילו שבוע." So the card
// shows one sentence for the whole stage, and it does not rotate. A mother
// who opens the app three days running sees the same headline, because
// nothing about her baby changed in three days.
//
// The depth is behind a tap. Card -> sheet -> topic. Nothing is a wall of
// text until she chose to read it, which was the complaint about v1.
//
// Content comes only from Brenda's own course material (age_stages /
// age_stage_topics, both editable from the admin מדריך גיל screen).
// Red flags are a topic like any other, with kind='consult' and a
// deliberately soft tone: "איפה שמדובר על דגלונים אדומים אני לא רוצה
// להלחיץ את האמהות."

export default function AgeGuideCard() {
  const { selectedChild } = useAuth()
  const [stages, setStages] = useState<AgeStage[]>([])
  const [topics, setTopics] = useState<AgeStageTopic[]>([])
  const [open, setOpen] = useState(false)
  const [openTopicId, setOpenTopicId] = useState<string | null>(null)

  const dob = selectedChild?.dob ?? null

  const ageDays = useMemo(() => {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob).getTime()) / 86_400_000)
  }, [dob])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('age_stages')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (!cancelled) setStages((data ?? []) as AgeStage[])
      })
    return () => { cancelled = true }
  }, [])

  const stage = useMemo(() => {
    if (ageDays == null || stages.length === 0) return null
    // Before birth (a due date sitting in dob) and past the last stage both
    // mean "no card", not "show the nearest one". Guessing here would put
    // three-year-old content in front of a mother of a newborn.
    if (ageDays < 0) return null
    return stages.find(s => ageDays >= s.age_start_days && ageDays <= s.age_end_days) ?? null
  }, [ageDays, stages])

  useEffect(() => {
    if (!stage) { setTopics([]); return }
    let cancelled = false
    supabase
      .from('age_stage_topics')
      .select('*')
      .eq('stage_id', stage.id)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (!cancelled) setTopics((data ?? []) as AgeStageTopic[])
      })
    return () => { cancelled = true }
  }, [stage])

  // Body scroll lock while the sheet is up, so the page behind does not
  // scroll away under her thumb on iOS.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!stage || !selectedChild) return null

  const firstName = selectedChild.name.trim().split(/\s+/)[0]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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
              מה קורה אצל {firstName} עכשיו
            </p>
            <p className="font-bold mt-1" style={{ fontSize: 13, color: '#8A6A2F' }}>{stage.title}</p>
            <p className="mt-0.5 leading-relaxed" style={{ fontSize: 14, color: '#443327' }}>
              {stage.headline}
            </p>
            <span className="inline-flex items-center mt-2 font-bold" style={{ fontSize: 12, color: '#8A6A2F', gap: 2 }}>
              לקריאה
              <ChevronLeft style={{ width: 14, height: 14 }} strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center"
          style={{ background: 'rgba(40,30,22,.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            dir="rtl"
            className="w-full sm:max-w-lg text-right flex flex-col"
            style={{
              background: '#FBF8F4',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '88vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex items-start justify-between flex-shrink-0"
              style={{ padding: '18px 18px 12px', borderBottom: '1px solid #EFE7DC' }}
            >
              <div className="min-w-0" style={{ paddingLeft: 8 }}>
                <p className="font-bold" style={{ fontSize: 12, color: '#957860' }}>
                  {firstName}, {stage.title}
                </p>
                <p className="font-bold mt-0.5 leading-snug" style={{ fontSize: 16, color: '#443327' }}>
                  מה קורה בשלב הזה
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{ width: 32, height: 32, background: '#F0EBE3' }}
                aria-label="סגירה"
              >
                <X style={{ width: 17, height: 17, color: '#8A6A2F' }} strokeWidth={2.5} />
              </button>
            </div>

            <div
              className="overflow-y-auto"
              style={{
                padding: 18,
                paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
                gap: 10,
                display: 'flex',
                flexDirection: 'column',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {stage.intro && (
                <p className="leading-relaxed" style={{ fontSize: 14, color: '#5C4A3A', flexShrink: 0 }}>{stage.intro}</p>
              )}

              {topics.map(t => {
                const isOpen = openTopicId === t.id
                const consult = t.kind === 'consult'
                return (
                  <div
                    key={t.id}
                    style={{
                      background: consult ? '#F6F1E8' : '#FFFFFF',
                      borderRadius: 20,
                      border: consult ? '1px solid #E7DCC9' : '1px solid transparent',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => setOpenTopicId(isOpen ? null : t.id)}
                      className="w-full text-right flex items-center"
                      style={{ padding: 14, gap: 10 }}
                    >
                      {t.emoji && <span style={{ fontSize: 20, lineHeight: 1 }}>{t.emoji}</span>}
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold" style={{ fontSize: 14, color: '#443327' }}>{t.title}</span>
                        {t.teaser && !isOpen && (
                          <span className="block mt-0.5" style={{ fontSize: 12.5, color: '#957860' }}>{t.teaser}</span>
                        )}
                      </span>
                      <ChevronDown
                        style={{
                          width: 17,
                          height: 17,
                          color: '#B09A7E',
                          flexShrink: 0,
                          transform: isOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform .18s',
                        }}
                        strokeWidth={2.5}
                      />
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 14px 16px' }}>
                        {t.body.split('\n').map((line, i) =>
                          line.trim() === '' ? (
                            <div key={i} style={{ height: 8 }} />
                          ) : (
                            <p key={i} className="leading-relaxed" style={{ fontSize: 14, color: '#443327' }}>
                              {line}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <p className="leading-relaxed" style={{ fontSize: 11.5, color: '#A9937A', paddingTop: 4, flexShrink: 0 }}>
                התוכן כאן הוא מידע כללי ותומך, מתוך חומרי הקורס של מימו. הוא אינו ייעוץ רפואי ואינו תחליף לרופא, לאחות טיפת חלב או לאיש מקצוע.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
