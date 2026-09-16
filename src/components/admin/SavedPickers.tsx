import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Brenda 16.9.26: "שמירה של לינקים לתשלום בתוך האפליקציה ... פשוט אחפש
// שמות של הלינקים ... וגם מיקומים - הסטודיו ברמת גן שיהיה כבר שמור".
//
// Two small libraries, saved_payment_links and saved_locations, and the
// two fields in the event form that read from them. She types a NAME,
// the url (and, for a link, the Morning product id) come along. A url
// she pastes that the library does not know yet can be saved under a
// name right there in the form, so the library fills itself as she
// works instead of needing a setup step.
//
// The product id is the reason this exists. It belongs to the LINK (one
// Morning link = one product), so once the library knows it for a url,
// every event on that url gets it - the DB trigger
// community_events_sync_product_ids does the copying. The webhook learns
// it from the first payment when it is missing. The form never shows it.

export type SavedPaymentLink = {
  id: string
  name: string
  url: string
  morning_product_id: string | null
  amount: number | null
}

export type SavedLocation = {
  id: string
  name: string
  link: string | null
}

export function useSavedLibrary() {
  const [links, setLinks] = useState<SavedPaymentLink[]>([])
  const [locations, setLocations] = useState<SavedLocation[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [l, p] = await Promise.all([
      supabase.from('saved_payment_links').select('id, name, url, morning_product_id, amount').order('amount', { ascending: true, nullsFirst: false }).order('name'),
      supabase.from('saved_locations').select('id, name, link').order('name'),
    ])
    setLinks((l.data ?? []) as SavedPaymentLink[])
    setLocations((p.data ?? []) as SavedLocation[])
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveLink(name: string, url: string, amount: number | null): Promise<SavedPaymentLink | null> {
    const { data } = await supabase
      .from('saved_payment_links')
      .upsert({ name: name.trim(), url: url.trim(), amount }, { onConflict: 'url' })
      .select('id, name, url, morning_product_id, amount').single()
    await load()
    return (data as SavedPaymentLink | null) ?? null
  }

  async function renameLink(id: string, name: string) {
    await supabase.from('saved_payment_links').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  async function deleteLink(id: string) {
    await supabase.from('saved_payment_links').delete().eq('id', id)
    await load()
  }

  async function saveLocation(name: string, link: string | null): Promise<SavedLocation | null> {
    const { data } = await supabase
      .from('saved_locations')
      .upsert({ name: name.trim(), link: link?.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'name' })
      .select('id, name, link').single()
    await load()
    return (data as SavedLocation | null) ?? null
  }

  async function renameLocation(id: string, name: string) {
    await supabase.from('saved_locations').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  async function deleteLocation(id: string) {
    await supabase.from('saved_locations').delete().eq('id', id)
    await load()
  }

  return { links, locations, loaded, reload: load, saveLink, renameLink, deleteLink, saveLocation, renameLocation, deleteLocation }
}

const inputCls = 'w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white'
const labelCls = 'block text-xs font-semibold text-sand-600 mb-1'
const hintStyle = { fontSize: 12, color: '#A2937D', marginTop: 4, lineHeight: 1.5 } as const

function isUrl(s: string) { return /^https?:\/\//i.test(s.trim()) }

/** Close a dropdown when the pointer lands outside its wrapper. */
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ref, onOutside])
}

// ── Payment link ───────────────────────────────────────────────────────
// value is the URL that goes into community_events.payment_link. The box
// shows the saved NAME when the url is known, the raw url otherwise.

export function SavedPaymentLinkField({
  label, value, onChange, links, onSaveNew, required, hint, defaultName,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  links: SavedPaymentLink[]
  onSaveNew: (name: string, url: string) => Promise<unknown>
  required?: boolean
  hint?: string
  /** Name offered when she pastes a new url (the event title + price). */
  defaultName?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  useClickOutside(wrap, useCallback(() => setOpen(false), []))

  const selected = useMemo(() => links.find(l => l.url === value.trim()) ?? null, [links, value])

  // What the box shows when she is not typing: the name, or the url.
  const display = open ? query : (selected ? selected.name : value)

  const q = query.trim().toLowerCase()
  const matches = q
    ? links.filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
    : links
  const typedUrl = isUrl(query) && !links.some(l => l.url === query.trim())

  function pick(l: SavedPaymentLink) {
    onChange(l.url)
    setQuery('')
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(true)
  }

  async function saveTyped() {
    const name = (newName || defaultName || '').trim()
    if (!name || !typedUrl) return
    setSaving(true)
    await onSaveNew(name, query.trim())
    onChange(query.trim())
    setSaving(false)
    setQuery('')
    setNewName('')
    setOpen(false)
  }

  return (
    <div ref={wrap} className="relative">
      <label className={labelCls}>{label}{required ? ' *' : ''}</label>
      <div className="relative">
        <input
          value={display}
          dir={open || !selected ? (isUrl(display) ? 'ltr' : 'rtl') : 'rtl'}
          placeholder="הקלידי שם (דמי רצינות, עזרה ראשונה...) או הדביקי לינק"
          className={`${inputCls} ${selected && !open ? 'pl-16' : ''}`}
          onFocus={() => { setQuery(selected ? '' : value); setOpen(true) }}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!isUrl(e.target.value)) { /* typing a name: url stays until she picks */ } }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              if (typedUrl) { onChange(query.trim()); setOpen(false) }
              else if (matches.length === 1) pick(matches[0])
            }
          }}
        />
        {selected && !open && (
          <div className="absolute inset-y-0 left-2 flex items-center gap-1">
            <Check className="w-4 h-4" style={{ color: '#5C7A4A' }} />
            <button type="button" onClick={clear} className="p-1 rounded-full hover:bg-sand-100" title="החלפת לינק">
              <X className="w-3.5 h-3.5 text-sand-400" />
            </button>
          </div>
        )}
        {!selected && !open && value && (
          <div className="absolute inset-y-0 left-2 flex items-center">
            <button type="button" onClick={clear} className="p-1 rounded-full hover:bg-sand-100" title="ניקוי">
              <X className="w-3.5 h-3.5 text-sand-400" />
            </button>
          </div>
        )}
      </div>

      {selected && !open && (
        <p style={hintStyle}>
          {selected.amount != null ? `₪${selected.amount} · ` : ''}
          {selected.morning_product_id
            ? 'מזהה המוצר ידוע, מורנינג תאשר תשלומים לבד'
            : 'מזהה המוצר עוד לא ידוע, ייקלט לבד מהתשלום הראשון'}
        </p>
      )}
      {!selected && !open && value && (
        <p style={hintStyle}>לינק שלא שמור בספרייה. תשלום ראשון ילמד את מזהה המוצר שלו.</p>
      )}
      {hint && !selected && !value && <p style={hintStyle}>{hint}</p>}

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border-2 border-sand-200 rounded-xl shadow-lg overflow-hidden" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {typedUrl ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-sand-600">לינק חדש. לשמור אותו בספרייה בשם:</p>
              <input
                value={newName || defaultName || ''}
                onChange={e => setNewName(e.target.value)}
                placeholder="למשל: הרצאה 40 ₪"
                className={inputCls}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveTyped() } }}
              />
              <div className="flex gap-2">
                <button type="button" onClick={saveTyped} disabled={saving || !(newName || defaultName)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: '#C8A460', color: '#33281B' }}>
                  {saving ? 'שומרת...' : 'שמירה ושימוש'}
                </button>
                <button type="button" onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold" style={{ border: '1.5px solid #DCD4C8', color: '#7B604C' }}>
                  שימוש בלי לשמור
                </button>
              </div>
            </div>
          ) : matches.length === 0 ? (
            <p className="p-3 text-xs text-sand-400">
              {links.length === 0 ? 'עוד אין לינקים שמורים. הדביקי לינק ותני לו שם.' : 'אין לינק בשם הזה. אפשר להדביק לינק חדש.'}
            </p>
          ) : (
            matches.map(l => (
              <button key={l.id} type="button" onClick={() => pick(l)}
                className="w-full text-right px-3 py-2.5 hover:bg-sand-50 flex items-center justify-between gap-2 border-b border-sand-100 last:border-b-0">
                <span className="text-sm text-sand-800 font-semibold truncate">{l.name}</span>
                <span className="text-xs text-sand-400 flex-shrink-0" dir="ltr">
                  {l.amount != null ? `₪${l.amount}` : ''}{l.morning_product_id ? '' : ' · בלי מזהה'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Location ───────────────────────────────────────────────────────────
// name + link are two fields on the event; picking a saved place fills
// both. A new pair (name she typed + link she pasted) is offered for
// saving under the link field.

export function SavedLocationFields({
  name, link, onChange, locations, onSaveNew,
}: {
  name: string
  link: string
  onChange: (next: { name: string; link: string }) => void
  locations: SavedLocation[]
  onSaveNew: (name: string, link: string | null) => Promise<unknown>
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  useClickOutside(wrap, useCallback(() => setOpen(false), []))

  const q = name.trim().toLowerCase()
  const exact = locations.find(l => l.name.trim().toLowerCase() === q) ?? null
  const matches = q ? locations.filter(l => l.name.toLowerCase().includes(q)) : locations
  // Worth offering to save: a name we do not have, or one whose link changed.
  const canSave = q.length > 0 && (!exact || (link.trim() && exact.link !== link.trim()))

  function pick(l: SavedLocation) {
    onChange({ name: l.name, link: l.link ?? '' })
    setOpen(false)
  }

  async function save() {
    setSaving(true)
    await onSaveNew(name, link || null)
    setSaving(false)
  }

  return (
    <>
      <div ref={wrap} className="relative">
        <label className={labelCls}>מיקום</label>
        <div className="relative">
          <input
            value={name}
            placeholder="הסטודיו / פארק הירקון..."
            className={`${inputCls} pl-9`}
            onFocus={() => setOpen(true)}
            onChange={e => {
              const v = e.target.value
              const hit = locations.find(l => l.name.trim().toLowerCase() === v.trim().toLowerCase())
              // Typing a saved name outright fills its link too.
              onChange({ name: v, link: hit?.link ?? link })
              setOpen(true)
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && matches.length === 1) { e.preventDefault(); pick(matches[0]) }
            }}
          />
          <button type="button" onClick={() => setOpen(o => !o)} className="absolute inset-y-0 left-2 flex items-center" tabIndex={-1}>
            {exact ? <Check className="w-4 h-4" style={{ color: '#5C7A4A' }} /> : <ChevronDown className="w-4 h-4 text-sand-400" />}
          </button>
        </div>
        {open && locations.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border-2 border-sand-200 rounded-xl shadow-lg overflow-hidden" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {matches.length === 0 ? (
              <p className="p-3 text-xs text-sand-400">מיקום חדש. אחרי שתדביקי לינק ניווט אפשר לשמור אותו.</p>
            ) : matches.map(l => (
              <button key={l.id} type="button" onClick={() => pick(l)}
                className="w-full text-right px-3 py-2.5 hover:bg-sand-50 flex items-center justify-between gap-2 border-b border-sand-100 last:border-b-0">
                <span className="text-sm text-sand-800 font-semibold truncate">{l.name}</span>
                {!l.link && <span className="text-xs text-sand-400 flex-shrink-0">בלי לינק</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>לינק ניווט (Waze / Google Maps)</label>
        <input value={link} onChange={e => onChange({ name, link: e.target.value })} dir="ltr" placeholder="https://..." className={inputCls} />
        {canSave && (
          <button type="button" onClick={save} disabled={saving}
            className="mt-1.5 text-xs font-bold px-3 py-1.5 rounded-full disabled:opacity-40" style={{ background: '#F8F4EC', color: '#7B604C' }}>
            {saving ? 'שומרת...' : exact ? `עדכון הלינק של "${exact.name}"` : `שמירת "${name.trim()}" למיקומים השמורים`}
          </button>
        )}
      </div>
    </>
  )
}

// ── Library management ─────────────────────────────────────────────────
// A quiet card under the events list: rename or remove what the form
// saved. Deleting a link does not touch events that already use it.

export function SavedLibraryPanel({ lib }: { lib: ReturnType<typeof useSavedLibrary> }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<{ kind: 'link' | 'loc'; id: string; name: string } | null>(null)
  // Brenda 16.9.26: "יש גם יכולת להכניס לינקים? כדי למנוע את הכניסה למורנינג
  // כל הזמן". Add straight into the library, without opening an event.
  const [newLink, setNewLink] = useState({ name: '', url: '', amount: '' })
  const [newLoc, setNewLoc] = useState({ name: '', link: '' })
  const [busy, setBusy] = useState<'link' | 'loc' | null>(null)
  const [addErr, setAddErr] = useState<string | null>(null)

  async function addLink() {
    const name = newLink.name.trim(), url = newLink.url.trim()
    if (!name || !isUrl(url)) { setAddErr('צריך שם ולינק שמתחיל ב-https://'); return }
    if (lib.links.some(l => l.url === url)) { setAddErr('הלינק הזה כבר שמור'); return }
    setAddErr(null); setBusy('link')
    await lib.saveLink(name, url, newLink.amount ? Number(newLink.amount) : null)
    setNewLink({ name: '', url: '', amount: '' }); setBusy(null)
  }

  async function addLoc() {
    const name = newLoc.name.trim()
    if (!name) { setAddErr('צריך שם למיקום'); return }
    if (newLoc.link.trim() && !isUrl(newLoc.link)) { setAddErr('לינק הניווט צריך להתחיל ב-https://'); return }
    setAddErr(null); setBusy('loc')
    await lib.saveLocation(name, newLoc.link.trim() || null)
    setNewLoc({ name: '', link: '' }); setBusy(null)
  }

  async function commitRename() {
    if (!editing || !editing.name.trim()) { setEditing(null); return }
    if (editing.kind === 'link') await lib.renameLink(editing.id, editing.name)
    else await lib.renameLocation(editing.id, editing.name)
    setEditing(null)
  }

  const row = (kind: 'link' | 'loc', id: string, name: string, sub: string, onDelete: () => void) => (
    <div key={`${kind}-${id}`} className="flex items-center gap-2 py-2 border-b border-sand-100 last:border-b-0">
      {editing && editing.kind === kind && editing.id === id ? (
        <input autoFocus value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
          onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(null) }}
          className={`${inputCls} py-1.5`} />
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-sand-800 truncate">{name}</p>
          <p className="text-xs text-sand-400 truncate" dir="ltr">{sub}</p>
        </div>
      )}
      <button type="button" onClick={() => setEditing({ kind, id, name })} className="p-1.5 rounded-lg hover:bg-sand-100" title="שינוי שם">
        <Pencil className="w-4 h-4 text-sand-400" />
      </button>
      <button type="button" onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50" title="הסרה מהספרייה">
        <Trash2 className="w-4 h-4 text-sand-400" />
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-sand-200 p-4" dir="rtl">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <span className="text-sm font-bold text-sand-800">לינקים ומיקומים שמורים</span>
        <span className="text-xs text-sand-400">{lib.links.length} לינקים · {lib.locations.length} מיקומים <ChevronDown className={`inline w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-sand-500 mb-1">לינקים לתשלום</p>
            {lib.links.length === 0 && <p className="text-xs text-sand-400">הספרייה מתמלאת מטופס האירוע.</p>}
            {lib.links.map(l => row('link', l.id, l.name,
              `${l.url}${l.morning_product_id ? '' : '  (מזהה מוצר ייקלט מהתשלום הראשון)'}`,
              () => lib.deleteLink(l.id)))}
            <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: '#FAF7F1' }}>
              <p className="text-xs font-semibold text-sand-600">הוספת לינק</p>
              <input value={newLink.name} onChange={e => setNewLink(v => ({ ...v, name: e.target.value }))} placeholder="שם (למשל: הרצאה 40 ₪)" className={inputCls} />
              <input value={newLink.url} onChange={e => setNewLink(v => ({ ...v, url: e.target.value }))} dir="ltr" placeholder="https://mrng.to/..." className={inputCls} />
              <input type="number" min="0" value={newLink.amount} onChange={e => setNewLink(v => ({ ...v, amount: e.target.value }))} placeholder="סכום ₪ (לא חובה)" className={inputCls} />
              <button type="button" onClick={addLink} disabled={busy === 'link'}
                className="w-full py-2 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: '#C8A460', color: '#33281B' }}>
                {busy === 'link' ? 'שומרת...' : 'שמירה לספרייה'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-sand-500 mb-1">מיקומים</p>
            {lib.locations.length === 0 && <p className="text-xs text-sand-400">הספרייה מתמלאת מטופס האירוע.</p>}
            {lib.locations.map(l => row('loc', l.id, l.name, l.link ?? 'בלי לינק ניווט', () => lib.deleteLocation(l.id)))}
            <div className="mt-3 rounded-xl p-3 space-y-2" style={{ background: '#FAF7F1' }}>
              <p className="text-xs font-semibold text-sand-600">הוספת מיקום</p>
              <input value={newLoc.name} onChange={e => setNewLoc(v => ({ ...v, name: e.target.value }))} placeholder="שם (למשל: הסטודיו ברמת גן)" className={inputCls} />
              <input value={newLoc.link} onChange={e => setNewLoc(v => ({ ...v, link: e.target.value }))} dir="ltr" placeholder="https://maps.app.goo.gl/... (לא חובה)" className={inputCls} />
              <button type="button" onClick={addLoc} disabled={busy === 'loc'}
                className="w-full py-2 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: '#C8A460', color: '#33281B' }}>
                {busy === 'loc' ? 'שומרת...' : 'שמירה לספרייה'}
              </button>
            </div>
          </div>
          {addErr && <p className="text-xs text-red-500 font-semibold md:col-span-2">{addErr}</p>}
        </div>
      )}
    </div>
  )
}
