import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * "שילמו ולא קיבלו גישה" — the screen nobody wants to need.
 *
 * A mother pays, and two independent paths open her account: the thank-you
 * page and the Morning webhook. If BOTH miss her, she has paid and has
 * nothing, and there is no complaint in the world louder than that. This
 * card is the third net: it lists exactly those women and fixes them with
 * one button.
 *
 * The view it reads (unclaimed_paid_leads) is scoped to products with
 * course content, so in-person workshops — where an app account was never
 * part of the deal — do not fill it with noise.
 *
 * Renders nothing when the list is empty, which should be always.
 */

type Row = {
  lead_id: string
  name: string | null
  email: string | null
  phone: string | null
  created_at: string
  workshop_title: string | null
  user_id: string | null
  problem: string | null
}

export default function UnclaimedPurchasesCard() {
  const [rows, setRows] = useState<Row[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('unclaimed_paid_leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('[unclaimed] load failed:', error); return }
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => { load() }, [load])

  async function fix(row: Row) {
    setBusyId(row.lead_id)
    setNote(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-course-purchase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: row.lead_id }),
        },
      )
      const out = await res.json().catch(() => null)
      if (!res.ok || !out?.ok) {
        setNote(`לא הצלחנו: ${out?.reason ?? res.status}`)
      } else if (out.email_sent) {
        setNote(`${row.name ?? 'היא'} קיבלה גישה ומייל יצא אליה 🤎`)
      } else {
        setNote(`${row.name ?? 'היא'} קיבלה גישה, אבל המייל לא יצא. כדאי לכתוב לה.`)
      }
      await load()
    } catch (e) {
      console.error('[unclaimed] fix threw:', e)
      setNote('התקשורת נכשלה. נסי שוב.')
    } finally {
      setBusyId(null)
    }
  }

  function wa(row: Row): string | null {
    const digits = row.phone?.replace(/\D/g, '')
    if (!digits) return null
    const intl = digits.startsWith('972') ? digits : '972' + digits.replace(/^0/, '')
    const msg = `היי ${row.name ?? ''}! ראיתי שהתשלום שלך עבר, ופתחתי לך את הגישה לקורס עכשיו. בדקי את המייל 🤎`
    return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
  }

  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl p-4" style={{ background: '#FDECEC', border: '1px solid #E8B4B4' }}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#A33D3D' }} />
        <h2 className="font-bold text-sm" style={{ color: '#A33D3D' }}>
          שילמו ולא קיבלו גישה ({rows.length})
        </h2>
        <button onClick={load} className="mr-auto p-1 rounded-lg" style={{ color: '#A33D3D' }} title="רענון">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] mb-3" style={{ color: '#8A5A5A' }}>
        התשלום נרשם, אבל החשבון או הגישה לא נפתחו. לחיצה אחת מסדרת.
      </p>

      {note && (
        <p className="text-[11px] mb-2 rounded-lg px-2.5 py-1.5 bg-white" style={{ color: '#6E5836' }}>
          {note}
        </p>
      )}

      <div className="space-y-2">
        {rows.map(r => {
          const link = wa(r)
          return (
            <div key={r.lead_id} className="bg-white rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-sand-800 truncate">{r.name || '(ללא שם)'}</p>
                  <p className="text-[11px] text-sand-400 truncate">{r.email || r.phone}</p>
                  <p className="text-[11px] text-sand-400 truncate">
                    {r.workshop_title} · {new Date(r.created_at).toLocaleDateString('he-IL')}
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                  style={{ color: '#A33D3D', background: '#FDECEC' }}>
                  {r.problem}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <button onClick={() => fix(r)} disabled={busyId === r.lead_id}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                  style={{ background: '#A33D3D' }}>
                  {busyId === r.lead_id ? '...' : 'פתחי גישה ושלחי מייל'}
                </button>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                    style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                    <MessageCircle className="w-3 h-3" /> וואטסאפ
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
