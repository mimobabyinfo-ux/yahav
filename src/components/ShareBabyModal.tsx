import { useState } from 'react'
import { X, Copy, Check, MessageCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'
import MimoLogo from './MimoLogo'

const WA_NUMBER = '972559904274'

export default function ShareBabyModal({ onClose }: { onClose: () => void }) {
  const { profile, selectedChild } = useAuth()
  const [copied, setCopied] = useState(false)

  const baby = selectedChild
  const age = baby?.dob ? getBabyAge(baby.dob) : null
  const genderEmoji = baby?.gender === 'boy' ? '👦' : baby?.gender === 'girl' ? '👧' : '👶'

  const shareText = [
    `${genderEmoji} ${baby?.name ?? 'התינוק שלי'}`,
    age ? `גיל: ${age}` : null,
    profile?.mother_name ? `אמא: ${profile.mother_name}` : null,
    '',
    '📱 עוקבת אחר ההתפתחות שלנו עם Mimo',
    'https://mimo-app.vercel.app',
  ].filter(l => l !== null).join('\n')

  function copyLink() {
    navigator.clipboard.writeText('https://mimo-app.vercel.app').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
          <h3 className="font-bold text-sand-800">שיתוף פרופיל התינוק/ת</h3>
          <button onClick={onClose} className="p-1.5 text-sand-300 hover:text-sand-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Baby card preview */}
        <div className="p-5">
          <div className="rounded-3xl p-5 text-center space-y-3" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }}>
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
          <button
            onClick={shareWhatsApp}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-2xl text-sm transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            שתפי בוואטסאפ
          </button>

          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm transition-all border-2 border-sand-200 text-sand-700 hover:bg-sand-50"
          >
            {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            {copied ? 'הלינק הועתק!' : 'העתק לינק לאפליקציה'}
          </button>
        </div>
      </div>
    </div>
  )
}
