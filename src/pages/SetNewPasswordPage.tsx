import { useState } from 'react'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

// שכחתי סיסמה (27.9.26), step 2. She tapped the link in the email from
// request-password-reset, Supabase signed her in with a recovery session,
// and App.tsx sends her here before anything else. She picks a new
// password; updateUser saves it on her account and she goes on into the
// app, already signed in.
export default function SetNewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('הסיסמה צריכה להיות לפחות 6 תווים'); return }
    if (password !== confirm) { setError('שתי הסיסמאות לא זהות'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      const m = error.message
      if (m.includes('different from the old')) setError('זו הסיסמה הקודמת. בחרי סיסמה אחרת')
      else if (m.toLowerCase().includes('session')) setError('הקישור פג תוקף. חזרי למסך הכניסה ובקשי קישור חדש')
      else setError(m)
      return
    }
    setSaved(true)
  }

  const inputStyle = { border: '1.5px solid #C6BDA0', color: '#3D2E20', background: 'white', fontSize: '0.95rem' }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F8F4EC' }} dir="rtl">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <MimoLogo size={160} />
        <div className="w-full bg-white rounded-3xl p-7 shadow-sm border border-[#F0EAE0]">
          {saved ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: '#6F7155' }} />
              <h2 className="font-bold text-xl" style={{ color: '#5E4938' }}>הסיסמה החדשה נשמרה</h2>
              <p className="text-sm" style={{ color: '#818267' }}>מהפעם הבאה נכנסים איתה.</p>
              <button onClick={onDone} className="w-full font-bold py-3.5 rounded-2xl" style={{ background: '#E7C78A', color: '#4A3A28' }}>
                כניסה למימו
              </button>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <h2 className="font-display text-center" style={{ fontSize: '1.5rem', fontWeight: 400, color: '#5E4938' }}>בחירת סיסמה חדשה</h2>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="סיסמה חדשה (לפחות 6 תווים)"
                  className="w-full pr-4 pl-11 py-3.5 rounded-2xl text-right focus:outline-none"
                  style={inputStyle}
                  autoFocus
                />
                <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
                  className="absolute top-1/2 -translate-y-1/2 left-3 p-1 text-sand-600"
                  aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'}>
                  {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="שוב, לאימות"
                className="w-full px-4 py-3.5 rounded-2xl text-right focus:outline-none"
                style={inputStyle}
              />
              {error && (
                <div className="rounded-2xl p-3 text-sm text-center" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
              )}
              <button type="submit" disabled={saving} className="w-full font-bold py-4 rounded-2xl disabled:opacity-50" style={{ background: '#E7C78A', color: '#4A3A28' }}>
                {saving ? '...' : 'שמירה'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
