import { useEffect, useState, useCallback } from 'react'
import { Search, Check, PlayCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase, Video, HomeworkTask } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'
import { useTracker } from '../hooks/useTracker'

type VideoWithDetails = Video & {
  is_completed: boolean
  homework_tasks: HomeworkTask[]
  content_categories?: { name: string } | null
}

export default function ProAreaPage() {
  const { user, profile, hasActiveWorkshopAccess, activeAccessUntil } = useAuth()
  const { track } = useTracker()
  const [videos, setVideos] = useState<VideoWithDetails[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const fetchVideos = useCallback(async () => {
    if (!user) return
    const { data: vids } = await supabase
      .from('videos')
      .select('*, content_categories(name), homework_tasks(*)')
      .eq('is_active', true)
      .order('display_order')

    const { data: progress } = await supabase
      .from('user_video_progress')
      .select('video_id, completed')
      .eq('user_id', user.id)

    const progressMap = new Map((progress ?? []).map(p => [p.video_id, p.completed]))

    setVideos(
      (vids ?? []).map(v => ({
        ...v,
        is_completed: progressMap.get(v.id) ?? false,
        homework_tasks: (v.homework_tasks ?? []).sort(
          (a: HomeworkTask, b: HomeworkTask) => a.display_order - b.display_order
        ),
      }))
    )
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  async function toggleComplete(videoId: string, currentlyCompleted: boolean) {
    if (!user) return
    await supabase.from('user_video_progress').upsert({
      user_id: user.id,
      video_id: videoId,
      completed: !currentlyCompleted,
      completed_at: !currentlyCompleted ? new Date().toISOString() : null,
    }, { onConflict: 'user_id,video_id' })
    await fetchVideos()
  }

  const hasAccess = hasActiveWorkshopAccess || profile?.is_pro || profile?.is_admin

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm space-y-5">
          <div
            className="w-24 h-24 rounded-3xl mx-auto flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
          >
            <span className="text-5xl">🔒</span>
          </div>
          <h2 className="text-2xl font-black text-sand-800">הסרטונים נעולים</h2>
          <p className="text-sand-500 text-sm leading-relaxed">
            הגישה לסרטונים ניתנת לאחר רכישת סדנה פעילה.<br />
            פנייה לברנדה לפתיחת גישה 💛
          </p>
        </div>
      </div>
    )
  }

  const filtered = videos.filter(v =>
    !search ||
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    (v.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen p-4 pb-24 relative" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🎬</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">סרטונים</h1>
          <p className="text-sand-400 text-sm">תכנים מקצועיים עבורך</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש סרטונים..."
            className="w-full pr-10 pl-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sand-400">
            <p className="text-4xl mb-3">🎬</p>
            <p className="text-sm">לא נמצאו סרטונים</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(video => (
              <div key={video.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                {/* Thumbnail */}
                <div className="relative">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="w-full h-36 bg-gradient-to-br from-mustard-100 to-sand-100 flex items-center justify-center">
                      <PlayCircle className="w-12 h-12 text-mustard-400" />
                    </div>
                  )}
                  {video.is_completed && (
                    <div className="absolute top-2 left-2 bg-green-500 rounded-full p-1">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  {video.duration_minutes && (
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-lg">
                      {video.duration_minutes} דק'
                    </div>
                  )}
                  {video.video_url && (
                    <button
                      onClick={() => {
                        if (playingId !== video.id) track('video_start', { video_id: video.id, title: video.title })
                        setPlayingId(playingId === video.id ? null : video.id)
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                    >
                      <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                        <PlayCircle className="w-8 h-8 text-mustard-600" />
                      </div>
                    </button>
                  )}
                </div>

                {/* Inline video player */}
                {playingId === video.id && video.video_url && (
                  <video
                    src={video.video_url}
                    controls
                    autoPlay
                    className="w-full bg-black"
                    style={{ maxHeight: '220px' }}
                    onEnded={() => setPlayingId(null)}
                  />
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {video.content_categories?.name && (
                        <span className="text-xs text-mustard-600 font-medium bg-mustard-50 px-2 py-0.5 rounded-lg">
                          {video.content_categories.name}
                        </span>
                      )}
                      <h3 className="font-bold text-sand-800 mt-1.5">{video.title}</h3>
                      {video.description && (
                        <p className="text-xs text-sand-400 mt-1 leading-relaxed line-clamp-2">
                          {video.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleComplete(video.id, video.is_completed)}
                      className={`mt-1 p-2 rounded-xl transition-all flex-shrink-0 ${
                        video.is_completed
                          ? 'bg-green-100 text-green-600'
                          : 'bg-sand-100 text-sand-400 hover:bg-mustard-100 hover:text-mustard-600'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Homework */}
                  {video.homework_tasks.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpanded(expanded === video.id ? null : video.id)}
                        className="flex items-center gap-1 text-xs text-mustard-600 font-medium"
                      >
                        {expanded === video.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {video.homework_tasks.length} משימות
                      </button>
                      {expanded === video.id && (
                        <div className="mt-2 space-y-1.5">
                          {video.homework_tasks.map((task, i) => (
                            <div key={task.id} className="flex items-start gap-2 text-xs text-sand-600">
                              <span className="text-mustard-400 font-bold flex-shrink-0">{i + 1}.</span>
                              <span>{task.task_description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
