import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * "ממתינות למחזור חדש" — on the admin home, not buried in a product.
 *
 * Yahav 26.8.26: "אני צריך להיכנס לתוך המוצר עצמו וזה מאוד לא אינטואיטיבי
 * ולא זמין. אני רוצה שזה יופיע במסך הבית." He was right — the list lived
 * inside ProductPage, which you only open if you already knew to look. A
 * list of warm leads nobody sees is the same as no list.
 *
 * Same shape as UnclaimedPurchasesCard: self-contained, renders nothing
 * when empty, and each row is one tap from done. The product-page panel
 * stays, because that is where you are standing when you open a new cohort.
 *
 * Sending is a wa.me link, not the API. See project memory:
 * whatsapp_24h_window — a 200 from GHL does not mean it arrived.
 */

type Row = {
  id: string
  workshop_id: string
  name: string
  phone: string | null
  email: string | null
  created_at: string
  notified_at: string | null
}

type Cohort = { id: string; workshop_id: string; start_date: string; is_active: boolean }

function waHref(phone: string | null, text: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('972') ? digits : digits.replace(/^0/, '972')
  if (intl.length < 11) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function agoHe(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`
  return `לפני ${Math.floor(days / 30)} חודשים`
}

export default function WaitlistHomeCard({ onOpenProduct }: { onOpenProduct?: (id: string) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: w } = await supabase
      .from('workshop_waitlist')
      .select('id, workshop_id, name, phone, email, created_at, notified_at')
      .is('notified_at', null)
      .order('created_at')
    const list = (w ?? []) as Row[]
    setRows(list)

    if (list.length > 0) {
      const ids = [...new Set(list.map(r => r.workshop_id))]
      const [{ data: ws }, { data: cs }] = await Promise.all([
        supabase.from('workshops').select('id, title').in('id', ids),
        supabase.from('workshop_cohorts').select('id, workshop_id, start_date, is_active').in('workshop_id', ids),
      ])
      const t: Record<string, string> = {}
      for (const row of (ws ?? []) as { id: string; title: string }[]) t[row.id] = row.title
      setTitles(t)
      setCohorts((cs ?? []) as Cohort[])
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Group by product, so the card reads "who is waiting for what".
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of rows) {
      const arr = m.get(r.workshop_id) ?? []
      arr.push(r)
      m.set(r.workshop_id, arr)
    }
    return [...m.entries()]
  }, [rows])

  // The soonest cohort that has not started. If one exists the message can
  // name a date, which is the whole reason she asked to be told.
  function nextCohortFor(workshopId: string): Cohort | null {
    const today = new Date().toISOString().slice(0, 10)
    return cohorts
      .filter(c => c.workshop_id === workshopId && c.is_active && c.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
  }

  function messageFor(r: Row): string {
    const title = titles[r.workshop_id] ?? 'הסדנה'
    const next = nextCohortFor(r.workshop_id)
    if (!next) {
      return `היי ${firstName(r.name)}, ביקשת שנעדכן אותך כשייפתח מחזור חדש של ${title}.`
    }
    const label = new Date(next.start_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
    return `היי ${firstName(r.name)}, ביקשת שנעדכן אותך כשייפתח מחזור חדש של ${title}. נפתח מחזור שמתחיל ב-${label}. רוצה שאשמור לך מקום?`
  }

  async function markNotified(r: Row) {
    const next = nextCohortFor(r.workshop_id)
    await supabase
      .from('workshop_waitlist')
      .update({ notified_at: new Date().toISOString(), notified_cohort_id: next?.id ?? null })
      .eq('id', r.id)
    setRows(prev => prev.filter(x => x.id !== r.id))
  }

  if (loading || rows.length === 0) return null

  return (
    <div className="bg-white rounded-3xl p-5" style={{ border: '1px solid #E9E2D6' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold flex items-center gap-1.5" style={{ fontSize: 16, color: '#443327' }}>
          <Bell className="w-4 h-4" style={{ color: '#C8A460' }} />
          ממתינות למחזור חדש
        </h2>
        <span className="font-bold" style={{ fontSize: 13, color: '#C8A460' }}>{rows.length}</span>
      </div>
      <p className="mb-3" style={{ fontSize: 12, color: '#A2937D' }}>
        ביקשו שנעדכן אותן כשייפתח מחזור. הכפתור פותח וואטסאפ עם ההודעה מוכנה.
      </p>

      <div className="space-y-3">
        {grouped.map(([workshopId, list]) => {
          const next = nextCohortFor(workshopId)
          return (
            <div key={workshopId}>
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => onOpenProduct?.(workshopId)}
                  className="font-bold text-right"
                  style={{ fontSize: 13, color: '#6E5836' }}
                >
                  {titles[workshopId] ?? 'מוצר'} · {list.length}
                </button>
                <span style={{ fontSize: 11, color: next ? '#7A8F63' : '#C08A5A' }}>
                  {next
                    ? `מחזור ב-${new Date(next.start_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`
                    : 'אין עדיין מחזור'}
                </span>
              </div>

              <div className="space-y-1.5">
                {list.map(r => {
                  const href = waHref(r.phone, messageFor(r))
                  return (
                    <div key={r.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: '#FBF8F3' }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ fontSize: 13, color: '#443327' }}>{r.name}</p>
                        <p style={{ fontSize: 11, color: '#A2937D' }} dir="ltr">
                          {r.phone || r.email || 'אין פרטי קשר'}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, color: '#BCAE99' }} className="flex-shrink-0">{agoHe(r.created_at)}</span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markNotified(r)}
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl font-bold text-white"
                          style={{ background: '#5C7A4A', fontSize: 12, padding: '6px 10px' }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          עדכני
                        </a>
                      ) : (
                        <button
                          onClick={() => markNotified(r)}
                          className="flex-shrink-0 rounded-xl font-semibold"
                          style={{ background: '#F0EAE0', color: '#6E5836', fontSize: 12, padding: '6px 10px' }}
                        >
                          סמן
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
