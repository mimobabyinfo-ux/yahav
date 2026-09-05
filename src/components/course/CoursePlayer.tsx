import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, ChevronLeft, PlayCircle, BookOpen, FileText,
  CheckCircle2, Circle, MessageCircle, ChevronDown,
} from 'lucide-react'
import { supabase, Workshop, WorkshopContent } from '../../lib/supabase'
import type { EventType, EventData } from '../../hooks/useTracker'
import { signedMediaUrl } from '../../utils/signedMedia'
import MyWorkshopMeetings from '../MyWorkshopMeetings'

/**
 * Digital-course player.
 *
 * Renders a workshop whose content carries `section` values as an ordered
 * course: modules → lessons → one lesson at a time. A lesson is either a
 * video (9:16 phone footage, never cropped) or a reading lesson rendered
 * from `body_html`. Completion is stored per (user, content) in
 * `lesson_progress`; presence of the row means done.
 *
 * ProAreaPage decides which layout to use — see `isCourse` there. This
 * component is only mounted for course-shaped workshops, so the old
 * videos/homework/files view is untouched for existing סדנאות.
 */

type Props = {
  workshop: Workshop
  items: WorkshopContent[]
  userId: string
  ownerName: string
  ownerWhatsapp: string
  onBack: () => void
  track: (event: EventType, meta?: EventData) => void
}

type Module = { name: string; lessons: WorkshopContent[] }

const FALLBACK_RATIO = 9 / 16

export default function CoursePlayer({
  workshop, items, userId, ownerName, ownerWhatsapp, onBack, track,
}: Props) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  // ברנדה 4.9.26: "שלא כל האופציות יהיו פתוחות כל הזמן". כל נושא (חימום,
  // מפגש 1..5) הוא אקורדיון סגור, ורק הנושא שבו היא עומדת פתוח. null =
  // עוד לא נגעה, ואז נפתח הנושא עם השיעור הראשון שלא סומן.
  const [openModules, setOpenModules] = useState<Set<number> | null>(null)

  // Consecutive items sharing a section become one module. Order is the
  // display_order the query already applied — never re-sorted here, so a
  // section that legitimately appears twice stays two modules.
  const modules = useMemo<Module[]>(() => {
    const out: Module[] = []
    for (const it of items) {
      const name = (it.section ?? '').trim() || 'שיעורים'
      const last = out[out.length - 1]
      if (last && last.name === name) last.lessons.push(it)
      else out.push({ name, lessons: [it] })
    }
    return out
  }, [items])

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    supabase
      .from('lesson_progress')
      .select('content_id')
      .eq('user_id', userId)
      .in('content_id', items.map(i => i.id))
      .then(({ data }) => {
        if (!cancelled) setDone(new Set((data ?? []).map(r => r.content_id as string)))
      })
    return () => { cancelled = true }
  }, [items, userId])

  const toggleDone = useCallback(async (item: WorkshopContent) => {
    const isNowDone = !done.has(item.id)
    setSavingId(item.id)
    // Optimistic: the checkmark must feel instant on a phone.
    setDone(prev => {
      const s = new Set(prev)
      if (isNowDone) s.add(item.id); else s.delete(item.id)
      return s
    })
    const { error } = isNowDone
      ? await supabase.from('lesson_progress')
          .upsert({ user_id: userId, content_id: item.id }, { onConflict: 'user_id,content_id' })
      : await supabase.from('lesson_progress')
          .delete().eq('user_id', userId).eq('content_id', item.id)
    setSavingId(null)
    if (error) {
      // Roll back so the UI never claims progress the server refused.
      console.error('[course] lesson_progress failed:', error)
      setDone(prev => {
        const s = new Set(prev)
        if (isNowDone) s.delete(item.id); else s.add(item.id)
        return s
      })
      return
    }
    if (isNowDone) track('lesson_complete', { content_id: item.id, title: item.title })
  }, [done, userId, track])

  const doneCount = items.filter(i => done.has(i.id)).length
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0

  const firstUnfinishedModule = useMemo(() => {
    const i = modules.findIndex(m => m.lessons.some(l => !done.has(l.id)))
    return i === -1 ? 0 : i
  }, [modules, done])
  const isModuleOpen = (mi: number) => openModules ? openModules.has(mi) : mi === firstUnfinishedModule
  function toggleModule(mi: number) {
    setOpenModules(prev => {
      const next = new Set(prev ?? [firstUnfinishedModule])
      if (next.has(mi)) next.delete(mi); else next.add(mi)
      return next
    })
  }

  // ── Lesson view ────────────────────────────────────────────────────────────
  if (openIdx !== null && items[openIdx]) {
    const lesson = items[openIdx]
    const isDone = done.has(lesson.id)
    const prev = openIdx > 0 ? items[openIdx - 1] : null
    const next = openIdx < items.length - 1 ? items[openIdx + 1] : null

    return (
      <div className="min-h-screen pb-28" dir="rtl" style={{ background: '#FFFFFF' }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-sand-100 bg-white sticky top-0 z-10">
          <button onClick={() => setOpenIdx(null)}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] text-mustard-600 font-semibold truncate">
              {(lesson.section ?? '').trim() || workshop.title}
            </p>
            <h1 className="font-bold text-sand-800 text-base leading-tight truncate">{lesson.title}</h1>
          </div>
        </div>

        <div className="p-4 space-y-5 max-w-sm mx-auto">
          {lesson.url && lesson.type === 'video' && <LessonVideo url={lesson.url} onPlay={() => track('video_start', { item_id: lesson.id })} />}

          {lesson.description && (
            <p className="text-sm text-sand-500 leading-relaxed">{lesson.description}</p>
          )}

          {lesson.body_html && (
            <div className="course-body text-sand-700"
              dangerouslySetInnerHTML={{ __html: lesson.body_html }} />
          )}

          {lesson.url && lesson.type === 'pdf' && (
            <a href={lesson.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 bg-[#F5F1EB] rounded-2xl p-4 shadow-sm">
              <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-sand-800">פתחי את הקובץ</span>
            </a>
          )}

          <button
            onClick={() => toggleDone(lesson)}
            disabled={savingId === lesson.id}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-colors disabled:opacity-60"
            style={isDone
              ? { background: '#E8F5E9', color: '#2E7D32' }
              : { background: '#E7C78A', color: '#FFFFFF' }}
          >
            {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            {isDone ? 'סיימת את השיעור' : 'סיימתי את השיעור'}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenIdx(openIdx - 1)}
              disabled={!prev}
              className="flex-1 flex items-center justify-center gap-1 py-3 rounded-2xl text-sm font-semibold bg-sand-100 text-sand-600 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" /> הקודם
            </button>
            <button
              onClick={() => setOpenIdx(openIdx + 1)}
              disabled={!next}
              className="flex-1 flex items-center justify-center gap-1 py-3 rounded-2xl text-sm font-semibold bg-sand-100 text-sand-600 disabled:opacity-40"
            >
              הבא <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {next && (
            <p className="text-center text-[11px] text-sand-400">הבא: {next.title}</p>
          )}
        </div>
      </div>
    )
  }

  // ── Course index ───────────────────────────────────────────────────────────
  let counter = 0
  return (
    <div className="min-h-screen pb-24" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-sand-100 bg-white sticky top-0 z-10">
        <button onClick={onBack}
          className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        {workshop.image_url && (
          <img src={workshop.image_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
        )}
        <div className="min-w-0">
          <h1 className="font-bold text-sand-800 text-base leading-tight truncate">{workshop.title}</h1>
          <p className="text-[11px] text-sand-400">{items.length} שיעורים</p>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-sm mx-auto">
        {/* לוח המפגשים של המחזור שלה; מחזיר null כשאין מחזור (קורס דיגיטלי) */}
        <MyWorkshopMeetings workshopId={workshop.id} />

        {/* Progress */}
        <div className="bg-[#F5F1EB] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-sand-800">ההתקדמות שלך</p>
            <span className="text-xs font-bold text-mustard-700">{doneCount}/{items.length}</span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: '#E7C78A' }} />
          </div>
          {doneCount === items.length && items.length > 0 && (
            <p className="text-xs text-green-700 font-semibold mt-2">סיימת את הקורס. כל הכבוד 🤎</p>
          )}
        </div>

        {workshop.summary && (
          <div className="bg-mustard-50 rounded-2xl p-4 border border-mustard-100">
            <p className="text-sm text-sand-700 leading-relaxed whitespace-pre-line">{workshop.summary}</p>
          </div>
        )}

        {/* Modules: accordion, one topic at a time */}
        {modules.map((mod, mi) => {
          const open = isModuleOpen(mi)
          const modDone = mod.lessons.filter(l => done.has(l.id)).length
          const startIdx = counter
          counter += mod.lessons.length
          return (
            <section key={`${mod.name}-${mi}`} className="rounded-2xl bg-[#F5F1EB] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleModule(mi)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 p-3.5 text-right min-h-[52px]"
              >
                <span className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center flex-shrink-0 ${
                  modDone === mod.lessons.length ? 'bg-green-100 text-green-700' : 'bg-mustard-100 text-mustard-700'
                }`}>
                  {modDone === mod.lessons.length ? <CheckCircle2 className="w-4 h-4" /> : mi + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-sand-800 truncate">{mod.name}</span>
                  <span className="block text-xs text-sand-400">
                    {mod.lessons.length === 1 ? 'פריט אחד' : `${mod.lessons.length} פריטים`}
                    {modDone > 0 && modDone < mod.lessons.length ? ` · ${modDone} הושלמו` : ''}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-sand-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-2 pb-2 space-y-1.5">
                  {mod.lessons.map((lesson, li) => {
                    const idx = startIdx + li
                    const isDone = done.has(lesson.id)
                    return (
                      <button key={lesson.id}
                        onClick={() => { setOpenIdx(idx); track('lesson_open', { content_id: lesson.id, title: lesson.title }) }}
                        className="w-full flex items-center gap-3 bg-white rounded-xl p-3 text-right hover:bg-sand-50 transition-colors min-h-[48px]">
                        <span className="flex-shrink-0">
                          {isDone
                            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                            : lesson.type === 'video'
                              ? <PlayCircle className="w-5 h-5 text-mustard-500" />
                              : <BookOpen className="w-5 h-5 text-sand-400" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm font-semibold ${isDone ? 'text-sand-400' : 'text-sand-800'}`}>
                            {lesson.title}
                          </span>
                          <span className="block text-xs text-sand-400">
                            {lesson.type === 'video' ? 'סרטון' : 'לקריאה'}
                          </span>
                        </span>
                        <ChevronLeft className="w-4 h-4 text-sand-300 flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}

        <a
          href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! יש לי שאלה על "${workshop.title}"`)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
          style={{ background: '#E8F5E9', color: '#2E7D32' }}
        >
          <MessageCircle className="w-4 h-4" />
          שאלי את {ownerName}
        </a>
      </div>
    </div>
  )
}

/**
 * The footage is filmed on a phone (9:16). A fixed-height box cropped it;
 * `object-contain` inside an aspect-ratio box shows the whole frame. The
 * real ratio is read from the file on loadedmetadata, so a landscape clip
 * uploaded later sizes itself correctly instead of letterboxing.
 *
 * maxWidth is derived from maxHeight so a tall video can never push past
 * ~70vh and force the page to scroll to see the baby's feet.
 */
function LessonVideo({ url, onPlay }: { url: string; onPlay: () => void }) {
  const [ratio, setRatio] = useState(FALLBACK_RATIO)
  // Signed at play time, expires within the hour. See utils/signedMedia.
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    signedMediaUrl(url).then(u => { if (!cancelled) setSrc(u) })
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="flex justify-center">
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: String(ratio), maxHeight: '70vh', maxWidth: `calc(70vh * ${ratio})` }}
      >
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        <video
          src={src ?? undefined}
          controls
          playsInline
          preload="metadata"
          onPlay={onPlay}
          onLoadedMetadata={e => {
            const v = e.currentTarget
            if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight)
          }}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
    </div>
  )
}
