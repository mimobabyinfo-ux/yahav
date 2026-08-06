import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Megaphone, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase, type HomeAnnouncement } from '../../lib/supabase'
import ConfirmDialog from './ConfirmDialog'

// Admin manager for home-page announcements (מבצעים / הנחות / הודעות).
// Lives at the top of the perks tab. Each announcement renders as a
// prominent banner on the user dashboard (HomeAnnouncementsBanner):
// title + optional body/emoji, optional tap-through (store / benefits /
// community / external URL), optional date window, on/off toggle.

const EMPTY_FORM = { title: '', body: '', emoji: '', link_type: '', link_url: '', starts_at: '', ends_at: '' }

const LINK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'ללא קישור (תצוגה בלבד)' },
  { value: 'workshops', label: 'עמוד המוצרים' },
  { value: 'benefits', label: 'עמוד ההטבות' },
  { value: 'community', label: 'עמוד הקהילה' },
  { value: 'url', label: 'קישור חיצוני (URL)' },
]

function dateLabel(a: HomeAnnouncement): string | null {
  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${day}/${m}` }
  if (a.starts_at && a.ends_at) return `${fmt(a.starts_at)}–${fmt(a.ends_at)}`
  if (a.starts_at) return `מ־${fmt(a.starts_at)}`
  if (a.ends_at) return `עד ${fmt(a.ends_at)}`
  return null
}

export default function HomeAnnouncementsPanel() {
  const [items, setItems] = useState<HomeAnnouncement[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HomeAnnouncement | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HomeAnnouncement | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('home_announcements').select('*').order('display_order')
    setItems((data ?? []) as HomeAnnouncement[])
  }, [])
  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(a: HomeAnnouncement) {
    setEditing(a)
    setForm({
      title: a.title,
      body: a.body ?? '',
      emoji: a.emoji ?? '',
      link_type: a.link_type ?? '',
      link_url: a.link_url ?? '',
      starts_at: a.starts_at ?? '',
      ends_at: a.ends_at ?? '',
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  async function save() {
    if (!form.title.trim()) return
    if (form.link_type === 'url' && !form.link_url.trim()) { alert('לקישור חיצוני יש להזין URL') ; return }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      body: form.body.trim() || null,
      emoji: form.emoji.trim() || null,
      link_type: form.link_type || null,
      link_url: form.link_type === 'url' ? form.link_url.trim() : null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    }
    if (editing) {
      await supabase.from('home_announcements').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
    } else {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.display_order)) : 0
      await supabase.from('home_announcements').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setSaving(false)
    closeForm()
    load()
  }

  async function toggle(a: HomeAnnouncement) {
    await supabase.from('home_announcements').update({ is_active: !a.is_active }).eq('id', a.id)
    load()
  }

  async function move(a: HomeAnnouncement, dir: -1 | 1) {
    const idx = items.findIndex(i => i.id === a.id)
    const other = items[idx + dir]
    if (!other) return
    await Promise.all([
      supabase.from('home_announcements').update({ display_order: other.display_order }).eq('id', a.id),
      supabase.from('home_announcements').update({ display_order: a.display_order }).eq('id', other.id),
    ])
    load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('home_announcements').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-bold text-sand-800 text-sm flex items-center gap-1.5">
          <Megaphone className="w-4 h-4 text-mustard-600" />
          הודעות ומבצעים בדף הבית
        </p>
        <button onClick={openCreate} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-mustard-500 text-white hover:bg-mustard-600 transition-colors">
          <Plus className="w-3.5 h-3.5" /> חדש
        </button>
      </div>
      <p className="text-xs text-sand-500 -mt-1">
        באנרים בולטים שקופצים לאמהות בראש דף הבית — מבצע, הנחה, הודעה חשובה. אפשר להגביל בתאריכים ולכבות בכל רגע.
      </p>

      {showForm && (
        <div className="border-2 border-mustard-200 rounded-xl p-3 space-y-2.5 bg-mustard-50/40">
          <div className="flex gap-2">
            <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="אימוג'י" className="w-20 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm text-center" />
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת (למשל: 10% הנחה לסדנת מגלים!)" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          </div>
          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="טקסט נוסף (אופציונלי)" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div>
            <label className="text-xs text-sand-500 mb-1 block">לאן מוביל בלחיצה?</label>
            <select value={form.link_type} onChange={e => setForm(f => ({ ...f, link_type: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              {LINK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {form.link_type === 'url' && (
            <input value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://..." className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-sand-500 mb-1 block">מתאריך (אופציונלי)</label>
              <input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-sand-500 mb-1 block">עד תאריך (אופציונלי)</label>
              <input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: '#C8A460', color: '#33281B' }}>
              {saving ? '...' : editing ? 'שמירה' : 'יצירה'}
            </button>
            <button onClick={closeForm} className="px-4 py-2.5 rounded-xl bg-sand-100 text-sand-700 text-sm">ביטול</button>
          </div>
        </div>
      )}

      {items.length === 0 && !showForm ? (
        <p className="text-xs text-sand-400 text-center py-2">אין הודעות עדיין — לחצי על "חדש" ליצירת המבצע הראשון</p>
      ) : (
        <div className="space-y-2">
          {items.map((a, idx) => (
            <div key={a.id} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 ${a.is_active ? 'border-sand-200 bg-white' : 'border-sand-100 bg-sand-50 opacity-60'}`}>
              <div className="flex flex-col flex-shrink-0">
                <button onClick={() => move(a, -1)} disabled={idx === 0} className="text-sand-300 hover:text-sand-500 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => move(a, 1)} disabled={idx === items.length - 1} className="text-sand-300 hover:text-sand-500 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              {a.emoji && <span className="text-xl flex-shrink-0">{a.emoji}</span>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sand-800 truncate">{a.title}</p>
                <p className="text-[13px] text-sand-500 truncate">
                  {LINK_OPTIONS.find(o => o.value === (a.link_type ?? ''))?.label}
                  {dateLabel(a) && ` · ${dateLabel(a)}`}
                </p>
              </div>
              <button onClick={() => toggle(a)} className="flex-shrink-0" title={a.is_active ? 'פעיל — לחצי לכיבוי' : 'כבוי — לחצי להפעלה'}>
                {a.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5 text-sand-300" />}
              </button>
              <button onClick={() => openEdit(a)} className="p-1 text-sand-400 hover:text-mustard-500 flex-shrink-0"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => setPendingDelete(a)} className="p-1 text-sand-400 hover:text-red-500 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        itemName={pendingDelete?.title ?? ''}
        title="מחיקת הודעה"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
