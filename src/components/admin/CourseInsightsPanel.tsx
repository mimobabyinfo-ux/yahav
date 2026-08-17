import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * The digital course, measured — and specifically measured as an EXPOSURE
 * product, which is the whole reason it exists.
 *
 * "How many bought" is the easy number and the least interesting one. The
 * question this panel exists to answer is: did buying the course turn her
 * into a Mimo user? So it counts, of the women who bought:
 *   - how many ever opened a lesson
 *   - how many finished the course
 *   - how many went on to log something in the journal
 *   - how many joined the community
 *   - how many bought something else afterwards
 *
 * If the last three stay near zero, the course is selling but not doing its
 * job, and that is worth knowing before more money goes into ads.
 */

type Row = {
  user_id: string
  mother_name: string | null
  email: string | null
  purchase_date: string
  lessons_total: number
  lessons_done: number
  last_active: string | null
}

type Stats = {
  buyers: number
  started: number
  finished: number
  inJournal: number
  inCommunity: number
  boughtMore: number
}

export default function CourseInsightsPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: customers, error } = await supabase
        .from('course_customers')
        .select('user_id, mother_name, email, purchase_date, lessons_total, lessons_done, last_active')
        .order('purchase_date', { ascending: false })
      if (error) { console.error('[course insights]', error); setLoading(false); return }

      const list = (customers ?? []) as Row[]
      const ids = [...new Set(list.map(r => r.user_id))]

      if (ids.length === 0) {
        if (!cancelled) { setRows([]); setStats(null); setLoading(false) }
        return
      }

      // Did she do anything else in Mimo after buying?
      const [journal, community, purchases] = await Promise.all([
        supabase.from('daily_log_entries').select('user_id').in('user_id', ids),
        supabase.from('user_profiles').select('id').in('id', ids).eq('community_consent', true),
        supabase.from('purchased_workshops').select('user_id, workshop_id').in('user_id', ids),
      ])

      const journalUsers   = new Set((journal.data ?? []).map(r => r.user_id as string))
      const communityUsers = new Set((community.data ?? []).map(r => r.id as string))
      const buyCount = new Map<string, number>()
      for (const r of (purchases.data ?? []) as { user_id: string }[]) {
        buyCount.set(r.user_id, (buyCount.get(r.user_id) ?? 0) + 1)
      }

      if (cancelled) return
      setRows(list)
      setStats({
        buyers:      ids.length,
        started:     list.filter(r => r.lessons_done > 0).length,
        finished:    list.filter(r => r.lessons_total > 0 && r.lessons_done >= r.lessons_total).length,
        inJournal:   ids.filter(id => journalUsers.has(id)).length,
        inCommunity: ids.filter(id => communityUsers.has(id)).length,
        boughtMore:  ids.filter(id => (buyCount.get(id) ?? 0) > 1).length,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
        <div className="h-4 w-40 skeleton mb-3" />
        <div className="h-16 skeleton" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
        <h2 className="font-bold flex items-center gap-2" style={{ fontSize: 16, color: '#443327' }}>
          <GraduationCap className="w-4 h-4" style={{ color: '#8A6A2F' }} />
          הקורס הדיגיטלי
        </h2>
        <p className="text-sm text-sand-400 mt-2">עוד אין רוכשות. המספרים יופיעו כאן אחרי המכירה הראשונה.</p>
      </div>
    )
  }

  const pct = (n: number) => stats.buyers > 0 ? Math.round((n / stats.buyers) * 100) : 0

  const funnel = [
    { label: 'רכשו',            n: stats.buyers,      tone: '#8A6A2F' },
    { label: 'פתחו שיעור',      n: stats.started,     tone: '#8A6A2F' },
    { label: 'סיימו את הקורס',  n: stats.finished,    tone: '#2E7D32' },
  ]
  const spread = [
    { label: 'רשמו ביומן',        n: stats.inJournal },
    { label: 'הצטרפו לקהילה',     n: stats.inCommunity },
    { label: 'קנו מוצר נוסף',     n: stats.boughtMore },
  ]

  return (
    <div className="bg-white rounded-3xl p-5 space-y-4" style={{ border: '1px solid #E9E2D6' }}>
      <h2 className="font-bold flex items-center gap-2" style={{ fontSize: 16, color: '#443327' }}>
        <GraduationCap className="w-4 h-4" style={{ color: '#8A6A2F' }} />
        הקורס הדיגיטלי
      </h2>

      {/* Consumption */}
      <div className="grid grid-cols-3 gap-2">
        {funnel.map(f => (
          <div key={f.label} className="rounded-2xl p-3 text-center" style={{ background: '#FDF8EE' }}>
            <p className="text-2xl font-black" style={{ color: f.tone }}>{f.n}</p>
            <p className="text-[11px] font-semibold text-sand-500 leading-tight mt-0.5">{f.label}</p>
            {f.label !== 'רכשו' && (
              <p className="text-[10px] text-sand-400">{pct(f.n)}%</p>
            )}
          </div>
        ))}
      </div>

      {/* The exposure question */}
      <div>
        <p className="text-xs font-bold text-sand-600 mb-2">מה קרה איתן אחרי: האם המוצר עשה את שלו</p>
        <div className="space-y-1.5">
          {spread.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-xs text-sand-600 w-28 flex-shrink-0">{s.label}</span>
              <div className="flex-1 h-2 bg-sand-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct(s.n)}%`, background: '#E7C78A' }} />
              </div>
              <span className="text-xs font-bold text-sand-700 w-14 text-left">
                {s.n} · {pct(s.n)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Who is stuck — the retention email list */}
      {rows.some(r => r.lessons_done === 0) && (
        <div className="rounded-2xl p-3" style={{ background: '#FDF3E3' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#8A6A2F' }}>
            {rows.filter(r => r.lessons_done === 0).length} רכשו ולא פתחו אף שיעור
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: '#6E5836' }}>
            {rows.filter(r => r.lessons_done === 0).slice(0, 5)
                 .map(r => r.mother_name || r.email).join(' · ')}
            {rows.filter(r => r.lessons_done === 0).length > 5 && ' …'}
          </p>
        </div>
      )}
    </div>
  )
}
