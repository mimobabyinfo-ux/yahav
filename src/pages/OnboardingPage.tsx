import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth()
  const [motherName, setMotherName] = useState('')
  const [babyName, setBabyName] = useState('')
  const [babyDob, setBabyDob] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.from('user_profiles').insert({
        id: user.id,
        email: user.email ?? '',
        mother_name: motherName,
        baby_name: babyName,
        baby_dob: babyDob || null,
        display_name: motherName,
      })
      if (error) throw error
      await refreshProfile()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שגיאה, נסי שוב')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 bg-gradient-to-br from-beige-50 via-sand-50 to-mustard-50" dir="rtl">
      <div className="w-full max-w-sm mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl mb-4">👶</div>
          <h1 className="text-2xl font-bold text-sand-800">ברוכה הבאה!</h1>
          <p className="text-sand-500 mt-2 text-sm leading-relaxed">
            ספרי לנו קצת עליך ועל התינוק שלך כדי שנוכל להתאים את החוויה עבורך
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">שמך</label>
            <input
              type="text"
              value={motherName}
              onChange={e => setMotherName(e.target.value)}
              placeholder="מה שמך?"
              required
              className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white text-sand-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם התינוק/ת</label>
            <input
              type="text"
              value={babyName}
              onChange={e => setBabyName(e.target.value)}
              placeholder="שם התינוק שלך"
              required
              className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white text-sand-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">
              תאריך לידה <span className="text-sand-400 font-normal">(אופציונלי)</span>
            </label>
            <input
              type="date"
              value={babyDob}
              onChange={e => setBabyDob(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white text-sand-800"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-mustard-500 to-mustard-600 hover:from-mustard-600 hover:to-mustard-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading ? 'שומרת...' : 'בואי נתחיל! 🎉'}
          </button>
        </form>
      </div>
    </div>
  )
}
