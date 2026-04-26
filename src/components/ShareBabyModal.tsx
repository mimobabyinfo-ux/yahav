import { useState } from 'react'
import { X, Copy, Check, MessageCircle, Eye } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'
import MimoLogo from './MimoLogo'

const APP_BASE = 'https://mimoapp.vercel.app'

export default function ShareBabyModal({ onClose }: { onClose: () => void }) {
  const { profile, selectedChild } = useAuth()
  const [copiedLive, setCopiedLive] = useState(false)
  const [copiedApp, setCopiedApp] = useState(false)

  const baby = selectedChild
  const age = baby?.dob ? getBabyAge(baby.dob) : null
  const genderEmoji = baby?.gender === 'boy' ? '👶🏻' : baby?.gender === 'girl' ? '👧' : '👶'

  const liveLink = baby?.share_token
    ? `${APP_BASE}?baby=${baby.share_token}`
    : null

  const shareText = [
    `${genderEmoji} ${baby?.name ?? 'התינוק שלי'}`,
    age ? `גיל: ${age}` : null,
    profile?.mother_name ? `אמא: ${profile.mother_name}` : null,
    '',
    '👀 לצפייה חיה בפעילויות של היום:',
    liveLink ?? APP_BASE,
  ].filter(l => l !== null).join('\n')

  function copyLiveLink() {
    if (!liveLink) return
    navigator.clipboard.writeText(liveLink).then(() => {
      setCopiedLive(true)
      setTimeout(() => setCopiedLive(false), 2000)
    })
  }

  function copyAppLink() {
    navigator.clipboard.writeText(APP_BASE).then(() => {
      setCopiedApp(true)
      setTimeout(() => setCopiedApp(false), 2000)
    })
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div className="bg-[#DCD4C8] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
          <h3 className="font-bold text-sand-800">שיתוף פרופיל התינוק/ת</h3>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Baby card preview */}
        <div className="p-5">
          <div className="rounded-3xl p-5 text-center space-y-3" style={{ background: '#FFFFFF' }}>
            <div className="flex justify-center">
              <MimoLogo size={70} />
            </div>
            <div className="text-4xl">{genderEmoji}</div>
            <div>
              <p className="font-bold text-sand-800 text-xl">{baby?.name ?? 'התינוק שלי'}</p>
              {age && <p className="text-sand-500 text-sm mt-1">{age}</p>}
              {profile?.mother_name && (
                <p className="text-sand-400 text-xs mt-0.5">אמא: {profile.mother_name}</p>
              )}
            </div>
            <div className="text-xs text-sand-400 border-t border-sand-200 pt-2 mt-1">
              עוקבת אחר ההתפתחות עם Mimo 🐣
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-6 space-y-3">
          {/* Live view — main CTA */}
          {liveLink && (
            <div className="bg-blue-50 rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-blue-800">צפייה חיה בלי להירשם</p>
              </div>
              <p className="text-[11px] text-blue-600 leading-relaxed">
                סבתא, אבא או כל אחד — יכולים לראות את הפעילויות של היום בלחיצה אחת, בלי להתחבר
              </p>
              <button
                onClick={copyLiveLink}
                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
              >
                {copiedLive ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedLive ? 'הלינק הועתק!' : 'העתק לינק לצפייה חיה'}
              </button>
            </div>
          )}

          <button
            onClick={shareWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            שתפי בוואטסאפ
          </button>

          <button
            onClick={copyAppLink}
            className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm transition-all border-2 border-sand-200 text-sand-700 hover:bg-sand-50"
          >
            {copiedApp ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            {copiedApp ? 'הועתק!' : 'העתק לינק לאפליקציה'}
          </button>
        </div>
      </div>
    </div>
  )
}
