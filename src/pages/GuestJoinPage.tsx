import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import MimoLogo from '../components/MimoLogo'

export default function GuestJoinPage({ token }: { token: string }) {
  const { redeemFamilyInvite } = useAuth()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    redeemFamilyInvite(token).then(ok => {
      if (!ok) setStatus('error')
      // On success, onAuthStateChange fires in AuthContext → app re-renders as guest
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 gap-6"
      style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }}
      dir="rtl"
    >
      <MimoLogo size={90} />

      {status === 'loading' ? (
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          <p className="font-bold text-sand-800 text-lg">מצטרפת למשפחה...</p>
          <p className="text-sand-400 text-sm">רק רגע ✨</p>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <p className="text-4xl">😕</p>
          <p className="font-bold text-sand-800">קישור לא תקין או פג תוקף</p>
          <p className="text-sand-400 text-sm">בקש/י קישור חדש מבן/בת המשפחה</p>
        </div>
      )}
    </div>
  )
}
