import { useCallback, useEffect, useState } from 'react'
import { X, Plus, Pencil, Trash2, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type WorkshopCategory } from '../../hooks/useWorkshopCategories'

// Admin manager for store categories (content_categories, type
// 'workshop'). These names ARE the workshops.workshop_type values and
// they drive both the admin dropdown and the moms' store chips —
// so rename cascades to every product carrying the old name, and
// delete clears it (the product becomes digital-only / uncategorized).

type Props = {
  onClose: () => void
  /** Called after any change so the parent can refresh its own lists. */
  onChanged: () => void
}

export default function CategoryManagerModal({ onClose, onChanged }: Props) {
  const [cats, setCats] = useState<WorkshopCategory[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: c }, { data: ws }] = await Promise.all([
      supabase.from('content_categories')
        .select('id, name, icon, display_order, is_active')
        .in('category_type', ['workshop', 'both'])
        .eq('is_active', true)
        .order('display_order'),
      supabase.from('workshops').select('workshop_type'),
    ])
    setCats((c ?? []) as WorkshopCategory[])
    const counter: Record<string, number> = {}
    for (const w of (ws ?? []) as { workshop_type: string | null }[]) {
      if (w.workshop_type) counter[w.workshop_type] = (counter[w.workshop_type] ?? 0) + 1
    }
    setCounts(counter)
  }, [])
  useEffect(() => { load() }, [load])

  function changed() { load(); onChanged() }

  async function addCategory() {
    const name = newName.trim()
    if (!name || busy) return
    if (cats.some(c => c.name === name)) return
    setBusy(true)
    const maxOrder = cats.length ? Math.max(...cats.map(c => c.display_order)) : 0
    await supabase.from('content_categories').insert({
      name,
      slug: `store-${Date.now()}`,
      icon: newEmoji.trim() || null,
      category_type: 'workshop',
      display_order: maxOrder + 1,
      is_active: true,
    })
    setNewName(''); setNewEmoji('')
    setBusy(false)
    changed()
  }

  function startEdit(c: WorkshopCategory) {
    setEditingId(c.id); setEditName(c.name); setEditEmoji(c.icon ?? ''); setConfirmDeleteId(null)
  }

  async function saveEdit(c: WorkshopCategory) {
    const name = editName.trim()
    if (!name || busy) return
    setBusy(true)
    await supabase.from('content_categories')
      .update({ name, icon: editEmoji.trim() || null })
      .eq('id', c.id)
    if (name !== c.name) {
      // Cascade the rename to every product carrying the old name.
      await supabase.from('workshops').update({ workshop_type: name }).eq('workshop_type', c.name)
    }
    setEditingId(null)
    setBusy(false)
    changed()
  }

  async function remove(c: WorkshopCategory) {
    if (busy) return
    setBusy(true)
    const n = counts[c.name] ?? 0
    if (n > 0) {
      await supabase.from('workshops').update({ workshop_type: null }).eq('workshop_type', c.name)
    }
    await supabase.from('content_categories').delete().eq('id', c.id)
    setConfirmDeleteId(null)
    setBusy(false)
    changed()
  }

  async function move(idx: number, dir: -1 | 1) {
    const other = idx + dir
    if (other < 0 || other >= cats.length || busy) return
    const a = cats[idx], b = cats[other]
    await Promise.all([
      supabase.from('content_categories').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('content_categories').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    changed()
  }

  const inputCls = 'px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-sand-100 flex items-center justify-between rounded-t-3xl">
          <div>
            <h3 className="font-bold text-sand-800">ניהול קטגוריות החנות</h3>
            <p className="text-[11px] text-sand-400">הקטגוריות האלה מוצגות גם לאמהות בחנות</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-sand-400" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* Add new */}
          <div className="flex gap-2">
            <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="🧸" className={`${inputCls} w-16 text-center`} />
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCategory() }} placeholder="קטגוריה חדשה..." className={`${inputCls} flex-1`} />
            <button onClick={addCategory} disabled={busy || !newName.trim()} className="px-3 py-2 rounded-xl text-white disabled:opacity-40" style={{ background: '#E7C78A' }}>
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Existing */}
          {cats.map((c, idx) => (
            <div key={c.id} className="border border-sand-100 rounded-2xl p-3">
              {editingId === c.id ? (
                <div className="flex gap-2 items-center">
                  <input value={editEmoji} onChange={e => setEditEmoji(e.target.value)} className={`${inputCls} w-14 text-center`} />
                  <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(c) }} className={`${inputCls} flex-1`} />
                  <button onClick={() => saveEdit(c)} disabled={busy} className="p-2 rounded-xl bg-green-50 text-green-600" title="שמירה"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingId(null)} className="p-2 rounded-xl text-sand-400" title="ביטול"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-sand-300 disabled:opacity-20 hover:text-sand-500"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => move(idx, 1)} disabled={idx === cats.length - 1} className="text-sand-300 disabled:opacity-20 hover:text-sand-500"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-sand-800">{c.icon ? `${c.icon} ` : ''}{c.name}</p>
                    <p className="text-[11px] text-sand-400">{counts[c.name] ?? 0} מוצרים</p>
                  </div>
                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-red-500 font-semibold">
                        {(counts[c.name] ?? 0) > 0 ? `${counts[c.name]} מוצרים יישארו ללא קטגוריה —` : ''} למחוק?
                      </span>
                      <button onClick={() => remove(c)} disabled={busy} className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold">כן</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2.5 py-1.5 rounded-xl bg-sand-50 text-sand-500 text-xs font-bold">לא</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)} className="p-2 rounded-xl text-sand-400 hover:text-mustard-600 hover:bg-mustard-50" title="עריכה"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setConfirmDeleteId(c.id)} className="p-2 rounded-xl text-sand-300 hover:text-red-500 hover:bg-red-50" title="מחיקה"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {cats.length === 0 && <p className="text-center text-sand-400 text-sm py-6">אין קטגוריות — הוסיפי את הראשונה למעלה</p>}

          <p className="text-[11px] text-sand-400 leading-relaxed">
            💡 שינוי שם מעדכן אוטומטית את כל המוצרים בקטגוריה. מחיקה מעבירה את המוצרים שלה ל"סדנה דיגיטלית" (לא מוצגים בחנות עד שתבחרי להם קטגוריה חדשה).
          </p>
        </div>
      </div>
    </div>
  )
}
