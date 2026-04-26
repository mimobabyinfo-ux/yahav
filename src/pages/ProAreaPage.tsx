import { useEffect, useState, useCallback } from 'react'
import { ChevronRight, PlayCircle, BookOpen, FileText, Lock, CheckSquare, Square, MessageCircle, X } from 'lucide-react'
import { supabase, Workshop, WorkshopContent, PurchasedWorkshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTracker } from '../hooks/useTracker'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { formatDate } from '../utils/dateUtils'

type ActiveWorkshop = PurchasedWorkshop & { workshop: Workshop | null }

export default function ProAreaPage() {
  const { user, profile, hasActiveWorkshopAccess, purchasedWorkshops } = useAuth()
  const { track } = useTracker()
  const { ownerName, ownerWhatsapp } = useOwnerSettings()
  const [activeWorkshops, setActiveWorkshops] = useState<ActiveWorkshop[]>([])
  const [selected, setSelected] = useState<ActiveWorkshop | null>(null)
  const [content, setContent] = useState<WorkshopContent[]>([])
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [nextWorkshop, setNextWorkshop] = useState<Workshop | null>(null)
  const [showNextModal, setShowNextModal] = useState(false)
  const [nextWorkshopContent, setNextWorkshopContent] = useState<WorkshopContent[]>([])
  // homework progress: "contentId:taskIndex"
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())

  const fetchActive = useCallback(async () => {
    if (!user) return
    const today = formatDate(new Date())

    // For admins show all workshops; for users show only active access
    if (profile?.is_admin) {
      const { data: all } = await supabase.from('workshops').select('*').eq('is_active', true).order('display_order')
      setActiveWorkshops((all ?? []).map(w => ({
        id: w.id, user_id: user.id, workshop_id: w.id,
        purchase_date: today, amount_paid: null, notes: null,
        access_start_date: null, access_end_date: null, created_at: today,
        workshop: w,
      })))
    } else {
      const active = purchasedWorkshops.filter(pw =>
        pw.access_start_date && pw.access_end_date &&
        pw.access_start_date <= today && pw.access_end_date >= today
      )
      if (active.length === 0) { setActiveWorkshops([]); setLoading(false); return }

      const { data: wshops } = await supabase
        .from('workshops')
        .select('*')
        .in('id', active.map(pw => pw.workshop_id))

      const map = new Map((wshops ?? []).map(w => [w.id, w]))
      setActiveWorkshops(active.map(pw => ({ ...pw, workshop: map.get(pw.workshop_id) ?? null })))
    }
    setLoading(false)
  }, [user, profile, purchasedWorkshops])

  useEffect(() => { fetchActive() }, [fetchActive])

  async function openWorkshop(aw: ActiveWorkshop) {
    setSelected(aw)
    setNextWorkshop(null)
    setContentLoading(true)
    track('workshop_open', { workshop_id: aw.workshop_id, title: aw.workshop?.title ?? null })
    const { data } = await supabase
      .from('workshop_content')
      .select('*')
      .eq('workshop_id', aw.workshop_id)
      .eq('is_active', true)
      .order('display_order')
    const items = data ?? []
    setContent(items)

    // Load next workshop if linked
    if (aw.workshop?.next_workshop_id) {
      const { data: nw } = await supabase
        .from('workshops')
        .select('*')
        .eq('id', aw.workshop.next_workshop_id)
        .single()
      setNextWorkshop(nw ?? null)
    }

    // Load homework progress
    if (user && items.some(i => i.type === 'homework')) {
      const ids = items.filter(i => i.type === 'homework').map(i => i.id)
      const { data: prog } = await supabase
        .from('user_homework_progress')
        .select('content_id, task_index, completed')
        .eq('user_id', user.id)
        .in('content_id', ids)
      const keys = new Set(
        (prog ?? []).filter(p => p.completed).map(p => `${p.content_id}:${p.task_index}`)
      )
      setDoneKeys(keys)
    }
    setContentLoading(false)
  }

  async function openNextModal() {
    if (!nextWorkshop) return
    track('next_workshop_modal_open', { workshop_id: nextWorkshop.id, title: nextWorkshop.title })
    setShowNextModal(true)
    if (nextWorkshopContent.length === 0) {
      const { data } = await supabase
        .from('workshop_content')
        .select('*')
        .eq('workshop_id', nextWorkshop.id)
        .eq('is_active', true)
      setNextWorkshopContent(data ?? [])
    }
  }

  async function toggleTask(contentId: string, taskIndex: number) {
    if (!user) return
    const key = `${contentId}:${taskIndex}`
    const isNowDone = !doneKeys.has(key)
    setDoneKeys(prev => { const s = new Set(prev); isNowDone ? s.add(key) : s.delete(key); return s })
    await supabase.from('user_homework_progress').upsert({
      user_id: user.id,
      content_id: contentId,
      task_index: taskIndex,
      completed: isNowDone,
      completed_at: isNowDone ? new Date().toISOString() : null,
    }, { onConflict: 'user_id,content_id,task_index' })
  }

  const hasAccess = hasActiveWorkshopAccess || profile?.is_admin

  // Retention banner: show if any workshop was assigned 7+ days ago
  const retentionWorkshop = activeWorkshops.find(aw => {
    if (!aw.access_start_date) return false
    const days = (Date.now() - new Date(aw.access_start_date).getTime()) / (1000 * 60 * 60 * 24)
    return days >= 7
  })
  const [reminderDismissed, setReminderDismissed] = useState(() =>
    localStorage.getItem('reminder-dismissed') === formatDate(new Date())
  )

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-5">
          <div className="w-24 h-24 rounded-3xl mx-auto flex items-center justify-center shadow-lg"
            style={{ background: '#E7C78A' }}>
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-black text-sand-800">הסדנאות נעולות</h2>
          <p className="text-sand-500 text-sm leading-relaxed">
            הגישה לסדנאות ניתנת לאחר רכישה.<br />
            פנייה ל{ownerName} לפתיחת גישה 💛
          </p>
        </div>
      </div>
    )
  }

  // ── Folder / content view ──────────────────────────────────────────────────
  if (selected) {
    const videos   = content.filter(c => c.type === 'video')
    const homework = content.filter(c => c.type === 'homework')
    const pdfs     = content.filter(c => c.type === 'pdf')

    return (
      <div className="min-h-screen pb-24" dir="rtl" style={{ background: '#FFFFFF' }}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-sand-100 bg-white sticky top-0 z-10">
          <button onClick={() => { setSelected(null); setContent([]); setPlayingId(null) }}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          {selected.workshop?.image_url && (
            <img src={selected.workshop.image_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="font-bold text-sand-800 text-base leading-tight">{selected.workshop?.title ?? 'סדנה'}</h1>
            <p className="text-[11px] text-sand-400">{content.length} פריטים</p>
          </div>
        </div>

        <div className="p-4 space-y-5 max-w-sm mx-auto">

          {/* ── Message owner + Book next workshop ── */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי ${ownerName}! אני ${profile?.mother_name ?? ''} מסדנת "${selected.workshop?.title ?? 'הסדנה'}". רציתי לשאול...`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold"
              style={{ background: '#E8F5E9', color: '#2E7D32' }}
            >
              <MessageCircle className="w-4 h-4" />
              שאלי את {ownerName}
            </a>
            <button
              onClick={openNextModal}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background: '#E7C78A' }}
            >
              🎓 לסדנה הבאה
            </button>
          </div>

          {/* ── Workshop summary (if exists) ── */}
          {selected.workshop?.summary && (
            <div className="bg-mustard-50 rounded-2xl p-4 border border-mustard-100">
              <p className="text-xs font-bold text-mustard-700 mb-2">📝 תמצית הסדנה</p>
              <p className="text-sm text-sand-700 leading-relaxed whitespace-pre-line">
                {selected.workshop?.summary}
              </p>
            </div>
          )}

          {contentLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
            </div>
          ) : content.length === 0 ? (
            <div className="text-center py-16 text-sand-400">
              <p className="text-4xl mb-3">📂</p>
              <p className="text-sm">אין תוכן עדיין בסדנה זו</p>
            </div>
          ) : (
            <>
              {/* Videos section */}
              {videos.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <PlayCircle className="w-4 h-4 text-mustard-500" />
                    <h2 className="font-bold text-sand-700 text-sm">סרטונים</h2>
                    <span className="text-[10px] bg-mustard-100 text-mustard-600 px-1.5 py-0.5 rounded-md font-semibold">{videos.length}</span>
                  </div>
                  <div className="space-y-3">
                    {videos.map(item => (
                      <div key={item.id} className="bg-[#F5F5F5] rounded-2xl overflow-hidden shadow-sm">
                        {item.url && (
                          <div className="relative bg-sand-100 h-36">
                            {playingId === item.id ? (
                              <video src={item.url} controls autoPlay className="w-full h-full object-cover bg-black" onEnded={() => setPlayingId(null)} />
                            ) : (
                              <button onClick={() => { track('video_start', { item_id: item.id }); setPlayingId(item.id) }}
                                className="absolute inset-0 flex items-center justify-center w-full h-full">
                                <div className="w-14 h-14 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                                  <PlayCircle className="w-8 h-8 text-mustard-500" />
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                        <div className="p-3">
                          <p className="font-semibold text-sand-800 text-sm">{item.title}</p>
                          {item.description && <p className="text-xs text-sand-400 mt-1 leading-relaxed">{item.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Homework section */}
              {homework.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-purple-500" />
                    <h2 className="font-bold text-sand-700 text-sm">שיעורי בית</h2>
                    <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md font-semibold">{homework.length}</span>
                  </div>
                  <div className="space-y-3">
                    {homework.map(item => {
                      const taskList = item.tasks_json ?? []
                      const doneCount = taskList.filter((_, i) => doneKeys.has(`${item.id}:${i}`)).length
                      return (
                        <div key={item.id} className="bg-[#F5F5F5] rounded-2xl shadow-sm overflow-hidden">
                          <div className="p-4 border-b border-sand-50">
                            <div className="flex items-center justify-between">
                              <p className="font-bold text-sand-800 text-sm">{item.title}</p>
                              {taskList.length > 0 && (
                                <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">
                                  {doneCount}/{taskList.length}
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-xs text-sand-400 mt-1 leading-relaxed">{item.description}</p>}
                            {taskList.length > 0 && (
                              <div className="mt-1.5 h-1 bg-sand-100 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-400 rounded-full transition-all"
                                  style={{ width: `${(doneCount / taskList.length) * 100}%` }} />
                              </div>
                            )}
                          </div>
                          {taskList.length > 0 && (
                            <div className="divide-y divide-sand-50">
                              {taskList.map((task, i) => {
                                const done = doneKeys.has(`${item.id}:${i}`)
                                return (
                                  <button key={i} onClick={() => toggleTask(item.id, i)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sand-50 transition-colors text-right">
                                    {done
                                      ? <CheckSquare className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                      : <Square className="w-4 h-4 text-sand-300 flex-shrink-0" />
                                    }
                                    <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-300' : 'text-sand-700'}`}>{task}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {item.url && (
                            <div className="px-4 py-3 border-t border-sand-50">
                              <a href={item.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-mustard-600 font-medium">פתח קישור ←</a>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* PDFs section */}
              {pdfs.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <h2 className="font-bold text-sand-700 text-sm">קבצים</h2>
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-semibold">{pdfs.length}</span>
                  </div>
                  <div className="space-y-2">
                    {pdfs.map(item => (
                      <a key={item.id} href={item.url ?? '#'} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-[#F5F5F5] rounded-2xl p-4 shadow-sm hover:bg-sand-50 transition-colors">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-sand-800 text-sm">{item.title}</p>
                          {item.description && <p className="text-xs text-sand-400">{item.description}</p>}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Next Workshop Modal ── */}
        {showNextModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNextModal(false)} />
            <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl max-h-[85vh] overflow-y-auto pb-8">
              <button
                onClick={() => setShowNextModal(false)}
                className="absolute top-4 left-4 p-2 rounded-xl hover:bg-sand-100 text-sand-400 z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {(nextWorkshop ?? selected.workshop)?.image_url && (
                <img
                  src={(nextWorkshop ?? selected.workshop)!.image_url!}
                  alt=""
                  className="w-full h-44 object-cover rounded-t-3xl"
                />
              )}

              <div className="p-5 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-sand-800">
                    {nextWorkshop ? nextWorkshop.title : 'הסדנה הבאה'}
                  </h2>
                  {(nextWorkshop ?? selected.workshop)?.price != null && (
                    <p className="text-mustard-600 font-bold text-lg mt-1">
                      ₪{(nextWorkshop ?? selected.workshop)!.price}
                    </p>
                  )}
                </div>

                {(nextWorkshop ?? selected.workshop)?.description && (
                  <div className="text-sm text-sand-600 leading-relaxed whitespace-pre-line">
                    {(nextWorkshop ?? selected.workshop)!.description}
                  </div>
                )}

                {nextWorkshopContent.length > 0 && (
                  <div className="bg-sand-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-sand-600 mb-1">מה כלול בסדנה:</p>
                    {(() => {
                      const vids = nextWorkshopContent.filter(c => c.type === 'video').length
                      const hw   = nextWorkshopContent.filter(c => c.type === 'homework').length
                      const pdfs = nextWorkshopContent.filter(c => c.type === 'pdf').length
                      return (
                        <>
                          {vids > 0 && <p className="text-sm text-sand-700">🎬 {vids} סרטונים</p>}
                          {hw   > 0 && <p className="text-sm text-sand-700">📝 {hw} שיעורי בית</p>}
                          {pdfs > 0 && <p className="text-sm text-sand-700">📄 {pdfs} קבצים</p>}
                        </>
                      )
                    })()}
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  {(nextWorkshop?.payment_link ?? selected.workshop?.payment_link) ? (
                    <a
                      href={nextWorkshop?.payment_link ?? selected.workshop?.payment_link!}
                      target="_blank" rel="noopener noreferrer"
                      onClick={() => track('next_workshop_payment_click', { workshop_id: nextWorkshop?.id ?? selected.workshop_id })}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-bold text-base"
                      style={{ background: '#E7C78A' }}
                    >
                      להרשמה ותשלום ←
                    </a>
                  ) : null}
                  <a
                    href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`שלום ${ownerName}, יש לי שאלה לגבי סדנת ${nextWorkshop?.title ?? selected.workshop?.title ?? 'הסדנה הבאה'}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => track('next_workshop_question_click', { workshop_id: nextWorkshop?.id ?? selected.workshop_id })}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
                    style={{ background: '#E8F5E9', color: '#2E7D32' }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    יש לי שאלה
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Workshop list view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 pb-24" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">סדנאות</h1>
          <p className="text-sand-400 text-sm">תכנים מקצועיים עבורך</p>
        </div>

        {retentionWorkshop && !reminderDismissed && (
          <div className="bg-gradient-to-l from-mustard-50 to-sand-50 rounded-2xl p-4 border border-mustard-100 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🌸</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-sand-800">היי! לא ראינו אותך בסדנה זמן מה</p>
              <p className="text-xs text-sand-500 mt-0.5 leading-relaxed">
                {retentionWorkshop.workshop?.title} מחכה לך — גם 10 דקות יכולות לשנות הרבה 💛
              </p>
              <button onClick={() => openWorkshop(retentionWorkshop)}
                className="mt-2 text-xs font-bold text-mustard-700 underline underline-offset-2">
                המשיכי לצפות ←
              </button>
            </div>
            <button onClick={() => { setReminderDismissed(true); localStorage.setItem('reminder-dismissed', formatDate(new Date())) }}
              className="text-sand-300 hover:text-sand-500 flex-shrink-0 text-lg leading-none">✕</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
          </div>
        ) : activeWorkshops.length === 0 ? (
          <div className="text-center py-16 text-sand-400">
            <p className="text-4xl mb-3">🎓</p>
            <p className="text-sm">אין סדנאות פעילות כרגע</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeWorkshops.map(aw => {
              const w = aw.workshop
              return (
                <button key={aw.id} onClick={() => openWorkshop(aw)}
                  className="w-full bg-[#F5F5F5] rounded-3xl shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all text-right">
                  {w?.image_url ? (
                    <img src={w.image_url} alt={w.title} className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #F7E8C0, #EDD898)' }}>
                      <span className="text-5xl">🎓</span>
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-bold text-sand-800">{w?.title ?? 'סדנה'}</h3>
                    {w?.description && <p className="text-xs text-sand-400 mt-1 line-clamp-2 leading-relaxed">{w.description}</p>}
                    {aw.access_end_date && (
                      <p className="text-[10px] text-mustard-500 font-medium mt-2">
                        ✓ גישה פעילה עד {new Date(aw.access_end_date + 'T12:00:00').toLocaleDateString('he-IL')}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
