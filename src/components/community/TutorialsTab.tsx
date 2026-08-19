import { useCallback, useEffect, useState } from 'react'
import { PlayCircle, Clock, Sparkles } from 'lucide-react'
import { supabase, Video } from '../../lib/supabase'
import { useTracker } from '../../hooks/useTracker'
import InlineVideo from '../InlineVideo'

/**
 * מדריכים — short explainer clips for the community group.
 *
 * Yahav 19.8.26: one clip per area of the app, "כדי לגרות אותם וכדי להקל
 * עליהם את השימוש". So this is a shelf, not a course: no progress bar, no
 * "mark as done", nothing to finish. She taps the one thing she did not
 * understand, watches a minute, and closes it.
 *
 * The rows come from `videos`, which already had an admin manager, an
 * upload path and ordering, and no screen that displayed it. A clip shows
 * up here the moment it is marked "מדריך קהילה" in Admin → סרטונים; the
 * RLS policy added in 20260819120000 opens exactly those rows, and nothing
 * else in that table, to every signed-in mother.
 *
 * One open at a time — two videos playing at once on a phone is noise, and
 * an accordion keeps the list short enough to scan.
 */
export default function TutorialsTab() {
  const { track } = useTracker()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('videos')
      .select('*')
      .eq('is_tutorial', true)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        if (cancelled) return
        setVideos((data ?? []).filter(v => v.video_url))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback((v: Video) => {
    setOpenId(prev => {
      if (prev === v.id) return null
      track('tutorial_open', { video_id: v.id, title: v.title })
      return v.id
    })
  }, [track])

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-3xl h-24 shadow-sm animate-pulse" />
        ))}
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-3 animate-rise">
        <Sparkles className="w-8 h-8 mx-auto text-mustard-500" />
        <p className="text-base font-bold text-sand-800">המדריכים בדרך 🎬</p>
        <p className="text-sm text-sand-500 leading-relaxed">
          כאן יהיו סרטונים קצרים שמראים בדיוק מה יש באפליקציה ואיך משתמשים בכל חלק.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-[#F6ECD8] rounded-3xl p-4" style={{ border: '1px solid #E7C78A' }}>
        <p className="text-sm font-bold text-[#4A3A28]">סרטונים קצרים, דקה כל אחד 🎬</p>
        <p className="text-[13px] text-[#7B604C] leading-relaxed mt-1">
          כל סרטון מראה חלק אחד באפליקציה — מה יש בו ואיך משתמשים בו. אפשר לצפות לפי הסדר או רק במה שמעניין אותך.
        </p>
      </div>

      {videos.map(v => {
        const open = openId === v.id
        return (
          <div key={v.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggle(v)}
              className="w-full flex items-center gap-3 p-3.5 text-right hover:bg-sand-50 transition-colors"
            >
              {v.thumbnail_url ? (
                <img
                  src={v.thumbnail_url}
                  alt=""
                  className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
                />
              ) : (
                <span
                  className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#F4EDE1' }}
                >
                  <PlayCircle className="w-7 h-7 text-mustard-500" />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sand-800 text-[15px] leading-tight">{v.title}</span>
                {v.description && (
                  <span className="block text-[13px] text-sand-500 leading-snug mt-0.5 line-clamp-2">
                    {v.description}
                  </span>
                )}
                {v.duration_minutes != null && (
                  <span className="flex items-center gap-1 text-[11px] text-sand-400 font-semibold mt-1">
                    <Clock className="w-3 h-3" />
                    {v.duration_minutes} דק'
                  </span>
                )}
              </span>
            </button>

            {open && v.video_url && (
              <div className="px-3.5 pb-4">
                <InlineVideo
                  url={v.video_url}
                  onPlay={() => track('video_start', { source: 'community_tutorials', video_id: v.id, title: v.title })}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
