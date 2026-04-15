import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MimoLogo from '../components/MimoLogo'

type Baby = {
  name: string
  dob: string
  gender: 'girl' | 'boy' | 'other'
}

const genderOptions = [
  { value: 'girl',  label: 'בת 👧' },
  { value: 'boy',   label: 'בן 👦' },
  { value: 'other', label: 'אחר 👶' },
]

const emptyBaby = (): Baby => ({ name: '', dob: '', gender: 'girl' })

export default function OnboardingPage() {
  const { user, refreshProfile, refreshChildren } = useAuth()
  const [motherName, setMotherName] = useState('')
  const [area, setArea] = useState('')
  const [phone, setPhone] = useState('')
  const [showPhone, setShowPhone] = useState(false)
  const [babies, setBabies] = useState<Baby[]>([emptyBaby()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateBaby(idx: number, patch: Partial<Baby>) {
    setBabies(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b))
  }

  function addBaby() {
    setBabies(prev => [...prev, emptyBaby()])
  }

  function removeBaby(idx: number) {
    setBabies(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (babies.some(b => !b.name.trim())) {
      setError('אנא מלאי שם לכל תינוק/ת')
      return
    }
    if (babies.some(b => !b.dob)) {
      setError('אנא מלאי תאריך לידה לכל תינוק/ת')
      return
    }
    setError('')
    setLoading(true)
    try {
      // Save user profile
      const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        email: user.email ?? '',
        mother_name: motherName,
        baby_name: babies[0].name,
        baby_dob: babies[0].dob || null,
        baby_gender: babies[0].gender,
        display_name: motherName,
        area: area.trim() || null,
        phone_number: phone.trim() || null,
        community_consent: showPhone,
        lead_status: 'new_lead',
      })
      if (profileError) throw profileError

      // Insert all children
      const { error: childError } = await supabase.from('children').insert(
        babies.map(b => ({
          user_id: user.id,
          name: b.name.trim(),
          dob: b.dob || null,
          gender: b.gender,
        }))
      )
      if (childError) throw childError

      await Promise.all([refreshProfile(), refreshChildren()])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
      setError(msg || 'שגיאה, נסי שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 pb-10" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }} dir="rtl">
      <div className="w-full max-w-sm mx-auto space-y-5">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-2">
            <MimoLogo size={100} />
          </div>
          <h1 className="text-2xl font-bold text-sand-800">ברוכה הבאה!</h1>
          <p className="text-sand-500 mt-1 text-sm">ספרי לנו קצת עליך ועל התינוק שלך</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mother name + area */}
          <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">שמך</label>
              <input
                type="text"
                value={motherName}
                onChange={e => setMotherName(e.target.value)}
                placeholder="מה שמך?"
                required
                className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                עיר / אזור <span className="text-sand-400 font-normal">(לחיפוש בקהילה)</span>
              </label>
              <input
                type="text"
                value={area}
                onChange={e => setArea(e.target.value)}
                placeholder="למשל: תל אביב, ירושלים, חיפה..."
                className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                מספר טלפון <span className="text-sand-400 font-normal">(אופציונלי)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="050-0000000"
                dir="ltr"
                className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
              />
            </div>
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <div
                onClick={() => setShowPhone(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${showPhone ? 'border-mustard-500' : 'border-sand-300'}`}
                style={showPhone ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
              >
                {showPhone && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-sand-600 leading-relaxed">
                אני מסכימה לשתף את מספר הטלפון שלי עם אמהות אחרות בקהילה
              </span>
            </label>
          </div>

          {/* Baby cards */}
          {babies.map((baby, idx) => (
            <div key={idx} className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sand-700 text-sm">
                  {babies.length > 1 ? `תינוק/ת ${idx + 1}` : 'פרטי התינוק/ת'}
                </h3>
                {babies.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBaby(idx)}
                    className="p-1.5 rounded-xl text-red-400 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Baby name */}
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם התינוק/ת</label>
                <input
                  type="text"
                  value={baby.name}
                  onChange={e => updateBaby(idx, { name: e.target.value })}
                  placeholder="שם התינוק שלך"
                  required
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">מין התינוק/ת</label>
                <div className="flex gap-2">
                  {genderOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateBaby(idx, { gender: opt.value as Baby['gender'] })}
                      className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                        baby.gender === opt.value
                          ? 'border-mustard-400 bg-mustard-50 text-mustard-700'
                          : 'border-sand-200 text-sand-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Birthday */}
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                  תאריך לידה <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={baby.dob}
                  onChange={e => updateBaby(idx, { dob: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  required
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800"
                />
              </div>
            </div>
          ))}

          {/* Add another baby */}
          <button
            type="button"
            onClick={addBaby}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-mustard-300 text-mustard-600 font-semibold text-sm hover:bg-mustard-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסיפי תינוק/ת נוסף/ת
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-bold py-4 rounded-2xl transition-all shadow-lg disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
          >
            {loading ? 'שומרת...' : 'בואי נתחיל! 🎉'}
          </button>
        </form>
      </div>
    </div>
  )
}
