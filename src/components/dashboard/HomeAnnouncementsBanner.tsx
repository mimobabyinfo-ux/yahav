import { useEffect, useState } from 'react'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { supabase, type HomeAnnouncement } from '../../lib/supabase'
import { formatDate } from '../../utils/dateUtils'
import type { Page } from '../../App'

// Admin-controlled home-page announcements (מבצעים / הנחות / הודעות).
// Managed from the admin perks tab (HomeAnnouncementsPanel). Only
// active announcements inside their date window render; ordering is
// admin-controlled via display_order. Tapping navigates by link_type.

export default function HomeAnnouncementsBanner({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [items, setItems] = useState<HomeAnnouncement[]>([])

  useEffect(() => {
    supabase
      .from('home_announcements')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        // Date-window filter in Israel-calendar terms (formatDate is
        // Asia/Jerusalem-anchored) — RLS already filters is_active.
        const today = formatDate(new Date())
        setItems(((data ?? []) as HomeAnnouncement[]).filter(a =>
          (!a.starts_at || a.starts_at <= today) && (!a.ends_at || a.ends_at >= today)
        ))
      })
  }, [])

  if (items.length === 0) return null

  function open(a: HomeAnnouncement) {
    if (a.link_type === 'url' && a.link_url) {
      window.open(a.link_url, '_blank', 'noopener,noreferrer')
    } else if (a.link_type === 'workshops' || a.link_type === 'benefits' || a.link_type === 'community') {
      onNavigate(a.link_type)
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {items.map(a => {
        const clickable = (a.link_type === 'url' && !!a.link_url) || a.link_type === 'workshops' || a.link_type === 'benefits' || a.link_type === 'community'
        return (
          <button
            key={a.id}
            onClick={() => clickable && open(a)}
            disabled={!clickable}
            className={`w-full flex items-center text-right ${clickable ? 'transition-all hover:brightness-105 active:scale-[0.99]' : 'cursor-default'}`}
            style={{
              background: 'linear-gradient(135deg, #E7C78A 0%, #C8A460 100%)',
              borderRadius: 22,
              padding: '14px 16px',
              gap: 12,
              boxShadow: '0 2px 6px rgba(138,106,47,.18)',
            }}
          >
            {a.emoji && <span className="flex-shrink-0" style={{ fontSize: 30, lineHeight: 1 }}>{a.emoji}</span>}
            <span className="flex-1 min-w-0">
              <span className="block font-bold" style={{ fontSize: 16, lineHeight: 1.3, color: '#33281B' }}>{a.title}</span>
              {a.body && (
                <span className="block font-semibold mt-0.5 whitespace-pre-line" style={{ fontSize: 13, lineHeight: 1.45, color: '#4A3A28' }}>{a.body}</span>
              )}
            </span>
            {clickable && (
              a.link_type === 'url'
                ? <ExternalLink className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18, color: '#33281B' }} />
                : <ChevronLeft className="w-5 h-5 flex-shrink-0" style={{ color: '#33281B' }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
