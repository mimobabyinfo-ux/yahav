import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MimoLogo from '../components/MimoLogo'
import {
  LEGAL_LAST_UPDATED,
  MARKETING_CONSENT_LABEL,
  SIGNUP_CONSENT_SUMMARY,
} from '../constants/legal'

// The consent, enforced where it cannot be walked around.
//
// Brenda 18.8.26: "if I sign up with Google it doesn't ask me to tick 'I
// have read and accept the terms' — it just lets me straight in."
//
// She was right and my first attempt was too shallow. I had put the tick
// on the signup form and guarded the Google button with it — but only in
// signup mode. Google OAuth signs a NEW person up and an existing one in
// through the same call, so a mother tapping "המשך עם Google" on the
// default login screen created an account without ever seeing the box.
//
// A checkbox on a form can only ever guard the form it sits on. The
// consent belongs to the ACCOUNT, so this is the gate: after
// authentication, before any part of the service, anyone whose account
// carries no accepted-terms stamp sees this and cannot pass it. It covers
// Google, email, magic links and every account that existed before today,
// and no future sign-in route can slip past it.
//
// The form tick stays where it is. It is better to ask before creating
// the account when we can, and it writes the stamp that keeps this screen
// from ever appearing for that route.
//
// Guests holding a share link are deliberately excluded upstream: they
// are looking at someone else's journal, not opening an account.

export default function ConsentGate() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    if (!user || !accepted || saving) return
    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    try {
      // The stamp goes on the auth user, always. That is the record of
      // the moment it was given, and App reads it from there, so the gate
      // lifts even for someone who has no profile row yet.
      const { error: authError } = await supabase.auth.updateUser({
        data: { terms_accepted_at: now, terms_version: LEGAL_LAST_UPDATED, marketing_opt_in: marketing },
      })
      if (authError) throw authError

      // Only UPDATE an existing profile — never create one. A profile row
      // is what tells App she has finished onboarding; inserting a stub
      // here would skip the onboarding screen and leave her in the app
      // with no name and no baby. When there is no row yet,
      // OnboardingPage carries these same three fields over from the auth
      // metadata when it creates it.
      if (profile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ terms_accepted_at: now, terms_version: LEGAL_LAST_UPDATED, marketing_opt_in: marketing })
          .eq('id', user.id)
        if (updateError) throw updateError
        await refreshProfile()
      }
      setDone(true)
    } catch {
      setError('לא הצלחנו לשמור. נסי שוב')
      setSaving(false)
    }
  }

  // Held between the write landing and the auth context catching up, so
  // the gate does not flash back for a moment after she taps.
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8F4EC' }}>
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: '#F8F4EC' }}
      dir="rtl"
    >
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <MimoLogo size={120} />
          </div>
          <h1 className="font-brand" style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 400, color: '#A35C3D' }}>
            עוד רגע ואנחנו בפנים
          </h1>
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4" style={{ border: '1px solid #E8DFCB' }}>
          <p className="text-[13px] leading-relaxed" style={{ color: '#7E7160' }}>
            {SIGNUP_CONSENT_SUMMARY}
          </p>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-mustard-500 flex-shrink-0"
            />
            <span className="text-sm leading-snug" style={{ color: '#5A4B3C' }}>
              קראתי ואני מאשרת את{' '}
              <a href="/?legal=terms" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#A35C3D' }}>תנאי השימוש</a>
              {' '}ואת{' '}
              <a href="/?legal=privacy" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#A35C3D' }}>מדיניות הפרטיות</a>
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marketing}
              onChange={e => setMarketing(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-mustard-500 flex-shrink-0"
            />
            <span className="text-sm leading-snug" style={{ color: '#5A4B3C' }}>
              {MARKETING_CONSENT_LABEL}
            </span>
          </label>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button
            onClick={accept}
            disabled={!accepted || saving}
            className="w-full font-bold py-4 rounded-2xl transition-all disabled:opacity-40"
            style={{ background: '#E7C78A', color: '#4A3A28' }}
          >
            {saving ? '...' : 'ממשיכות'}
          </button>
        </div>

        <p className="text-center text-xs" style={{ color: '#9C8A74' }}>
          לא מסכימה?{' '}
          <button onClick={signOut} className="underline font-semibold">יציאה</button>
        </p>
      </div>
    </div>
  )
}
