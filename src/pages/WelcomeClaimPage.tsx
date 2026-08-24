import { useEffect, useState } from 'react'
import MimoLogo from '../components/MimoLogo'

// ?welcome=<lead_id> — the link inside the post-payment WhatsApp / email.
//
// Why a lead id and not a Supabase magic link: a magic link expires within
// the hour, and a WhatsApp message gets read the next morning. This route
// asks claim-course-purchase for a FRESH sign-in link at the moment she
// taps, so the message she was sent never goes stale.
//
// The lead id is the credential. The edge function refuses any lead that is
// not already status='paid', so knowing an id grants nothing that the
// payment did not already grant.
//
// She never sees this screen for long: on success we replace the location
// with the sign-in link, which lands her either inside her course or on the
// home screen, depending on what she bought.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function WelcomeClaimPage({ leadId }: { leadId: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!UUID.test(leadId)) { setFailed(true); return }
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-course-purchase`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: leadId, want_link: true }),
          },
        )
        const out = await res.json().catch(() => null)
        if (cancelled) return

        const target = out?.action_link ?? out?.fallback_url ?? null
        if (!res.ok || !out?.ok || !target) {
          console.error('[welcome] claim failed:', res.status, out)
          setFailed(true)
          return
        }
        // replace(), not assign(): back should not re-fire a spent link.
        window.location.replace(target)
      } catch (e) {
        console.error('[welcome] claim threw:', e)
        if (!cancelled) setFailed(true)
      }
    }

    run()
    return () => { cancelled = true }
  }, [leadId])

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center flex flex-col items-center gap-4 max-w-xs">
          <MimoLogo size={90} />
          <h1 className="text-lg font-bold text-sand-800">הקישור לא עבד</h1>
          <p className="text-sand-500 text-sm leading-relaxed">
            אפשר להיכנס ישירות עם כתובת המייל שאיתה שילמת — הכל מחכה לך שם.
          </p>
          <a
            href="/"
            className="mt-1 px-6 py-3 rounded-2xl font-bold text-sm text-white"
            style={{ background: '#E7C78A' }}
          >
            לכניסה למימו
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="text-center flex flex-col items-center gap-4">
        <div className="animate-pulse"><MimoLogo size={120} /></div>
        <p className="text-sand-400 text-sm">רגע, פותחת לך את מימו...</p>
      </div>
    </div>
  )
}
