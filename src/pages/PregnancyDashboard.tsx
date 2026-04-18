import { useState, useEffect, useCallback } from 'react'
import {
  LogOut, Sparkles, CheckCircle2, Circle, ShoppingBag, Stethoscope,
  ChevronDown, ChevronUp, Plus, Trash2, Bell, BellOff, X,
} from 'lucide-react'
import { supabase, PregnancyChecklistItem, PregnancyWeeklyGuide, UserPregnancyItem } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
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
    <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
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
          <p className="text-xs text-sand-400 mt-0.5 truncate">{guide.development?.slice(0, 50)}...</p>
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

// ── Reminders Settings Panel ──────────────────────────────────────────────────
function RemindersPanel() {
  const { profile, user, refreshProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  const [waterOn, setWaterOn] = useState(profile?.reminder_water_enabled ?? false)
  const [waterHours, setWaterHours] = useState(profile?.reminder_water_hours ?? 2)
  const [vitOn, setVitOn] = useState(profile?.reminder_vitamins_enabled ?? false)
  const [vitTime, setVitTime] = useState(profile?.reminder_vitamins_time ?? '08:00')
  const [exOn, setExOn] = useState(profile?.reminder_exercise_enabled ?? false)
  const [exTime, setExTime] = useState(profile?.reminder_exercise_time ?? '09:00')

  async function save() {
    if (!user) return
    setSaving(true)
    await supabase.from('user_profiles').update({
      reminder_water_enabled: waterOn,
      reminder_water_hours: waterHours,
      reminder_vitamins_enabled: vitOn,
      reminder_vitamins_time: vitTime,
      reminder_exercise_enabled: exOn,
      reminder_exercise_time: exTime,
    }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  const toggle = (
    <div className="space-y-4">
      {/* Water */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💧</span>
            <p className="font-semibold text-sand-800 text-sm">שתייה</p>
          </div>
          <button
            onClick={() => setWaterOn(v => !v)}
            className={`w-11 h-6 rounded-full transition-all relative ${waterOn ? 'bg-mustard-500' : 'bg-sand-200'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${waterOn ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {waterOn && (
          <div>
            <label className="text-xs text-sand-500 mb-1 block">תזכורת כל כמה שעות?</label>
            <select
              value={waterHours}
              onChange={e => setWaterHours(Number(e.target.value))}
              className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
            >
              {[1, 1.5, 2, 2.5, 3].map(h => (
                <option key={h} value={h}>כל {h} שעות</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Vitamins */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">💊</span>
            <p className="font-semibold text-sand-800 text-sm">ויטמינים / תרופות</p>
          </div>
          <button
            onClick={() => setVitOn(v => !v)}
            className={`w-11 h-6 rounded-full transition-all relative ${vitOn ? 'bg-mustard-500' : 'bg-sand-200'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${vitOn ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {vitOn && (
          <div>
            <label className="text-xs text-sand-500 mb-1 block">שעת תזכורת</label>
            <input
              type="time"
              value={vitTime}
              onChange={e => setVitTime(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
        )}
      </div>

      {/* Exercise */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧘</span>
            <p className="font-semibold text-sand-800 text-sm">תרגיל / הליכה יומית</p>
          </div>
          <button
            onClick={() => setExOn(v => !v)}
            className={`w-11 h-6 rounded-full transition-all relative ${exOn ? 'bg-mustard-500' : 'bg-sand-200'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${exOn ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
        {exOn && (
          <div>
            <label className="text-xs text-sand-500 mb-1 block">שעת תזכורת</label>
            <input
              type="time"
              value={exTime}
              onChange={e => setExTime(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        {saving ? 'שומרת...' : 'שמירת הגדרות'}
      </button>
    </div>
  )
  return toggle
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PregnancyDashboard({ onNavigate }: Props) {
  const { profile, signOut, refreshProfile, refreshChildren, user } = useAuth()
  const [dashTab, setDashTab] = useState<DashTab>('medical')

  // Checklist data
  const [medicalItems, setMedicalItems] = useState<PregnancyChecklistItem[]>([])
  const [buyingItems, setBuyingItems] = useState<PregnancyChecklistItem[]>([])
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())

  // Personal items
  const [personalItems, setPersonalItems] = useState<UserPregnancyItem[]>([])
  const [addingPersonal, setAddingPersonal] = useState(false)
  const [newItemText, setNewItemText] = useState('')
  const [newItemWeekFrom, setNewItemWeekFrom] = useState('')
  const [newItemWeekTo, setNewItemWeekTo] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)

  // Weekly guide
  const [guide, setGuide] = useState<PregnancyWeeklyGuide | null>(null)

  // Active reminders (shown as banners)
  const [reminders, setReminders] = useState<{ key: string; emoji: string; text: string }[]>([])

  // Graduation
  const [graduating, setGraduating] = useState(false)
  const [babyName, setBabyName] = useState('')
  const [babyDob, setBabyDob] = useState(new Date().toISOString().split('T')[0])
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

  // Load completions from profile
  useEffect(() => {
    if (!user) return
    supabase.from('user_profiles').select('pregnancy_task_completions').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.pregnancy_task_completions)
          setCompleted(new Set(data.pregnancy_task_completions as string[]))
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

  const allMasterItems = [...medicalItems, ...buyingItems]
  const totalItems = allMasterItems.length + personalItems.length
  const doneCount = allMasterItems.filter(i => completed.has(i.id)).length + personalItems.filter(i => i.is_completed).length
  const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0
  const medicalBuckets = groupByWeek(medicalItems)
  const myPersonalMedical = personalItems.filter(i => i.category === 'medical')
  const myPersonalBuying = personalItems.filter(i => i.category === 'buying')

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* ── Header ── */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(160deg, #4A3F35 0%, #3a302a 100%)' }}>
        <div className="max-w-sm mx-auto">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-sm" style={{ color: '#C49438' }}>שלום,</p>
              <h1 className="text-2xl font-bold text-white">{profile?.mother_name ?? 'אמא לעתיד'} 🤰</h1>
            </div>
            <button onClick={signOut} className="p-2 rounded-xl text-white/50 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {profile?.due_date ? (
            <div className="rounded-3xl p-5 relative overflow-hidden mb-4" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
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
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D4AA52, #ffdf80)' }} />
              </div>
            </div>
            <p className="text-xs font-bold text-white/80 flex-shrink-0">{doneCount}/{totalItems} הושלמו</p>
          </div>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 pt-4 space-y-3">
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
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {([
            { id: 'medical' as DashTab,   icon: <Stethoscope className="w-3.5 h-3.5" />, label: 'רפואי' },
            { id: 'buying' as DashTab,    icon: <ShoppingBag className="w-3.5 h-3.5" />, label: 'קניות' },
            { id: 'reminders' as DashTab, icon: <Bell className="w-3.5 h-3.5" />,        label: 'תזכורות' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setDashTab(t.id); setAddingPersonal(false) }}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${dashTab === t.id ? 'text-white shadow-sm' : 'text-sand-500'}`}
              style={dashTab === t.id ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
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
                <div key={bucket.key} className="bg-white rounded-3xl shadow-sm overflow-hidden">
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
                          <button key={item.id} onClick={() => toggleItem(item.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sand-50 transition-colors text-right">
                            {done ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                            <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Personal medical items */}
            {myPersonalMedical.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-sand-100">
                  <p className="text-xs font-bold text-mustard-600">📝 הוספות אישיות שלי</p>
                </div>
                <div className="divide-y divide-sand-50">
                  {myPersonalMedical.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => togglePersonal(item)}>
                        {item.is_completed ? <CheckCircle2 className="w-5 h-5 text-mustard-500" /> : <Circle className="w-5 h-5 text-sand-300" />}
                      </button>
                      <span className={`text-sm flex-1 text-right ${item.is_completed ? 'line-through text-sand-400' : 'text-sand-700'}`}>
                        {item.text}
                        {item.week_from && <span className="text-xs text-mustard-500 mr-1"> · שבוע {item.week_from}{item.week_to && `–${item.week_to}`}</span>}
                      </span>
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
              <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
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
                    style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
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
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden divide-y divide-sand-50">
              {buyingItems.map(item => {
                const done = completed.has(item.id)
                return (
                  <button key={item.id} onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-sand-50 transition-colors text-right">
                    {done ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" /> : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                    <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                    {done && <span className="text-xs text-mustard-500 font-semibold flex-shrink-0">✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Personal buying items */}
            {myPersonalBuying.length > 0 && (
              <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-sand-100">
                  <p className="text-xs font-bold text-mustard-600">📝 פריטים שהוספתי</p>
                </div>
                <div className="divide-y divide-sand-50">
                  {myPersonalBuying.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => togglePersonal(item)}>
                        {item.is_completed ? <CheckCircle2 className="w-5 h-5 text-mustard-500" /> : <Circle className="w-5 h-5 text-sand-300" />}
                      </button>
                      <span className={`text-sm flex-1 text-right ${item.is_completed ? 'line-through text-sand-400' : 'text-sand-700'}`}>{item.text}</span>
                      <button onClick={() => deletePersonalItem(item.id)} className="text-sand-200 hover:text-red-400 flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addingPersonal ? (
              <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
                <input
                  value={newItemText} onChange={e => setNewItemText(e.target.value)}
                  placeholder="מה עוד צריך לקנות?"
                  className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={addPersonalItem} disabled={savingPersonal || !newItemText.trim()}
                    className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
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
          <RemindersPanel />
        )}

        {/* ── Quick links + Graduation (always visible) ── */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={() => onNavigate('workshops')}
            className="bg-white rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
            <span className="text-3xl block mb-2">🛍️</span>
            <p className="font-bold text-sand-800 text-sm">מוצרים</p>
            <p className="text-xs text-sand-400">לקראת הלידה</p>
          </button>
          <button onClick={() => onNavigate('community')}
            className="bg-white rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all">
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
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
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
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 text-sm" />
            </div>
            <div className="flex gap-2">
              {(['girl', 'boy', 'other'] as const).map(g => (
                <button key={g} onClick={() => setBabyGender(g)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${babyGender === g ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}>
                  {g === 'girl' ? 'בת 👧' : g === 'boy' ? 'בן 👦' : 'אחר 👶'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={graduate} disabled={saving || !babyName.trim()}
                className="flex-1 py-3 rounded-2xl text-white font-bold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
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
