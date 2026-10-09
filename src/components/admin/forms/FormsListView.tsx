import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Check, Folder, MessageSquareText, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, Link2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

/**
 * The questionnaires list (9.10.26, from the approved Lovable mockup).
 *
 * Before: one table, every row the same weight, five text buttons per row.
 * Now: new answers first ("תשובות חדשות"), then a card per form inside its
 * folder with the answer count as the main element, ONE primary action
 * ("תשובות"), copy-link and edit as icons, and the rest (שיוך, כיבוי,
 * מחיקה) in a ⋯ menu. Inactive forms are dimmed at the end of their folder.
 *
 * Presentation only: every action is the parent's existing handler, so the
 * editor, the answers view and the data loading are untouched.
 */

type Form = { id: string; title: string; folder: string | null; is_active: boolean; fields_json: { type: string }[] }
type Link = { kind: 'linked' | 'feedback'; title: string }

const INPUT_TYPES = new Set(['text', 'textarea', 'select', 'multiselect', 'rating', 'date'])

function shortProduct(t: string) {
  return t.replace(/^ליווי התפתחותי\s*-\s*/, '').replace(/^סדנת\s+/, '')
}

function relative(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days < 14) return `לפני ${days} ימים`
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

export default function FormsListView({
  forms, stats, newCountByFormId, copiedId, showNewStrip = true,
  onOpen, onEdit, onCopyLink, onAssign, onToggle, onDelete, onCreate,
}: {
  forms: Form[]
  stats: Map<string, { count: number; lastAt: string }>
  newCountByFormId: Map<string, number>
  copiedId: string | null
  /** The phone tab keeps its own "מה חדש" strip (with "סמני הכל כנקרא"). */
  showNewStrip?: boolean
  onOpen: (f: Form) => void
  onEdit: (f: Form) => void
  onCopyLink: (id: string) => void
  onAssign: (f: Form) => void
  onToggle: (f: Form) => void
  onDelete: (f: Form) => void
  onCreate: () => void
}) {
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  // Which product sends each form (same rule as the desktop LinkageLine:
  // the registration questionnaire wins over the feedback form).
  const [linkage, setLinkage] = useState<Map<string, Link>>(new Map())
  useEffect(() => {
    supabase.from('workshops').select('title, linked_form_id, feedback_form_id').then(({ data }) => {
      const m = new Map<string, Link>()
      type W = { title: string; linked_form_id: string | null; feedback_form_id: string | null }
      for (const w of (data ?? []) as W[]) if (w.feedback_form_id) m.set(w.feedback_form_id, { kind: 'feedback', title: w.title })
      for (const w of (data ?? []) as W[]) if (w.linked_form_id) m.set(w.linked_form_id, { kind: 'linked', title: w.title })
      setLinkage(m)
    })
  }, [])

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => forms.filter(f => {
    if (!q) return true
    const link = linkage.get(f.id)
    return `${f.title} ${f.folder ?? ''} ${link?.title ?? ''}`.toLowerCase().includes(q)
  }), [forms, q, linkage])

  const folders = useMemo(() => {
    const m = new Map<string, Form[]>()
    for (const f of visible) {
      const k = f.folder ?? ''
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'he')))
  }, [visible])

  const withNew = forms.filter(f => (newCountByFormId.get(f.id) ?? 0) > 0)
  const totalNew = withNew.reduce((n, f) => n + (newCountByFormId.get(f.id) ?? 0), 0)

  return (
    <div className="space-y-4" dir="rtl">
      <style>{FL_CSS}</style>
      <header className="fl-header">
        <h1>שאלונים</h1>
        <button type="button" onClick={onCreate} className="fl-btn primary"><Plus className="w-4 h-4" /> שאלון חדש</button>
        <div className="fl-search">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#A2937D' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שאלון או מוצר" aria-label="חיפוש שאלון" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="ניקוי"><X className="w-4 h-4" style={{ color: '#A2937D' }} /></button>}
        </div>
      </header>

      {showNewStrip && (
        <section aria-label="תשובות חדשות">
          <div className="fl-h">
            <MessageSquareText className="w-4 h-4" style={{ color: '#8A6A2F' }} />
            <h2>תשובות חדשות</h2>
            <span>{totalNew > 0 ? (totalNew === 1 ? 'תשובה אחת שעוד לא נפתחה' : `${totalNew} שעוד לא נפתחו`) : 'הכל נקרא'}</span>
          </div>
          {withNew.length > 0 && (
            <div className="fl-new">
              {withNew.map(f => (
                <button key={f.id} type="button" className="fl-new-tile" onClick={() => onOpen(f)}>
                  <span className="t">{f.title}</span>
                  <strong>{newCountByFormId.get(f.id) === 1 ? 'אחת חדשה' : `${newCountByFormId.get(f.id)} חדשות`}</strong>
                  <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {folders.map(([folderName, list]) => {
        const isOpen = !closed.has(folderName)
        const sorted = list.slice().sort((a, b) => Number(b.is_active) - Number(a.is_active))
        return (
          <section key={folderName || '__none__'} aria-label={folderName || 'ללא תיקייה'}>
            <button type="button" className="fl-h fl-folder" aria-expanded={isOpen}
              onClick={() => setClosed(prev => { const n = new Set(prev); if (n.has(folderName)) n.delete(folderName); else n.add(folderName); return n })}>
              <Folder className="w-4 h-4" style={{ color: '#A2937D' }} />
              <h2>{folderName || 'ללא תיקייה'}</h2>
              <span>{list.length}</span>
            </button>
            {isOpen && (
              <div className="fl-list">
                {sorted.map(f => {
                  const stat = stats.get(f.id)
                  const count = stat?.count ?? 0
                  const fresh = newCountByFormId.get(f.id) ?? 0
                  const link = linkage.get(f.id)
                  const questions = f.fields_json.filter(x => INPUT_TYPES.has(x.type)).length
                  return (
                    <article key={f.id} className={`fl-card${f.is_active ? '' : ' off'}`} aria-label={f.title}>
                      <div className="fl-info">
                        <h3>{f.title}</h3>
                        <div className="fl-chips">
                          {link?.kind === 'linked' && <span className="fl-chip blue">מקושר · {shortProduct(link.title)}</span>}
                          {link?.kind === 'feedback' && <span className="fl-chip">משוב · {shortProduct(link.title)}</span>}
                          {!link && <span className="fl-chip rust">לא מקושר למוצר</span>}
                          <span className="fl-faint">{questions} שאלות</span>
                        </div>
                        <p className="fl-faint">תשובה אחרונה: {stat && count > 0 ? relative(stat.lastAt) : 'אין עדיין'}</p>
                      </div>
                      <button type="button" className="fl-count" disabled={count === 0} onClick={() => onOpen(f)} title={count > 0 ? 'פתיחת התשובות' : undefined}>
                        <strong>{count}</strong>
                        <span>{count === 1 ? 'תשובה' : 'תשובות'}</span>
                        {fresh > 0 && <em>{fresh === 1 ? 'אחת חדשה' : `${fresh} חדשות`}</em>}
                      </button>
                      <div className="fl-actions">
                        <button type="button" className={`fl-state${f.is_active ? ' on' : ''}`} onClick={() => onToggle(f)} title={f.is_active ? 'לחיצה מכבה את השאלון' : 'לחיצה מפעילה את השאלון'}>
                          <i />{f.is_active ? 'פעיל' : 'כבוי'}
                        </button>
                        <button type="button" className="fl-btn soft" disabled={count === 0} onClick={() => onOpen(f)}>תשובות</button>
                        <button type="button" className="fl-icon" onClick={() => onCopyLink(f.id)} title="העתקת הקישור הציבורי" aria-label={`העתקת קישור ל${f.title}`}>
                          {copiedId === f.id ? <Check className="w-4 h-4" style={{ color: '#3F5B39' }} /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button type="button" className="fl-icon" onClick={() => onEdit(f)} title="עריכה" aria-label={`עריכת ${f.title}`}><Pencil className="w-4 h-4" /></button>
                        <span className="relative">
                          <button type="button" className="fl-icon" onClick={() => setMenuFor(menuFor === f.id ? null : f.id)} title="עוד" aria-label={`עוד פעולות ל${f.title}`} aria-expanded={menuFor === f.id}>
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {menuFor === f.id && (
                            <>
                              <span className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                              <span className="fl-menu" role="menu">
                                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onAssign(f) }}><Link2 className="w-4 h-4" /> שליחה לאמהות כמשימה</button>
                                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onToggle(f) }}><Power className="w-4 h-4" /> {f.is_active ? 'כיבוי' : 'הפעלה'}</button>
                                <button type="button" role="menuitem" className="danger" onClick={() => { setMenuFor(null); onDelete(f) }}><Trash2 className="w-4 h-4" /> מחיקה</button>
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
      {visible.length === 0 && <p className="text-center py-10" style={{ fontWeight: 600, fontSize: 14, color: '#A2937D' }}>{forms.length === 0 ? 'אין שאלונים עדיין' : 'לא נמצא שאלון'}</p>}
    </div>
  )
}

const FL_CSS = `
.fl-header{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.fl-header h1{font-size:26px;font-weight:700;color:#443327;line-height:1.2;margin-inline-end:auto}
.fl-search{flex-basis:100%;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;padding:0 12px;height:42px;max-width:520px}
.fl-search input{flex:1;min-width:0;background:transparent;outline:none;font-size:14.5px;color:#443327}
.fl-search input::placeholder{color:#A2937D}
.fl-btn{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;border-radius:10px;padding:7px 12px;white-space:nowrap}
.fl-btn.primary{background:#C8A460;color:#33281B;padding:9px 16px;font-size:14px}
.fl-btn.soft{background:#F6ECD8;color:#6E5836}
.fl-btn:disabled{opacity:.4}
.fl-h{display:flex;align-items:center;gap:7px;margin:6px 0 8px}
.fl-h h2{font-size:17px;font-weight:700;color:#443327}
.fl-h span{font-size:12.5px;font-weight:600;color:#A2937D}
.fl-folder{width:100%;text-align:right}
.fl-new{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.fl-new-tile{display:flex;align-items:center;gap:10px;background:#FBF1DC;border:1px solid #EBD7AE;border-radius:14px;padding:11px 14px;text-align:right;color:#6E5836;transition:filter .15s}
.fl-new-tile:hover{filter:brightness(.98)}
.fl-new-tile .t{flex:1;min-width:0;font-size:13.5px;font-weight:700;color:#443327;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl-new-tile strong{font-size:12.5px;color:#8B4A30;white-space:nowrap}
.fl-list{display:flex;flex-direction:column;gap:8px}
.fl-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;background:#fff;border:1px solid #E9E2D6;border-radius:16px;padding:13px 16px}
.fl-card.off{background:#FBF9F5}
.fl-card.off h3,.fl-card.off .fl-count strong{color:#A2937D}
.fl-info h3{font-size:15px;font-weight:700;color:#443327;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fl-chips{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:4px}
.fl-chip{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;background:#F6F3ED;color:#6E5836;white-space:nowrap}
.fl-chip.blue{background:#E4EBEF;color:#35505C}.fl-chip.rust{background:#F5E2D8;color:#8B4A30}
.fl-faint{font-size:12px;font-weight:600;color:#A2937D}
.fl-info p{margin-top:3px}
.fl-count{display:flex;flex-direction:column;align-items:center;min-width:76px;line-height:1.1}
.fl-count strong{font-size:24px;font-weight:700;color:#443327}
.fl-count span{font-size:12px;font-weight:600;color:#8A7A63}
.fl-count em{font-style:normal;margin-top:3px;font-size:11.5px;font-weight:800;color:#8B4A30;background:#F5E2D8;border-radius:999px;padding:1px 8px;white-space:nowrap}
.fl-count:not(:disabled):hover strong{text-decoration:underline}
.fl-actions{display:flex;align-items:center;gap:4px}
.fl-state{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#A2937D;padding:4px 8px;border-radius:8px;margin-inline-end:4px}
.fl-state i{width:7px;height:7px;border-radius:99px;background:#CFC4B4}
.fl-state.on{color:#3F5B39}.fl-state.on i{background:#6E8F5E}
.fl-state:hover{background:#F6F3ED}
.fl-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;color:#8A7A63}
.fl-icon:hover{background:#F6F3ED;color:#443327}
.fl-menu{position:absolute;top:36px;left:0;z-index:40;display:flex;flex-direction:column;min-width:170px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;box-shadow:0 8px 24px rgba(68,51,39,.12);padding:4px}
.fl-menu button{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#443327;padding:8px 10px;border-radius:8px;text-align:right}
.fl-menu button:hover{background:#F6F3ED}
.fl-menu button.danger{color:#8B4A30}
@media (max-width:700px){
  .fl-card{grid-template-columns:minmax(0,1fr) auto;gap:10px 12px}
  .fl-actions{grid-column:1/-1;justify-content:flex-start;border-top:1px solid #F1EBE1;padding-top:8px}
  .fl-info h3{white-space:normal}
  .fl-header h1{font-size:22px}
}
`
