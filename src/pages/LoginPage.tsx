import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

const REMEMBERED_EMAIL_KEY = 'mimo_remembered_email'

function moveSessionToSessionStorage() {
  const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.includes('auth-token'))
  if (key) {
    sessionStorage.setItem(key, localStorage.getItem(key)!)
    localStorage.removeItem(key)
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupSent, setSignupSent] = useState(false)
  const [subtitle, setSubtitle] = useState('מרכז התפתחות לתינוקות')

  useEffect(() => {
    supabase.from('global_settings').select('setting_value')
      .eq('setting_key', 'app_subtitle').limit(1)
      .then(({ data }) => { const v = data?.[0]?.setting_value; if (v) setSubtitle(v) })

    // Restore remembered email (Remember-Me)
    const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY)
    if (saved) {
      setEmail(saved)
      setRememberMe(true)
    }
  }, [])

  async function handleGoogle() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is required, data.session will be null
        if (!data.session) {
          setSignupSent(true)
          setLoading(false)
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY)
          moveSessionToSessionStorage()
        }
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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{ background: '#FFFFFF' }}
      dir="rtl"
    >
      {/* Background watermark duck */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none" style={{ opacity: 0.07 }}>
        <MimoLogo size={520} />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex justify-center">
          <MimoLogo size={260} />
        </div>

        {/* Signup email-sent confirmation */}
        {signupSent && (
          <div className="w-full bg-[#F5F1EB] rounded-3xl shadow-lg p-7 text-center space-y-4">
            <div className="text-5xl">📧</div>
            <h2 className="font-bold text-sand-800 text-xl">בדקי את האימייל שלך!</h2>
            <p className="text-sand-500 text-sm leading-relaxed">
              שלחנו לך לינק לאימות ל-<strong>{email}</strong>.<br />
              לחצי על הלינק וחזרי לכאן להתחבר.
            </p>
            <button
              onClick={() => { setSignupSent(false); setMode('login') }}
              className="w-full font-bold py-3.5 rounded-2xl text-white"
              style={{ background: '#E7C78A' }}
            >
              חזרה לכניסה
            </button>
          </div>
        )}


        {/* Subtitle */}
        <p style={{ color: '#818267', fontSize: '0.95rem', marginTop: '-12px' }}>
          {subtitle}
        </p>

        {/* Card */}
        {!signupSent && <div className="w-full bg-[#F5F1EB] rounded-3xl shadow-lg p-7 mt-2">
          <h2
            className="font-bold text-center mb-6"
            style={{ fontSize: '1.5rem', color: '#3D2E20', fontFamily: 'Nunito, sans-serif' }}
          >
            {mode === 'login' ? 'התחברות' : 'הרשמה'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div>
              <label className="block text-sm text-right mb-1.5" style={{ color: '#818267' }}>
                אימייל
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="w-full px-4 py-3.5 rounded-2xl text-right focus:outline-none transition-colors"
                style={{
                  border: '1.5px solid #C6BDA0',
                  color: '#3D2E20',
                  background: 'white',
                  fontSize: '0.95rem',
                }}
                onFocus={e => (e.target.style.borderColor = '#D9B978')}
                onBlur={e => (e.target.style.borderColor = '#C6BDA0')}
              />
            </div>

            <div>
              <label className="block text-sm text-right mb-1.5" style={{ color: '#818267' }}>
                סיסמה
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                  minLength={6}
                  className="w-full pr-4 pl-11 py-3.5 rounded-2xl text-right focus:outline-none transition-colors"
                  style={{
                    border: '1.5px solid #C6BDA0',
                    color: '#3D2E20',
                    background: 'white',
                    fontSize: '0.95rem',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#D9B978')}
                  onBlur={e => (e.target.style.borderColor = '#C6BDA0')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute top-1/2 -translate-y-1/2 left-3 p-1 text-sand-400 hover:text-sand-600"
                  aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded accent-mustard-500"
                />
                <span className="text-sm" style={{ color: '#818267' }}>זכרי אותי</span>
              </label>
            )}

            {error && (
              <div className="rounded-2xl p-3 text-sm text-center" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold py-4 rounded-2xl transition-all disabled:opacity-50"
              style={{
                background: '#E7C78A',
                color: 'white',
                fontSize: '1rem',
                fontFamily: 'Nunito, sans-serif',
                marginTop: '8px',
              }}
            >
              {loading ? '...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px" style={{ background: '#C6BDA0' }} />
            <span className="text-xs" style={{ color: '#818267' }}>או</span>
            <div className="flex-1 h-px" style={{ background: '#C6BDA0' }} />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold transition-all"
            style={{ border: '1.5px solid #C6BDA0', color: '#3D2E20', background: 'white', fontSize: '0.95rem' }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.7 0 6.7 5.4 2.8 13.3l7.8 6C12.4 13.2 17.8 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
              <path fill="#FBBC05" d="M10.6 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.8 10.7l7.8-6z"/>
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.8 6C6.7 42.6 14.7 48 24 48z"/>
            </svg>
            המשך עם Google
          </button>

          {/* Toggle */}
          <p className="text-center mt-4 text-sm" style={{ color: '#818267' }}>
            {mode === 'login' ? 'אין לך חשבון? ' : 'יש לך חשבון? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="font-bold underline"
              style={{ color: '#A35C3D' }}
            >
              {mode === 'login' ? 'הרשמה' : 'כניסה'}
            </button>
          </p>
        </div>}
      </div>
    </div>
  )
}
