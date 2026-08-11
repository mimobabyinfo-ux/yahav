import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, Check, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

// Vendor / host check-in page — opened via ?checkin=<token> (no account,
// no login). The token comes from event_checkin_tokens (admin-only
// table) through the SECURITY DEFINER get_event_checkin RPC, which only
// answers from the day before the event to the day after. Shows FIRST
// NAMES ONLY — no phones, no profiles.

type CheckinRow = {
  event_id: string
  title: string
  emoji: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  vendor_name: string | null
  registration_id: string
  first_name: string
  status: 'registered' | 'attended' | 'no_show'
}

function hebDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long',
  })
}

export default function VendorCheckinPage({ token }: { token: string }) {
  const [rows, setRows] = useState<CheckinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_event_checkin', { p_token: token })
    const list = (data ?? []) as CheckinRow[]
    if (error || list.length === 0) {
      // Empty can mean: bad/revoked token, inactive event, or outside
      // the day-before → day-after window. Same friendly message.
      setInvalid(error != null || list.length === 0)
    } else {
      setInvalid(false)
    }
    setRows(list)
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
    // Light auto-refresh so two people marking in parallel stay in sync.
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const ev = rows[0] ?? null
  const attended = rows.filter(r => r.status === 'attended').length

  const visible = useMemo(() => {
    const needle = q.trim()
    const list = needle ? rows.filter(r => r.first_name.includes(needle)) : rows
    return [...list].sort((a, b) => a.first_name.localeCompare(b.first_name, 'he'))
  }, [rows, q])

  async function toggle(r: CheckinRow) {
    if (busyId) return
    const target = r.status !== 'attended'
    setBusyId(r.registration_id)
    // Optimistic flip; revert on failure.
    setRows(prev => prev.map(x => x.registration_id === r.registration_id
      ? { ...x, status: target ? 'attended' : 'registered' } : x))
    const { data, error } = await supabase.rpc('set_event_checkin', {
      p_token: token, p_registration_id: r.registration_id, p_attended: target,
    })
    setBusyId(null)
    if (error || data == null) {
      // Window closed / token revoked mid-session — resync.
      load()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (invalid || !ev) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-3xl shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <MimoLogo size={72} />
          <h1 className="font-bold text-lg" style={{ color: '#5E4938' }}>הקישור אינו פעיל</h1>
          <p className="text-sm leading-relaxed" style={{ color: '#7B604C' }}>
            דף הצ'ק-אין נפתח מיום לפני האירוע ועד יום אחריו.
            אם האירוע מתקיים עכשיו והקישור לא עובד, דברו עם ברנדה 🤍
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-16" dir="rtl">
      <div className="max-w-sm mx-auto px-4 pt-8 space-y-4">
        {/* Event header */}
        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-2">
          <p className="text-xs font-bold" style={{ color: '#8A6A2F' }}>צ'ק-אין · הקהילה של מימו</p>
          <h1 className="font-display" style={{ fontSize: 24, lineHeight: 1.2, color: '#5E4938' }}>
            {ev.emoji && `${ev.emoji} `}{ev.title}
          </h1>
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#7B604C' }}>
            <CalendarDays className="w-4 h-4 flex-shrink-0" />
            {hebDate(ev.event_date)}
            {ev.start_time && (
              <>
                {' · '}
                {/* dir=ltr keeps the time range from flipping under RTL */}
                <span dir="ltr">{ev.start_time.slice(0, 5)}{ev.end_time && `–${ev.end_time.slice(0, 5)}`}</span>
              </>
            )}
          </p>
          {ev.location && (
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#7B604C' }}>
              <MapPin className="w-4 h-4 flex-shrink-0" />{ev.location}
            </p>
          )}
        </div>

        {/* Progress counter */}
        <div className="flex items-center justify-between px-4 py-3 rounded-2xl" style={{ background: '#F6ECD8' }}>
          <span className="text-sm font-bold" style={{ color: '#4A3A28' }}>
            הגיעו {attended} מתוך {rows.length} רשומות
          </span>
          <button onClick={load} className="p-1.5 rounded-full" title="רענון" aria-label="רענון">
            <RefreshCw className="w-4 h-4" style={{ color: '#8A6A2F' }} />
          </button>
        </div>

        {/* Search — helpful from ~10 names up */}
        {rows.length >= 10 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#B7A895' }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="חיפוש שם..."
              className="w-full pr-9 pl-3 py-2.5 bg-white border border-[#E4DAD0] rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
        )}

        {/* Attendee list — tap a row to mark arrived / undo */}
        <div className="space-y-2">
          {visible.map(r => {
            const isIn = r.status === 'attended'
            return (
              <button
                key={r.registration_id}
                onClick={() => toggle(r)}
                disabled={busyId === r.registration_id}
                className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm transition-all active:scale-[0.99] disabled:opacity-60"
                style={isIn ? { border: '2px solid #9BA37B' } : { border: '2px solid transparent' }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={isIn ? { background: '#818267', borderColor: '#818267' } : { borderColor: '#DCD4C8' }}
                  >
                    {isIn && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </span>
                  <span className="font-bold text-base truncate" style={{ color: '#3D2E20' }}>{r.first_name}</span>
                </span>
                <span className="text-[13px] font-bold flex-shrink-0" style={{ color: isIn ? '#818267' : '#B7A895' }}>
                  {isIn ? 'הגיעה ✓' : r.status === 'no_show' ? 'סומנה כלא הגיעה' : 'סמנו כשמגיעה'}
                </span>
              </button>
            )
          })}
          {visible.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: '#957860' }}>
              {q ? 'אין שם כזה ברשימה' : 'אין עדיין נרשמות לאירוע'}
            </p>
          )}
        </div>

        <p className="text-center text-xs pt-2" style={{ color: '#B7A895' }}>
          הסימונים נשמרים מיד · אפשר לתקן בלחיצה חוזרת
        </p>
      </div>
    </div>
  )
}
