import { useEffect, useMemo, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * The digital products, measured — and measured as EXPOSURE products,
 * which is the whole reason they exist.
 *
 * "How many bought" is the easy number and the least interesting one. The
 * question this panel exists to answer is: did buying turn her into a Mimo
 * user? So it counts, of the women who bought:
 *   - how many ever opened a lesson
 *   - how many finished
 *   - how many went on to log something in the journal
 *   - how many joined the community
 *   - how many bought something else afterwards
 *
 * ONE PRODUCT AT A TIME. Until 1.9.26 this panel called itself "הקורס
 * הדיגיטלי" and then counted every product that has lessons — עטופים,
 * מגלים and the ₪97 massage course together — so it showed 47 buyers for a
 * course three women had bought. Brenda: "אני לא יודע מה זה הקורס הדיגיטלי
 * הזה אבל זה לא נכון - רכשו רק 3". Merging them was never useful anyway:
 * an ₪800 workshop and a ₪97 course are not the same funnel and their
 * numbers mean nothing added together.
 */

type Row = {
  user_id: string
  mother_name: string | null
  email: string | null
  workshop_id: string
  workshop_title: string
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
  const [journalUsers, setJournalUsers] = useState<Set<string>>(new Set())
  const [communityUsers, setCommunityUsers] = useState<Set<string>>(new Set())
  const [buyCount, setBuyCount] = useState<Map<string, number>>(new Map())
  const [productId, setProductId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: customers, error } = await supabase
        .from('course_customers')
        .select('user_id, mother_name, email, workshop_id, workshop_title, purchase_date, lessons_total, lessons_done, last_active')
        .order('purchase_date', { ascending: false })
      if (error) { console.error('[course insights]', error); setLoading(false); return }

      const list = (customers ?? []) as Row[]
      const ids = [...new Set(list.map(r => r.user_id))]
      if (ids.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false) }
        return
      }

      // Did she do anything else in Mimo after buying?
      const [journal, community, purchases] = await Promise.all([
        supabase.from('daily_log_entries').select('user_id').in('user_id', ids),
        supabase.from('user_profiles').select('id').in('id', ids).eq('community_consent', true),
        supabase.from('purchased_workshops').select('user_id, workshop_id').in('user_id', ids),
      ])
      if (cancelled) return

      const counts = new Map<string, number>()
      for (const r of (purchases.data ?? []) as { user_id: string }[]) {
        counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1)
      }
      setJournalUsers(new Set((journal.data ?? []).map(r => r.user_id as string)))
      setCommunityUsers(new Set((community.data ?? []).map(r => r.id as string)))
      setBuyCount(counts)
      setRows(list)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // One tab per product that has ever been bought, biggest first.
  const products = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; buyers: Set<string> }>()
    for (const r of rows) {
      const cur = byId.get(r.workshop_id) ?? { id: r.workshop_id, title: r.workshop_title, buyers: new Set<string>() }
      cur.buyers.add(r.user_id)
      byId.set(r.workshop_id, cur)
    }
    return [...byId.values()]
      .map(p => ({ id: p.id, title: p.title, buyers: p.buyers.size }))
      .sort((a, b) => b.buyers - a.buyers)
  }, [rows])

  const selected = productId ?? products[0]?.id ?? null
  const productRows = useMemo(
    () => rows.filter(r => r.workshop_id === selected),
    [rows, selected],
  )

  const stats = useMemo<Stats | null>(() => {
    if (productRows.length === 0) return null
    const ids = [...new Set(productRows.map(r => r.user_id))]
    return {
      buyers:      ids.length,
      started:     productRows.filter(r => r.lessons_done > 0).length,
      finished:    productRows.filter(r => r.lessons_total > 0 && r.lessons_done >= r.lessons_total).length,
      inJournal:   ids.filter(id => journalUsers.has(id)).length,
      inCommunity: ids.filter(id => communityUsers.has(id)).length,
      boughtMore:  ids.filter(id => (buyCount.get(id) ?? 0) > 1).length,
    }
  }, [productRows, journalUsers, communityUsers, buyCount])

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
          מוצרים דיגיטליים
        </h2>
        <p className="text-sm text-sand-400 mt-2">עוד אין רוכשות. המספרים יופיעו כאן אחרי המכירה הראשונה.</p>
      </div>
    )
  }

  const pct = (n: number) => stats.buyers > 0 ? Math.round((n / stats.buyers) * 100) : 0
  const neverOpened = productRows.filter(r => r.lessons_done === 0)

  const funnel = [
    { label: 'רכשו',            n: stats.buyers,   tone: '#8A6A2F' },
    { label: 'פתחו שיעור',      n: stats.started,  tone: '#8A6A2F' },
    { label: 'סיימו את הקורס',  n: stats.finished, tone: '#2E7D32' },
  ]
  const spread = [
    { label: 'רשמו ביומן',     n: stats.inJournal },
    { label: 'הצטרפו לקהילה',  n: stats.inCommunity },
    { label: 'קנו מוצר נוסף',  n: stats.boughtMore },
  ]

  return (
    <div className="bg-white rounded-3xl p-5 space-y-4" style={{ border: '1px solid #E9E2D6' }}>
      <h2 className="font-bold flex items-center gap-2" style={{ fontSize: 16, color: '#443327' }}>
        <GraduationCap className="w-4 h-4" style={{ color: '#8A6A2F' }} />
        מוצרים דיגיטליים
      </h2>

      {/* One product at a time. עטופים and a ₪97 course share nothing but
          the fact that both have lessons. */}
      <div className="flex gap-1.5 flex-wrap">
        {products.map(p => {
          const active = p.id === selected
          return (
            <button
              key={p.id}
              onClick={() => setProductId(p.id)}
              className="px-3 py-1.5 rounded-xl font-bold transition-all"
              style={active
                ? { background: '#E7C78A', color: '#4A3A28', fontSize: 12.5 }
                : { background: '#F4EDE1', color: '#7B604C', fontSize: 12.5 }}
            >
              {p.title} · {p.buyers}
            </button>
          )
        })}
      </div>

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

      {/* Who is stuck — the retention list */}
      {neverOpened.length > 0 && (
        <div className="rounded-2xl p-3" style={{ background: '#FDF3E3' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#8A6A2F' }}>
            {neverOpened.length} רכשו ולא פתחו אף שיעור
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: '#6E5836' }}>
            {neverOpened.slice(0, 5).map(r => r.mother_name || r.email).join(' · ')}
            {neverOpened.length > 5 && ' …'}
          </p>
        </div>
      )}
    </div>
  )
}
