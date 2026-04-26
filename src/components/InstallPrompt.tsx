import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

type Platform = 'ios' | 'android' | 'other'

function getPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<Platform>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (localStorage.getItem('pwa-dismissed')) return

    const p = getPlatform()
    setPlatform(p)

    if (p === 'android') {
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setShow(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }

    if (p === 'ios') {
      // Show iOS instructions after 3 seconds
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem('pwa-dismissed', '1')
  }

  async function installAndroid() {
    if (!deferredPrompt) return
    const prompt = deferredPrompt as BeforeInstallPromptEvent
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') dismiss()
    setDeferredPrompt(null)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-24 right-0 left-0 max-w-[480px] mx-auto px-4 z-50 animate-slide-up" dir="rtl">
      <div className="bg-[#F5F5F5] rounded-3xl shadow-2xl border border-sand-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-50">
          <div className="flex items-center gap-3">
            <img src="/mimo_logo.png" alt="Mimo" className="w-10 h-10 rounded-2xl object-cover" />
            <div>
              <p className="font-bold text-sand-800 text-sm">הוסיפי Mimo למסך הבית</p>
              <p className="text-xs text-sand-400">גישה מהירה — כמו אפליקציה אמיתית</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 text-sand-300 hover:text-sand-500 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {platform === 'android' && (
          <div className="px-5 py-4">
            <button
              onClick={installAndroid}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm"
              style={{ background: '#E7C78A' }}
            >
              📲 התקיני את האפליקציה
            </button>
          </div>
        )}

        {platform === 'ios' && (
          <div className="px-5 py-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">1️⃣</span>
              <p className="text-sm text-sand-700">לחצי על כפתור השיתוף <span className="font-bold">⬆️</span> בתחתית הדפדפן (Safari)</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">2️⃣</span>
              <p className="text-sm text-sand-700">גללי מטה ובחרי <span className="font-bold">"הוסף למסך הבית"</span></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">3️⃣</span>
              <p className="text-sm text-sand-700">לחצי <span className="font-bold">"הוסף"</span> — וזהו! 🎉</p>
            </div>
            <button onClick={dismiss} className="w-full py-2.5 rounded-2xl bg-sand-50 text-sand-500 text-sm font-semibold mt-1">
              הבנתי, תודה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Chrome's BeforeInstallPromptEvent type
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
