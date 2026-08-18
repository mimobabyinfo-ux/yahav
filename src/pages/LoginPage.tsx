import { useState, useEffect } from 'react'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { LEGAL_LAST_UPDATED, MARKETING_CONSENT_LABEL, SIGNUP_CONSENT_SUMMARY } from '../constants/legal'
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
  // Brenda 18.8.26: "my wife is nervous about the legal side — maybe add
  // a consent about sharing details at signup." חוק הגנת הפרטיות, after
  // תיקון 13 (in force 14.8.2025), makes the notice at the moment of
  // collection the operative duty: what the data is for, who holds it,
  // that giving it is voluntary, and that she can see and correct it.
  // So the box is unticked by default and blocks signup until she ticks
  // it — a pre-ticked box is not consent. Marketing is a SEPARATE and
  // genuinely optional box, because חוק התקשורת סעיף 30א needs its own
  // prior consent and bundling the two would invalidate both.
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupSent, setSignupSent] = useState(false)
  // Brenda 18.8.26: "when I open the app it first says מרכז התפתחות
  // לתינוקות and then it changes to בית עוטף ומלטף."
  //
  // It was seeded with one tagline and then overwritten by the real one
  // from global_settings a moment later, so the first thing a mother read
  // about the brand was a line the brand no longer uses. Start empty and
  // hold the space: the tagline appears once, correct, without the row
  // jumping. The fallback is only for a failed fetch, and it now matches
  // what is actually in global_settings.
  const [subtitle, setSubtitle] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('global_settings').select('setting_value')
      .eq('setting_key', 'app_subtitle').limit(1)
      .then(({ data }) => setSubtitle(data?.[0]?.setting_value || 'בית עוטף ומלטף'))

    // Restore remembered email (Remember-Me)
    const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY)
    if (saved) {
      setEmail(saved)
      setRememberMe(true)
    }
  }, [])

  async function handleGoogle() {
    // The same gate as the email form. Without this the Google button was
    // a way around the consent entirely — and onboarding would then have
    // had to invent a timestamp for a tick that never happened.
    if (mode === 'signup' && !acceptedTerms) {
      setError('כדי לפתוח חשבון צריך לאשר את תנאי השימוש ומדיניות הפרטיות')
      return
    }
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
        if (!acceptedTerms) {
          setError('כדי לפתוח חשבון צריך לאשר את תנאי השימוש ומדיניות הפרטיות')
          setLoading(false)
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              // Stamped on the auth user so the consent is evidenced at
              // the moment it was given, not inferred later.
              terms_accepted_at: new Date().toISOString(),
              terms_version: LEGAL_LAST_UPDATED,
              marketing_opt_in: marketingOptIn,
            },
          },
        })
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
      style={{ background: '#F8F4EC' }}
      dir="rtl"
    >

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="flex justify-center">
          <MimoLogo size={210} />
        </div>

        {/* Signup email-sent confirmation */}
        {signupSent && (
          <div className="w-full bg-white rounded-3xl p-7 shadow-sm border border-[#F0EAE0] text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ background: '#F6ECD8' }}><Mail className="w-7 h-7" style={{ color: '#8A6A2F' }} /></div>
            <h2 className="font-bold text-sand-800 text-xl">בדקי את האימייל שלך!</h2>
            <p className="text-sand-500 text-sm leading-relaxed">
              שלחנו לך לינק לאימות ל-<strong>{email}</strong>.<br />
              לחצי על הלינק וחזרי לכאן להתחבר.
            </p>
            <button
              onClick={() => { setSignupSent(false); setMode('login') }}
              className="w-full font-bold py-3.5 rounded-2xl text-[#4A3A28]"
              style={{ background: '#E7C78A' }}
            >
              חזרה לכניסה
            </button>
          </div>
        )}


        {/* Subtitle. The row keeps its height while the value is in
            flight, so the card below does not jump when it lands. */}
        <p
          style={{
            color: '#818267', fontSize: '0.95rem', marginTop: '-12px',
            minHeight: '1.4em',
            opacity: subtitle ? 1 : 0,
            transition: 'opacity .25s ease',
          }}
        >
          {subtitle ?? '\u00A0'}
        </p>

        {/* Card */}
        {!signupSent && <div className="w-full bg-white rounded-3xl p-7 shadow-sm border border-[#F0EAE0] mt-2">
          <h2
            className="font-display text-center mb-6"
            style={{ fontSize: '1.5rem', fontWeight: 400, color: '#5E4938' }}
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
                  className="absolute top-1/2 -translate-y-1/2 left-3 p-1 text-sand-600 hover:text-sand-600"
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

            {mode === 'signup' && (
              <div className="space-y-2.5 rounded-2xl p-3.5" style={{ background: '#FFFFFF', border: '1px solid #E8DFCB' }}>
                <p className="text-[11px] leading-relaxed" style={{ color: '#7E7160' }}>
                  <span id="consent-note">{SIGNUP_CONSENT_SUMMARY}</span>
                </p>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-mustard-500 flex-shrink-0"
                    aria-describedby="consent-note"
                  />
                  <span className="text-[13px] leading-snug" style={{ color: '#5A4B3C' }}>
                    קראתי ואני מאשרת את{' '}
                    <a href="/?legal=terms" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#A35C3D' }}>תנאי השימוש</a>
                    {' '}ואת{' '}
                    <a href="/?legal=privacy" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#A35C3D' }}>מדיניות הפרטיות</a>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={e => setMarketingOptIn(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-mustard-500 flex-shrink-0"
                  />
                  <span className="text-[13px] leading-snug" style={{ color: '#5A4B3C' }}>
                    {MARKETING_CONSENT_LABEL}
                  </span>
                </label>
              </div>
            )}

            {error && (
              <div className="rounded-2xl p-3 text-sm text-center" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'signup' && !acceptedTerms)}
              className="w-full font-bold py-4 rounded-2xl transition-all disabled:opacity-50"
              style={{
                background: '#E7C78A',
                color: '#4A3A28',
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

          {/* Reachable from every entry point, signed in or not. The
              accessibility statement has to be findable from the service
              itself, not only from inside it. */}
          <nav className="flex justify-center gap-3 mt-3 text-[11px]" aria-label="מסמכים">
            <a href="/?legal=privacy" className="underline" style={{ color: '#9C8A74' }}>פרטיות</a>
            <a href="/?legal=terms" className="underline" style={{ color: '#9C8A74' }}>תנאי שימוש</a>
            <a href="/?legal=accessibility" className="underline" style={{ color: '#9C8A74' }}>נגישות</a>
          </nav>
        </div>}
      </div>
    </div>
  )
}
