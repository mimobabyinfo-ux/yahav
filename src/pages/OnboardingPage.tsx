import { useState } from 'react'
import { Plus, Trash2, Check, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MimoLogo from '../components/MimoLogo'
import { CITIES } from '../data/cities'

type Mode = 'mom' | 'pregnant'

type Baby = {
  firstName: string
  lastName: string
  dob: string
  gender: 'girl' | 'boy' | 'other'
}

const genderOptions: { value: 'boy' | 'girl'; label: string }[] = [
  { value: 'boy',  label: 'זכר' },
  { value: 'girl', label: 'נקבה' },
]

const emptyBaby = (): Baby => ({ firstName: '', lastName: '', dob: '', gender: 'girl' })

export default function OnboardingPage() {
  const { user, refreshProfile, refreshChildren } = useAuth()
  // 2-step flow: mode is null until the user explicitly picks one,
  // then the rest of the form unlocks. A back arrow returns here.
  const [mode, setMode] = useState<Mode | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [area, setArea] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [showCities, setShowCities] = useState(false)
  const [phone, setPhone] = useState('')
  const [showPhone, setShowPhone] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [babies, setBabies] = useState<Baby[]>([emptyBaby()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateBaby(idx: number, patch: Partial<Baby>) {
    setBabies(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b))
  }

  function addBaby() { setBabies(prev => [...prev, emptyBaby()]) }
  function removeBaby(idx: number) { setBabies(prev => prev.filter((_, i) => i !== idx)) }

  function backToModeSelection() {
    setMode(null)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !mode) return

    if (!firstName.trim()) { setError('אנא הכניסי שם פרטי'); return }
    if (!lastName.trim()) { setError('אנא הכניסי שם משפחה'); return }
    if (!area) { setError('אנא בחרי עיר מגורים'); return }
    if (!phone.trim()) { setError('אנא הכניסי מספר טלפון'); return }

    if (mode === 'pregnant') {
      if (!dueDate) { setError('אנא הכניסי תאריך לידה משוער'); return }
    }

    if (mode === 'mom') {
      if (babies.some(b => !b.firstName.trim())) { setError('אנא מלאי שם פרטי לכל תינוק/ת'); return }
      if (babies.some(b => !b.lastName.trim())) { setError('אנא מלאי שם משפחה לכל תינוק/ת'); return }
      if (babies.some(b => !b.dob)) { setError('אנא מלאי תאריך לידה לכל תינוק/ת'); return }
    }

    setError('')
    setLoading(true)
    const motherName = `${firstName.trim()} ${lastName.trim()}`
    try {
      const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        email: user.email ?? '',
        mother_name: motherName,
        baby_name: mode === 'mom' ? `${babies[0].firstName.trim()} ${babies[0].lastName.trim()}`.trim() : null,
        baby_dob: mode === 'mom' ? babies[0].dob || null : null,
        baby_gender: mode === 'mom' ? babies[0].gender : null,
        display_name: motherName,
        area: area || null,
        phone_number: phone.trim() || null,
        community_consent: showPhone,
        lead_status: 'new_lead',
        user_mode: mode,
        due_date: mode === 'pregnant' ? dueDate || null : null,
      })
      if (profileError) throw profileError

      if (mode === 'mom') {
        const { error: childError } = await supabase.from('children').insert(
          babies.map(b => ({
            user_id: user.id,
            name: `${b.firstName.trim()} ${b.lastName.trim()}`.trim(),
            dob: b.dob || null,
            gender: b.gender,
          }))
        )
        if (childError) throw childError
      }

      await Promise.all([refreshProfile(), refreshChildren()])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
      setError(msg || 'שגיאה, נסי שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 pb-10" style={{ background: '#FFFFFF' }} dir="rtl">
      <div className="w-full max-w-sm mx-auto space-y-5 relative">
        {/* Back arrow — visible only after a mode was selected */}
        {mode !== null && (
          <button
            type="button"
            onClick={backToModeSelection}
            className="absolute top-0 left-0 p-2 rounded-xl text-sand-400 hover:text-sand-700 hover:bg-sand-50 transition-colors"
            aria-label="חזרה לבחירת מצב"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-2">
            <MimoLogo size={100} />
          </div>
          <h1 className="text-2xl font-bold text-sand-800">ברוכה הבאה!</h1>
        </div>

        {/* Step 1: Mode selection only */}
        {mode === null && (
          <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 space-y-3">
            <p className="text-sm font-semibold text-sand-700 text-center">איפה את בתהליך?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('pregnant')}
                className="flex-1 py-4 rounded-2xl text-sm font-bold border-2 border-sand-200 text-sand-500 hover:border-mustard-400 hover:bg-mustard-50 hover:text-mustard-700 transition-all">
                🤰 בהיריון
              </button>
              <button type="button" onClick={() => setMode('mom')}
                className="flex-1 py-4 rounded-2xl text-sm font-bold border-2 border-sand-200 text-sand-500 hover:border-mustard-400 hover:bg-mustard-50 hover:text-mustard-700 transition-all">
                👶 כבר אמא
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Full form once a mode is picked */}
        {mode !== null && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mother details */}
          <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 space-y-4">
            {/* Name — split */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם פרטי <span className="text-red-400">*</span></label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="שם פרטי" required
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם משפחה <span className="text-red-400">*</span></label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="שם משפחה" required
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
              </div>
            </div>

            {/* City combobox */}
            <div className="relative">
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">עיר מגורים / יישוב <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={citySearch}
                onChange={e => { setCitySearch(e.target.value); setArea(''); setShowCities(true) }}
                onFocus={() => setShowCities(true)}
                onBlur={() => setTimeout(() => setShowCities(false), 150)}
                placeholder="חיפוש עיר..."
                autoComplete="off"
                className={`w-full px-4 py-3.5 border-2 rounded-2xl focus:outline-none bg-white text-sand-800 ${area ? 'border-mustard-400' : 'border-sand-200 focus:border-mustard-400'}`}
              />
              {showCities && (
                <div className="absolute top-full right-0 left-0 z-50 bg-white border-2 border-mustard-200 rounded-2xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                  {CITIES.filter(c => !citySearch || c.includes(citySearch)).map(c => (
                    <button key={c} type="button"
                      onMouseDown={() => { setArea(c); setCitySearch(c); setShowCities(false) }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-mustard-50 text-sand-800 border-b border-sand-50 last:border-0 transition-colors">
                      {c}
                    </button>
                  ))}
                  {CITIES.filter(c => !citySearch || c.includes(citySearch)).length === 0 && (
                    <p className="text-center text-sand-400 text-sm py-3">לא נמצאו תוצאות</p>
                  )}
                </div>
              )}
            </div>

            {/* Phone — required */}
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">מספר טלפון <span className="text-red-400">*</span></label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="050-0000000" required dir="ltr"
                className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800" />
            </div>

            {/* Community consent */}
            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <div onClick={() => setShowPhone(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${showPhone ? 'border-mustard-500' : 'border-sand-300'}`}
                style={showPhone ? { background: '#E7C78A' } : {}}>
                {showPhone && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-sand-600 leading-relaxed">
                אני מסכימה לשתף את מספר הטלפון שלי עם אמהות אחרות בקהילת מימו
              </span>
            </label>
          </div>

          {/* Due date — pregnant only, required */}
          {mode === 'pregnant' && (
            <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5">
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                תאריך לידה משוער <span className="text-red-400">*</span>
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} required dir="ltr"
                className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
            </div>
          )}

          {/* Baby cards — mom only */}
          {mode === 'mom' && babies.map((baby, idx) => (
            <div key={idx} className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sand-700 text-sm">
                  {babies.length > 1 ? `תינוק/ת ${idx + 1}` : 'פרטי התינוק/ת'}
                </h3>
                {babies.length > 1 && (
                  <button type="button" onClick={() => removeBaby(idx)}
                    className="p-1.5 rounded-xl text-red-400 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Baby name — split */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם פרטי <span className="text-red-400">*</span></label>
                  <input type="text" value={baby.firstName} onChange={e => updateBaby(idx, { firstName: e.target.value })}
                    placeholder="שם פרטי" required
                    className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם משפחה <span className="text-red-400">*</span></label>
                  <input type="text" value={baby.lastName} onChange={e => updateBaby(idx, { lastName: e.target.value })}
                    placeholder="שם משפחה" required
                    className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">מין התינוק/ת <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {genderOptions.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => updateBaby(idx, { gender: opt.value as Baby['gender'] })}
                      className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                        baby.gender === opt.value ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">תאריך לידה <span className="text-red-400">*</span></label>
                <input type="date" value={baby.dob} onChange={e => updateBaby(idx, { dob: e.target.value })}
                  max={new Date().toISOString().split('T')[0]} required dir="ltr"
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm" />
              </div>
            </div>
          ))}

          {/* Add another baby — mom only */}
          {mode === 'mom' && (
            <button type="button" onClick={addBaby}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-mustard-300 text-mustard-600 font-semibold text-sm hover:bg-mustard-50 transition-colors">
              <Plus className="w-4 h-4" />
              הוסיפי תינוק/ת נוסף/ת
            </button>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full text-white font-bold py-4 rounded-2xl transition-all shadow-lg disabled:opacity-50"
            style={{ background: '#E7C78A' }}>
            {loading ? 'שומרת...' : 'בואי נתחיל! 🎉'}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
