import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, X, Check } from 'lucide-react'
import { supabase, UserProfile, DailyTip, Video, HomeworkTask, Workshop, PartnerPerk, ContentCategory, GlobalSetting, PerkAnalytic } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'users' | 'tips' | 'categories' | 'videos' | 'workshops' | 'perks' | 'settings'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'users', label: 'משתמשים', emoji: '👥' },
  { id: 'tips', label: 'טיפים', emoji: '💡' },
  { id: 'categories', label: 'קטגוריות', emoji: '🗂️' },
  { id: 'videos', label: 'סרטונים', emoji: '🎬' },
  { id: 'workshops', label: 'סדנאות', emoji: '🛠️' },
  { id: 'perks', label: 'הטבות', emoji: '🎁' },
  { id: 'settings', label: 'הגדרות', emoji: '⚙️' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('tips')

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-sand-500">אין גישה לפאנל הניהול</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-24 relative" dir="rtl">
      <div className="max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">ניהול</h1>
          <p className="text-sand-400 text-sm">פאנל ניהול תוכן</p>
        </div>

        {/* Tab scroll */}
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                tab === t.id
                  ? 'bg-mustard-500 text-white shadow-md'
                  : 'bg-white text-sand-600 hover:bg-sand-50'
              }`}
            >
              <span>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'users' && <UsersTab />}
        {tab === 'tips' && <TipsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'videos' && <VideosTab />}
        {tab === 'workshops' && <WorkshopsTab />}
        {tab === 'perks' && <PerksTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([])
  useEffect(() => {
    supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setUsers(data ?? []))
  }, [])

  async function toggleRole(user: UserProfile, role: 'is_pro' | 'is_admin') {
    await supabase.from('user_profiles').update({ [role]: !user[role] }).eq('id', user.id)
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, [role]: !u[role] } : u))
  }

  return (
    <div className="space-y-2">
      {users.map(u => (
        <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{u.mother_name ?? u.email}</p>
              <p className="text-xs text-sand-400 truncate">{u.email}</p>
              {u.baby_name && <p className="text-xs text-sand-400">{u.baby_name}</p>}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => toggleRole(u, 'is_pro')}
                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${u.is_pro ? 'bg-mustard-100 text-mustard-700' : 'bg-sand-100 text-sand-400'}`}
              >
                Pro
              </button>
              <button
                onClick={() => toggleRole(u, 'is_admin')}
                className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${u.is_admin ? 'bg-red-100 text-red-600' : 'bg-sand-100 text-sand-400'}`}
              >
                Admin
              </button>
            </div>
          </div>
        </div>
      ))}
      {users.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין משתמשים</p>}
    </div>
  )
}

// ─── Tips Tab ────────────────────────────────────────────────────────────────
function TipsTab() {
  const [tips, setTips] = useState<DailyTip[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DailyTip | null>(null)
  const [text, setText] = useState('')

  const load = useCallback(() => {
    supabase.from('daily_tips').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setTips(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!text.trim()) return
    if (editing) {
      await supabase.from('daily_tips').update({ tip_text: text }).eq('id', editing.id)
    } else {
      await supabase.from('daily_tips').insert({ tip_text: text, is_active: true })
    }
    setText(''); setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('daily_tips').delete().eq('id', id); load()
  }

  async function toggle(tip: DailyTip) {
    await supabase.from('daily_tips').update({ is_active: !tip.is_active }).eq('id', tip.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setText('') }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        טיפ חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="כתוב טיפ יומי..."
            rows={3}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setText('') }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {tips.map(tip => (
        <div key={tip.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!tip.is_active ? 'opacity-50' : ''}`}>
          <p className="text-sm text-sand-700 leading-relaxed mb-2">{tip.tip_text}</p>
          <div className="flex items-center justify-between">
            <button onClick={() => toggle(tip)} className="text-sand-400 hover:text-mustard-500">
              {tip.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(tip); setText(tip.tip_text); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(tip.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const [cats, setCats] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ContentCategory | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', category_type: 'both' as ContentCategory['category_type'] })

  const load = useCallback(() => {
    supabase.from('content_categories').select('*').order('display_order')
      .then(({ data }) => setCats(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.name.trim()) return
    if (editing) {
      await supabase.from('content_categories').update(form).eq('id', editing.id)
    } else {
      const maxOrder = cats.length > 0 ? Math.max(...cats.map(c => c.display_order)) : 0
      await supabase.from('content_categories').insert({ ...form, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ name: '', slug: '', category_type: 'both' }); setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('content_categories').delete().eq('id', id); load()
  }

  async function toggle(cat: ContentCategory) {
    await supabase.from('content_categories').update({ is_active: !cat.is_active }).eq('id', cat.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', slug: '', category_type: 'both' }) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        קטגוריה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם הקטגוריה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="slug (אנגלית)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <select value={form.category_type} onChange={e => setForm(f => ({ ...f, category_type: e.target.value as ContentCategory['category_type'] }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
            <option value="video">סרטונים</option>
            <option value="workshop">סדנאות</option>
            <option value="both">שניהם</option>
          </select>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {cats.map(cat => (
        <div key={cat.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!cat.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sand-800 text-sm">{cat.name}</p>
              <p className="text-xs text-sand-400">{cat.slug} · {cat.category_type}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(cat)} className="text-sand-400 hover:text-mustard-500">
                {cat.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(cat); setForm({ name: cat.name, slug: cat.slug, category_type: cat.category_type }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(cat.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Videos Tab ───────────────────────────────────────────────────────────────
function VideosTab() {
  const [videos, setVideos] = useState<Video[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Video | null>(null)
  const [tasks, setTasks] = useState<HomeworkTask[]>([])
  const [newTask, setNewTask] = useState('')
  const [form, setForm] = useState({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })

  const load = useCallback(async () => {
    const [{ data: vids }, { data: cats }] = await Promise.all([
      supabase.from('videos').select('*').order('display_order'),
      supabase.from('content_categories').select('*').eq('is_active', true),
    ])
    setVideos(vids ?? [])
    setCategories(cats ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function loadTasks(videoId: string) {
    const { data } = await supabase.from('homework_tasks').select('*').eq('video_id', videoId).order('display_order')
    setTasks(data ?? [])
  }

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      video_url: form.video_url || null,
      thumbnail_url: form.thumbnail_url || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      category_id: form.category_id || null,
    }
    if (editing) {
      await supabase.from('videos').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = videos.length > 0 ? Math.max(...videos.map(v => v.display_order)) : 0
      await supabase.from('videos').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })
    setEditing(null); setShowForm(false); setTasks([]); load()
  }

  async function del(id: string) {
    await supabase.from('videos').delete().eq('id', id); load()
  }

  async function toggle(v: Video) {
    await supabase.from('videos').update({ is_active: !v.is_active }).eq('id', v.id); load()
  }

  async function addTask(videoId: string) {
    if (!newTask.trim()) return
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.display_order)) : 0
    await supabase.from('homework_tasks').insert({ video_id: videoId, task_description: newTask, display_order: maxOrder + 1 })
    setNewTask('')
    await loadTasks(videoId)
  }

  async function delTask(id: string, videoId: string) {
    await supabase.from('homework_tasks').delete().eq('id', id)
    await loadTasks(videoId)
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...videos]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('videos').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('videos').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setTasks([]) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סרטון חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור לסרטון" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <input value={form.thumbnail_url} onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value }))} placeholder="קישור לתמונה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <input value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="משך (דקות)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Homework tasks (only when editing) */}
          {editing && (
            <div>
              <p className="text-xs font-semibold text-sand-600 mb-2">משימות</p>
              {tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-sand-100 last:border-0">
                  <span className="text-xs text-sand-600 flex-1">{t.task_description}</span>
                  <button onClick={() => delTask(t.id, editing.id)} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="משימה חדשה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-500" onKeyDown={e => e.key === 'Enter' && addTask(editing.id)} />
                <button onClick={() => addTask(editing.id)} className="px-3 py-2 bg-mustard-100 text-mustard-700 rounded-xl"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setTasks([]) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {videos.map((v, idx) => (
        <div key={v.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!v.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{v.title}</p>
              {v.description && <p className="text-xs text-sand-400 truncate">{v.description}</p>}
              {v.duration_minutes && <p className="text-xs text-sand-400">{v.duration_minutes} דק'</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => toggle(v)} className="text-sand-400 hover:text-mustard-500">
                {v.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(v); setForm({ title: v.title, description: v.description ?? '', video_url: v.video_url ?? '', thumbnail_url: v.thumbnail_url ?? '', duration_minutes: v.duration_minutes?.toString() ?? '', category_id: v.category_id ?? '' }); setShowForm(false); loadTasks(v.id) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(v.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Workshops Tab ────────────────────────────────────────────────────────────
function WorkshopsTab() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [form, setForm] = useState({ title: '', description: '', price: '', payment_link: '', image_url: '', video_url: '' })

  const load = useCallback(() => {
    supabase.from('workshops').select('*').order('display_order')
      .then(({ data }) => setWorkshops(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      currency: 'ILS',
    }
    if (editing) {
      await supabase.from('workshops').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = workshops.length > 0 ? Math.max(...workshops.map(w => w.display_order)) : 0
      await supabase.from('workshops').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', price: '', payment_link: '', image_url: '', video_url: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('workshops').delete().eq('id', id); load()
  }

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סדנה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם הסדנה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר (₪)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="קישור רישום" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="קישור תמונה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {workshops.map(w => (
        <div key={w.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!w.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{w.title}</p>
              {w.price != null && <p className="text-xs text-mustard-600">₪{w.price}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(w)} className="text-sand-400 hover:text-mustard-500">
                {w.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(w); setForm({ title: w.title, description: w.description ?? '', price: w.price?.toString() ?? '', payment_link: w.payment_link ?? '', image_url: w.image_url ?? '', video_url: w.video_url ?? '' }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(w.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Perks Tab ────────────────────────────────────────────────────────────────
function PerksTab() {
  const [perks, setPerks] = useState<PartnerPerk[]>([])
  const [analytics, setAnalytics] = useState<PerkAnalytic[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PartnerPerk | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [form, setForm] = useState({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('partner_perks').select('*').order('display_order'),
      supabase.from('perk_analytics').select('*'),
    ])
    setPerks(p ?? [])
    setAnalytics(a ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.partner_name.trim()) return
    const payload = {
      partner_name: form.partner_name,
      short_description: form.short_description || null,
      full_description: form.full_description || null,
      discount_code: form.discount_code || null,
      action_link: form.action_link || null,
      logo_url: form.logo_url || null,
      is_featured: form.is_featured,
    }
    if (editing) {
      await supabase.from('partner_perks').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = perks.length > 0 ? Math.max(...perks.map(p => p.display_order)) : 0
      await supabase.from('partner_perks').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('partner_perks').delete().eq('id', id); load()
  }

  async function toggle(p: PartnerPerk, field: 'is_active' | 'is_featured') {
    await supabase.from('partner_perks').update({ [field]: !p[field] }).eq('id', p.id); load()
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...perks]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('partner_perks').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('partner_perks').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  function perkStats(perkId: string) {
    const pa = analytics.filter(a => a.perk_id === perkId)
    return {
      views: pa.filter(a => a.action_type === 'view').length,
      copies: pa.filter(a => a.action_type === 'copy_code').length,
      visits: pa.filter(a => a.action_type === 'visit_link').length,
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => { setShowForm(true); setEditing(null) }} className="flex-1 flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors">
          <Plus className="w-4 h-4" />
          הטבה חדשה
        </button>
        <button onClick={() => setShowAnalytics(!showAnalytics)} className={`px-4 py-3 rounded-2xl font-semibold text-sm transition-colors ${showAnalytics ? 'bg-sand-200 text-sand-700' : 'bg-white text-sand-600 shadow-sm'}`}>
          📊
        </button>
      </div>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} placeholder="שם השותף" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} placeholder="תיאור קצר" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.full_description} onChange={e => setForm(f => ({ ...f, full_description: e.target.value }))} placeholder="תיאור מלא" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.discount_code} onChange={e => setForm(f => ({ ...f, discount_code: e.target.value }))} placeholder="קוד הנחה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
            <input value={form.action_link} onChange={e => setForm(f => ({ ...f, action_link: e.target.value }))} placeholder="קישור לאתר" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="קישור ללוגו" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <label className="flex items-center gap-2 text-sm text-sand-600 cursor-pointer">
            <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="rounded" />
            מוצג בדף הבית
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {perks.map((p, idx) => {
        const stats = perkStats(p.id)
        return (
          <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!p.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sand-800 text-sm truncate">{p.partner_name}</p>
                  {p.is_featured && <span className="text-xs bg-mustard-100 text-mustard-600 px-1.5 py-0.5 rounded-lg">מוצג</span>}
                </div>
                {p.discount_code && <p className="text-xs text-sand-400">{p.discount_code}</p>}
                {showAnalytics && (
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-sand-400">👁 {stats.views}</span>
                    <span className="text-xs text-sand-400">📋 {stats.copies}</span>
                    <span className="text-xs text-sand-400">🔗 {stats.visits}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggle(p, 'is_featured')} className={`p-1.5 ${p.is_featured ? 'text-mustard-500' : 'text-sand-300'}`}>⭐</button>
                <button onClick={() => toggle(p, 'is_active')} className="text-sand-400 hover:text-mustard-500">
                  {p.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => { setEditing(p); setForm({ partner_name: p.partner_name, short_description: p.short_description ?? '', full_description: p.full_description ?? '', discount_code: p.discount_code ?? '', action_link: p.action_link ?? '', logo_url: p.logo_url ?? '', is_featured: p.is_featured }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(p.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState<GlobalSetting[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GlobalSetting | null>(null)
  const [form, setForm] = useState({ setting_key: '', setting_value: '', setting_type: 'text' as GlobalSetting['setting_type'], category: '', description: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    supabase.from('global_settings').select('*').order('category').order('setting_key')
      .then(({ data }) => setSettings(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function saveNew() {
    if (!form.setting_key.trim()) return
    if (editing) {
      await supabase.from('global_settings').update({ setting_value: form.setting_value, description: form.description || null }).eq('id', editing.id)
    } else {
      await supabase.from('global_settings').insert({ ...form, description: form.description || null, category: form.category || null })
    }
    setForm({ setting_key: '', setting_value: '', setting_type: 'text', category: '', description: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function saveInline(setting: GlobalSetting) {
    setSaving(setting.id)
    const value = editValues[setting.id] ?? setting.setting_value ?? ''
    await supabase.from('global_settings').update({ setting_value: value }).eq('id', setting.id)
    setSaving(null)
    load()
  }

  async function del(id: string) {
    await supabase.from('global_settings').delete().eq('id', id); load()
  }

  const grouped = settings.reduce((acc, s) => {
    const cat = s.category ?? 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {} as Record<string, GlobalSetting[]>)

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        הגדרה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {!editing && <input value={form.setting_key} onChange={e => setForm(f => ({ ...f, setting_key: e.target.value }))} placeholder="מפתח (key)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />}
          <input value={form.setting_value} onChange={e => setForm(f => ({ ...f, setting_value: e.target.value }))} placeholder="ערך" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          {!editing && (
            <div className="flex gap-2">
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="קטגוריה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
              <select value={form.setting_type} onChange={e => setForm(f => ({ ...f, setting_type: e.target.value as GlobalSetting['setting_type'] }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
                <option value="text">טקסט</option>
                <option value="number">מספר</option>
                <option value="boolean">כן/לא</option>
                <option value="url">קישור</option>
                <option value="json">JSON</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={saveNew} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-sand-400 mb-2 px-1">{cat}</p>
          {items.map(s => (
            <div key={s.id} className="bg-white rounded-2xl p-3 shadow-sm mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-sand-400">{s.setting_key}</p>
                  {s.description && <p className="text-xs text-sand-500">{s.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      value={editValues[s.id] ?? s.setting_value ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="flex-1 px-2 py-1 border border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                    />
                    <button onClick={() => saveInline(s)} className={`p-1 rounded-lg transition-colors ${saving === s.id ? 'text-mustard-300' : 'text-mustard-500 hover:bg-mustard-50'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => del(s.id)} className="p-1.5 text-sand-300 hover:text-red-400 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
