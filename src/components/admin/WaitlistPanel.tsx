import { useCallback, useEffect, useState } from 'react'
import { Bell, MessageCircle, Check, Copy, Trash2 } from 'lucide-react'
import { supabase, type WorkshopWaitlistRow, type WorkshopCohort } from '../../lib/supabase'

// Who is waiting for the next cohort of this product.
//
// Yahav 25.8.26: "כשיפתח מחזור חדש אני רוצה לדעת / ואז יהיה לי רשימה של
// לידים פונטציאלים לסדנאות שכרגע לא פתוחות".
//
// Sending is a per-person wa.me link, not an API call. That is a decision,
// not laziness: on 24.8 the GHL API returned 200 for 33 messages and
// WhatsApp then rejected 27 of them for being outside the 24-hour window,
// while our records said "sent". A wa.me link opens Yahav's own WhatsApp
// with the text filled in, so a message either visibly goes or visibly
// does not. See project memory: whatsapp_24h_window.
//
// notified_at is stamped when he marks a row done, so nobody gets told
// twice and the list keeps its history instead of being emptied.

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('972') ? digits : digits.replace(/^0/, '972')
  if (intl.length < 11) return null
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

export default function WaitlistPanel({ workshopId, workshopTitle, cohorts }: {
  workshopId: string
  workshopTitle: string
  cohorts: WorkshopCohort[]
}) {
  const [rows, setRows] = useState<WorkshopWaitlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<WorkshopWaitlistRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('workshop_waitlist')
      .select('*')
      .eq('workshop_id', workshopId)
      .order('created_at')
    setRows((data ?? []) as WorkshopWaitlistRow[])
    setLoading(false)
  }, [workshopId])
  useEffect(() => { load() }, [load])

  // The next cohort that has not started yet. That is the one worth telling
  // people about; a cohort that already began is not news.
  const next = cohorts
    .filter(c => c.is_active && c.start_date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null

  const dateLabel = next
    ? new Date(next.start_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
    : null

  const messageFor = (r: WorkshopWaitlistRow) =>
    next
      ? `היי ${firstName(r.name)}, ביקשת שנעדכן אותך כשייפתח מחזור חדש של ${workshopTitle}. נפתח מחזור שמתחיל ב-${dateLabel}. רוצה שאשמור לך מקום?`
      : `היי ${firstName(r.name)}, ביקשת שנעדכן אותך כשייפתח מחזור חדש של ${workshopTitle}.`

  const waiting = rows.filter(r => !r.notified_at)
  const done = rows.filter(r => r.notified_at)

  async function markNotified(r: WorkshopWaitlistRow) {
    await supabase
      .from('workshop_waitlist')
      .update({ notified_at: new Date().toISOString(), notified_cohort_id: next?.id ?? null })
      .eq('id', r.id)
    setRows(prev => prev.map(x => x.id === r.id
      ? { ...x, notified_at: new Date().toISOString(), notified_cohort_id: next?.id ?? null }
      : x))
  }

  async function undoNotified(r: WorkshopWaitlistRow) {
    await supabase.from('workshop_waitlist').update({ notified_at: null, notified_cohort_id: null }).eq('id', r.id)
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, notified_at: null, notified_cohort_id: null } : x))
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await supabase.from('workshop_waitlist').delete().eq('id', pendingDelete.id)
    setRows(prev => prev.filter(x => x.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  function copyAll() {
    const text = waiting.map(r => `${r.name} · ${r.phone ?? 'אין טלפון'}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => { /* clipboard blocked */ })
  }

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-sand-800 text-sm flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-mustard-500" />
            ממתינות למחזור הבא
          </h3>
          <p className="text-xs text-sand-500 mt-1 leading-relaxed">
            {waiting.length > 0
              ? `${waiting.length} ביקשו שנעדכן אותן כשייפתח מחזור חדש.`
              : 'עדכנת את כולן.'}
            {next
              ? ` המחזור הקרוב מתחיל ב-${dateLabel}.`
              : ' אין עדיין מחזור עתידי, אז אין על מה לעדכן.'}
          </p>
        </div>
        {waiting.length > 0 && (
          <button onClick={copyAll}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-sand-50 text-sand-600 font-semibold text-xs inline-flex items-center gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'הועתק' : 'העתק הכל'}
          </button>
        )}
      </div>

      {!next && waiting.length > 0 && (
        <p className="text-xs rounded-2xl p-3" style={{ background: '#FBF3E4', color: '#8A6A2F' }}>
          פתח מחזור חדש למוצר הזה, וההודעה כאן תכלול את התאריך שלו אוטומטית.
        </p>
      )}

      <div className="space-y-2">
        {waiting.map(r => {
          const link = waLink(r.phone, messageFor(r))
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl p-3 bg-sand-50/60">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-sand-800 truncate">{r.name}</p>
                <p className="text-xs text-sand-500" dir="ltr">
                  {r.phone || r.email || 'אין פרטי קשר'}
                </p>
                <p className="text-[11px] text-sand-400 mt-0.5">
                  ביקשה ב-{new Date(r.created_at).toLocaleDateString('he-IL')}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    onClick={() => markNotified(r)}
                    className="px-3 py-2 rounded-xl text-white font-bold text-xs inline-flex items-center gap-1.5"
                    style={{ background: '#5C7A4A' }}>
                    <MessageCircle className="w-3.5 h-3.5" />
                    שלח
                  </a>
                ) : (
                  <button onClick={() => markNotified(r)}
                    className="px-3 py-2 rounded-xl bg-sand-100 text-sand-600 font-semibold text-xs">
                    סמן כעודכנה
                  </button>
                )}
                <button onClick={() => setPendingDelete(r)} title="הסרה">
                  <Trash2 className="w-4 h-4 text-red-300" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(v => !v)}
            className="text-xs text-sand-500 font-semibold">
            {showDone ? 'הסתר' : `הצג ${done.length} שכבר עודכנו`}
          </button>
          {showDone && (
            <div className="space-y-2 mt-2">
              {done.map(r => (
                <div key={r.id} className="flex items-center gap-2 rounded-2xl p-3 bg-sand-50/40">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-sand-500 truncate">{r.name}</p>
                    <p className="text-[11px] text-sand-400">
                      עודכנה ב-{new Date(r.notified_at as string).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                  <button onClick={() => undoNotified(r)}
                    className="px-3 py-1.5 rounded-xl bg-sand-100 text-sand-600 font-semibold text-[11px]">
                    החזר לרשימה
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setPendingDelete(null)}>
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm text-right" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-sand-800 text-sm">להסיר את {pendingDelete.name} מהרשימה?</p>
            <p className="text-xs text-sand-500 mt-1">
              היא לא תדע על זה. אם רק עדכנת אותה, עדיף לסמן כעודכנה ולא למחוק.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={confirmDelete}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">הסרה</button>
              <button onClick={() => setPendingDelete(null)}
                className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
