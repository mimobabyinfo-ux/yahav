import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MimoLogo from '../components/MimoLogo'

type Mode = 'mom' | 'pregnant'

type Baby = {
  name: string
  dob: string
  gender: 'girl' | 'boy' | 'other'
}

const genderOptions = [
  { value: 'girl', label: 'בת 👧' },
  { value: 'boy',  label: 'בן 👶🏻' },
]

const CITIES = [
  'אילת', 'אור יהודה', 'אור עקיבא', 'אריאל', 'אשדוד', 'אשקלון',
  'באר שבע', 'בית שאן', 'בית שמש', 'בני ברק', 'בת ים',
  'גבעת שמואל', 'גבעתיים', 'גדרה',
  'הוד השרון', 'הרצליה', 'חדרה', 'חולון', 'חיפה',
  'טבריה', 'טירת כרמל',
  'יבנה', 'יהוד', 'ירושלים',
  'כפר סבא', 'כרמיאל',
  'לוד',
  'מזכרת בתיה', 'מודיעין', 'מעלה אדומים',
  'נהריה', 'נס ציונה', 'נצרת', 'נצרת עילית', 'נתיבות', 'נתניה',
  'עכו', 'עפולה',
  'פתח תקווה',
  'צפת',
  'קריית אתא', 'קריית ביאליק', 'קריית גת', 'קריית מוצקין', 'קריית שמונה',
  'ראש העין', 'ראשון לציון', 'רחובות', 'רמלה', 'רמת גן', 'רמת השרון', 'רעננה',
  'תל אביב', 'תל מונד',
  'אחר',
]

const emptyBaby = (): Baby => ({ name: '', dob: '', gender: 'girl' })

export default function OnboardingPage() {
  const { user, refreshProfile, refreshChildren } = useAuth()
  const [mode, setMode] = useState<Mode>('mom')
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    if (!firstName.trim()) { setError('אנא הכניסי שם פרטי'); return }
    if (!lastName.trim()) { setError('אנא הכניסי שם משפחה'); return }
    if (!area) { setError('אנא בחרי עיר / אזור'); return }
    if (!phone.trim()) { setError('אנא הכניסי מספר טלפון'); return }

    if (mode === 'pregnant') {
      if (!dueDate) { setError('אנא הכניסי תאריך לידה משוער'); return }
    }

    if (mode === 'mom') {
      if (babies.some(b => !b.name.trim())) { setError('אנא מלאי שם לכל תינוק/ת'); return }
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
        baby_name: mode === 'mom' ? babies[0].name : null,
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
            name: b.name.trim(),
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
          {/* Mode selector */}
          <div className="bg-white rounded-3xl shadow-sm p-4">
            <p className="text-xs font-semibold text-sand-600 mb-3 text-center">איפה את בתהליך?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('pregnant')}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${mode === 'pregnant' ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}>
                🤰 בהיריון
              </button>
              <button type="button" onClick={() => setMode('mom')}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${mode === 'mom' ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}>
                👶 כבר אמא
              </button>
            </div>
          </div>

          {/* Mother details */}
          <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
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
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">עיר / אזור <span className="text-red-400">*</span></label>
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
                style={showPhone ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}>
                {showPhone && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-sand-600 leading-relaxed">
                אני מסכימה לשתף את מספר הטלפון שלי עם אמהות אחרות בקהילה
              </span>
            </label>
          </div>

          {/* Due date — pregnant only, required */}
          {mode === 'pregnant' && (
            <div className="bg-white rounded-3xl shadow-sm p-5 overflow-hidden">
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                תאריך לידה משוער <span className="text-red-400">*</span>
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} required dir="ltr"
                className="w-full max-w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800" />
            </div>
          )}

          {/* Baby cards — mom only */}
          {mode === 'mom' && babies.map((baby, idx) => (
            <div key={idx} className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
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

              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם התינוק/ת <span className="text-red-400">*</span></label>
                <input type="text" value={baby.name} onChange={e => updateBaby(idx, { name: e.target.value })}
                  placeholder="שם התינוק שלך" required
                  className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800" />
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

              <div className="overflow-hidden">
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">תאריך לידה <span className="text-red-400">*</span></label>
                <input type="date" value={baby.dob} onChange={e => updateBaby(idx, { dob: e.target.value })}
                  max={new Date().toISOString().split('T')[0]} required dir="ltr"
                  className="w-full max-w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800" />
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
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            {loading ? 'שומרת...' : 'בואי נתחיל! 🎉'}
          </button>
        </form>
      </div>
    </div>
  )
}
