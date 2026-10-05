import { useCallback, useEffect, useState } from 'react'
import { Bell, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import WaitlistOutreach, { summarizeWaitlist, type PaidLead } from './WaitlistOutreach'
import type { WorkshopWaitlistRow } from '../../lib/supabase'

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

type Group = { workshopId: string; title: string; count: number; act: number; parked: number; registered: number; datePassed: boolean; needsAction: boolean }

export default function WaitlistHomeCard({ onOpenProduct }: { onOpenProduct?: (id: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  // Brenda 14.9.26: "אני לא רוצה שבדיפולט זה יהיה פתוח". The count on
  // the header still says whether anyone is waiting.
  const [open, setOpen] = useState(false)
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
    const { data: w } = await supabase.from('workshop_waitlist').select('*')
    const rowsBy = new Map<string, WorkshopWaitlistRow[]>()
    for (const r of (w ?? []) as WorkshopWaitlistRow[]) rowsBy.set(r.workshop_id, [...(rowsBy.get(r.workshop_id) ?? []), r])
    const ids = [...rowsBy.keys()]
    if (ids.length === 0) { setGroups([]); setLoading(false); return }
    const [{ data: ws }, { data: pl }] = await Promise.all([
      supabase.from('workshops').select('id, title, waitlist_proposed_date').in('id', ids),
      supabase.from('registration_leads').select('selected_workshop_id, user_id, normalized_phone, created_at').in('selected_workshop_id', ids).eq('status', 'paid'),
    ])
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const info = new Map(((ws ?? []) as { id: string; title: string; waitlist_proposed_date: string | null }[]).map(x => [x.id, x]))
    const paid = (pl ?? []) as (PaidLead & { selected_workshop_id: string })[]
    setGroups(ids.map(id => {
      const rows = rowsBy.get(id) ?? []
      const sum = summarizeWaitlist(rows, info.get(id)?.waitlist_proposed_date ?? null, paid.filter(p => p.selected_workshop_id === id), today)
      return { workshopId: id, title: info.get(id)?.title ?? 'מוצר', count: rows.length, ...sum }
    }).sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || b.act - a.act))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading || groups.length === 0) return null
  // 6.10.26: the number on the header is who needs a move from him, not
  // everyone who ever asked (מפגש אבות read 13 with 5 already paid).
  const total = groups.reduce((n, g) => n + g.act, 0)
  const quiet = groups.filter(g => !g.needsAction)
  const live = groups.filter(g => g.needsAction)
  // Nothing to do anywhere: one quiet line, no card.
  if (live.length === 0) {
    return (
      <p className="px-2" style={{ fontSize: 12.5, color: '#A2937D', fontWeight: 600 }}>
        רשימות המתנה: אין מה לעשות כרגע · {quiet.map(g => `${g.title}${g.parked ? ` (${g.parked} לסבב הבא)` : ''}`).join(' · ')}
        {onOpenProduct && quiet[0] && <> · <button onClick={() => onOpenProduct(quiet[0].workshopId)} className="underline">לעמוד המוצר</button></>}
      </p>
    )
  }

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
          {live.map(g => (
            <div key={g.workshopId}>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => toggleGroup(g.workshopId)} className="font-bold text-right flex items-center gap-1.5"
                  style={{ fontSize: 13, color: '#6E5836' }} aria-expanded={!collapsed[g.workshopId]}>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform"
                    style={{ color: '#BCAE99', transform: collapsed[g.workshopId] ? 'rotate(-90deg)' : 'none' }} />
                  {g.title} · {g.act > 0 ? `${g.act} לטיפול` : 'התאריך עבר'}
                  {(g.parked > 0 || g.registered > 0) && (
                    <span className="font-semibold" style={{ color: '#A2937D' }}>
                      {g.registered > 0 && ` · ${g.registered} נרשמו`}{g.parked > 0 && ` · ${g.parked} לסבב הבא`}
                    </span>
                  )}
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
          {quiet.length > 0 && (
            <p style={{ fontSize: 12, color: '#A2937D' }}>
              בלי פעולה כרגע: {quiet.map(g => `${g.title}${g.parked ? ` (${g.parked} לסבב הבא)` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
