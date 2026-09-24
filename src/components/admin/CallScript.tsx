import { useEffect, useMemo, useState } from 'react'
import { Phone, MessageCircle, X, Check, Pencil, ChevronDown, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Sales call script, opened from a lead card on the admin "לידים" screen (24.9.26).
 * Structure from the meeting with Saar: חיבור, חסמים, כאב, גשר, מוצר, מחיר, סגירה.
 * Every call is saved to crm_call_logs (steps done, blockers, pains, price reaction,
 * outcome) and the outcome is written to the CRM through crm-lead-action, like the
 * buttons on the card. The script text lives in sales_scripts and is edited here;
 * every save is a new version so the stats can compare versions.
 */

type Check_ = { key: string; label: string; say: string }
type Step = {
  key: string; title: string; say?: string[]; hint?: string
  checks?: Check_[]; chips?: string[]; choices?: Array<{ key: string; label: string }>
  products?: Record<string, string[]>
}
type Script = { version: number; content: { steps: Step[]; wa: string[] } }
export type ScriptLead = { opp_id: string; contact_id: string | null; name: string | null; phone: string | null; phone_local: string | null; products: string[] | null }
type Reason = { id: string; label: string | null; example: string | null }
type Cohort = { workshop: string; start_date: string; start_time: string | null; capacity: number | null; paid: number }

const PRODUCT_LABEL: Record<string, string> = { atufim: 'עטופים', maglim: 'מגלים' }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
function waLink(phone: string | null, text: string) {
  if (!phone) return undefined
  const d = phone.replace(/\D/g, '')
  return `https://wa.me/${d.startsWith('972') ? d : d.replace(/^0/, '972')}?text=${encodeURIComponent(text)}`
}

let cached: Script | null = null
async function loadScript(): Promise<Script | null> {
  if (cached) return cached
  const { data } = await supabase.from('sales_scripts').select('version, content').eq('is_active', true).order('version', { ascending: false }).limit(1)
  cached = (data?.[0] as Script) ?? null
  return cached
}

type Outcome = 'registered' | 'callback' | 'not_relevant' | 'no_answer'
const OUTCOMES: Array<{ id: Outcome; label: string; cls: string }> = [
  { id: 'registered', label: 'נרשמה', cls: 'bg-[#E3EFE0] text-[#3D6B35]' },
  { id: 'callback', label: 'לחזור ב...', cls: 'bg-beige-100 text-sand-700' },
  { id: 'not_relevant', label: 'לא רלוונטי', cls: 'bg-[#F5E3DC] text-[#8B4A30]' },
  { id: 'no_answer', label: 'לא ענתה', cls: 'bg-beige-100 text-sand-700' },
]

export default function CallScript({ lead, actor, reasons, cohorts, onClose, onDone }: {
  lead: ScriptLead; actor: string; reasons: Reason[]; cohorts: Cohort[]; onClose: () => void; onDone: (msg: string) => void
}) {
  const [script, setScript] = useState<Script | null>(cached)
  const [editing, setEditing] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())
  const [product, setProduct] = useState<'atufim' | 'maglim'>(() => (lead.products ?? []).some(p => p.includes('מגלים')) ? 'maglim' : 'atufim')
  const [done, setDone] = useState<string[]>([])
  const [openKey, setOpenKey] = useState<string>('open')
  const [blockers, setBlockers] = useState<Record<string, 'ok' | 'no'>>({})
  const [pains, setPains] = useState<string[]>([])
  const [price, setPrice] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (!script) loadScript().then(setScript) }, [script])

  const first = (lead.name ?? '').trim().split(/\s+/)[0] ?? ''
  const fill = (t: string) => t.replace(/\[שם\]/g, first).replace(/\[אני\]/g, actor)
  const steps = script?.content.steps ?? []
  const blockStep = steps.find(s => s.key === 'blockers')
  const blockersAnswered = !blockStep?.checks || blockStep.checks.every(c => blockers[c.key])
  const blockersFailed = Object.entries(blockers).filter(([, v]) => v === 'no').map(([k]) => blockStep?.checks?.find(c => c.key === k)?.label ?? k)
  const idxBlock = steps.findIndex(s => s.key === 'blockers')

  const nextCohort = useMemo(() => {
    const name = PRODUCT_LABEL[product]
    return cohorts.find(c => c.workshop.includes(name) && (c.capacity == null || c.capacity - Number(c.paid) > 0))
  }, [cohorts, product])
  const cohortLine = nextCohort
    ? `המחזור הקרוב: ${PRODUCT_LABEL[product]} ${ddmm(nextCohort.start_date)}${nextCohort.start_time ? ` ב-${nextCohort.start_time.slice(0, 5)}` : ''}${nextCohort.capacity != null ? `, נשארו ${nextCohort.capacity - Number(nextCohort.paid)} מקומות` : ''}`
    : `אין כרגע מחזור פתוח ל${PRODUCT_LABEL[product]}`

  function toggleDone(k: string) { setDone(d => d.includes(k) ? d.filter(x => x !== k) : [...d, k]) }
  function markDone(k: string) { setDone(d => d.includes(k) ? d : [...d, k]) }
  function setBlocker(k: string, v: 'ok' | 'no') {
    const nb = { ...blockers, [k]: v }
    setBlockers(nb)
    if (blockStep?.checks?.every(c => nb[c.key])) markDone('blockers')
  }

  async function save() {
    if (!outcome || !script) return
    if (outcome === 'callback' && !date) { setErr('צריך לבחור תאריך'); return }
    if (outcome === 'not_relevant' && !reason) { setErr('צריך לבחור סיבת אבדן'); return }
    setBusy(true); setErr(null)
    const order = steps.map(s => s.key)
    const stopped = outcome === 'registered' || outcome === 'no_answer' ? null : order.slice(1).find(k => !done.includes(k)) ?? null
    const reasonRow = reasons.find(r => r.id === reason)
    const { error: logErr } = await supabase.from('crm_call_logs').insert({
      opp_id: lead.opp_id, contact_id: lead.contact_id, lead_name: lead.name, phone_local: lead.phone_local, actor,
      script_version: script.version, product, steps_done: done, stopped_at: stopped, blockers, pains,
      price_reaction: price, outcome, note: note.trim() || null, started_at: startedAt,
    })
    const title = (k: string | null) => steps.find(s => s.key === k)?.title ?? k
    const summary = outcome === 'no_answer' ? note.trim() : [
      'שיחה לפי תסריט',
      pains.length ? `כאב: ${pains.join(', ')}` : '',
      blockersFailed.length ? `חסמים: ${blockersFailed.join(', ')}` : '',
      price ? `מחיר: ${blockStepChoice(steps, price)}` : '',
      stopped ? `נעצרה ב: ${title(stopped)}` : '',
      note.trim(),
    ].filter(Boolean).join(' · ')
    const { data, error } = await supabase.functions.invoke('crm-lead-action', {
      body: {
        action: outcome, opp_id: lead.opp_id, contact_id: lead.contact_id, actor,
        note: summary || undefined,
        callback_date: outcome === 'callback' ? date : undefined,
        complete_task_ids: [],
        lost_reason_id: outcome === 'not_relevant' ? reason : undefined,
        lost_reason_label: outcome === 'not_relevant' ? reasonRow?.label ?? undefined : undefined,
      },
    })
    setBusy(false)
    if (error || !data?.ok) {
      setErr(`${logErr ? 'השיחה לא נשמרה, ' : 'השיחה נשמרה, אבל '}ה-CRM לא התעדכן. ${(error?.message ?? '').slice(0, 120)}`)
      return
    }
    if (logErr) { setErr('ה-CRM התעדכן, אבל תיעוד השיחה לא נשמר: ' + logErr.message); return }
    onDone(`${lead.name}: ${data.label} · השיחה נשמרה`)
    onClose()
  }

  if (editing && script) return <ScriptEditor script={script} actor={actor} onClose={() => setEditing(false)} onSaved={s => { cached = s; setScript(s); setEditing(false) }} />

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" dir="rtl" onClick={onClose}>
      <div className="bg-cream-50 bg-white w-full lg:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sand-800 text-lg leading-tight">{lead.name}</p>
            <p className="text-xs text-sand-500" dir="ltr">{lead.phone_local}</p>
          </div>
          <div className="flex gap-1.5">
            {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="w-9 h-9 rounded-full bg-sand-800 text-white flex items-center justify-center"><Phone className="w-4 h-4" /></a>}
            <button onClick={() => setEditing(true)} title="עריכת התסריט" className="w-9 h-9 rounded-full bg-beige-100 text-sand-600 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-beige-100 text-sand-600 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['atufim', 'maglim'] as const).map(p => (
            <button key={p} onClick={() => setProduct(p)} className={`px-3 py-1 rounded-full text-xs font-bold ${product === p ? 'bg-sand-800 text-white' : 'bg-beige-100 text-sand-600'}`}>{PRODUCT_LABEL[p]}</button>
          ))}
          <span className="text-[11px] text-sand-500">{cohortLine}</span>
        </div>

        {!script && <p className="text-sm text-sand-400 py-6 text-center">טוען תסריט...</p>}

        {/* steps */}
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const locked = idxBlock >= 0 && i > idxBlock && !blockersAnswered
            const isOpen = openKey === s.key && !locked
            const isDone = done.includes(s.key)
            return (
              <div key={s.key} className={`rounded-2xl border ${isDone ? 'border-[#B9D3B2] bg-[#F3F8F1]' : 'border-beige-200 bg-white'} ${locked ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button onClick={() => !locked && toggleDone(s.key)} disabled={locked}
                    className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center border ${isDone ? 'bg-[#3D6B35] border-[#3D6B35] text-white' : 'border-sand-300 text-transparent'}`}>
                    {locked ? <Lock className="w-3 h-3 text-sand-400" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => !locked && setOpenKey(isOpen ? '' : s.key)} className="flex-1 flex items-center justify-between text-right">
                    <span className="font-bold text-sm text-sand-800">{i + 1}. {s.title}</span>
                    <ChevronDown className={`w-4 h-4 text-sand-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {s.say?.map((t, j) => <p key={j} className="text-sm text-sand-800 leading-relaxed">• {fill(t)}</p>)}
                    {s.products?.[product]?.map((t, j) => <p key={j} className="text-sm text-sand-800">✓ {t}</p>)}
                    {s.key === 'blockers' && <p className="text-[11px] text-sand-500">{cohortLine}</p>}
                    {s.checks?.map(c => (
                      <div key={c.key} className="bg-beige-50 rounded-xl px-3 py-2 space-y-1.5">
                        <p className="text-sm text-sand-800"><b>{c.label}:</b> {fill(c.say)}</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => setBlocker(c.key, 'ok')} className={`px-3 py-1 rounded-full text-xs font-bold ${blockers[c.key] === 'ok' ? 'bg-[#3D6B35] text-white' : 'bg-white text-sand-600'}`}>מסתדר</button>
                          <button onClick={() => setBlocker(c.key, 'no')} className={`px-3 py-1 rounded-full text-xs font-bold ${blockers[c.key] === 'no' ? 'bg-[#8B4A30] text-white' : 'bg-white text-sand-600'}`}>לא מסתדר</button>
                        </div>
                      </div>
                    ))}
                    {s.key === 'blockers' && blockersFailed.length > 0 && (
                      <p className="text-xs text-[#8B4A30] bg-[#F5E3DC] rounded-lg px-2 py-1">לא מסתדר: {blockersFailed.join(', ')}. להציע חלופה (פרטני בבית, קורס דיגיטלי, מחזור אחר) או לסגור עם סיבה.</p>
                    )}
                    {s.chips && (
                      <div className="flex gap-1.5 flex-wrap">
                        {s.chips.map(c => (
                          <button key={c} onClick={() => { setPains(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]); markDone(s.key) }}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${pains.includes(c) ? 'bg-mustard-400 text-sand-900' : 'bg-beige-100 text-sand-600'}`}>{c}</button>
                        ))}
                      </div>
                    )}
                    {s.choices && (
                      <div className="flex gap-1.5">
                        {s.choices.map(c => (
                          <button key={c.key} onClick={() => { setPrice(c.key); markDone(s.key) }}
                            className={`px-3 py-1 rounded-full text-xs font-bold ${price === c.key ? 'bg-sand-800 text-white' : 'bg-beige-100 text-sand-600'}`}>{c.label}</button>
                        ))}
                      </div>
                    )}
                    {s.hint && <p className="text-[11px] text-sand-500">💡 {s.hint}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* outcome */}
        <div className="border-t border-beige-200 pt-3 space-y-2">
          <p className="text-xs font-bold text-sand-600">איך זה נגמר?</p>
          <div className="flex gap-1.5 flex-wrap">
            {OUTCOMES.map(o => (
              <button key={o.id} onClick={() => { setOutcome(outcome === o.id ? null : o.id); setErr(null) }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${o.cls} ${outcome === o.id ? 'ring-2 ring-sand-700' : ''}`}>{o.label}</button>
            ))}
          </div>
          {outcome === 'no_answer' && script && (
            <div className="space-y-1.5">
              {script.content.wa.map((t, i) => (
                <a key={i} href={waLink(lead.phone, fill(t))} target="_blank" rel="noopener noreferrer"
                  className="flex gap-2 items-start bg-[#EAF7EE] rounded-xl px-3 py-2 text-xs text-sand-800">
                  <MessageCircle className="w-4 h-4 text-[#25D366] shrink-0 mt-0.5" />
                  <span><b>הודעה אחרי ניסיון {i + 1}:</b> {fill(t)}</span>
                </a>
              ))}
            </div>
          )}
          {outcome === 'callback' && (
            <input type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)} className="rounded-lg border border-beige-300 px-2 py-1 text-sm" />
          )}
          {outcome === 'not_relevant' && (
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border border-beige-300 px-2 py-1.5 text-sm">
              <option value="">סיבת אבדן (חובה)</option>
              {reasons.map(r => <option key={r.id} value={r.id}>{r.label ?? `סיבה ללא שם${r.example ? `, כמו אצל ${r.example}` : ''}`}</option>)}
            </select>
          )}
          {outcome && (
            <>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="עוד משהו? (לא חובה)"
                className="w-full rounded-lg border border-beige-300 px-2 py-1.5 text-sm" />
              {err && <p className="text-xs text-[#8B4A30]">{err}</p>}
              <button onClick={save} disabled={busy} className="w-full py-2 rounded-full bg-sand-800 text-white text-sm font-bold disabled:opacity-50">
                {busy ? 'שומר...' : `לשמור (${actor})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function blockStepChoice(steps: Step[], key: string) {
  for (const s of steps) { const c = s.choices?.find(x => x.key === key); if (c) return c.label }
  return key
}

/** Plain editor: one line per row in every box. Saving creates a new version. */
function ScriptEditor({ script, actor, onClose, onSaved }: { script: Script; actor: string; onClose: () => void; onSaved: (s: Script) => void }) {
  const [draft, setDraft] = useState<Script['content']>(() => JSON.parse(JSON.stringify(script.content)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const lines = (a?: string[]) => (a ?? []).join('\n')
  const split = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean)
  function upd(i: number, patch: Partial<Step>) { setDraft(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, ...patch } : s) })) }

  async function save() {
    setBusy(true); setErr(null)
    const version = script.version + 1
    const { error } = await supabase.from('sales_scripts').insert({ version, content: draft, created_by: actor, is_active: true })
    if (error) { setBusy(false); setErr(error.message); return }
    await supabase.from('sales_scripts').update({ is_active: false }).lt('version', version)
    setBusy(false)
    onSaved({ version, content: draft })
  }

  const box = 'w-full rounded-lg border border-beige-300 px-2 py-1.5 text-sm'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" dir="rtl">
      <div className="bg-white w-full lg:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sand-800">עריכת התסריט (גרסה {script.version})</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-beige-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px] text-sand-500">שורה לכל משפט. [שם] = השם שלה, [אני] = מי שמתקשר. שמירה יוצרת גרסה חדשה, כדי שנוכל להשוות בין גרסאות.</p>
        {draft.steps.map((s, i) => (
          <div key={s.key} className="bg-beige-50 rounded-2xl p-3 space-y-1.5">
            <p className="font-bold text-sm text-sand-800">{i + 1}. {s.title}</p>
            {s.say && <textarea className={box} rows={Math.max(2, s.say.length)} value={lines(s.say)} onChange={e => upd(i, { say: split(e.target.value) })} />}
            {s.checks?.map((c, ci) => (
              <label key={c.key} className="block text-xs text-sand-600">{c.label}
                <textarea className={box} rows={2} value={c.say} onChange={e => upd(i, { checks: s.checks!.map((x, xi) => xi === ci ? { ...x, say: e.target.value } : x) })} />
              </label>
            ))}
            {s.products && Object.keys(s.products).map(p => (
              <label key={p} className="block text-xs text-sand-600">{PRODUCT_LABEL[p] ?? p}
                <textarea className={box} rows={4} value={lines(s.products![p])} onChange={e => upd(i, { products: { ...s.products!, [p]: split(e.target.value) } })} />
              </label>
            ))}
            {s.chips && (
              <label className="block text-xs text-sand-600">כפתורים (שורה לכל אחד)
                <textarea className={box} rows={3} value={lines(s.chips)} onChange={e => upd(i, { chips: split(e.target.value) })} />
              </label>
            )}
            <label className="block text-xs text-sand-600">טיפ
              <input className={box} value={s.hint ?? ''} onChange={e => upd(i, { hint: e.target.value })} />
            </label>
          </div>
        ))}
        <div className="bg-beige-50 rounded-2xl p-3 space-y-1.5">
          <p className="font-bold text-sm text-sand-800">הודעות ווטסאפ כשלא ענתה</p>
          {draft.wa.map((t, i) => (
            <textarea key={i} className={box} rows={2} value={t} onChange={e => setDraft(d => ({ ...d, wa: d.wa.map((x, j) => j === i ? e.target.value : x) }))} />
          ))}
        </div>
        {err && <p className="text-xs text-[#8B4A30]">{err}</p>}
        <button onClick={save} disabled={busy} className="w-full py-2 rounded-full bg-sand-800 text-white text-sm font-bold disabled:opacity-50">{busy ? 'שומר...' : `לשמור כגרסה ${script.version + 1}`}</button>
      </div>
    </div>
  )
}

/** "למידה" tab: what the call log says, for the last 7 / 30 days. */
export function CallInsights() {
  const [days, setDays] = useState(7)
  const [s, setS] = useState<any>(null)
  const [titles, setTitles] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.rpc('crm_call_stats', { p_days: days }).then(({ data }) => setS(data))
    loadScript().then(sc => sc && setTitles(Object.fromEntries(sc.content.steps.map(x => [x.key, x.title]))))
  }, [days])
  if (!s) return <p className="text-center text-sand-400 text-sm py-8">טוען...</p>
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
  const top = (o: Record<string, number>) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1])
  const BLOCK: Record<string, string> = { age: 'גיל', distance: 'מרחק ורכב', schedule: 'לו"ז' }
  const PRICE: Record<string, string> = { ok: 'בסדר', hesitant: 'היססה', no: 'לא מתאים' }
  const Row = ({ label, n, of }: { label: string; n: number; of?: number }) => (
    <div className="flex justify-between text-sm py-0.5"><span className="text-sand-700">{label}</span><span className="font-bold text-sand-800">{n}{of != null ? ` (${pct(n, of)})` : ''}</span></div>
  )
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl p-4 shadow-sm"><p className="font-bold text-sand-800 text-sm mb-1.5">{title}</p>{children}</div>
  )
  const empty = <p className="text-xs text-sand-400">אין עדיין נתונים</p>
  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex gap-1">
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-full text-xs font-bold ${days === d ? 'bg-sand-800 text-white' : 'bg-beige-100 text-sand-600'}`}>{d} ימים</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['שיחות', s.calls], ['ענו', s.answered], ['נרשמו', s.registered]].map(([l, n]) => (
          <div key={l as string} className="bg-white rounded-2xl p-3 text-center shadow-sm"><p className="text-2xl font-bold text-sand-800">{n as number}</p><p className="text-xs text-sand-500">{l as string}</p></div>
        ))}
      </div>
      <p className="text-[11px] text-sand-500">נרשמו = סומנה "נרשמה", או שילמה באפליקציה אחרי השיחה (לפי טלפון). אחוז הרשמה מתוך מי שענתה: {pct(s.registered, s.answered)}.</p>
      <Card title="עד איפה הגיעו השיחות (מתוך מי שענתה)">
        {Object.keys(titles).length && s.answered ? Object.entries(titles).map(([k, t]) => <Row key={k} label={t} n={s.reached?.[k] ?? 0} of={s.answered} />) : empty}
      </Card>
      <Card title="איפה נעצרו (מי שלא נרשמה)">{top(s.stopped).length ? top(s.stopped).map(([k, n]) => <Row key={k} label={titles[k] ?? k} n={n} />) : empty}</Card>
      <Card title="חסמים שלא הסתדרו">{top(s.blockers_no).length ? top(s.blockers_no).map(([k, n]) => <Row key={k} label={BLOCK[k] ?? k} n={n} />) : empty}</Card>
      <Card title="מה הכאב">{top(s.pains).length ? top(s.pains).map(([k, n]) => <Row key={k} label={k} n={n} />) : empty}</Card>
      <Card title="תגובה למחיר">{top(s.price).length ? top(s.price).map(([k, n]) => <Row key={k} label={PRICE[k] ?? k} n={n} />) : empty}</Card>
      <Card title="לפי גרסת תסריט">
        {(s.by_version ?? []).length ? (s.by_version as any[]).map(v => <Row key={v.version} label={`גרסה ${v.version}: ${v.calls} שיחות, ${v.answered} ענו`} n={v.registered} of={v.answered} />) : empty}
      </Card>
      <p className="text-[11px] text-sand-400">בכמויות של עשרות שיחות, זה נותן כיוון ולא הוכחה.</p>
    </div>
  )
}
