import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, MessageCircle, X } from 'lucide-react'
import { supabase, Workshop } from '../../lib/supabase'
import { signedMediaUrl } from '../../utils/signedMedia'
import type { EventType, EventData } from '../../hooks/useTracker'
import {
  Program, Exercise, SessionTemplate, CohortSession, GlossaryTerm,
  MEETING_ORDINAL, defaultMeeting, markTerms,
} from '../../lib/program'

/**
 * The workshop program as the mother sees it. Built to Brenda's mockup
 * (3.9.26): a topic bar that FILTERS across all five meetings, a meetings
 * bar (active pill solid black), one card per exercise, glossary terms
 * that open on tap, video only where there is one.
 *
 * Minimum information to the mother. No "you skipped", no counts, no
 * mechanics: what her cohort did not get to simply appears at the top of
 * the next meeting under a quiet label.
 */

type Props = {
  workshop: Workshop
  program: Program
  ownerName: string
  ownerWhatsapp: string
  motherName?: string | null
  onBack: () => void
  track: (event: EventType, meta?: EventData) => void
}

type MyCohort = { cohort_id: string; past: number[] }

export default function WorkshopProgram({ workshop, program, ownerName, ownerWhatsapp, motherName, onBack, track }: Props) {
  const { templates, exercises, topics, glossary } = program

  // Her cohort in THIS workshop: decides the landing meeting and which
  // cohort_sessions rows apply. Admins and mothers without a cohort just
  // land on meeting 1 with everything shown.
  const [mine, setMine] = useState<MyCohort | null>(null)
  const [sessions, setSessions] = useState<CohortSession[]>([])
  const [meeting, setMeeting] = useState<number>(1)
  const [topic, setTopic] = useState<string | null>(null)
  // null = not touched yet: open in meeting 1 (where she meets it), folded after.
  const [warmupOpen, setWarmupOpen] = useState<boolean | null>(null)
  const [term, setTerm] = useState<GlossaryTerm | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('get_my_cohort_schedule')
      if (cancelled) return
      const rows = ((data ?? []) as { workshop_id: string; cohort_id: string; meeting_number: number; is_past: boolean }[])
        .filter(r => r.workshop_id === workshop.id)
      if (rows.length === 0) return
      const cohortId = rows[0].cohort_id
      const past = rows.filter(r => r.is_past).map(r => r.meeting_number)
      setMine({ cohort_id: cohortId, past })
      setMeeting(Math.min(defaultMeeting(past), templates.length))
      const { data: cs } = await supabase
        .from('cohort_sessions').select('*').eq('cohort_id', cohortId)
      if (!cancelled) setSessions((cs ?? []) as CohortSession[])
    })()
    return () => { cancelled = true }
  }, [workshop.id, templates.length])

  const skippedIn = (n: number): Set<string> =>
    new Set(sessions.find(s => s.meeting_number === n)?.skipped_exercise_ids ?? [])

  // Warm-up set: the first template's list (they are identical per workshop).
  const warmup: Exercise[] = useMemo(() => {
    const t = templates[0]
    return (t?.warmup_exercise_ids ?? []).map(id => exercises.get(id)).filter((e): e is Exercise => !!e && e.is_active)
  }, [templates, exercises])

  function exercisesOf(t: SessionTemplate): Exercise[] {
    return (t.exercise_ids ?? []).map(id => exercises.get(id)).filter((e): e is Exercise => !!e && e.is_active)
  }

  /** What this meeting shows: what the previous meeting did not get to,
   *  then this meeting's own list minus what THIS meeting did not get to
   *  (those travel forward). The last meeting keeps its own skipped items:
   *  there is nowhere else for them to go. */
  function meetingLists(t: SessionTemplate): { carried: Exercise[]; own: Exercise[] } {
    const prev = templates.find(x => x.meeting_number === t.meeting_number - 1)
    const carried = prev
      ? exercisesOf(prev).filter(e => skippedIn(prev.meeting_number).has(e.id))
      : []
    const isLast = t.meeting_number === templates[templates.length - 1].meeting_number
    const skippedHere = skippedIn(t.meeting_number)
    const own = exercisesOf(t).filter(e => isLast || !skippedHere.has(e.id))
    return { carried, own }
  }

  const activeTemplate = templates.find(t => t.meeting_number === meeting) ?? templates[0]

  const waHref = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! אני ${motherName ?? ''} מסדנת "${workshop.title}". רציתי לשאול...`)}`

  function openTerm(name: string) {
    const g = glossary.find(x => x.term === name)
    if (g) { setTerm(g); track('glossary_open', { term: name }) }
  }

  return (
    <div className="min-h-screen pb-28" dir="rtl" style={{ background: '#FBFAF7' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-sand-100 bg-white sticky top-0 z-20">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        {workshop.image_url && <img src={workshop.image_url} alt="" className="w-9 h-9 rounded-xl object-cover" />}
        <div className="min-w-0">
          <h1 className="font-bold text-sand-800 text-base leading-tight truncate">{workshop.title}</h1>
          <p className="text-[11px] text-sand-400">{templates.length} מפגשים</p>
        </div>
      </div>

      <div className="max-w-sm mx-auto">
        {/* ── Topic bar ── */}
        <div className="px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold tracking-wide text-[#8C8177] ml-1">לפי נושא</span>
            {topics.map(tp => (
              <Chip key={tp.key} active={topic === tp.key} onClick={() => { const next = topic === tp.key ? null : tp.key; setTopic(next); if (next) track('program_topic', { topic: next }) }}>
                {tp.label}
              </Chip>
            ))}
            <Chip dashed active={topic === null} onClick={() => setTopic(null)}>כל המפגשים</Chip>
          </div>
        </div>

        {/* ── Meetings bar ── */}
        {topic === null && (
          <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
            {templates.map(t => (
              <button key={t.id}
                onClick={() => { setMeeting(t.meeting_number); track('program_meeting', { meeting: t.meeting_number }) }}
                className="flex-shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap border transition-colors"
                style={t.meeting_number === meeting
                  ? { background: '#2E2C24', color: '#fff', borderColor: '#2E2C24' }
                  : { background: '#fff', color: '#4A443C', borderColor: '#E5DCD0' }}>
                {t.meeting_number}. {t.title}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="px-4 pt-5 space-y-4">
          {topic !== null ? (
            <FilteredView
              templates={templates} exercisesOf={exercisesOf} warmup={warmup}
              topic={topic} topicLabel={topics.find(t => t.key === topic)?.label ?? ''}
              glossary={glossary} onTerm={openTerm} track={track}
            />
          ) : activeTemplate && (
            <MeetingView
              template={activeTemplate} lists={meetingLists(activeTemplate)} warmup={warmup}
              warmupOpen={warmupOpen ?? activeTemplate.meeting_number === 1} onToggleWarmup={() => setWarmupOpen(o => !(o ?? activeTemplate.meeting_number === 1))}
              glossary={glossary} onTerm={openTerm} track={track}
              isCurrent={!!mine && mine.past.length > 0 && Math.max(...mine.past) === activeTemplate.meeting_number}
            />
          )}

          {/* WhatsApp */}
          <a href={waHref} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold mt-6"
            style={{ background: '#E8F5E9', color: '#2E7D32' }}>
            <MessageCircle className="w-4 h-4" />
            שאלי את {ownerName}
          </a>
        </div>
      </div>

      {/* ── Glossary sheet ── */}
      {term && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={() => setTerm(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-sm bg-white rounded-t-3xl p-5 pb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setTerm(null)} className="absolute top-4 left-4 p-1.5 rounded-lg text-sand-400 hover:bg-sand-100">
              <X className="w-4 h-4" />
            </button>
            <p className="text-[11px] font-bold tracking-wide text-[#8C8177] mb-1">מונח</p>
            <h3 className="text-lg font-bold text-sand-800 mb-2">{term.term}</h3>
            <p className="text-[15px] leading-relaxed text-[#4A443C]">{term.plain}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── pieces ────────────────────────────────────────────────────────────────

function Chip({ children, active, dashed, onClick }: { children: React.ReactNode; active: boolean; dashed?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
      style={active
        ? { background: '#2E2C24', color: '#fff', border: '1px solid #2E2C24' }
        : { background: '#fff', color: dashed ? '#8C8177' : '#4A443C', border: `1px ${dashed ? 'dashed' : 'solid'} ${dashed ? '#C6BDA0' : '#E5DCD0'}` }}>
      {children}
    </button>
  )
}

function MeetingHeader({ template }: { template: SessionTemplate }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold flex-shrink-0"
          style={{ background: '#E7C78A', color: '#3B2E1C' }}>{template.meeting_number}</span>
        <span className="text-[12px] font-bold tracking-widest" style={{ color: '#8C8177' }}>
          {MEETING_ORDINAL[template.meeting_number] ?? `מפגש ${template.meeting_number}`}
        </span>
      </div>
      <h2 className="font-brand text-[30px] leading-tight mb-3" style={{ color: '#2E2823', fontWeight: 400 }}>{template.title}</h2>
    </div>
  )
}

function MeetingView({ template, lists, warmup, warmupOpen, onToggleWarmup, glossary, onTerm, track, isCurrent }: {
  template: SessionTemplate
  lists: { carried: Exercise[]; own: Exercise[] }
  warmup: Exercise[]
  warmupOpen: boolean
  onToggleWarmup: () => void
  glossary: GlossaryTerm[]
  onTerm: (t: string) => void
  track: Props['track']
  isCurrent: boolean
}) {
  return (
    <>
      <MeetingHeader template={template} />
      {template.intro && <HtmlBlock html={template.intro} glossary={glossary} onTerm={onTerm} className="pg-lead" />}

      {/* Warm-up: the same in every meeting, so it folds. Open in meeting 1
          where she meets it for the first time. */}
      {template.include_warmup && warmup.length > 0 && (
        <section className="rounded-2xl border" style={{ background: '#FFF8EA', borderColor: '#F2E3C4' }}>
          <button onClick={onToggleWarmup} className="w-full flex items-center justify-between px-4 py-3 text-right">
            <span className="font-bold text-sand-800 text-[15px]">החימום של מימו</span>
            <span className="flex items-center gap-2 text-[12px] text-sand-500">
              {warmup.length} שירים ותרגילים
              <ChevronDown className={`w-4 h-4 transition-transform ${warmupOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {warmupOpen && (
            <div className="px-3 pb-3 space-y-2">
              {warmup.map((e, i) => <ExerciseCard key={e.id} ex={e} index={i + 1} glossary={glossary} onTerm={onTerm} track={track} />)}
            </div>
          )}
        </section>
      )}

      {lists.carried.length > 0 && (
        <section className="space-y-2">
          <p className="text-[12px] font-bold tracking-wide" style={{ color: '#8C8177' }}>
            {isCurrent ? 'נמשיך היום ממה שלא הספקנו במפגש הקודם' : 'המשך מהמפגש הקודם'}
          </p>
          {lists.carried.map(e => <ExerciseCard key={e.id} ex={e} glossary={glossary} onTerm={onTerm} track={track} />)}
        </section>
      )}

      <section className="space-y-2">
        {lists.own.map(e => <ExerciseCard key={e.id} ex={e} glossary={glossary} onTerm={onTerm} track={track} />)}
      </section>

      {template.outro && <HtmlBlock html={template.outro} glossary={glossary} onTerm={onTerm} className="pg-end" />}
    </>
  )
}

function FilteredView({ templates, exercisesOf, warmup, topic, topicLabel, glossary, onTerm, track }: {
  templates: SessionTemplate[]
  exercisesOf: (t: SessionTemplate) => Exercise[]
  warmup: Exercise[]
  topic: string
  topicLabel: string
  glossary: GlossaryTerm[]
  onTerm: (t: string) => void
  track: Props['track']
}) {
  const wu = warmup.filter(e => e.topics.includes(topic))
  const groups = templates
    .map(t => ({ t, items: exercisesOf(t).filter(e => e.topics.includes(topic)) }))
    .filter(g => g.items.length > 0)
  if (wu.length === 0 && groups.length === 0) {
    return <p className="text-sm text-sand-400 text-center py-8">אין עדיין תרגילים בנושא {topicLabel}.</p>
  }
  return (
    <>
      {wu.length > 0 && (
        <section className="space-y-2">
          <p className="text-[12px] font-bold tracking-wide" style={{ color: '#8C8177' }}>החימום של מימו</p>
          {wu.map(e => <ExerciseCard key={e.id} ex={e} glossary={glossary} onTerm={onTerm} track={track} />)}
        </section>
      )}
      {groups.map(({ t, items }) => (
        <section key={t.id} className="space-y-2">
          <div className="flex items-center gap-2 pt-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
              style={{ background: '#E7C78A', color: '#3B2E1C' }}>{t.meeting_number}</span>
            <span className="text-[13px] font-bold text-sand-700 truncate">{t.title}</span>
          </div>
          {items.map(e => <ExerciseCard key={e.id} ex={e} glossary={glossary} onTerm={onTerm} track={track} />)}
        </section>
      ))}
    </>
  )
}

/** Light html from the database, with glossary terms made tappable.
 *  Event delegation: one listener per block, no per-term wiring. */
function HtmlBlock({ html, glossary, onTerm, className }: { html: string | null; glossary: GlossaryTerm[]; onTerm: (t: string) => void; className?: string }) {
  const marked = useMemo(() => markTerms(html, glossary), [html, glossary])
  if (!html) return null
  return (
    <div className={`pg-html ${className ?? ''}`}
      onClick={e => {
        const el = (e.target as HTMLElement).closest?.('.pg-term') as HTMLElement | null
        if (el?.dataset.term) { e.preventDefault(); onTerm(el.dataset.term) }
      }}
      dangerouslySetInnerHTML={{ __html: marked }} />
  )
}

function ExerciseCard({ ex, index, glossary, onTerm, track }: { ex: Exercise; index?: number; glossary: GlossaryTerm[]; onTerm: (t: string) => void; track: Props['track'] }) {
  return (
    <article className="bg-white rounded-2xl px-4 py-3.5 border" style={{ borderColor: '#E5DCD0' }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h5 className="text-[17px] font-bold" style={{ color: '#2E2823' }}>
          {index ? `${index}. ` : ''}{ex.title}
        </h5>
        {ex.age_range && (
          <span className="flex-shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 mt-1" style={{ background: '#F5F1EB', color: '#7B604C' }}>
            {ex.age_range}
          </span>
        )}
      </div>
      {/* Video belongs to the exercise. No placeholder when there is none. */}
      {ex.video_url && <ExerciseVideo url={ex.video_url} onPlay={() => track('video_start', { exercise_id: ex.id, title: ex.title })} />}
      <HtmlBlock html={ex.how} glossary={glossary} onTerm={onTerm} />
      {ex.lyrics && <p className="pg-lyrics" dangerouslySetInnerHTML={{ __html: ex.lyrics }} />}
      {ex.why && <HtmlBlock html={ex.why} glossary={glossary} onTerm={onTerm} className="pg-why" />}
      {ex.caution && <HtmlBlock html={ex.caution} glossary={glossary} onTerm={onTerm} className="pg-stop" />}
    </article>
  )
}

const FALLBACK_RATIO = 9 / 16

/** Same box as the course player: phone footage is 9:16, the real ratio is
 *  read on loadedmetadata, height capped so the baby's feet stay on screen. */
function ExerciseVideo({ url, onPlay }: { url: string; onPlay: () => void }) {
  const [ratio, setRatio] = useState(FALLBACK_RATIO)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    signedMediaUrl(url).then(u => { if (!cancelled) setSrc(u) })
    return () => { cancelled = true }
  }, [url])
  return (
    <div className="flex justify-center my-2">
      <div className="relative w-full overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: String(ratio), maxHeight: '60vh', maxWidth: `calc(60vh * ${ratio})` }}>
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        <video src={src ?? undefined} controls playsInline preload="metadata" onPlay={onPlay}
          onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight) }}
          className="absolute inset-0 w-full h-full object-contain" />
      </div>
    </div>
  )
}
