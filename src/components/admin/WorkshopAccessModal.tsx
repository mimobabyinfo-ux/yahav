import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Search, MessageCircle } from 'lucide-react'
import { supabase, Workshop } from '../../lib/supabase'
import ConfirmDialog from './ConfirmDialog'

/**
 * "מי עם גישה" — access control for ONE product.
 *
 * The per-user modal (Users tab → a mother → הענקת גישה) already grants,
 * extends and revokes, and it always covered every active product. What it
 * cannot answer is the question you actually ask before a launch: who has
 * access to *this* course right now. That needs the product as the entry
 * point, which is what this is.
 *
 * purchased_workshops.user_id points at auth.users, not user_profiles, so
 * PostgREST cannot embed the profile — names are fetched in a second query
 * and joined here.
 */

type AccessRow = {
  id: string
  user_id: string
  purchase_date: string
  amount_paid: number | null
  access_start_date: string | null
  access_end_date: string | null
  notes: string | null
}

type Person = { id: string; mother_name: string | null; email: string | null; phone_number: string | null }

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const he = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('he-IL')

function status(r: AccessRow, today: string): { label: string; color: string; bg: string } {
  if (!r.access_start_date || !r.access_end_date) return { label: 'ללא תאריכים', color: '#7B604C', bg: '#F0EBE3' }
  if (r.access_end_date < today) return { label: 'הסתיימה', color: '#8A5A5A', bg: '#F5E6E6' }
  if (r.access_start_date > today) return { label: 'עתידית', color: '#3E5966', bg: '#E4EBEF' }
  return { label: 'פעילה', color: '#2E7D32', bg: '#E8F5E9' }
}

export default function WorkshopAccessModal({ workshop, onClose }: { workshop: Workshop; onClose: () => void }) {
  const today = iso(new Date())
  const [rows, setRows] = useState<AccessRow[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(iso(new Date(Date.now() + 365 * 864e5)))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEnd, setEditEnd] = useState('')
  const [pendingRevoke, setPendingRevoke] = useState<AccessRow | null>(null)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: acc }, { data: profs }] = await Promise.all([
      supabase.from('purchased_workshops')
        .select('id, user_id, purchase_date, amount_paid, access_start_date, access_end_date, notes')
        .eq('workshop_id', workshop.id)
        .order('purchase_date', { ascending: false }),
      supabase.from('user_profiles').select('id, mother_name, email, phone_number'),
    ])
    setRows((acc ?? []) as AccessRow[])
    setPeople(new Map(((profs ?? []) as Person[]).map(p => [p.id, p])))
    setLoading(false)
  }, [workshop.id])
  useEffect(() => { load() }, [load])

  const activeCount = rows.filter(r => status(r, today).label === 'פעילה').length

  // Everyone who does not already have a row for this product.
  const candidates = useMemo(() => {
    const taken = new Set(rows.map(r => r.user_id))
    const q = query.trim().toLowerCase()
    return [...people.values()]
      .filter(p => !taken.has(p.id))
      .filter(p => !q || [p.mother_name, p.email, p.phone_number].some(v => v?.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [people, rows, query])

  async function grant() {
    if (!pickedId || !startDate || !endDate) return
    if (endDate < startDate) { setErr('תאריך הסיום מוקדם מתאריך ההתחלה'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('purchased_workshops').upsert({
      user_id: pickedId,
      workshop_id: workshop.id,
      purchase_date: startDate,
      access_start_date: startDate,
      access_end_date: endDate,
    }, { onConflict: 'user_id,workshop_id' })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowAdd(false); setPickedId(''); setQuery('')
    load()
  }

  async function extend(r: AccessRow) {
    const { error } = await supabase.from('purchased_workshops')
      .update({ access_end_date: editEnd }).eq('id', r.id)
    if (error) { setErr(error.message); return }
    setEditingId(null)
    load()
  }

  async function revoke() {
    if (!pendingRevoke) return
    setRevoking(true)
    const { error } = await supabase.from('purchased_workshops').delete().eq('id', pendingRevoke.id)
    setRevoking(false)
    setPendingRevoke(null)
    if (error) { setErr(error.message); return }
    load()
  }

  function waLink(p: Person | undefined): string | null {
    const digits = p?.phone_number?.replace(/\D/g, '')
    if (!digits) return null
    const intl = digits.startsWith('972') ? digits : '972' + digits.replace(/^0/, '')
    const msg = `היי ${p?.mother_name ?? ''}! 🎉\nהגישה שלך ל${workshop.title} פעילה כעת.\nהיכנסי לאפליקציית Mimo — התכנים שלך במסך הבית 🌸`
    return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b border-sand-100 sticky top-0 bg-white rounded-t-3xl z-10 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-sand-800">מי עם גישה</h3>
            <p className="text-xs text-sand-400 mt-0.5 truncate">{workshop.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-sand-100 text-sand-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold px-2.5 py-1 rounded-xl" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
              {activeCount} פעילות
            </span>
            <span className="font-bold px-2.5 py-1 rounded-xl bg-sand-100 text-sand-600">
              {rows.length} סה״כ
            </span>
          </div>

          {err && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{err}</p>
          )}

          {!showAdd ? (
            <button onClick={() => { setShowAdd(true); setErr(null) }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold text-white"
              style={{ background: '#E7C78A' }}>
              <Plus className="w-4 h-4" /> פתיחת גישה לאמא
            </button>
          ) : (
            <div className="bg-sand-50 rounded-2xl p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-sand-400 absolute top-3 right-3" />
                <input value={query} onChange={e => { setQuery(e.target.value); setPickedId('') }}
                  placeholder="חיפוש לפי שם, מייל או טלפון"
                  className="w-full pr-9 pl-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
              </div>

              <div className="space-y-1 max-h-44 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="text-xs text-sand-400 text-center py-3">
                    {query ? 'לא נמצאה אמא מתאימה' : 'לכל המשתמשות כבר יש שורה למוצר הזה'}
                  </p>
                ) : candidates.map(p => (
                  <button key={p.id} onClick={() => setPickedId(p.id)}
                    className={`w-full text-right px-3 py-2 rounded-xl border-2 transition-colors ${
                      pickedId === p.id ? 'border-mustard-400 bg-mustard-50' : 'border-transparent bg-white hover:bg-sand-100'
                    }`}>
                    <span className="block text-sm font-semibold text-sand-800">{p.mother_name || '(ללא שם)'}</span>
                    <span className="block text-[11px] text-sand-400 truncate">{p.email || p.phone_number || ''}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-bold text-sand-600">מתאריך</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full px-2 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-sand-600">עד תאריך</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="w-full px-2 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400" />
                </label>
              </div>

              <div className="flex gap-2">
                <button onClick={grant} disabled={saving || !pickedId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: '#E7C78A' }}>
                  {saving ? '...' : 'פתח גישה'}
                </button>
                <button onClick={() => { setShowAdd(false); setPickedId(''); setQuery(''); setErr(null) }}
                  className="px-4 py-2.5 rounded-xl text-sm bg-sand-100 text-sand-600">ביטול</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sand-400 text-sm py-8">עדיין אין לאף אחת גישה למוצר הזה</p>
          ) : rows.map(r => {
            const p = people.get(r.user_id)
            const st = status(r, today)
            const wa = waLink(p)
            return (
              <div key={r.id} className="bg-white border border-sand-100 rounded-2xl p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-sand-800 truncate">{p?.mother_name || '(ללא שם)'}</p>
                    <p className="text-[11px] text-sand-400 truncate">{p?.email || p?.phone_number || r.user_id}</p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                    style={{ color: st.color, background: st.bg }}>{st.label}</span>
                </div>

                <p className="text-[11px] text-sand-500">
                  {r.access_start_date && r.access_end_date
                    ? `${he(r.access_start_date)} — ${he(r.access_end_date)}`
                    : 'ללא חלון גישה'}
                  {r.amount_paid != null && ` · ₪${r.amount_paid}`}
                </p>
                {r.notes && <p className="text-[11px] text-sand-400">{r.notes}</p>}

                {editingId === r.id ? (
                  <div className="flex gap-2">
                    <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      className="flex-1 px-2 py-1.5 border-2 border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400" />
                    <button onClick={() => extend(r)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#E7C78A' }}>שמור</button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-sand-100 text-sand-600">ביטול</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setEditingId(r.id); setEditEnd(r.access_end_date ?? today) }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#F6ECD8] text-[#6E5836]">
                      שינוי תאריך סיום
                    </button>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                        style={{ background: '#E8F5E9', color: '#2E7D32' }}>
                        <MessageCircle className="w-3 h-3" /> עדכון בוואטסאפ
                      </a>
                    )}
                    <button onClick={() => setPendingRevoke(r)}
                      className="mr-auto p-1.5 text-red-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingRevoke}
        itemName={people.get(pendingRevoke?.user_id ?? '')?.mother_name ?? 'הגישה'}
        title="ביטול גישה"
        busy={revoking}
        onConfirm={revoke}
        onClose={() => setPendingRevoke(null)}
      />
    </div>
  )
}
