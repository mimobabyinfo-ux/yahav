import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, Copy, GraduationCap, MessageCircle, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react'
import type { UserProfile } from '../../lib/supabase'
import type { ProductFacet } from './useUserProducts'

/**
 * The משתמשות list (10.10.26, from the approved Lovable mockup).
 *
 * Before: a wide table, every row the same weight, actions hidden until
 * hover. Now: three tiles (חדשות השבוע / פעילות השבוע / לא סיימו הרשמה)
 * that double as filters, a "צריכות תשומת לב" strip only when something
 * is stuck, segment tabs, and a compact card per mother whose main tap
 * opens her customer card. WhatsApp and copy-phone are icons; edit,
 * workshop access and delete sit in a ⋯ menu.
 *
 * Presentation only: loading, editing, access and delete stay the
 * parent's handlers and modals.
 */

type U = UserProfile & { childCount: number }
type Segment = 'all' | 'new' | 'mom' | 'pregnant' | 'bought' | 'inactive' | 'stuck' | 'active'
type Sort = 'new' | 'active' | 'abc'

const DAY = 86400000
function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
}
function agoText(iso: string | null | undefined): string {
  const d = daysAgo(iso)
  if (d == null) return 'אף פעם'
  if (d <= 0) return 'היום'
  if (d === 1) return 'אתמול'
  if (d < 30) return `לפני ${d} ימים`
  if (d < 365) return `לפני ${Math.round(d / 30)} חודשים`
  return 'לפני יותר משנה'
}
function babyAge(dob: string | null | undefined): string | null {
  if (!dob) return null
  const days = Math.floor((Date.now() - new Date(dob).getTime()) / DAY)
  if (days < 0) return null
  if (days < 30) return `${Math.max(1, Math.floor(days / 7))} שבועות`
  const months = Math.floor(days / 30.44)
  if (months < 24) return months === 1 ? 'חודש' : `${months} חודשים`
  return `${Math.floor(months / 12)} שנים`
}
function sourceLabel(u: U): string | null {
  if (u.referred_by) return 'חברה הביאה'
  if (u.acquisition_source === 'course_purchase') return 'רכישה'
  if (u.acquisition_source === 'public_event') return 'אירוע קהילה'
  if (u.acquisition_source) return u.acquisition_source
  return null
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')) || '?'
}
function waHref(phone: string, name: string | null) {
  const n = phone.replace(/\D/g, '').replace(/^0/, '972')
  return `https://wa.me/${n}?text=${encodeURIComponent(`היי ${(name ?? '').split(' ')[0]}!`)}`
}
function shortTitle(t: string) {
  return t.replace(/^ליווי התפתחותי\s*-\s*/, '').replace(/^סדנת\s+/, '').replace(/\s*-\s*הקורס הדיגיטלי$/, ' דיגיטלי')
}
function matches(u: U, q: string) {
  if (!q) return true
  const s = q.toLowerCase()
  if ((u.mother_name ?? '').toLowerCase().includes(s) || (u.email ?? '').toLowerCase().includes(s)) return true
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 4) {
    const p = (u.phone_number ?? '').replace(/\D/g, '').replace(/^972/, '0')
    return p.includes(digits.replace(/^972/, '0'))
  }
  return false
}

export default function UsersListView({
  users, byUser, titleById, products, onOpen, onEdit, onAccess, onDelete,
}: {
  users: U[]
  byUser: Map<string, string[]>
  titleById: Map<string, string>
  products: ProductFacet[]
  /** Opens her customer card; list = the order she is looking at. */
  onOpen: (u: U, list: U[]) => void
  onEdit: (u: U) => void
  onAccess: (u: U) => void
  onDelete: (u: U) => void
}) {
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState<Segment>('all')
  const [product, setProduct] = useState('all')
  const [sort, setSort] = useState<Sort>('new')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const isNew = (u: U) => (daysAgo(u.created_at) ?? 999) < 7
  const isActive = (u: U) => (daysAgo(u.last_active) ?? 999) < 7
  const isStuck = (u: U) => !u.onboarding_completed_at && !u.is_admin
  const bought = (u: U) => (byUser.get(u.id) ?? []).length > 0

  const counts = useMemo(() => ({
    new: users.filter(isNew).length,
    active: users.filter(isActive).length,
    stuck: users.filter(isStuck).length,
    mom: users.filter(u => u.user_mode === 'mom').length,
    pregnant: users.filter(u => u.user_mode === 'pregnant').length,
    bought: users.filter(bought).length,
    inactive: users.filter(u => (daysAgo(u.last_active) ?? 999) >= 30).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [users, byUser])

  const attention = useMemo(() => {
    const out: { key: Segment; text: string }[] = []
    const newStuck = users.filter(u => isNew(u) && isStuck(u)).length
    if (newStuck > 0) out.push({ key: 'stuck', text: newStuck === 1 ? 'אחת נרשמה השבוע ולא סיימה את ההרשמה' : `${newStuck} נרשמו השבוע ולא סיימו את ההרשמה` })
    const noApp = users.filter(u => bought(u) && !u.pwa_installed_at && (daysAgo(u.created_at) ?? 999) < 60).length
    if (noApp > 0) out.push({ key: 'bought', text: noApp === 1 ? 'אחת רכשה ב-60 הימים האחרונים ולא התקינה את האפליקציה' : `${noApp} רכשו ב-60 הימים האחרונים ולא התקינו את האפליקציה` })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, byUser])

  const shown = useMemo(() => {
    const q = search.trim()
    const list = users.filter(u => {
      if (!matches(u, q)) return false
      if (product !== 'all' && !(byUser.get(u.id) ?? []).includes(product)) return false
      switch (segment) {
        case 'new': return isNew(u)
        case 'active': return isActive(u)
        case 'stuck': return isStuck(u)
        case 'mom': return u.user_mode === 'mom'
        case 'pregnant': return u.user_mode === 'pregnant'
        case 'bought': return bought(u)
        case 'inactive': return (daysAgo(u.last_active) ?? 999) >= 30
        default: return true
      }
    })
    const name = (u: U) => (u.mother_name ?? u.email ?? '')
    if (sort === 'abc') list.sort((a, b) => name(a).localeCompare(name(b), 'he'))
    else if (sort === 'active') list.sort((a, b) => (b.last_active ?? '').localeCompare(a.last_active ?? ''))
    else list.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, segment, product, sort, byUser])

  function copyPhone(u: U) {
    const digits = (u.phone_number ?? '').replace(/\D/g, '')
    if (!digits) return
    navigator.clipboard.writeText(digits).then(() => {
      setCopied(u.id)
      setTimeout(() => setCopied(c => (c === u.id ? null : c)), 1500)
    })
  }

  const tabs: [Segment, string, number][] = [
    ['all', 'הכל', users.length], ['new', 'חדשות', counts.new], ['mom', 'אמהות', counts.mom],
    ['pregnant', 'בהריון', counts.pregnant], ['bought', 'רכשו', counts.bought], ['inactive', 'לא פעילות 30 יום', counts.inactive],
  ]

  return (
    <div className="space-y-4" dir="rtl">
      <style>{US_CSS}</style>
      <header className="us-header">
        <h1>משתמשות <span>{users.length}</span></h1>
        <div className="us-search">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#A2937D' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון או אימייל" aria-label="חיפוש משתמשת" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="ניקוי"><X className="w-4 h-4" style={{ color: '#A2937D' }} /></button>}
        </div>
      </header>

      <div className="us-tiles">
        {([['new', 'חדשות השבוע', counts.new], ['active', 'פעילות השבוע', counts.active], ['stuck', 'לא סיימו הרשמה', counts.stuck]] as [Segment, string, number][]).map(([k, label, n]) => (
          <button key={k} type="button" className={`us-tile${segment === k ? ' on' : ''}${k === 'stuck' && n > 0 ? ' warn' : ''}`} onClick={() => setSegment(segment === k ? 'all' : k)} aria-pressed={segment === k}>
            <b>{n}</b><span>{label}</span>
          </button>
        ))}
      </div>

      {attention.length > 0 && (
        <section className="us-attn" aria-label="צריכות תשומת לב">
          <h2><AlertTriangle className="w-4 h-4" /> צריכות תשומת לב</h2>
          {attention.map(a => (
            <button key={a.key} type="button" onClick={() => setSegment(a.key)}><span>{a.text}</span><ChevronLeft className="w-4 h-4 flex-shrink-0" /></button>
          ))}
        </section>
      )}

      <div className="us-bar">
        <div className="us-tabs" role="tablist" aria-label="קבוצה">
          {tabs.map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={segment === k} className="us-tab" onClick={() => setSegment(k)}>{label}<small>{n}</small></button>
          ))}
        </div>
        <div className="us-quiet">
          {products.length > 0 && (
            <select value={product} onChange={e => setProduct(e.target.value)} aria-label="סינון לפי מוצר">
              <option value="all">כל המוצרים</option>
              {products.map(p => <option key={p.id} value={p.id}>{shortTitle(p.title)} · {p.buyers}</option>)}
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="מיון">
            <option value="new">חדשות קודם</option>
            <option value="active">פעילות לאחרונה</option>
            <option value="abc">א-ב</option>
          </select>
        </div>
      </div>

      <p className="us-faint">{shown.length === users.length ? `${shown.length} משתמשות` : `${shown.length} מתוך ${users.length}`}</p>

      <div className="us-list">
        {shown.map(u => {
          const name = u.mother_name || u.display_name || u.email
          const owned = byUser.get(u.id) ?? []
          const age = babyAge(u.baby_dob)
          const src = sourceLabel(u)
          return (
            <article key={u.id} className="us-card" aria-label={name}>
              <button type="button" className="us-open" onClick={() => onOpen(u, shown)} title="פתיחת כרטיס הלקוחה">
                <span className="us-av" aria-hidden="true">{initials(name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="us-name">
                    <b>{name}</b>
                    {u.user_mode === 'pregnant' && <span className="us-chip blue">בהריון</span>}
                    {u.is_admin && <span className="us-chip rust">אדמין</span>}
                    {isStuck(u) && <span className="us-chip rust">לא סיימה הרשמה</span>}
                  </span>
                  <span className="us-sub">
                    {u.baby_name ? `${u.baby_name}${age ? `, ${age}` : ''}` : u.user_mode === 'mom' ? 'בלי פרטי תינוק' : ''}
                    {u.area || u.neighborhood ? ` · ${u.neighborhood || u.area}` : ''}
                  </span>
                  <span className="us-chips">
                    {src && <span className="us-chip">{src}</span>}
                    {owned.slice(0, 3).map(id => <span key={id} className="us-chip gold">{shortTitle(titleById.get(id) ?? '')}</span>)}
                    {owned.length > 3 && <span className="us-faint">+{owned.length - 3}</span>}
                  </span>
                </span>
                <span className="us-meta">
                  <span>הצטרפה {agoText(u.created_at)}</span>
                  <span>פעילה {agoText(u.last_active)}</span>
                  <span className={`us-app${u.pwa_installed_at ? ' on' : ''}`}><i />{u.pwa_installed_at ? 'אפליקציה מותקנת' : 'בלי אפליקציה'}</span>
                </span>
              </button>
              <div className="us-actions">
                {u.phone_number && (
                  <>
                    <a className="us-icon" href={waHref(u.phone_number, u.mother_name)} target="_blank" rel="noopener noreferrer" title="וואטסאפ" aria-label={`וואטסאפ ל${name}`}><MessageCircle className="w-4 h-4" /></a>
                    <button type="button" className="us-icon" onClick={() => copyPhone(u)} title="העתקת הטלפון" aria-label={`העתקת הטלפון של ${name}`}>
                      {copied === u.id ? <Check className="w-4 h-4" style={{ color: '#3F5B39' }} /> : <Copy className="w-4 h-4" />}
                    </button>
                  </>
                )}
                <span className="relative">
                  <button type="button" className="us-icon" onClick={() => setMenuFor(menuFor === u.id ? null : u.id)} title="עוד" aria-label={`עוד פעולות ל${name}`} aria-expanded={menuFor === u.id}><MoreHorizontal className="w-4 h-4" /></button>
                  {menuFor === u.id && (
                    <>
                      <span className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                      <span className="us-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onEdit(u) }}><Pencil className="w-4 h-4" /> עריכה</button>
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onAccess(u) }}><GraduationCap className="w-4 h-4" /> גישה לתוכן סדנה</button>
                        <button type="button" role="menuitem" className="danger" onClick={() => { setMenuFor(null); onDelete(u) }}><Trash2 className="w-4 h-4" /> מחיקה</button>
                      </span>
                    </>
                  )}
                </span>
              </div>
            </article>
          )
        })}
        {shown.length === 0 && <p className="us-faint" style={{ padding: 16, textAlign: 'center' }}>לא נמצאו משתמשות</p>}
      </div>
    </div>
  )
}

const US_CSS = `
.us-header{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.us-header h1{font-size:26px;font-weight:700;color:#443327;line-height:1.2;margin-inline-end:auto}
.us-header h1 span{font-size:15px;font-weight:600;color:#A2937D}
.us-search{flex:1 1 280px;max-width:460px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;padding:0 12px;height:42px}
.us-search input{flex:1;min-width:0;background:transparent;outline:none;font-size:14.5px;color:#443327}
.us-search input::placeholder{color:#A2937D}
.us-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.us-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;background:#fff;border:1px solid #E9E2D6;border-radius:16px;padding:12px 16px;text-align:right}
.us-tile b{font-size:26px;line-height:1.1;color:#443327}
.us-tile span{font-size:12.5px;font-weight:700;color:#8A7A63}
.us-tile.warn b{color:#8B4A30}
.us-tile.on{border-color:#C8A460;box-shadow:0 0 0 2px #F6ECD8}
.us-attn{background:#FBF3EF;border:1px solid #EFD3C6;border-radius:16px;padding:10px 12px}
.us-attn h2{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;color:#8B4A30;margin:0 4px 6px}
.us-attn button{display:flex;align-items:center;gap:8px;width:100%;text-align:right;font-size:13.5px;font-weight:600;color:#713924;padding:7px 6px;border-radius:8px}
.us-attn button span{flex:1}
.us-attn button:hover{background:#F5E2D8}
.us-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:8px;border-bottom:1px solid #E9E2D6}
.us-tabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;max-width:100%}
.us-tabs::-webkit-scrollbar{display:none}
.us-tab{padding:9px 1px;font-size:14px;font-weight:600;color:#8A7A63;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}
.us-tab[aria-selected="true"]{color:#443327;font-weight:800;border-color:#C8A460}
.us-tab small{font-size:11.5px;color:#A2937D;margin-inline-start:5px;font-weight:700}
.us-quiet{display:flex;gap:6px;padding-bottom:6px}
.us-quiet select{font-size:12.5px;font-weight:600;color:#6E5836;background:#F6F3ED;border:none;border-radius:9px;padding:6px 8px;outline:none}
.us-faint{font-size:12.5px;font-weight:600;color:#A2937D}
.us-list{display:flex;flex-direction:column;gap:8px}
.us-card{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #E9E2D6;border-radius:16px;padding:4px 8px 4px 4px}
.us-open{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:10px 10px;text-align:right;border-radius:12px}
.us-open:hover{background:#FCFAF6}
.us-av{flex-shrink:0;width:38px;height:38px;border-radius:999px;background:#F6ECD8;color:#6E5836;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}
.us-name{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.us-name b{font-size:15px;color:#443327}
.us-sub{display:block;font-size:12.5px;font-weight:600;color:#8A7A63;margin-top:1px}
.us-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.us-chip{font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 8px;background:#F6F3ED;color:#6E5836;white-space:nowrap}
.us-chip.gold{background:#FBF1DC;color:#8A6A2F}.us-chip.blue{background:#E4EBEF;color:#35505C}.us-chip.rust{background:#F5E2D8;color:#8B4A30}
.us-meta{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px;font-size:12px;font-weight:600;color:#A2937D;min-width:130px}
.us-app{display:inline-flex;align-items:center;gap:5px}
.us-app i{width:7px;height:7px;border-radius:99px;background:#D8CCB6}
.us-app.on{color:#3F5B39}.us-app.on i{background:#6E8F5E}
.us-actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
.us-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;color:#8A7A63}
.us-icon:hover{background:#F6F3ED;color:#443327}
.us-menu{position:absolute;top:36px;left:0;z-index:40;display:flex;flex-direction:column;min-width:180px;background:#fff;border:1px solid #E9E2D6;border-radius:12px;box-shadow:0 8px 24px rgba(68,51,39,.12);padding:4px}
.us-menu button{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#443327;padding:8px 10px;border-radius:8px;text-align:right}
.us-menu button:hover{background:#F6F3ED}
.us-menu button.danger{color:#8B4A30}
@media (max-width:700px){
  .us-header h1{font-size:22px}
  .us-search{flex-basis:100%;max-width:none}
  .us-tile{padding:10px 12px}.us-tile b{font-size:21px}.us-tile span{font-size:11.5px}
  .us-card{flex-direction:column;align-items:stretch;padding:4px}
  .us-open{flex-wrap:wrap}
  .us-meta{flex-direction:row;flex-wrap:wrap;gap:2px 10px;min-width:0;flex-basis:100%;padding-inline-start:50px}
  .us-actions{justify-content:flex-end;border-top:1px solid #F1EBE1;padding:4px}
  .us-quiet{width:100%}
}
`
