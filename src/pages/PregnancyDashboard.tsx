import { useState, useEffect } from 'react'
import { Baby, CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Page } from '../App'

type Props = {
  onNavigate: (page: Page) => void
}

type ChecklistItem = { id: string; text: string }
type ChecklistCategory = { key: string; label: string; emoji: string; items: ChecklistItem[] }

const CHECKLISTS: ChecklistCategory[] = [
  {
    key: 'hospital',
    label: 'תיק לבית חולים',
    emoji: '🏥',
    items: [
      { id: 'h1', text: 'תעודת זהות וכרטיס קופת חולים' },
      { id: 'h2', text: 'בגדים לתינוק (4-5 חליפות)' },
      { id: 'h3', text: 'חיתולים לתינוק' },
      { id: 'h4', text: 'שמיכה לעטיפה' },
      { id: 'h5', text: 'בגדים נוחים לאמא לאחר לידה' },
      { id: 'h6', text: 'אוכל קל ומשקאות' },
      { id: 'h7', text: 'מטען לטלפון' },
      { id: 'h8', text: 'טיפות עיניים לתינוק (לפי הנחיות)' },
    ],
  },
  {
    key: 'nursery',
    label: 'חדר תינוק',
    emoji: '🛏️',
    items: [
      { id: 'n1', text: 'עריסה או מיטת תינוק' },
      { id: 'n2', text: 'מזרן ומצעים' },
      { id: 'n3', text: 'שינוי חיתולים ורפד' },
      { id: 'n4', text: 'אמבטיה לתינוק' },
      { id: 'n5', text: 'מנורת לילה' },
      { id: 'n6', text: 'בייבי מוניטור' },
    ],
  },
  {
    key: 'shopping',
    label: 'קניות לתינוק',
    emoji: '🛍️',
    items: [
      { id: 's1', text: 'עגלת תינוק' },
      { id: 's2', text: 'כיסא בטיחות לרכב' },
      { id: 's3', text: 'מנשא/עגלת טיול' },
      { id: 's4', text: 'שאבת חלב' },
      { id: 's5', text: 'בקבוקי האכלה ופטמות' },
      { id: 's6', text: 'בגדים (גודל 50, 56, 62)' },
      { id: 's7', text: 'חיתולים ומגבונים' },
      { id: 's8', text: 'מוצץ' },
    ],
  },
  {
    key: 'medical',
    label: 'פגישות רפואיות',
    emoji: '👩‍⚕️',
    items: [
      { id: 'm1', text: 'בדיקת אולטרסאונד שבוע 12' },
      { id: 'm2', text: 'בדיקת שקיפות עורפית' },
      { id: 'm3', text: 'בדיקת אולטרסאונד שבוע 22' },
      { id: 'm4', text: 'בדיקת סוכר הריון (שבוע 26-28)' },
      { id: 'm5', text: 'כיתת לידה' },
      { id: 'm6', text: 'פגישה עם מיילדת/רופא ילדים' },
      { id: 'm7', text: 'ייעוץ הנקה' },
    ],
  },
]

function pregnancyWeek(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  const daysLeft = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const totalDays = 280
  const daysPregnant = totalDays - daysLeft
  return Math.max(1, Math.min(42, Math.floor(daysPregnant / 7)))
}

function daysUntilDue(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  return Math.max(0, Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
}

export default function PregnancyDashboard({ onNavigate }: Props) {
  const { profile, signOut, refreshProfile, user } = useAuth()
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>('hospital')
  const [graduating, setGraduating] = useState(false)
  const [babyName, setBabyName] = useState('')
  const [babyDob, setBabyDob] = useState(new Date().toISOString().split('T')[0])
  const [babyGender, setBabyGender] = useState<'girl' | 'boy' | 'other'>('girl')
  const [saving, setSaving] = useState(false)

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

  async function graduate() {
    if (!user || !babyName.trim()) return
    setSaving(true)
    // Add baby
    await supabase.from('children').insert({
      user_id: user.id,
      name: babyName.trim(),
      dob: babyDob || null,
      gender: babyGender,
    })
    // Switch mode to mom
    await supabase
      .from('user_profiles')
      .update({ user_mode: 'mom', baby_name: babyName.trim(), baby_dob: babyDob || null })
      .eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  const week = profile?.due_date ? pregnancyWeek(profile.due_date) : null
  const daysLeft = profile?.due_date ? daysUntilDue(profile.due_date) : null

  const totalItems = CHECKLISTS.reduce((a, c) => a + c.items.length, 0)
  const doneCount = CHECKLISTS.reduce(
    (a, c) => a + c.items.filter(i => completed.has(i.id)).length, 0
  )
  const pct = Math.round((doneCount / totalItems) * 100)

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[220px] opacity-5">🤰</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-sand-400 text-sm">שלום,</p>
            <h1 className="text-2xl font-bold text-sand-800">{profile?.mother_name ?? 'אמא לעתיד'} 🤰</h1>
          </div>
          <button onClick={signOut} className="p-2 rounded-xl hover:bg-sand-100 text-sand-300 hover:text-sand-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Due date card */}
        {profile?.due_date ? (
          <div className="rounded-3xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            <div className="relative z-10">
              <p className="text-sm font-semibold opacity-80">שבוע הריון</p>
              <p className="text-5xl font-black mt-1">{week}</p>
              <p className="text-sm opacity-80 mt-2">
                {daysLeft === 0 ? '🎉 יום הלידה הגיע!' : `עוד ${daysLeft} ימים ללידה`}
              </p>
            </div>
            <div className="absolute left-4 top-4 text-6xl opacity-20">👶</div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-4 shadow-sm text-center">
            <p className="text-sand-500 text-sm">הוסיפי תאריך לידה משוער בפרופיל שלך</p>
          </div>
        )}

        {/* Progress bar */}
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-sand-800">ההכנות שלי</p>
            <p className="text-sm font-bold text-mustard-600">{doneCount}/{totalItems}</p>
          </div>
          <div className="w-full h-3 bg-sand-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D4AA52, #C49438)' }}
            />
          </div>
          <p className="text-xs text-sand-400">{pct}% הושלם</p>
        </div>

        {/* Checklists */}
        <div className="space-y-2">
          {CHECKLISTS.map(cat => {
            const catDone = cat.items.filter(i => completed.has(i.id)).length
            const isOpen = expanded === cat.key
            return (
              <div key={cat.key} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setExpanded(isOpen ? null : cat.key)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.emoji}</span>
                    <div className="text-right">
                      <p className="font-bold text-sand-800 text-sm">{cat.label}</p>
                      <p className="text-xs text-sand-400">{catDone}/{cat.items.length} הושלמו</p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-sand-400" /> : <ChevronDown className="w-4 h-4 text-sand-400" />}
                </button>

                {isOpen && (
                  <div className="border-t border-sand-100 divide-y divide-sand-50">
                    {cat.items.map(item => {
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
                          <span className={`text-sm ${done ? 'line-through text-sand-400' : 'text-sand-700'}`}>
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

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
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
            <p className="text-xs text-sand-400">אמהות לעתיד</p>
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

        {/* Baby icon bottom */}
        <div className="flex justify-center py-2">
          <Baby className="w-6 h-6 text-sand-200" />
        </div>
      </div>
    </div>
  )
}
