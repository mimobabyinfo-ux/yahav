import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTracker } from '../hooks/useTracker'

/** "איך שמים את מימו במסך הבית" — one 24-second silent clip that covers
 *  both אייפון/ספארי and אנדרואיד/כרום.
 *
 *  It replaces the written three-step sheet that used to slide up on iOS
 *  after three seconds (Brenda 29.8.26: one video instead of two
 *  explanations racing each other). What survives from it is the Android
 *  native install button — beforeinstallprompt is the one thing a video
 *  cannot do — which now lives inside this modal.
 *
 *  Two ways in:
 *   · once by itself, to a mother who is not yet running the installed
 *     app. That is the first visit after she registers.
 *   · the ? beside the settings gear on the home screen, always, for the
 *     mother who closed it too fast or is setting up a second phone.
 */

const SEEN_KEY = 'mimo_install_guide_seen'
const OPEN_EVENT = 'mimo:install-guide'

/** Open the guide from anywhere (the ? button on the home screen). */
export function openInstallGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

// Chrome's BeforeInstallPromptEvent type
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallGuide() {
  const { track } = useTracker()
  const [open, setOpen] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  // Chrome hands this over once, whenever it feels like it. Hold it
  // whether or not the modal is open, so the button is ready when it is.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // The ? button.
  useEffect(() => {
    const handler = () => {
      setOpen(true)
      track('install_guide', { via: 'button' })
    }
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [track])

  // First visit, by itself. Never to a mother who already installed —
  // there is nothing left to explain to her — and never twice.
  useEffect(() => {
    if (isInstalled()) return
    try { if (localStorage.getItem(SEEN_KEY)) return } catch { return }
    const t = setTimeout(() => {
      setOpen(true)
      try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
      track('install_guide', { via: 'auto' })
    }, 2500)
    return () => clearTimeout(t)
  }, [track])

  const close = useCallback(() => {
    setOpen(false)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
  }, [])

  async function installNow() {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') close()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      dir="rtl"
      onClick={close}
    >
      <div
        className="w-full max-w-[340px] max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{ background: '#F5F1EB' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <p className="font-bold text-sand-800 text-sm">שמים את מימו במסך הבית</p>
            <p className="text-xs text-sand-400 mt-0.5">חצי דקה, ואת נכנסת בלחיצה אחת</p>
          </div>
          <button
            onClick={close}
            className="p-1.5 text-sand-300 hover:text-sand-500 flex-shrink-0"
            aria-label="סגירה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Silent by design: it autoplays only because it is muted, and on
            iOS only because of playsInline. Controls stay on so she can
            pause on the step she is standing in. */}
        {/* Capped by HEIGHT, not width: the clip is 9:16, and a card that
            simply let it be as tall as it wants pushed "הבנתי" off the
            bottom of a small phone. */}
        <div className="w-full flex justify-center bg-black">
          <video
            src="/mimo-add-to-home-screen-v2.mp4"
            poster="/mimo-add-to-home-screen-v2.jpg"
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            className="max-h-[58vh] w-auto max-w-full"
          />
        </div>

        <div className="px-4 py-3 space-y-2">
          {deferred && (
            <button
              onClick={installNow}
              className="w-full py-3 rounded-2xl font-bold text-sm text-[#4A3A28] transition-all hover:brightness-95"
              style={{ background: '#E7C78A' }}
            >
              📲 להתקנה עכשיו
            </button>
          )}
          <button
            onClick={close}
            className="w-full py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: '#EFE9DF', color: '#8A7A63' }}
          >
            הבנתי, תודה
          </button>
        </div>
      </div>
    </div>
  )
}
