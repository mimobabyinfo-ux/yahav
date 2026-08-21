import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Users, Clock, RotateCcw, Eye } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { waLink } from '../../utils/phone'

// שימוש באפליקציה — Brenda 21.8.26: "אני רוצה לדעת מה האמהות עשו
// באפליקציה, כמה זמן הם היו שם, איזה עמודים הם ראו... ומה הדבר העיקרי
// שהם עושות שם."
//
// She picked two questions out of four, so the panel answers exactly
// those and refuses to grow a third:
//   1. מי נעלמה ומי חוזרת — with the phone number, because the point is
//      to write to her, not to admire the number.
//   2. מה הן עושות בפועל — screens AND actions, side by side.
//
// Everything comes from two admin-only RPCs (get_app_usage,
// get_mothers_activity) which already exclude admin accounts: Brenda's
// own clicking was 170 of the first 890 page views and it drowned out
// the mothers she is trying to see.

type Usage = {
  days: number
  mothers_total: number
  mothers_new: number
  active_today: number
  active_7d: number
  active_30d: number
  active_window: number
  never_opened: number
  visits: number
  visits_per_mother: number | null
  median_seconds: number | null
  avg_seconds: number | null
  glance_visits: number
  avg_views_per_visit: number | null
  returned: number
  one_day_only: number
  journal_entries: number
  journal_mothers: number
  pages: { page: string; views: number; mothers: number }[]
  actions: { action: string; count: number; mothers: number }[]
  daily: { day: string; mothers: number; visits: number }[]
}

type MotherRow = {
  user_id: string
  mother_name: string | null
  phone_number: string | null
  email: string | null
  joined: string
  last_active: string | null
  days_since: number | null
  visits: number
  journal_entries: number
  event_registrations: number
}

// Screen names as Brenda calls them, not as the router calls them.
const PAGE_HE: Record<string, string> = {
  community: 'קהילה',
  dashboard: 'בית',
  journal: 'יומן',
  workshops: 'מוצרים',
  benefits: 'הטבות',
  pro: 'הסדנאות שלי',
  admin: 'ניהול',
  'log-feeding-breast': 'רישום הנקה',
  'log-feeding-bottle': 'רישום בקבוק',
  'log-feeding-solid': 'רישום אוכל',
  'log-sleep': 'רישום שינה',
  'log-diaper': 'רישום חיתול',
  'log-milestone': 'רישום אבן דרך',
  'log-medical': 'רישום ביקור רופא',
  'log-tummy': 'רישום זמן בטן',
  'log-note': 'רישום הערה',
}

const ACTION_HE: Record<string, string> = {
  event_open: 'פתחה אירוע קהילה',
  event_register: 'נרשמה לאירוע',
  community_tab: 'עברה בין טאבים בקהילה',
  member_open: 'פתחה פרופיל של אמא אחרת',
  product_open: 'פתחה מוצר בחנות',
  product_pay_click: 'המשיכה לתשלום / הרשמה',
  gift_card_open: 'פתחה גיפט קארד',
  perk_open: 'פתחה הטבה',
  workshop_open: 'פתחה סדנה דיגיטלית',
  lesson_open: 'פתחה שיעור',
  lesson_complete: 'סיימה שיעור',
  video_start: 'הפעילה סרטון',
  next_workshop_modal_open: 'הציצה בסדנה הבאה',
  next_workshop_payment_click: 'לחצה לתשלום על הסדנה הבאה',
  next_workshop_question_click: 'שאלה על הסדנה הבאה',
}

function humanTime(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} שנ׳`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}:${String(s).padStart(2, '0')} דק׳` : `${m} דק׳`
}

function ddmm(d: string): string {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-3.5 flex-1 min-w-[130px]" style={{ background: '#FAF8F4', border: '1px solid #EFE7DC' }}>
      <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#8A7A63' }}>
        {icon}{label}
      </p>
      <p className="font-bold mt-1" style={{ fontSize: 24, color: '#443327' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: '#8A7A63' }}>{sub}</p>}
    </div>
  )
}

/** Horizontal bar list. `max` normalises the widths so one big row does
 *  not flatten the rest into invisible slivers. */
function BarRow({ label, value, note, max, color }: { label: string; value: number; note?: string; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold truncate" style={{ color: '#443327' }}>{label}</span>
        <span className="text-[13px] font-bold flex-shrink-0" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: '#F0EAE0' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      {note && <p className="text-[11px] mt-0.5" style={{ color: '#8A7A63' }}>{note}</p>}
    </div>
  )
}

export default function AppUsagePanel() {
  const [days, setDays] = useState(30)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [listMode, setListMode] = useState<'dormant' | 'active'>('dormant')
  const [dormantDays, setDormantDays] = useState(7)
  const [rows, setRows] = useState<MotherRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadUsage = useCallback(() => {
    setLoading(true)
    supabase.rpc('get_app_usage', { p_days: days }).then(({ data }) => {
      setUsage((data ?? null) as Usage | null)
      setLoading(false)
    })
  }, [days])

  const loadRows = useCallback(() => {
    supabase.rpc('get_mothers_activity', {
      p_mode: listMode,
      p_days: listMode === 'dormant' ? dormantDays : days,
      p_limit: 40,
    }).then(({ data }) => setRows((data ?? []) as MotherRow[]))
  }, [listMode, dormantDays, days])

  useEffect(() => { loadUsage() }, [loadUsage])
  useEffect(() => { loadRows() }, [loadRows])

  if (loading && !usage) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-8 text-center mb-4">
        <div className="w-7 h-7 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
      </div>
    )
  }
  if (!usage) return null

  const maxPage = Math.max(1, ...usage.pages.map(p => p.mothers))
  const maxAction = Math.max(1, ...usage.actions.map(a => a.mothers))
  const maxDay = Math.max(1, ...usage.daily.map(d => d.mothers))
  const glancePct = usage.visits > 0 ? Math.round((usage.glance_visits / usage.visits) * 100) : 0

  return (
    <div className="space-y-4 mb-6">
      {/* Header + period */}
      <div className="bg-white rounded-3xl shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold" style={{ fontSize: 18, color: '#443327' }}>מה האמהות עושות באפליקציה</h2>
            <p className="text-xs mt-0.5" style={{ color: '#7B604C' }}>בלי החשבון שלך, רק אמהות</p>
          </div>
          <div className="flex gap-1.5">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={days === d
                  ? { background: '#E7C78A', color: '#4A3A28' }
                  : { background: '#F4EDE1', color: '#7B604C' }}>
                {d} ימים
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mt-4">
          <Tile
            icon={<Users className="w-3 h-3" />}
            label="נכנסו בתקופה"
            value={`${usage.active_window}`}
            sub={`מתוך ${usage.mothers_total} אמהות · היום ${usage.active_today}`}
          />
          <Tile
            icon={<RotateCcw className="w-3 h-3" />}
            label="חזרו ביותר מיום אחד"
            value={`${usage.returned}`}
            sub={`${usage.one_day_only} נכנסו פעם אחת בלבד`}
          />
          <Tile
            icon={<Clock className="w-3 h-3" />}
            label="אורך כניסה חציוני"
            value={humanTime(usage.median_seconds)}
            sub={`${glancePct}% מהכניסות קצרות מ-20 שניות`}
          />
          <Tile
            icon={<Eye className="w-3 h-3" />}
            label="כניסות"
            value={`${usage.visits}`}
            sub={`${usage.visits_per_mother ?? 0} לאמא · ${usage.avg_views_per_visit ?? 0} מסכים בכניסה`}
          />
        </div>

        {usage.never_opened > 0 && (
          <p className="text-xs mt-3 rounded-2xl px-3 py-2" style={{ background: '#FBEBE7', color: '#C1392C' }}>
            {usage.never_opened} אמהות נרשמו ומעולם לא פתחו את האפליקציה
          </p>
        )}
      </div>

      {/* Daily strip */}
      {usage.daily.length > 1 && (
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-sm mb-3" style={{ color: '#443327' }}>אמהות שנכנסו, לפי יום</h3>
          <div className="flex items-end gap-1.5 overflow-x-auto scroll-hide" style={{ height: 96 }}>
            {usage.daily.map(d => (
              <div key={d.day} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 34 }}>
                <span className="text-[10px] font-bold" style={{ color: '#8A7A63' }}>{d.mothers}</span>
                <div className="w-full rounded-t-md" style={{
                  height: Math.max(4, Math.round((d.mothers / maxDay) * 60)),
                  background: '#C8A460',
                }} />
                <span className="text-[10px]" style={{ color: '#8A7A63' }}>{ddmm(d.day)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What they do: screens + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-sm" style={{ color: '#443327' }}>מסכים</h3>
          <p className="text-[11px] mb-2" style={{ color: '#8A7A63' }}>המספר = כמה אמהות שונות ראו אותו</p>
          {usage.pages.length === 0
            ? <p className="text-xs py-6 text-center" style={{ color: '#8A7A63' }}>אין נתונים בתקופה הזו</p>
            : usage.pages.map(p => (
                <BarRow key={p.page}
                  label={PAGE_HE[p.page] ?? p.page}
                  value={p.mothers}
                  note={`${p.views} צפיות`}
                  max={maxPage}
                  color="#C8A460" />
              ))}
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-sm" style={{ color: '#443327' }}>פעולות</h3>
          <p className="text-[11px] mb-2" style={{ color: '#8A7A63' }}>מה הן עשו, לא רק לאן הגיעו</p>
          {usage.actions.length === 0
            ? <p className="text-xs py-6 leading-relaxed text-center" style={{ color: '#8A7A63' }}>
                עדיין אין פעולות מתועדות. המדידה הזו נוספה ב-21.8. הנתונים יתחילו להצטבר מהעדכון הבא של האפליקציה.
              </p>
            : usage.actions.map(a => (
                <BarRow key={a.action}
                  label={ACTION_HE[a.action] ?? a.action}
                  value={a.mothers}
                  note={`${a.count} פעמים`}
                  max={maxAction}
                  color="#818267" />
              ))}
          <div className="mt-3 pt-3 border-t" style={{ borderColor: '#F0EAE0' }}>
            <p className="text-xs" style={{ color: '#5E4938' }}>
              <span className="font-bold">{usage.journal_mothers}</span> אמהות רשמו ביומן
              <span style={{ color: '#8A7A63' }}> · {usage.journal_entries} רשומות</span>
            </p>
          </div>
        </div>
      </div>

      {/* Who disappeared / who is here */}
      <div className="bg-white rounded-3xl shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex gap-1.5">
            <button onClick={() => setListMode('dormant')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={listMode === 'dormant' ? { background: '#E7C78A', color: '#4A3A28' } : { background: '#F4EDE1', color: '#7B604C' }}>
              מי נעלמה
            </button>
            <button onClick={() => setListMode('active')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold"
              style={listMode === 'active' ? { background: '#E7C78A', color: '#4A3A28' } : { background: '#F4EDE1', color: '#7B604C' }}>
              הכי פעילות
            </button>
          </div>
          {listMode === 'dormant' && (
            <div className="flex gap-1.5">
              {[3, 7, 14, 30].map(d => (
                <button key={d} onClick={() => setDormantDays(d)}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                  style={dormantDays === d ? { background: '#818267', color: '#FFFFFF' } : { background: '#F4EDE1', color: '#7B604C' }}>
                  {d}+ ימים
                </button>
              ))}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="text-xs py-6 text-center" style={{ color: '#8A7A63' }}>
            {listMode === 'dormant' ? 'אף אחת לא נעלמה בטווח הזה 🤍' : 'אין כניסות בתקופה'}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const name = r.mother_name?.trim() || r.email || 'אמא'
              const first = name.split(' ')[0]
              const wa = waLink(r.phone_number,
                `היי ${first}! רק רציתי להזכיר שיש לך את אפליקציית מימו, ונכנס בה משהו חדש שיכול לעניין אותך 🤍`)
              return (
                <div key={r.user_id} className="rounded-2xl p-3 flex items-center gap-3"
                  style={{ background: '#FAF8F4', border: '1px solid #EFE7DC' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#443327' }}>{name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#8A7A63' }}>
                      {listMode === 'dormant'
                        ? (r.last_active
                            ? `לא נכנסה ${r.days_since} ימים`
                            : 'מעולם לא פתחה את האפליקציה')
                        : `${r.visits} כניסות`}
                      {r.journal_entries > 0 && ` · ${r.journal_entries} רשומות ביומן`}
                      {r.event_registrations > 0 && ` · ${r.event_registrations} אירועים`}
                    </p>
                  </div>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
                      style={{ background: '#818267' }}>
                      <MessageCircle className="w-3.5 h-3.5" /> הודעה
                    </a>
                  ) : (
                    <span className="flex-shrink-0 text-[11px]" style={{ color: '#A09484' }}>אין טלפון</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
