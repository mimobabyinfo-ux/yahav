import { useEffect, useState } from 'react'
import { Bell, BellOff, Share, PlusSquare, Check } from 'lucide-react'
import { disablePush, enablePush, getPushState, isIos, type PushState } from '../../utils/webPush'

// "תזכורת לפני האירוע" — the opt-in, plus the nudge that has to come
// first on iPhone.
//
// The iPhone constraint is the whole reason this component exists in
// this shape: Safari exposes no push API at all until the app has been
// added to the home screen, so an "allow notifications" button would do
// nothing there. Rather than let it fail silently, that case gets the
// two-step instructions instead of a button.

export default function EventRemindersCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getPushState().then(setState) }, [])

  if (state === null || state === 'unsupported') return null

  async function toggle() {
    setBusy(true)
    setState(state === 'on' ? await disablePush() : await enablePush())
    setBusy(false)
  }

  // Already on — a quiet confirmation, not a banner.
  if (state === 'on') {
    return (
      <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5" style={{ background: '#EDEDE6' }}>
        <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#4F5040' }} />
        <p className="flex-1 font-semibold" style={{ fontSize: 13, color: '#4F5040' }}>
          נשלח לך תזכורת יום לפני כל מפגש
        </p>
        <button
          onClick={toggle}
          disabled={busy}
          className="flex-shrink-0 font-bold disabled:opacity-40"
          style={{ fontSize: 12, color: '#7B604C' }}
        >
          {busy ? '...' : 'ביטול'}
        </button>
      </div>
    )
  }

  // iPhone, still in Safari: push doesn't exist yet. Show her how.
  if (state === 'needs-install') {
    return (
      <div className="rounded-3xl p-4 space-y-2.5" style={{ background: '#F6ECD8', border: '1px solid #E7C78A' }}>
        <p className="flex items-center gap-2 font-bold" style={{ fontSize: 14, color: '#6E5836' }}>
          <Bell className="w-4 h-4" /> רוצה תזכורת לפני המפגש?
        </p>
        <p style={{ fontSize: 13, color: '#7B604C', lineHeight: 1.6 }}>
          באייפון אפשר לקבל התראות רק אחרי שמוסיפים את מימו למסך הבית. זה לוקח שתי שניות:
        </p>
        <ol className="space-y-1.5" style={{ fontSize: 13, color: '#5E4938' }}>
          <li className="flex items-center gap-2">
            <Share className="w-4 h-4 flex-shrink-0" style={{ color: '#8A6A2F' }} />
            לוחצים על כפתור השיתוף למטה במסך
          </li>
          <li className="flex items-center gap-2">
            <PlusSquare className="w-4 h-4 flex-shrink-0" style={{ color: '#8A6A2F' }} />
            בוחרים "הוספה למסך הבית"
          </li>
        </ol>
        <p style={{ fontSize: 12, color: '#A2937D' }}>
          אחרי זה תפתחי את מימו מהאייקון החדש, והכפתור להפעלת התזכורות יופיע כאן.
        </p>
      </div>
    )
  }

  // She refused once. The browser will not ask again — only she can undo
  // it, so say where, instead of showing a button that does nothing.
  if (state === 'denied') {
    return (
      <div className="flex items-start gap-2 rounded-2xl px-4 py-3" style={{ background: '#F5F1EB' }}>
        <BellOff className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#8A7A63' }} />
        <p style={{ fontSize: 12.5, color: '#7B604C', lineHeight: 1.6 }}>
          התראות חסומות עבור מימו בדפדפן. אפשר להחזיר אותן בהגדרות האתר{isIos() ? '' : ' (האייקון ליד כתובת האתר)'} — או פשוט להוסיף כל מפגש ליומן.
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="w-full flex items-center gap-3 rounded-3xl px-4 py-3.5 text-right transition-all hover:brightness-95 disabled:opacity-50"
      style={{ background: '#F6ECD8', border: '1px solid #E7C78A' }}
    >
      <Bell className="w-5 h-5 flex-shrink-0" style={{ color: '#8A6A2F' }} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold" style={{ fontSize: 14, color: '#6E5836' }}>
          {busy ? 'רגע...' : 'הפעילי תזכורת לפני המפגש'}
        </span>
        <span className="block" style={{ fontSize: 12, color: '#8A7A63' }}>
          נזכיר לך יום לפני, בהתראה לטלפון
        </span>
      </span>
    </button>
  )
}
