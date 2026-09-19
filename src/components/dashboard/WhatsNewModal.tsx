// Brenda 17.9.26: "כשפותחים את האפליקציה אפשר שיקפוץ כזה כל פעם שיש עדכון...
// שהאמא שנכנסת ישר תראה ויקפוץ לה, ולא תצטרך לחפש את זה".
//
// One popup on the home screen with everything that is new for HER since
// she last dismissed it: community events published since then, workshop
// cohorts opened since then (unless she is already in / already has the
// workshop), and admin announcements flagged "להקפיץ בכניסה". Everything
// arrives in one list — never a popup after a popup.
//
// "Seen" is a single timestamp per user in whats_new_seen (get_whats_new /
// mark_whats_new_seen, both SECURITY DEFINER). It lives in the DB so the
// phone and the desktop agree. Closing the popup, or tapping through to a
// page, both count as seen. A brand-new signup gets nothing on her first
// open; an existing mother starts two weeks back so the events published
// just before rollout still reach her.
import { useEffect, useState } from 'react'
import { Sparkles, X, CalendarHeart, GraduationCap, Megaphone, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Page } from '../../App'

type NewEvent = { id: string; title: string; emoji: string | null; event_date: string; start_time: string | null; location: string | null; price: number | null }
type NewCohort = { id: string; workshop_id: string; workshop_title: string; label: string | null; start_date: string | null; start_time: string | null; location: string | null }
type NewAnnouncement = { id: string; title: string; body: string | null; emoji: string | null; link_type: 'workshops' | 'benefits' | 'community' | 'url' | null; link_url: string | null }
type WhatsNew = { first_visit: boolean; events: NewEvent[]; cohorts: NewCohort[]; announcements: NewAnnouncement[] }

const MAX_PER_GROUP = 5
const SESSION_KEY = 'mimo_whats_new_checked'

function ddmm(iso: string | null): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function weekday(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long' })
}
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

export default function WhatsNewModal({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [data, setData] = useState<WhatsNew | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Once per browser session: coming back to the home tab must not re-ask.
    try { if (sessionStorage.getItem(SESSION_KEY)) return } catch { /* private mode */ }
    let cancelled = false
    supabase.rpc('get_whats_new').then(({ data: d, error }) => {
      if (cancelled || error || !d) return
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
      const w = d as WhatsNew
      if (w.first_visit) return
      if (w.events.length + w.cohorts.length + w.announcements.length === 0) return
      setData(w)
      setOpen(true)
    })
    return () => { cancelled = true }
  }, [])

  if (!open || !data) return null

  function markSeen() {
    setOpen(false)
    // The .then() is what SENDS the request. A supabase-js builder is lazy:
    // `void supabase.rpc(...)` on its own builds the call and never fires
    // it. From 17.9 to 19.9.26 that is exactly what stood here, so nobody
    // was ever marked as having seen the popup and it came back on every
    // app open (30 of 31 rows in whats_new_seen never moved).
    void supabase.rpc('mark_whats_new_seen').then(({ error }) => {
      if (error) console.error('[whats-new] mark seen failed:', error)
    })
  }
  function go(page: Page) {
    markSeen()
    onNavigate(page)
  }
  function openAnnouncement(a: NewAnnouncement) {
    if (a.link_type === 'url' && a.link_url) {
      markSeen()
      window.open(a.link_url, '_blank', 'noopener,noreferrer')
    } else if (a.link_type === 'workshops' || a.link_type === 'benefits' || a.link_type === 'community') {
      go(a.link_type)
    }
  }

  const events = data.events.slice(0, MAX_PER_GROUP)
  const cohorts = data.cohorts.slice(0, MAX_PER_GROUP)
  const moreEvents = data.events.length - events.length
  const moreCohorts = data.cohorts.length - cohorts.length
  const total = data.events.length + data.cohorts.length + data.announcements.length

  const rowCls = 'w-full flex items-center gap-3 text-right rounded-2xl px-3 py-2.5 transition-all active:scale-[0.99]'
  const rowStyle = { background: '#FAF6EF' }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={markSeen}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="relative px-6 pt-7 pb-5 text-center flex-shrink-0" style={{ background: '#F6ECD8' }}>
          <button
            onClick={markSeen}
            className="absolute top-4 left-4 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center"
            aria-label="סגירה"
          >
            <X className="w-4 h-4 text-sand-700" />
          </button>
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: '#E7C78A' }}>
            <Sparkles className="w-7 h-7" style={{ color: '#4A3A28' }} />
          </div>
          <h2 className="mt-3 font-bold text-lg" style={{ color: '#3D2E20' }}>חדש במימו</h2>
          <p className="mt-1 text-sm" style={{ color: '#7B604C' }}>
            {total === 1 ? 'משהו חדש מאז הפעם הקודמת שנכנסת' : `${total} דברים חדשים מאז הפעם הקודמת שנכנסת`}
          </p>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {data.announcements.map(a => {
            const clickable = (a.link_type === 'url' && !!a.link_url) || a.link_type === 'workshops' || a.link_type === 'benefits' || a.link_type === 'community'
            return (
              <button key={a.id} onClick={() => clickable && openAnnouncement(a)} disabled={!clickable}
                className={`w-full text-right rounded-2xl px-4 py-3 ${clickable ? 'active:scale-[0.99]' : 'cursor-default'}`}
                style={{ background: 'linear-gradient(135deg, #E7C78A 0%, #C8A460 100%)' }}>
                <span className="flex items-start gap-3">
                  <span className="flex-shrink-0 text-2xl leading-none">{a.emoji || <Megaphone className="w-6 h-6" style={{ color: '#33281B' }} />}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-[15px]" style={{ color: '#33281B' }}>{a.title}</span>
                    {a.body && <span className="block text-[13px] mt-0.5 whitespace-pre-line" style={{ color: '#4A3A28' }}>{a.body}</span>}
                  </span>
                  {clickable && <ChevronLeft className="w-5 h-5 flex-shrink-0 self-center" style={{ color: '#33281B' }} />}
                </span>
              </button>
            )
          })}

          {events.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold mb-2" style={{ color: '#A2937D' }}>
                <CalendarHeart className="w-3.5 h-3.5" />
                {data.events.length === 1 ? 'מפגש חדש בקהילה' : `${data.events.length} מפגשים חדשים בקהילה`}
              </p>
              <div className="space-y-2">
                {events.map(e => (
                  <button key={e.id} onClick={() => go('community')} className={rowCls} style={rowStyle}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-white">{e.emoji ?? '🎉'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm text-sand-800 leading-snug truncate">{e.title}</span>
                      <span className="block text-xs text-sand-500 mt-0.5">
                        {[`${weekday(e.event_date)} ${ddmm(e.event_date)}`, hhmm(e.start_time), e.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronLeft className="w-4 h-4 text-sand-400 flex-shrink-0" />
                  </button>
                ))}
                {moreEvents > 0 && (
                  <button onClick={() => go('community')} className="w-full text-center text-xs font-bold py-1" style={{ color: '#B98F4E' }}>
                    ועוד {moreEvents} בקהילה
                  </button>
                )}
              </div>
            </div>
          )}

          {cohorts.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold mb-2" style={{ color: '#A2937D' }}>
                <GraduationCap className="w-3.5 h-3.5" />
                {data.cohorts.length === 1 ? 'נפתח מחזור חדש' : `${data.cohorts.length} מחזורים חדשים נפתחו`}
              </p>
              <div className="space-y-2">
                {cohorts.map(c => (
                  <button key={c.id} onClick={() => go('workshops')} className={rowCls} style={rowStyle}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-white">🎓</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm text-sand-800 leading-snug truncate">{c.workshop_title}</span>
                      <span className="block text-xs text-sand-500 mt-0.5">
                        {[c.label, c.start_date ? `מתחיל ${weekday(c.start_date)} ${ddmm(c.start_date)}` : null, hhmm(c.start_time), c.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronLeft className="w-4 h-4 text-sand-400 flex-shrink-0" />
                  </button>
                ))}
                {moreCohorts > 0 && (
                  <button onClick={() => go('workshops')} className="w-full text-center text-xs font-bold py-1" style={{ color: '#B98F4E' }}>
                    ועוד {moreCohorts} בעמוד המוצרים
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 pt-2 flex gap-2 flex-shrink-0">
          <button onClick={markSeen} className="px-4 py-3 rounded-2xl text-sm font-bold" style={{ background: '#F0EAE0', color: '#7B604C' }}>
            סגירה
          </button>
          <button
            onClick={() => go(data.events.length > 0 || data.cohorts.length === 0 ? 'community' : 'workshops')}
            className="flex-1 py-3 rounded-2xl text-sm font-bold"
            style={{ background: '#E7C78A', color: '#4A3A28' }}
          >
            {data.events.length > 0 || data.cohorts.length === 0 ? 'לקהילה' : 'לעמוד המוצרים'}
          </button>
        </div>
      </div>
    </div>
  )
}
