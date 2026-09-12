// חברה מביאה חברה — Brenda 12.9.26: "תקף תמיד, כל עוד החברה הגיעה דרך
// האמא הזאת והיא שמה במסך הבית."
//
// Her personal link is ?ref=<her code>. The friend who opens it, signs
// up and later opens Mimo from her home screen earns a credit for BOTH
// of them — granted by the DB (grant_referral_credits) the moment that
// first standalone open is recorded. This card is only the link and the
// share button. Amount and on/off live in global_settings so Brenda can
// change them without a deploy.
import { useEffect, useState } from 'react'
import { Copy, Check, Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTracker } from '../../hooks/useTracker'

export default function InviteFriendCard() {
  const { profile } = useAuth()
  const { track } = useTracker()
  const [enabled, setEnabled] = useState(false)
  const [amount, setAmount] = useState(30)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.from('global_settings').select('setting_key, setting_value')
      .in('setting_key', ['referral_enabled', 'referral_amount'])
      .then(({ data }) => {
        for (const r of data ?? []) {
          if (r.setting_key === 'referral_enabled') setEnabled(r.setting_value === 'true')
          if (r.setting_key === 'referral_amount') {
            const n = Number(r.setting_value)
            if (Number.isFinite(n) && n > 0) setAmount(n)
          }
        }
      })
  }, [])

  const code = profile?.referral_code
  if (!enabled || !code) return null

  const link = `${window.location.origin}/?ref=${code}`
  const text = `היי! אני משתמשת במימו — אפליקציה לאמהות עם יומן לתינוק, סדנאות וקהילה ברמת גן 🤍\n` +
    `הרשמי דרך הלינק שלי ושימי אותה במסך הבית, ושתינו נקבל ₪${amount} לאירועי הקהילה:\n${link}`

  async function share() {
    track('referral_share', { via: 'button' })
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* cancelled — fall through */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  async function copy() {
    track('referral_share', { via: 'copy' })
    try { await navigator.clipboard.writeText(link) } catch { /* no clipboard — the link is visible */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="rounded-3xl p-4 space-y-3" style={{ background: '#EADBDD' }} dir="rtl">
      <div>
        <p className="font-bold" style={{ fontSize: 15, color: '#5E4938' }}>חברה מביאה חברה 🤍</p>
        <p className="font-semibold mt-0.5" style={{ fontSize: 13, color: '#8C6E63', lineHeight: 1.5 }}>
          שלחי לחברה את הלינק שלך. כשהיא נרשמת ושמה את מימו במסך הבית — שתיכן מקבלות ₪{amount} לאירועי הקהילה.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: 'rgba(255,255,255,.6)' }}>
        <span className="flex-1 min-w-0 truncate font-semibold" dir="ltr" style={{ fontSize: 12, color: '#5E4938', textAlign: 'left' }}>{link}</span>
        <button onClick={copy} className="flex-shrink-0 p-1.5 rounded-full hover:brightness-95" style={{ background: '#F0EBE3' }} aria-label="העתקת הלינק">
          {copied ? <Check className="w-4 h-4" style={{ color: '#5E4938' }} /> : <Copy className="w-4 h-4" style={{ color: '#7B604C' }} />}
        </button>
      </div>
      <button
        onClick={share}
        className="w-full py-3 rounded-2xl font-bold text-sm text-[#4A3A28] flex items-center justify-center gap-2 transition-all hover:brightness-95"
        style={{ background: '#E7C78A' }}
      >
        <Share2 className="w-4 h-4" />
        לשלוח לחברה
      </button>
    </div>
  )
}
