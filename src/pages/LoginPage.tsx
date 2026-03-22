import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה, נסי שוב'
      if (msg.includes('Invalid login credentials')) setError('אימייל או סיסמה שגויים')
      else if (msg.includes('already registered')) setError('כתובת אימייל זו כבר רשומה')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-beige-50 via-sand-50 to-mustard-50" dir="rtl">
      {/* Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none">
        <span className="text-[200px] opacity-5">🍼</span>
      </div>

      <div className="w-full max-w-sm space-y-8 relative">
        {/* Logo */}
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-mustard-400 to-mustard-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-4xl">🍼</span>
          </div>
          <h1 className="text-3xl font-bold text-sand-800">מימו</h1>
          <p className="text-sand-500 mt-1">חברה לדרך עם התינוק שלך</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-sand-100 rounded-2xl p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'login' ? 'bg-white text-mustard-700 shadow-sm' : 'text-sand-500'
            }`}
          >
            כניסה
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'signup' ? 'bg-white text-mustard-700 shadow-sm' : 'text-sand-500'
            }`}
          >
            הרשמה
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">כתובת אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 transition-colors bg-white text-sand-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 transition-colors bg-white text-sand-800"
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
            className="w-full bg-gradient-to-r from-mustard-500 to-mustard-600 hover:from-mustard-600 hover:to-mustard-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
          >
            {loading ? 'מעבדת...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>

        <p className="text-center text-xs text-sand-400">
          מימו — נבנה עם ❤️ לאמהות חדשות
        </p>
      </div>
    </div>
  )
}
