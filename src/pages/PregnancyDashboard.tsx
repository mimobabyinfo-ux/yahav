import { useState, useEffect, useCallback } from 'react'
import {
  LogOut, Sparkles, CheckCircle2, Circle, ShoppingBag, Stethoscope,
  ChevronDown, ChevronUp, Plus, Trash2, Bell, X, Pencil, Check,
  Settings as SettingsIcon,
} from 'lucide-react'
import { supabase, PregnancyChecklistItem, PregnancyWeeklyGuide, UserPregnancyItem, UserReminder } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MyTasksPanel from '../components/MyTasksPanel'
import { formatDate } from '../utils/dateUtils'
import type { Page } from '../App'

type Props = { onNavigate: (page: Page) => void }
type DashTab = 'medical' | 'buying' | 'reminders'

// ── helpers ──────────────────────────────────────────────────────────────────
function pregnancyWeek(dueDate: string): number {
  const daysLeft = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000)
  return Math.max(1, Math.min(42, Math.floor((280 - daysLeft) / 7)))
}
function daysUntilDue(dueDate: string): number {
  return Math.max(0, Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000))
}
function groupByWeek(items: PregnancyChecklistItem[]) {
  const buckets: { label: string; key: string; items: PregnancyChecklistItem[] }[] = []
  const seen = new Set<string>()
  items.forEach(item => {
    const key = `${item.week_from ?? 0}-${item.week_to ?? 42}`
    if (!seen.has(key)) {
      seen.add(key)
      const label = item.week_from && item.week_to
        ? `שבוע ${item.week_from}–${item.week_to}`
        : item.week_from ? `מסביב לשבוע ${item.week_from}` : 'כללי'
      buckets.push({ label, key, items: [] })
    }
    buckets.find(b => b.key === key)!.items.push(item)
  })
  return buckets.sort((a, b) => parseInt(a.key) - parseInt(b.key))
}

// ── Reminder helpers (localStorage-based) ────────────────────────────────────
function reminderDue(key: string, intervalHours: number): boolean {
  const last = localStorage.getItem(key)
  if (!last) return true
  return Date.now() - new Date(last).getTime() > intervalHours * 3600000
}
function dismissReminder(key: string) {
  localStorage.setItem(key, new Date().toISOString())
}
function timeIsDue(timeStr: string | null): boolean {
  if (!timeStr) return false
  const key = `reminder_time_${timeStr}`
  const last = localStorage.getItem(key)
  const [h, m] = timeStr.split(':').map(Number)
  const now = new Date()
  const target = new Date(); target.setHours(h, m, 0, 0)
  if (now < target) return false // hasn't reached the time today
  // Check if dismissed today
  if (last) {
    const lastDate = new Date(last)
    if (lastDate.toDateString() === now.toDateString()) return false
  }
  return true
}
function dismissTimeReminder(timeStr: string) {
  localStorage.setItem(`reminder_time_${timeStr}`, new Date().toISOString())
}

// ── Week Guide Card ───────────────────────────────────────────────────────────
function WeekGuideCard({ guide, week }: { guide: PregnancyWeeklyGuide; week: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
      <button
        className="w-full p-4 flex items-center gap-3 text-right"
        onClick={() => setOpen(v => !v)}
      >
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' }}>
          {guide.baby_size_emoji ?? '🤰'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-purple-600">מדריך שבוע {week}</p>
          <p className="font-bold text-sand-800 text-sm mt-0.5">
            {guide.baby_size ?? `שבוע ${week} בהריון`}
          </p>
          {!open && (
            <p className="text-xs text-sand-400 mt-0.5 truncate">{guide.development?.slice(0, 50)}...</p>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-sand-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-sand-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-sand-100 p-4 space-y-3">
          {guide.image_url && (
            <img src={guide.image_url} alt={`שבוע ${week}`} className="w-full h-36 object-cover rounded-2xl" />
          )}
          {guide.development && (
            <div className="bg-purple-50 rounded-2xl p-3">
              <p className="text-xs font-bold text-purple-700 mb-1">🍼 התפתחות</p>
              <p className="text-sm text-sand-700 leading-relaxed">{guide.development}</p>
            </div>
          )}
          {guide.symptoms && (
            <div className="bg-mustard-50 rounded-2xl p-3">
              <p className="text-xs font-bold text-mustard-700 mb-1">💛 סימפטומים שכדאי להכיר</p>
              <p className="text-sm text-sand-700 leading-relaxed">{guide.symptoms}</p>
            </div>
          )}
          {guide.fun_fact && (
            <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100">
              <p className="text-xs font-bold text-amber-700 mb-1">💡 ידעת?</p>
              <p className="text-sm text-sand-700 leading-relaxed">{guide.fun_fact}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Reminder Banner ───────────────────────────────────────────────────────────
function ReminderBanner({ emoji, text, onDismiss }: { emoji: string; text: string; onDismiss: () => void }) {
  return (
    <div className="rounded-2xl p-3 flex items-center gap-3 animate-pulse-once"
      style={{ background: 'linear-gradient(135deg, #FFF7ED, #FFFBEB)', border: '1px solid #F3C96C' }}>
      <span className="text-2xl flex-shrink-0">{emoji}</span>
      <p className="flex-1 text-sm font-semibold text-sand-800">{text}</p>
      <button onClick={onDismiss} className="text-sand-300 hover:text-sand-500 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Custom Reminders Panel ────────────────────────────────────────────────────
function CustomRemindersPanel() {
  const { user } = useAuth()
  const [reminders, setReminders] = useState<UserReminder[]>([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('🔔')
  const [newTime, setNewTime] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('user_reminders').select('*').eq('user_id', user.id).order('created_at')
    setReminders((data ?? []) as UserReminder[])
  }, [user])

  useEffect(() => { load() }, [load])

  async function toggle(r: UserReminder) {
    await supabase.from('user_reminders').update({ is_enabled: !r.is_enabled }).eq('id', r.id)
    setReminders(prev => prev.map(x => x.id === r.id ? { ...x, is_enabled: !x.is_enabled } : x))
  }

  async function del(id: string) {
    await supabase.from('user_reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(x => x.id !== id))
  }

  async function add() {
    if (!user || !newLabel.trim()) return
    setSaving(true)
    const { data } = await supabase.from('user_reminders').insert({
      user_id: user.id,
      label: newLabel.trim(),
      emoji: newEmoji || '🔔',
      time_of_day: newTime || null,
      is_enabled: true,
    }).select().single()
    if (data) setReminders(prev => [...prev, data as UserReminder])
    setNewLabel(''); setNewEmoji('🔔'); setNewTime('')
    setAdding(false)
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {reminders.length === 0 && !adding && (
        <div className="bg-[#F5F1EB] rounded-3xl p-8 text-center shadow-sm">
          <p className="text-3xl mb-2">🔔</p>
          <p className="font-semibold text-sand-700 text-sm">אין תזכורות עדיין</p>
          <p className="text-xs text-sand-400 mt-1">הוסיפי תזכורות אישיות להריון</p>
        </div>
      )}

      {reminders.map(r => (
        <div key={r.id} className="bg-[#F5F1EB] rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{r.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sand-800 text-sm">{r.label}</p>
            {r.time_of_day && <p className="text-xs text-sand-400">{r.time_of_day}</p>}
          </div>
          <button
            onClick={() => toggle(r)}
            className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${r.is_enabled ? 'bg-mustard-500' : 'bg-sand-200'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${r.is_enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
          <button onClick={() => del(r.id)} className="text-sand-200 hover:text-red-400 flex-shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex gap-2">
            <input
              value={newEmoji} onChange={e => setNewEmoji(e.target.value)}
              placeholder="🔔" maxLength={2}
              className="w-16 px-3 py-3 border-2 border-sand-200 rounded-2xl text-center text-lg focus:outline-none focus:border-mustard-400"
            />
            <input
              value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="תיאור התזכורת..."
              className="flex-1 px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">שעת תזכורת (אופציונלי)</label>
            <input
              type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={add} disabled={saving || !newLabel.trim()}
              className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: '#E7C78A' }}>
              {saving ? '...' : 'הוסיפי'}
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-mustard-200 text-mustard-600 text-sm font-semibold hover:bg-mustard-50 transition-colors">
          <Plus className="w-4 h-4" /> הוסיפי תזכורת אישית
        </button>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PregnancyDashboard({ onNavigate }: Props) {
  const { profile, signOut, refreshProfile, refreshChildren, user } = useAuth()
  const [dashTab, setDashTab] = useState<DashTab>('medical')

  // Checklist data
  const [medicalItems, setMedicalItems] = useState<PregnancyChecklistItem[]>([])
  const [buyingItems, setBuyingItems] = useState<PregnancyChecklistItem[]>([])
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())

  // Personal items
  const [personalItems, setPersonalItems] = useState<UserPregnancyItem[]>([])
  const [addingPersonal, setAddingPersonal] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [newItemWeekFrom, setNewItemWeekFrom] = useState('')
  const [newItemWeekTo, setNewItemWeekTo] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editWeekFrom, setEditWeekFrom] = useState('')
  const [editWeekTo, setEditWeekTo] = useState('')

  // Weekly guide
  const [guide, setGuide] = useState<PregnancyWeeklyGuide | null>(null)

  // Active reminders (shown as banners)
  const [reminders, setReminders] = useState<{ key: string; emoji: string; text: string }[]>([])

  // Graduation
  const [graduating, setGraduating] = useState(false)
  const [babyName, setBabyName] = useState('')
  const [babyDob, setBabyDob] = useState(formatDate(new Date()))
  const [babyGender, setBabyGender] = useState<'girl' | 'boy' | 'other'>('girl')
  const [saving, setSaving] = useState(false)

  const week = profile?.due_date ? pregnancyWeek(profile.due_date) : null
  const daysLeft = profile?.due_date ? daysUntilDue(profile.due_date) : null

  // Load master items
  useEffect(() => {
    supabase.from('pregnancy_checklist_items').select('*').eq('is_active', true).order('display_order')
      .then(({ data }) => {
        const all = (data ?? []) as PregnancyChecklistItem[]
        setMedicalItems(all.filter(i => i.category === 'medical'))
        setBuyingItems(all.filter(i => i.category === 'buying'))
        const firstKey = groupByWeek(all.filter(i => i.category === 'medical'))[0]?.key
        if (firstKey) setExpandedBuckets(new Set([firstKey]))
      })
  }, [])

  // Load completions + hidden items from profile
  useEffect(() => {
    if (!user) return
    supabase.from('user_profiles').select('pregnancy_task_completions, hidden_pregnancy_items').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.pregnancy_task_completions)
          setCompleted(new Set(data.pregnancy_task_completions as string[]))
        if (data?.hidden_pregnancy_items)
          setHidden(new Set(data.hidden_pregnancy_items as string[]))
      })
  }, [user])

  // Load personal items
  const loadPersonal = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('user_pregnancy_items').select('*').eq('user_id', user.id).order('created_at')
    setPersonalItems((data ?? []) as UserPregnancyItem[])
  }, [user])
  useEffect(() => { loadPersonal() }, [loadPersonal])

  // Load weekly guide for current week
  useEffect(() => {
    if (!week) return
    // Find closest week that has content (search within ±2 weeks)
    supabase.from('pregnancy_weekly_guide').select('*').eq('is_active', true)
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const guides = data as PregnancyWeeklyGuide[]
        const exact = guides.find(g => g.week === week)
        if (exact) { setGuide(exact); return }
        // Find closest
        const closest = guides.reduce((prev, curr) =>
          Math.abs(curr.week - week!) < Math.abs(prev.week - week!) ? curr : prev
        )
        if (Math.abs(closest.week - week) <= 4) setGuide(closest)
      })
  }, [week])

  // Check reminders on mount
  useEffect(() => {
    if (!profile) return
    const active: { key: string; emoji: string; text: string }[] = []
    if (profile.reminder_water_enabled && reminderDue('reminder_water', profile.reminder_water_hours))
      active.push({ key: 'reminder_water', emoji: '💧', text: 'זמן לשתות מים! שתייה מספקת חשובה מאוד בהריון' })
    if (profile.reminder_vitamins_enabled && timeIsDue(profile.reminder_vitamins_time))
      active.push({ key: `reminder_time_${profile.reminder_vitamins_time}`, emoji: '💊', text: `זמן לויטמינים / תרופות (${profile.reminder_vitamins_time})` })
    if (profile.reminder_exercise_enabled && timeIsDue(profile.reminder_exercise_time))
      active.push({ key: `reminder_time_${profile.reminder_exercise_time}`, emoji: '🧘', text: `זמן לתרגיל יומי (${profile.reminder_exercise_time})` })
    setReminders(active)
  }, [profile])

  function dismissReminderBanner(key: string, isTime: boolean, timeStr?: string) {
    if (isTime && timeStr) dismissTimeReminder(timeStr)
    else dismissReminder(key)
    setReminders(prev => prev.filter(r => r.key !== key))
  }

  async function toggleItem(itemId: string) {
    if (!user) return
    const next = new Set(completed)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setCompleted(next)
    await supabase.from('user_profiles').update({ pregnancy_task_completions: Array.from(next) }).eq('id', user.id)
  }

  async function hideItem(itemId: string) {
    if (!user) return
    const next = new Set(hidden)
    next.add(itemId)
    setHidden(next)
    await supabase.from('user_profiles').update({ hidden_pregnancy_items: Array.from(next) }).eq('id', user.id)
  }

  async function togglePersonal(item: UserPregnancyItem) {
    await supabase.from('user_pregnancy_items').update({ is_completed: !item.is_completed }).eq('id', item.id)
    setPersonalItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: !i.is_completed } : i))
  }

  async function addPersonalItem() {
    if (!user || !newItemText.trim()) return
    setSavingPersonal(true)
    const { data } = await supabase.from('user_pregnancy_items').insert({
      user_id: user.id,
      category: dashTab as 'medical' | 'buying',
      text: newItemText.trim(),
      week_from: newItemWeekFrom ? parseInt(newItemWeekFrom) : null,
      week_to: newItemWeekTo ? parseInt(newItemWeekTo) : null,
    }).select().single()
    if (data) setPersonalItems(prev => [...prev, data as UserPregnancyItem])
    setNewItemText(''); setNewItemWeekFrom(''); setNewItemWeekTo('')
    setAddingPersonal(false)
    setSavingPersonal(false)
  }

  async function deletePersonalItem(id: string) {
    await supabase.from('user_pregnancy_items').delete().eq('id', id)
    setPersonalItems(prev => prev.filter(i => i.id !== id))
  }

  function startEdit(item: UserPregnancyItem) {
    setEditingId(item.id)
    setEditText(item.text)
    setEditWeekFrom(item.week_from?.toString() ?? '')
    setEditWeekTo(item.week_to?.toString() ?? '')
  }

  async function saveEdit() {
    if (!editingId || !editText.trim()) return
    const updates = {
      text: editText.trim(),
      week_from: editWeekFrom ? parseInt(editWeekFrom) : null,
      week_to: editWeekTo ? parseInt(editWeekTo) : null,
    }
    await supabase.from('user_pregnancy_items').update(updates).eq('id', editingId)
    setPersonalItems(prev => prev.map(i => i.id === editingId ? { ...i, ...updates } : i))
    setEditingId(null)
  }

  function toggleBucket(key: string) {
    setExpandedBuckets(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function graduate() {
    if (!user || !babyName.trim()) return
    setSaving(true)
    await supabase.from('children').insert({ user_id: user.id, name: babyName.trim(), dob: babyDob || null, gender: babyGender })
    await supabase.from('user_profiles').update({ user_mode: 'mom', baby_name: babyName.trim(), baby_dob: babyDob || null }).eq('id', user.id)
    await Promise.all([refreshProfile(), refreshChildren()])
    setSaving(false)
  }

  const visibleMedical = medicalItems.filter(i => !hidden.has(i.id))
  const visibleBuying = buyingItems.filter(i => !hidden.has(i.id))
  const allMasterItems = [...visibleMedical, ...visibleBuying]
  const totalItems = allMasterItems.length + personalItems.length
  const doneCount = allMasterItems.filter(i => completed.has(i.id)).length + personalItems.filter(i => i.is_completed).length
  const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0
  const medicalBuckets = groupByWeek(visibleMedical)
  const myPersonalMedical = personalItems.filter(i => i.category === 'medical')
  const myPersonalBuying = personalItems.filter(i => i.category === 'buying')

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* ── Header ── */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(160deg, #3D2E20 0%, #2A1F15 100%)' }}>
        <div className="max-w-sm mx-auto">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-sm" style={{ color: '#D9B978' }}>שלום,</p>
              <h1 className="text-2xl font-bold text-white">{profile?.mother_name ?? 'אמא לעתיד'} 🤰</h1>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="?settings"
                className="p-2 rounded-xl text-white/50 hover:text-white transition-colors"
                title="הגדרות"
              >
                <SettingsIcon className="w-5 h-5" />
              </a>
              <button onClick={signOut} className="p-2 rounded-xl text-white/50 hover:text-white transition-colors" title="יציאה">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          {profile?.due_date ? (
            <div className="rounded-3xl p-5 relative overflow-hidden mb-4" style={{ background: '#E7C78A' }}>
              <div className="relative z-10">
                <p className="text-sm font-semibold text-white/80">שבוע הריון</p>
                <p className="text-5xl font-black text-white mt-1">{week}</p>
                <p className="text-sm text-white/80 mt-2">
                  {daysLeft === 0 ? '🎉 יום הלידה הגיע!' : `עוד ${daysLeft} ימים ללידה`}
                </p>
              </div>
              <div className="absolute left-4 top-4 text-6xl opacity-20">👶</div>
            </div>
          ) : (
            <div className="bg-white/10 rounded-3xl p-4 text-center mb-4">
              <p className="text-white/60 text-sm">הוסיפי תאריך לידה משוער בפרופיל שלך</p>
            </div>
          )}

          <div className="bg-white/10 rounded-2xl p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: '#E7C78A' }} />
              </div>
            </div>
            <p className="text-xs font-bold text-white/80 flex-shrink-0">{doneCount}/{totalItems} הושלמו</p>
          </div>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 pt-4 space-y-3">
        {/* ── Assigned tasks ── */}
        <MyTasksPanel />

        {/* ── Weekly Guide Card ── */}
        {guide && week && <WeekGuideCard guide={guide} week={week} />}

        {/* ── Active Reminder Banners ── */}
        {reminders.map(r => (
          <ReminderBanner
            key={r.key}
            emoji={r.emoji}
            text={r.text}
            onDismiss={() => {
              const isTime = r.key.startsWith('reminder_time_')
              const timeStr = isTime ? r.key.replace('reminder_time_', '') : undefined
              dismissReminderBanner(r.key, isTime, timeStr)
            }}
          />
        ))}

        {/* ── Tab Switcher ── */}
        <div className="flex bg-[#F5F1EB] rounded-2xl p-1 shadow-sm gap-1">
          {([
            { id: 'medical' as DashTab,   icon: <Stethoscope className="w-3.5 h-3.5" />, label: 'רפואי' },
            { id: 'buying' as DashTab,    icon: <ShoppingBag className="w-3.5 h-3.5" />, label: 'קניות' },
            { id: 'reminders' as DashTab, icon: <Bell className="w-3.5 h-3.5" />,        label: 'תזכורות' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setDashTab(t.id); setAddingPersonal(false) }}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${dashTab === t.id ? 'text-white shadow-sm' : 'text-sand-500'}`}
              style={dashTab === t.id ? { background: '#E7C78A' } : {}}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Medical Tab ── */}
        {dashTab === 'medical' && (
          <div className="space-y-2">
            {medicalBuckets.map(bucket => {
              const bucketDone = bucket.items.filter(i => completed.has(i.id)).length
              const isOpen = expandedBuckets.has(bucket.key)
              const allDone = bucketDone === bucket.items.length
              return (
                <div key={bucket.key} className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
                  <button className="w-full flex items-center justify-between p-4" onClick={() => toggleBucket(bucket.key)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${allDone ? 'bg-green-100' : 'bg-mustard-50'}`}>
                        {allDone ? '✅' : '🩺'}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sand-800 text-sm">{bucket.label}</p>
                        <p className="text-xs text-sand-400">{bucketDone}/{bucket.items.length} הושלמו</p>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-sand-400" /> : <ChevronDown className="w-4 h-4 text-sand-400" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-sand-100 divide-y divide-sand-50">
                      {bucket.items.map(item => {
                        const done = completed.has(item.id)
                        return (
                          <div key={item.id} className="flex items-center gap-1 pr-4 pl-2 hover:bg-sand-50 transition-colors">
                            <button onClick={() => toggleItem(item.id)}
                              className="flex items-center gap-3 flex-1 py-3 text-right">
                              {done ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                              <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                            </button>
                            <button
                              onClick={() => hideItem(item.id)}
                              className="p-2 text-sand-200 hover:text-red-400 transition-colors flex-shrink-0"
                              title="הסר פריט"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Personal medical items */}
            {myPersonalMedical.length > 0 && (
              <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-sand-100">
                  <p className="text-xs font-bold text-mustard-600">📝 הוספות אישיות שלי</p>
                </div>
                <div className="divide-y divide-sand-50">
                  {myPersonalMedical.map(item => editingId === item.id ? (
                    <div key={item.id} className="px-4 py-3 space-y-2">
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-mustard-300 rounded-xl text-sm focus:outline-none" autoFocus />
                      <div className="flex gap-2">
                        <input type="number" value={editWeekFrom} onChange={e => setEditWeekFrom(e.target.value)}
                          placeholder="שבוע מ-" min={1} max={42}
                          className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none" />
                        <input type="number" value={editWeekTo} onChange={e => setEditWeekTo(e.target.value)}
                          placeholder="שבוע עד" min={1} max={42}
                          className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="flex-1 py-2 rounded-xl text-white font-bold text-xs"
                          style={{ background: '#E7C78A' }}>
                          <Check className="w-3.5 h-3.5 inline ml-1" />שמירה
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-xl bg-sand-100 text-sand-600 text-xs font-semibold">ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => togglePersonal(item)}>
                        {item.is_completed ? <CheckCircle2 className="w-5 h-5 text-mustard-500" /> : <Circle className="w-5 h-5 text-sand-300" />}
                      </button>
                      <span className={`text-sm flex-1 text-right ${item.is_completed ? 'line-through text-sand-400' : 'text-sand-700'}`}>
                        {item.text}
                        {item.week_from && <span className="text-xs text-mustard-500 mr-1"> · שבוע {item.week_from}{item.week_to && `–${item.week_to}`}</span>}
                      </span>
                      <button onClick={() => startEdit(item)} className="text-sand-200 hover:text-mustard-400 flex-shrink-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePersonalItem(item.id)} className="text-sand-200 hover:text-red-400 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add personal medical item */}
            {addingPersonal ? (
              <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3">
                <input
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  placeholder="שם הבדיקה / פגישה..."
                  className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <input
                    type="number" value={newItemWeekFrom} onChange={e => setNewItemWeekFrom(e.target.value)}
                    placeholder="שבוע מ-" min={1} max={42}
                    className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                  />
                  <input
                    type="number" value={newItemWeekTo} onChange={e => setNewItemWeekTo(e.target.value)}
                    placeholder="שבוע עד" min={1} max={42}
                    className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={addPersonalItem} disabled={savingPersonal || !newItemText.trim()}
                    className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: '#E7C78A' }}>
                    {savingPersonal ? '...' : 'הוסיפי'}
                  </button>
                  <button onClick={() => setAddingPersonal(false)} className="px-4 py-2.5 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingPersonal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-mustard-200 text-mustard-600 text-sm font-semibold hover:bg-mustard-50 transition-colors">
                <Plus className="w-4 h-4" /> הוסיפי בדיקה / פגישה אישית
              </button>
            )}
          </div>
        )}

        {/* ── Buying Tab ── */}
        {dashTab === 'buying' && (
          <div className="space-y-2">
            <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden divide-y divide-sand-50">
              {visibleBuying.map(item => {
                const done = completed.has(item.id)
                return (
                  <div key={item.id} className="flex items-center gap-1 pr-4 pl-2 hover:bg-sand-50 transition-colors">
                    <button onClick={() => toggleItem(item.id)}
                      className="flex items-center gap-3 flex-1 py-3.5 text-right">
                      {done ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                      <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                      {done && <span className="text-xs text-mustard-500 font-semibold flex-shrink-0">✓</span>}
                    </button>
                    <button
                      onClick={() => hideItem(item.id)}
                      className="p-2 text-sand-200 hover:text-red-400 transition-colors flex-shrink-0"
                      title="הסר פריט"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Personal buying items */}
            {myPersonalBuying.length > 0 && (
              <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-sand-100">
                  <p className="text-xs font-bold text-mustard-600">📝 פריטים שהוספתי</p>
                </div>
                <div className="divide-y divide-sand-50">
                  {myPersonalBuying.map(item => editingId === item.id ? (
                    <div key={item.id} className="px-4 py-3 space-y-2">
                      <input value={editText} onChange={e => setEditText(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-mustard-300 rounded-xl text-sm focus:outline-none" autoFocus />
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="flex-1 py-2 rounded-xl text-white font-bold text-xs"
                          style={{ background: '#E7C78A' }}>
                          <Check className="w-3.5 h-3.5 inline ml-1" />שמירה
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-xl bg-sand-100 text-sand-600 text-xs font-semibold">ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => togglePersonal(item)}>
                        {item.is_completed ? <CheckCircle2 className="w-5 h-5 text-mustard-500" /> : <Circle className="w-5 h-5 text-sand-300" />}
                      </button>
                      <span className={`text-sm flex-1 text-right ${item.is_completed ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                      <button onClick={() => startEdit(item)} className="text-sand-200 hover:text-mustard-400 flex-shrink-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePersonalItem(item.id)} className="text-sand-200 hover:text-red-400 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addingPersonal ? (
              <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3">
                <input
                  value={newItemText} onChange={e => setNewItemText(e.target.value)}
                  placeholder="מה עוד צריך לקנות?"
                  className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={addPersonalItem} disabled={savingPersonal || !newItemText.trim()}
                    className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: '#E7C78A' }}>
                    {savingPersonal ? '...' : 'הוסיפי'}
                  </button>
                  <button onClick={() => setAddingPersonal(false)} className="px-4 py-2.5 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingPersonal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-mustard-200 text-mustard-600 text-sm font-semibold hover:bg-mustard-50 transition-colors">
                <Plus className="w-4 h-4" /> הוסיפי פריט אישי
              </button>
            )}
          </div>
        )}

        {/* ── Reminders Tab ── */}
        {dashTab === 'reminders' && (
          <CustomRemindersPanel />
        )}

        {/* ── Quick links + Graduation (always visible) ── */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={() => onNavigate('workshops')}
            className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
            <span className="text-3xl block mb-2">🛍️</span>
            <p className="font-bold text-sand-800 text-sm">מוצרים</p>
            <p className="text-xs text-sand-400">לקראת הלידה</p>
          </button>
          <button onClick={() => onNavigate('community')}
            className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
            <span className="text-3xl block mb-2">🌸</span>
            <p className="font-bold text-sand-800 text-sm">קהילה</p>
            <p className="text-xs text-sand-400">בנות בהריון כמוך</p>
          </button>
        </div>

        {!graduating ? (
          <button onClick={() => setGraduating(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl text-white font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
            <Sparkles className="w-5 h-5" />
            התינוק נולד! 🎉 עברי ליומן
          </button>
        ) : (
          <div className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm space-y-4">
            <div className="text-center">
              <p className="text-2xl">🎉</p>
              <p className="font-bold text-sand-800 mt-1">מזל טוב! ספרי לנו על התינוק</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם התינוק/ת</label>
              <input value={babyName} onChange={e => setBabyName(e.target.value)} placeholder="שם התינוק"
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">תאריך לידה</label>
              <input type="date" value={babyDob} onChange={e => setBabyDob(e.target.value)}
                max={formatDate(new Date())}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 text-sm" />
            </div>
            <div className="flex gap-2">
              {(['girl', 'boy', 'other'] as const).map(g => (
                <button key={g} onClick={() => setBabyGender(g)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${babyGender === g ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}>
                  {g === 'girl' ? 'בת 👧' : g === 'boy' ? 'בן 👶🏻' : 'אחר 👶'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={graduate} disabled={saving || !babyName.trim()}
                className="flex-1 py-3 rounded-2xl text-white font-bold disabled:opacity-50"
                style={{ background: '#E7C78A' }}>
                {saving ? 'שומרת...' : 'כניסה ליומן 🎉'}
              </button>
              <button onClick={() => setGraduating(false)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
