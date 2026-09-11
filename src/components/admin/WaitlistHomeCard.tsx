import { useCallback, useEffect, useState } from 'react'
import { Bell, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import WaitlistOutreach from './WaitlistOutreach'

/**
 * "ממתינות למחזור חדש" on the admin home.
 *
 * Yahav 26.8.26: "אני צריך להיכנס לתוך המוצר עצמו וזה מאוד לא אינטואיטיבי
 * ולא זמין. אני רוצה שזה יופיע במסך הבית."
 *
 * Yahav 11.9.26: "ברגע שאני שולח הודעה זה נעלם ואז אני לא מצליח לראות מי
 * האמהות שרצו". This card used to list only notified_at IS NULL, so a
 * message made the row disappear from here (it was still on the product
 * page, folded away). Now every product with anyone on its waitlist shows
 * the full panel: proposed date, who can, who cannot, who has not answered.
 * The per-product panel is WaitlistOutreach, shared with the product page.
 */

type Group = { workshopId: string; title: string; count: number }

export default function WaitlistHomeCard({ onOpenProduct }: { onOpenProduct?: (id: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  // Holds people who are waiting on him, so it opens by default.
  const [open, setOpen] = useState(true)
  // Yahav 11.9.26: "אם אני עובד כרגע רק על מפגש אבות אני רוצה לראות רק את
  // המפגש אבות". Each product folds on its own; the choice is remembered
  // per browser so it survives a refresh.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('mimo_admin_waitlist_collapsed') ?? '{}') } catch { return {} }
  })
  function toggleGroup(id: string) {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem('mimo_admin_waitlist_collapsed', JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  const load = useCallback(async () => {
    const { data: w } = await supabase.from('workshop_waitlist').select('workshop_id')
    const counts = new Map<string, number>()
    for (const r of (w ?? []) as { workshop_id: string }[]) counts.set(r.workshop_id, (counts.get(r.workshop_id) ?? 0) + 1)
    const ids = [...counts.keys()]
    if (ids.length === 0) { setGroups([]); setLoading(false); return }
    const { data: ws } = await supabase.from('workshops').select('id, title').in('id', ids)
    const titles = new Map((ws ?? []).map((x: { id: string; title: string }) => [x.id, x.title]))
    setGroups(ids.map(id => ({ workshopId: id, title: titles.get(id) ?? 'מוצר', count: counts.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading || groups.length === 0) return null
  const total = groups.reduce((n, g) => n + g.count, 0)

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full text-right" aria-expanded={open}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold flex items-center gap-1.5" style={{ fontSize: 16, color: '#443327' }}>
            <Bell className="w-4 h-4" style={{ color: '#C8A460' }} />
            ממתינות למחזור חדש
          </h2>
          <span className="flex items-center gap-1.5">
            <span className="font-bold" style={{ fontSize: 13, color: '#C8A460' }}>{total}</span>
            <ChevronDown className="w-4 h-4 transition-transform" style={{ color: '#BCAE99', transform: open ? 'rotate(180deg)' : 'none' }} />
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#A2937D' }}>
          ביקשו שנעדכן אותן כשייפתח מחזור. קבע תאריך, שלח (וואטסאפ עם ההודעה מוכנה), וסמן מי יכולה. אף אחת לא נעלמת אחרי הודעה.
        </p>
      </button>

      {!open ? null : (
        <div className="space-y-5 mt-3">
          {groups.map(g => (
            <div key={g.workshopId}>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => toggleGroup(g.workshopId)} className="font-bold text-right flex items-center gap-1.5"
                  style={{ fontSize: 13, color: '#6E5836' }} aria-expanded={!collapsed[g.workshopId]}>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform"
                    style={{ color: '#BCAE99', transform: collapsed[g.workshopId] ? 'rotate(-90deg)' : 'none' }} />
                  {g.title} · {g.count}
                </button>
                <button onClick={() => onOpenProduct?.(g.workshopId)} style={{ fontSize: 11, color: '#A2937D' }}>
                  לעמוד המוצר
                </button>
              </div>
              {!collapsed[g.workshopId] && (
                <WaitlistOutreach workshopId={g.workshopId} workshopTitle={g.title} compact />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
