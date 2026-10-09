import { useEffect, useRef, useState } from 'react'
import { Baby, MessageCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useOpenCustomer } from './CustomerCardContext'
import type { MegalimCandidatesResult } from './megalimCandidates'

/**
 * מועמדות למגלים — graduates of עטופים whose baby reached the מגלים age.
 *
 * Moved 9.10.26 from the admin home into the לידים page, tab "בוגרות
 * עטופים" (Yahav: "אפשר לסנכרן את זה עם מועמדות למגלים ושיהיה הכל ביחד").
 * The CRM's own follow-up is calendar-based (+14 days after עטופים); this
 * list is AGE-based, so it catches the mothers that message reached too
 * early. "לא רלוונטי" persists as admin_task_dismissals `megalim:<lead id>`
 * (Brenda 14.9.26), with a 10-second undo.
 */

function ageHe(months: number): string {
  const whole = Math.floor(months)
  const half = months - whole >= 0.5
  const num = half ? `${whole} וחצי` : String(whole)
  return whole === 1 && !half ? 'חודש' : `${num} חודשים`
}

function agoHe(days: number): string {
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 14) return `לפני ${days} ימים`
  if (days < 60) return `לפני ${Math.round(days / 7)} שבועות`
  return `לפני ${Math.round(days / 30.44)} חודשים`
}

function waHref(phone: string, text: string): string {
  const intl = phone.replace(/\D/g, '').replace(/^0/, '972')
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export default function MegalimCandidatesList({ megalim, onChanged }: { megalim: MegalimCandidatesResult; onChanged: () => Promise<void> | void }) {
  const { profile } = useAuth()
  const openCustomer = useOpenCustomer()
  const [busy, setBusy] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ label: string; key: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function dismiss(leadId: string, name: string) {
    const key = `megalim:${leadId}`
    setBusy(key)
    await supabase.from('admin_task_dismissals').upsert(
      { task_key: key, dismissed_at: new Date().toISOString(), dismissed_by: profile?.id ?? null },
      { onConflict: 'task_key' },
    )
    await onChanged()
    setBusy(null)
    if (timer.current) clearTimeout(timer.current)
    setUndo({ label: `${name} לא רלוונטית למגלים`, key })
    timer.current = setTimeout(() => setUndo(null), 10_000)
  }

  async function runUndo() {
    if (!undo) return
    const key = undo.key
    setUndo(null)
    await supabase.from('admin_task_dismissals').delete().eq('task_key', key)
    await onChanged()
  }

  return (
    <div className="bg-white rounded-3xl p-4 lg:p-5 shadow-sm" dir="rtl">
      <p className="font-bold text-sand-800">
        בגיל למגלים עכשיו · {megalim.candidates.length}
      </p>
      <p className="text-xs text-sand-500 mb-3">
        סיימו עטופים, עוד לא נרשמו למגלים, והתינוק/ת בן/בת {ageHe(megalim.fromMonths)} ומעלה. לפי תאריך הלידה, לא לפי ה-CRM.
      </p>

      {undo && (
        <div className="flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2 mb-2" style={{ background: '#F6F3ED' }}>
          <span className="font-semibold truncate" style={{ fontSize: 13, color: '#6B5842' }}>{undo.label}</span>
          <button onClick={runUndo} className="flex items-center gap-1 font-bold flex-shrink-0" style={{ fontSize: 13, color: '#8A6A2F' }}>
            <RotateCcw className="w-3.5 h-3.5" /> ביטול
          </button>
        </div>
      )}

      {megalim.candidates.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-4" style={{ background: '#F6F3ED' }}>
          <Baby className="w-5 h-5 flex-shrink-0" style={{ color: '#8A7A63' }} />
          <p className="font-semibold" style={{ fontSize: 14, color: '#8A7A63' }}>אין כרגע בוגרות עטופים בטווח הגיל של מגלים</p>
        </div>
      ) : (
        <div className="space-y-1">
          {megalim.candidates.map(c => (
            <div key={c.leadId} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[#FAF7F1]">
              <span className="flex flex-col items-center justify-center flex-shrink-0 rounded-xl" style={{ width: 52, padding: '5px 0', background: '#F6ECD8' }}>
                <span className="font-display" style={{ fontSize: 16, lineHeight: 1, color: '#6E5836' }}>{c.ageMonths}</span>
                <span className="font-semibold" style={{ fontSize: 11, color: '#8A7A63' }}>חודשים</span>
              </span>
              <p className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>
                <button onClick={() => openCustomer({ phone: c.phone, leadId: c.leadId })} className="font-bold hover:underline" style={{ color: '#443327' }}>{c.name}</button>
                {c.babyName && <span style={{ color: '#A2937D' }}> · {c.babyName}</span>}
                <span style={{ color: '#A2937D' }}> · סיימה עטופים {agoHe(c.daysSinceFinish)}</span>
              </p>
              <a
                href={waHref(c.phone, `היי ${c.name.split(' ')[0]}! 🐣`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1 font-bold rounded-xl transition-all hover:brightness-95"
                style={{ fontSize: 13, padding: '6px 12px', background: '#E7F0E4', color: '#3F5B39' }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> וואטסאפ
              </a>
              <button
                onClick={() => dismiss(c.leadId, c.name)}
                disabled={busy === `megalim:${c.leadId}`}
                className="flex-shrink-0 font-bold rounded-xl transition-all hover:brightness-95 disabled:opacity-40"
                style={{ fontSize: 13, padding: '6px 12px', background: '#EDEDE6', color: '#4F5040' }}
                title="מסתיר אותה מהרשימה הזו לתמיד"
              >
                לא רלוונטי
              </button>
            </div>
          ))}
        </div>
      )}

      {megalim.unknownDobCount > 0 && (
        <p className="mt-2.5 px-1" style={{ fontSize: 12, color: '#A2937D' }}>
          ל-{megalim.unknownDobCount} בוגרות נוספות אין תאריך לידה של התינוק/ת בשאלון, והן לא נספרות כאן
        </p>
      )}
    </div>
  )
}
