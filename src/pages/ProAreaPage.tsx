import { useEffect, useState, useCallback } from 'react'
import { ChevronRight, PlayCircle, BookOpen, FileText, Lock } from 'lucide-react'
import { supabase, Workshop, WorkshopContent, PurchasedWorkshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTracker } from '../hooks/useTracker'

type ActiveWorkshop = PurchasedWorkshop & { workshop: Workshop | null }

export default function ProAreaPage() {
  const { user, profile, hasActiveWorkshopAccess, purchasedWorkshops } = useAuth()
  const { track } = useTracker()
  const [activeWorkshops, setActiveWorkshops] = useState<ActiveWorkshop[]>([])
  const [selected, setSelected] = useState<ActiveWorkshop | null>(null)
  const [content, setContent] = useState<WorkshopContent[]>([])
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const fetchActive = useCallback(async () => {
    if (!user) return
    const today = new Date().toISOString().split('T')[0]

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
    setContentLoading(true)
    track('workshop_open', { workshop_id: aw.workshop_id, title: aw.workshop?.title })
    const { data } = await supabase
      .from('workshop_content')
      .select('*')
      .eq('workshop_id', aw.workshop_id)
      .eq('is_active', true)
      .order('display_order')
    setContent(data ?? [])
    setContentLoading(false)
  }

  const hasAccess = hasActiveWorkshopAccess || profile?.is_pro || profile?.is_admin

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-5">
          <div className="w-24 h-24 rounded-3xl mx-auto flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-black text-sand-800">הסדנאות נעולות</h2>
          <p className="text-sand-500 text-sm leading-relaxed">
            הגישה לסדנאות ניתנת לאחר רכישה.<br />
            פנייה לברנדה לפתיחת גישה 💛
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
      <div className="min-h-screen pb-24" dir="rtl" style={{ background: '#FDFBF7' }}>
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
                      <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
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
                  <div className="space-y-2">
                    {homework.map((item, i) => (
                      <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3">
                        <div className="w-7 h-7 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-purple-600">{i + 1}</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sand-800 text-sm">{item.title}</p>
                          {item.description && <p className="text-xs text-sand-400 mt-1 leading-relaxed">{item.description}</p>}
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="inline-block mt-2 text-xs text-mustard-600 font-medium underline">
                              פתח קישור ←
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
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
                        className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:bg-sand-50 transition-colors">
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
      </div>
    )
  }

  // ── Workshop list view ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 pb-24" dir="rtl" style={{ background: '#FDFBF7' }}>
      <div className="max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">סדנאות</h1>
          <p className="text-sand-400 text-sm">תכנים מקצועיים עבורך</p>
        </div>

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
                  className="w-full bg-white rounded-3xl shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all text-right">
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
