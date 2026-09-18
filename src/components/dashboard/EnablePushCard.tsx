import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { enablePush, getPushState, type PushState } from '../../utils/webPush'
import { useTracker } from '../../hooks/useTracker'

// "הפעילי התראות" on the home screen.
//
// Yahav 18.9.26: 9 of 125 mothers had push on, while 47 had installed the
// app. The only opt-in lived inside the community tab, under the events,
// so most never met it. This card sits on the home screen and shows only
// when a tap can actually work: the browser has push, she has not refused,
// and she is not subscribed yet. On an iPhone that is still in Safari the
// card does not appear (push does not exist there yet); the "?" install
// guide beside the gear is the path for that case.
//
// "לא עכשיו" hides it on this device for 14 days (localStorage), not
// forever: a mother who said no on a busy morning should be asked again,
// but not every day.

const SNOOZE_KEY = 'mimo_push_card_snoozed_until'
const SNOOZE_DAYS = 14

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
    return Number.isFinite(until) && until > Date.now()
  } catch { return false }
}

export default function EnablePushCard() {
  const { track } = useTracker()
  const [state, setState] = useState<PushState | null>(null)
  const [hidden, setHidden] = useState(snoozed())
  const [busy, setBusy] = useState(false)

  useEffect(() => { getPushState().then(setState) }, [])

  if (hidden || state !== 'off') return null

  async function enable() {
    setBusy(true)
    const next = await enablePush()
    setBusy(false)
    setState(next)
    track('push_enable', { result: next, from: 'home_card' })
  }

  function later() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)) } catch { /* private mode */ }
    setHidden(true)
    track('push_enable', { result: 'later', from: 'home_card' })
  }

  return (
    <div className="rounded-3xl p-4 flex items-start gap-3" style={{ background: '#F6ECD8', border: '1px solid #E7C78A' }}>
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#FFFFFF' }}>
        <Bell className="w-5 h-5" style={{ color: '#8A6A2F' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold" style={{ fontSize: 14, color: '#5E4938' }}>
          שנעדכן אותך?
        </p>
        <p className="mt-0.5" style={{ fontSize: 13, color: '#7B604C', lineHeight: 1.6 }}>
          מפגש חדש בקהילה, תזכורת לפני אירוע, ומקום שהתפנה להשלמה. בלי ספאם.
        </p>
        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={enable}
            disabled={busy}
            className="px-4 py-2 rounded-2xl text-sm font-bold text-[#4A3A28] disabled:opacity-40 transition-all hover:brightness-95"
            style={{ background: '#E7C78A' }}
          >
            {busy ? 'רגע...' : 'הפעלת התראות'}
          </button>
          <button onClick={later} className="px-3 py-2 text-[13px] font-semibold" style={{ color: '#8C7D6B' }}>
            לא עכשיו
          </button>
        </div>
      </div>
      <button onClick={later} className="p-1 -m-1 text-sand-400 hover:text-sand-600" aria-label="סגירה">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
