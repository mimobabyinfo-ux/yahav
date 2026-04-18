import { useState, useEffect } from 'react'
import { LogOut, Sparkles, CheckCircle2, Circle, ShoppingBag, Stethoscope, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase, PregnancyChecklistItem } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Page } from '../App'

type Props = { onNavigate: (page: Page) => void }

type DashTab = 'medical' | 'buying'

function pregnancyWeek(dueDate: string): number {
  const daysLeft = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000)
  return Math.max(1, Math.min(42, Math.floor((280 - daysLeft) / 7)))
}

function daysUntilDue(dueDate: string): number {
  return Math.max(0, Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000))
}

// Group medical items into week buckets
function groupByWeek(items: PregnancyChecklistItem[]) {
  const buckets: { label: string; key: string; items: PregnancyChecklistItem[] }[] = []
  const seen = new Set<string>()
  items.forEach(item => {
    const key = `${item.week_from ?? 0}-${item.week_to ?? 42}`
    if (!seen.has(key)) {
      seen.add(key)
      const label = item.week_from && item.week_to
        ? `שבוע ${item.week_from}–${item.week_to}`
        : item.week_from
        ? `מסביב לשבוע ${item.week_from}`
        : 'כללי'
      buckets.push({ label, key, items: [] })
    }
    buckets.find(b => b.key === key)!.items.push(item)
  })
  return buckets.sort((a, b) => {
    const aFrom = parseInt(a.key.split('-')[0])
    const bFrom = parseInt(b.key.split('-')[0])
    return aFrom - bFrom
  })
}

export default function PregnancyDashboard({ onNavigate }: Props) {
  const { profile, signOut, refreshProfile, refreshChildren, user } = useAuth()
  const [dashTab, setDashTab] = useState<DashTab>('medical')
  const [medicalItems, setMedicalItems] = useState<PregnancyChecklistItem[]>([])
  const [buyingItems, setBuyingItems] = useState<PregnancyChecklistItem[]>([])
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set())
  const [graduating, setGraduating] = useState(false)
  const [babyName, setBabyName] = useState('')
  const [babyDob, setBabyDob] = useState(new Date().toISOString().split('T')[0])
  const [babyGender, setBabyGender] = useState<'girl' | 'boy' | 'other'>('girl')
  const [saving, setSaving] = useState(false)

  // Load checklist items from DB
  useEffect(() => {
    supabase
      .from('pregnancy_checklist_items')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        const all = (data ?? []) as PregnancyChecklistItem[]
        setMedicalItems(all.filter(i => i.category === 'medical'))
        setBuyingItems(all.filter(i => i.category === 'buying'))
        // Auto-expand first medical bucket
        const firstKey = groupByWeek(all.filter(i => i.category === 'medical'))[0]?.key
        if (firstKey) setExpandedBuckets(new Set([firstKey]))
      })
  }, [])

  // Load completions from DB
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_profiles')
      .select('pregnancy_task_completions')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.pregnancy_task_completions) {
          setCompleted(new Set(data.pregnancy_task_completions as string[]))
        }
      })
  }, [user])

  async function toggleItem(itemId: string) {
    if (!user) return
    const next = new Set(completed)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    setCompleted(next)
    await supabase
      .from('user_profiles')
      .update({ pregnancy_task_completions: Array.from(next) })
      .eq('id', user.id)
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
    await supabase.from('children').insert({
      user_id: user.id,
      name: babyName.trim(),
      dob: babyDob || null,
      gender: babyGender,
    })
    await supabase.from('user_profiles').update({
      user_mode: 'mom',
      baby_name: babyName.trim(),
      baby_dob: babyDob || null,
    }).eq('id', user.id)
    await Promise.all([refreshProfile(), refreshChildren()])
    setSaving(false)
  }

  const week = profile?.due_date ? pregnancyWeek(profile.due_date) : null
  const daysLeft = profile?.due_date ? daysUntilDue(profile.due_date) : null

  const allItems = [...medicalItems, ...buyingItems]
  const totalItems = allItems.length
  const doneCount = allItems.filter(i => completed.has(i.id)).length
  const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0

  const medicalBuckets = groupByWeek(medicalItems)

  return (
    <div className="min-h-screen pb-28" dir="rtl">
      {/* Header */}
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

          {/* Due date card */}
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

          {/* Progress bar */}
          <div className="bg-white/10 rounded-2xl p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D4AA52, #ffdf80)' }}
                />
              </div>
            </div>
            <p className="text-xs font-bold text-white/80 flex-shrink-0">{doneCount}/{totalItems} הושלמו</p>
          </div>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 pt-4 space-y-3">
        {/* Tab switcher */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          <button
            onClick={() => setDashTab('medical')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${dashTab === 'medical' ? 'text-white shadow-sm' : 'text-sand-500'}`}
            style={dashTab === 'medical' ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
          >
            <Stethoscope className="w-4 h-4" />
            משימות רפואיות
          </button>
          <button
            onClick={() => setDashTab('buying')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${dashTab === 'buying' ? 'text-white shadow-sm' : 'text-sand-500'}`}
            style={dashTab === 'buying' ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
          >
            <ShoppingBag className="w-4 h-4" />
            רשימת קניות
          </button>
        </div>

        {/* Medical missions — grouped by week */}
        {dashTab === 'medical' && (
          medicalBuckets.length === 0 ? (
            <div className="text-center py-10 text-sand-400 text-sm">טוענת...</div>
          ) : (
            <div className="space-y-2">
              {medicalBuckets.map(bucket => {
                const bucketDone = bucket.items.filter(i => completed.has(i.id)).length
                const isOpen = expandedBuckets.has(bucket.key)
                const allDone = bucketDone === bucket.items.length
                return (
                  <div key={bucket.key} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-4"
                      onClick={() => toggleBucket(bucket.key)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-base flex-shrink-0 ${allDone ? 'bg-green-100' : 'bg-mustard-50'}`}>
                          {allDone ? '✅' : '🩺'}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sand-800 text-sm">{bucket.label}</p>
                          <p className="text-xs text-sand-400">{bucketDone}/{bucket.items.length} הושלמו</p>
                        </div>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-sand-400" />
                        : <ChevronDown className="w-4 h-4 text-sand-400" />}
                    </button>

                    {isOpen && (
                      <div className="border-t border-sand-100 divide-y divide-sand-50">
                        {bucket.items.map(item => {
                          const done = completed.has(item.id)
                          return (
                            <button
                              key={item.id}
                              onClick={() => toggleItem(item.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sand-50 transition-colors text-right"
                            >
                              {done
                                ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" />
                                : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                              <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>
                                {item.text}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Buying list — flat */}
        {dashTab === 'buying' && (
          buyingItems.length === 0 ? (
            <div className="text-center py-10 text-sand-400 text-sm">טוענת...</div>
          ) : (
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden divide-y divide-sand-50">
              {buyingItems.map(item => {
                const done = completed.has(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-sand-50 transition-colors text-right"
                  >
                    {done
                      ? <CheckCircle2 className="w-5 h-5 text-mustard-500 flex-shrink-0" />
                      : <Circle className="w-5 h-5 text-sand-300 flex-shrink-0" />}
                    <span className={`text-sm flex-1 text-right ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>
                      {item.text}
                    </span>
                    {done && <span className="text-xs text-mustard-500 font-semibold flex-shrink-0">✓</span>}
                  </button>
                )
              })}
            </div>
          )
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={() => onNavigate('workshops')}
            className="bg-white rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <span className="text-3xl block mb-2">🛍️</span>
            <p className="font-bold text-sand-800 text-sm">מוצרים</p>
            <p className="text-xs text-sand-400">לקראת הלידה</p>
          </button>
          <button
            onClick={() => onNavigate('community')}
            className="bg-white rounded-3xl p-4 shadow-sm text-right hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <span className="text-3xl block mb-2">🌸</span>
            <p className="font-bold text-sand-800 text-sm">קהילה</p>
            <p className="text-xs text-sand-400">בנות בריון כמוך</p>
          </button>
        </div>

        {/* Graduation button */}
        {!graduating ? (
          <button
            onClick={() => setGraduating(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl text-white font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
          >
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
              <input
                value={babyName}
                onChange={e => setBabyName(e.target.value)}
                placeholder="שם התינוק"
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">תאריך לידה</label>
              <input
                type="date"
                value={babyDob}
                onChange={e => setBabyDob(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 text-sm"
              />
            </div>
            <div className="flex gap-2">
              {(['girl', 'boy', 'other'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setBabyGender(g)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                    babyGender === g ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'
                  }`}
                >
                  {g === 'girl' ? 'בת 👧' : g === 'boy' ? 'בן 👦' : 'אחר 👶'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={graduate}
                disabled={saving || !babyName.trim()}
                className="flex-1 py-3 rounded-2xl text-white font-bold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
              >
                {saving ? 'שומרת...' : 'כניסה ליומן 🎉'}
              </button>
              <button
                onClick={() => setGraduating(false)}
                className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
