import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, X, Check, ShieldAlert, Search, Users, BarChart2, Lightbulb, Video, Gift, Settings, MessageCircle, Mail, Phone } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import { supabase, UserProfile, DailyTip, Video as VideoType, HomeworkTask, Workshop, PartnerPerk, PerkAnalytic, ContentCategory, GlobalSetting, PregnancyChecklistItem, PregnancyWeeklyGuide, ServicePartner, PartnerLead, WorkshopContent } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { AdminSection } from '../App'

type Tab = 'users' | 'insights' | 'tips' | 'videos' | 'workshops' | 'perks' | 'forms' | 'settings' | 'pregnancy' | 'partners' | 'leads'

const APP_URL = 'https://mimoapp.vercel.app'

// Map admin nav sections → internal tabs
const SECTION_TAB: Record<AdminSection, Tab> = {
  insights:  'insights',
  users:     'users',
  workshops: 'workshops',
  forms:     'forms',
  leads:     'leads',
  tips:      'tips',
  videos:    'videos',
  perks:     'perks',
  pregnancy: 'pregnancy',
  partners:  'partners',
  settings:  'settings',
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'users',     label: 'משתמשים',      icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'insights',  label: 'תובנות',        icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'workshops', label: 'סדנאות',        icon: <span className="text-xs">🎓</span> },
  { id: 'videos',    label: 'סרטונים',       icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'tips',      label: 'טיפים',         icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: 'perks',     label: 'הטבות',         icon: <Gift className="w-3.5 h-3.5" /> },
  { id: 'pregnancy', label: 'הריון',          icon: <span className="text-xs">🤰</span> },
  { id: 'partners',  label: 'שירותים',       icon: <span className="text-xs">🌿</span> },
  { id: 'leads',     label: 'לידים',         icon: <span className="text-xs">📞</span> },
  { id: 'forms',     label: 'טפסים',         icon: <span className="text-xs">📋</span> },
  { id: 'settings',  label: 'הגדרות',        icon: <Settings className="w-3.5 h-3.5" /> },
]

export default function AdminPage({ defaultSection }: { defaultSection?: AdminSection }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>(defaultSection ? SECTION_TAB[defaultSection] : 'insights')

  // Sync when parent nav changes the section
  useEffect(() => {
    if (defaultSection) setTab(SECTION_TAB[defaultSection])
  }, [defaultSection])

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-sand-500">אין גישה לפאנל הניהול</p>
      </div>
    )
  }

  const tabLabel = TABS.find(t => t.id === tab)?.label ?? ''

  return (
    <div className="min-h-screen pb-24 lg:pb-6" dir="rtl">
      {/* ── Mobile header (hidden on desktop, sidebar handles nav) ── */}
      <div className="lg:hidden bg-white border-b border-sand-100 shadow-sm px-4 pt-5 pb-3">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-sand-800">פאנל ניהול</h1>
              <p className="text-xs text-sand-400">Mimo CMS</p>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scroll-hide pb-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${tab === t.id ? 'text-white shadow-md' : 'bg-sand-50 text-sand-500 hover:bg-sand-100'}`}
                style={tab === t.id ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desktop header (slim top bar) ── */}
      <div className="hidden lg:flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{tabLabel}</h2>
          <p className="text-xs text-gray-400">Mimo CMS · Admin Panel</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-red-400 font-bold">
          <ShieldAlert className="w-3.5 h-3.5" />
          ADMIN MODE
        </div>
      </div>

      {/* ── Mobile content ── */}
      <div className="lg:hidden max-w-sm mx-auto px-4 pt-4 space-y-4">
        {tab === 'users'      && <UsersTab />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'tips'       && <TipsTab />}
        {tab === 'videos'     && <VideosTab />}
        {tab === 'workshops'  && <WorkshopsTab />}
        {tab === 'perks'      && <PerksTab />}
        {tab === 'pregnancy'  && <PregnancyAdminTab />}
        {tab === 'partners'   && <PartnersTab />}
        {tab === 'leads'      && <LeadsTab />}
        {tab === 'forms'      && <FormsTab />}
        {tab === 'settings'   && <SettingsTab />}
      </div>

      {/* ── Desktop content ── */}
      <div className="hidden lg:block px-8 py-6">
        {tab === 'users'      && <UsersTabDesktop />}
        {tab === 'leads'      && <LeadsTabDesktop />}
        {tab === 'workshops'  && <WorkshopsTabDesktop />}
        {tab === 'forms'      && <FormsTabDesktop />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'tips'       && <TipsTab />}
        {tab === 'videos'     && <VideosTab />}
        {tab === 'perks'      && <PerksTab />}
        {tab === 'pregnancy'  && <PregnancyAdminTab />}
        {tab === 'partners'   && <PartnersTab />}
        {tab === 'settings'   && <SettingsTab />}
      </div>
    </div>
  )
}

// ─── CRM helpers ─────────────────────────────────────────────────────────────
const LEAD_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  new_lead:        { label: 'ליד חדש',           color: '#3b82f6', bg: '#eff6ff' },
  active_workshop: { label: 'בסדנה פעילה',       color: '#16a34a', bg: '#f0fdf4' },
  post_service:    { label: 'לאחר שירות',         color: '#9ca3af', bg: '#f9fafb' },
}

function LeadBadge({ status }: { status: string | null }) {
  const s = status ? (LEAD_STATUS_LABELS[status] ?? null) : null
  if (!s) return <span className="text-[10px] bg-sand-100 text-sand-400 px-1.5 py-0.5 rounded-md">ללא סטטוס</span>
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
type UserWithChildren = UserProfile & { childCount: number }

type ExistingAccess = { id: string; workshop_id: string; access_start_date: string | null; access_end_date: string | null; workshops?: { title: string }[] | { title: string } | null }

function AssignAccessModal({ user, onClose }: { user: UserWithChildren; onClose: () => void }) {
  const [workshops, setWorkshops] = useState<{ id: string; title: string }[]>([])
  const [existing, setExisting] = useState<ExistingAccess[]>([])
  const [workshopId, setWorkshopId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [waLink, setWaLink] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEndDate, setEditEndDate] = useState('')

  useEffect(() => {
    supabase.from('workshops').select('id, title').eq('is_active', true).order('display_order')
      .then(({ data }) => setWorkshops(data ?? []))
    loadExisting()
  }, [])

  async function loadExisting() {
    const { data } = await supabase
      .from('purchased_workshops')
      .select('id, workshop_id, access_start_date, access_end_date, workshops(title)')
      .eq('user_id', user.id)
    setExisting((data ?? []) as ExistingAccess[])
  }

  async function save() {
    if (!workshopId || !startDate || !endDate) return
    setSaving(true)
    await supabase.from('purchased_workshops').upsert({
      user_id: user.id,
      workshop_id: workshopId,
      purchase_date: startDate,
      access_start_date: startDate,
      access_end_date: endDate,
    }, { onConflict: 'user_id,workshop_id' })
    setSaving(false)
    setSaved(true)
    loadExisting()
    const workshopTitle = workshops.find(w => w.id === workshopId)?.title ?? 'הסדנה'
    const userName = user.mother_name ?? user.email
    const phone = user.phone_number?.replace(/\D/g, '') ?? ''
    if (phone) {
      const msg = encodeURIComponent(`היי ${userName}! 🎉\nהגישה שלך ל${workshopTitle} פעילה כעת.\nהיכנסי לאפליקציית Mimo > הסדנאות שלי לצפייה 🌸`)
      setWaLink(`https://wa.me/${phone.startsWith('972') ? phone : '972' + phone.replace(/^0/, '')}?text=${msg}`)
    }
    setTimeout(() => setSaved(false), 1500)
  }

  async function saveEditAccess(id: string) {
    await supabase.from('purchased_workshops').update({ access_end_date: editEndDate }).eq('id', id)
    setEditingId(null)
    loadExisting()
  }

  async function revokeAccess(id: string) {
    await supabase.from('purchased_workshops').delete().eq('id', id)
    setExisting(prev => prev.filter(e => e.id !== id))
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl space-y-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl">🎓</span>
          </div>
          <h3 className="font-bold text-sand-800">ניהול גישה לסדנאות</h3>
          <p className="text-xs text-sand-400 mt-1">{user.mother_name ?? user.email}</p>
        </div>

        {/* Existing access */}
        {existing.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-sand-500">גישות קיימות</p>
            {existing.map(e => {
              const active = e.access_end_date && e.access_end_date >= today
              return (
                <div key={e.id} className={`rounded-2xl p-3 space-y-2 ${active ? 'bg-green-50 border border-green-200' : 'bg-sand-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-sand-800">{(e.workshops as { title: string } | null)?.title ?? '—'}</p>
                      <p className="text-[10px] text-sand-400">
                        {e.access_start_date} → {e.access_end_date}
                        {active ? <span className="text-green-600 mr-1"> ✓ פעיל</span> : <span className="text-red-400 mr-1"> פג תוקף</span>}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(e.id); setEditEndDate(e.access_end_date ?? '') }} className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg">✏️</button>
                      <button onClick={() => revokeAccess(e.id)} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg">✕</button>
                    </div>
                  </div>
                  {editingId === e.id && (
                    <div className="flex gap-2 items-center">
                      <input type="date" value={editEndDate} onChange={ev => setEditEndDate(ev.target.value)} className="flex-1 px-3 py-1.5 border border-sand-200 rounded-xl text-xs focus:outline-none" />
                      <button onClick={() => saveEditAccess(e.id)} className="px-3 py-1.5 rounded-xl text-xs text-white font-bold" style={{ background: '#C49438' }}>שמור</button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1.5 rounded-xl text-xs bg-sand-100 text-sand-600">ביטול</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* New access */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-sand-500">הקצה גישה חדשה</p>
          <select value={workshopId} onChange={e => setWorkshopId(e.target.value)} className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400">
            <option value="">בחר סדנה...</option>
            {workshops.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-sand-500 mb-1 block">התחלה</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">סיום</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
            </div>
          </div>
        </div>

        {saved && <p className="text-center text-green-600 font-semibold text-sm">✓ נשמר בהצלחה!</p>}
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}>
            💬 שלחי הודעת WhatsApp לאישור
          </a>
        )}

        <div className="flex gap-2 pb-2">
          <button onClick={save} disabled={saving || !workshopId || !endDate} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            {saving ? '...' : 'הקצה גישה'}
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">סגור</button>
        </div>
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<UserWithChildren[]>([])
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'pregnant' | 'mom'>('all')
  const [editUser, setEditUser] = useState<UserWithChildren | null>(null)
  const [editName, setEditName] = useState('')
  const [editLeadStatus, setEditLeadStatus] = useState<string>('')
  const [editNotes, setEditNotes] = useState('')
  const [editUserMode, setEditUserMode] = useState<string>('')
  const [deleteUser, setDeleteUser] = useState<UserWithChildren | null>(null)
  const [saving, setSaving] = useState(false)
  const [assignAccessUser, setAssignAccessUser] = useState<UserWithChildren | null>(null)

  const load = useCallback(async () => {
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
    const { data: children } = await supabase.from('children').select('user_id')
    const countMap: Record<string, number> = {}
    children?.forEach(c => { countMap[c.user_id] = (countMap[c.user_id] ?? 0) + 1 })
    setUsers((profiles ?? []).map(p => ({ ...p, childCount: countMap[p.id] ?? 0 })))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = users.filter(u => {
    if (modeFilter !== 'all' && u.user_mode !== modeFilter) return false
    return !search || (u.mother_name ?? '').includes(search) || u.email.includes(search)
  })

  async function saveEdit() {
    if (!editUser || !editName.trim()) return
    setSaving(true)
    const ls = (editLeadStatus || null) as 'new_lead' | 'active_workshop' | 'post_service' | null
    const updates = {
      mother_name: editName,
      display_name: editName,
      lead_status: ls,
      staff_notes: editNotes || null,
      user_mode: (editUserMode || null) as 'pregnant' | 'mom' | null,
    }
    await supabase.from('user_profiles').update(updates).eq('id', editUser.id)
    setUsers(prev => prev.map(p => p.id === editUser.id ? { ...p, ...updates } : p))
    setEditUser(null)
    setSaving(false)
  }

  async function confirmDelete() {
    if (!deleteUser) return
    await supabase.from('user_profiles').delete().eq('id', deleteUser.id)
    setUsers(prev => prev.filter(p => p.id !== deleteUser.id))
    setDeleteUser(null)
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-300" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חפש לפי שם אמא..."
          className="w-full pr-9 pl-4 py-3 bg-white border border-sand-100 rounded-2xl text-sm text-sand-800 focus:outline-none focus:border-mustard-400 shadow-sm"
        />
      </div>

      {/* Mode filter */}
      <div className="flex gap-2">
        {(['all', 'mom', 'pregnant'] as const).map(m => (
          <button
            key={m}
            onClick={() => setModeFilter(m)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${modeFilter === m ? 'text-white shadow-sm' : 'bg-sand-50 text-sand-500'}`}
            style={modeFilter === m ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
          >
            {m === 'all' ? 'הכל' : m === 'mom' ? '👶 אמהות' : '🤰 הריון'}
          </button>
        ))}
      </div>

      <p className="text-xs text-sand-400">{filtered.length} משתמשות</p>

      {filtered.map(u => (
        <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sand-800 text-sm truncate">{u.mother_name ?? '—'}</p>
                {u.is_admin && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-bold">ADMIN</span>}
                {u.user_mode === 'pregnant' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold">🤰 הריון</span>}
                <LeadBadge status={u.lead_status} />
              </div>
              <p className="text-xs text-sand-400 truncate">{u.email}</p>
              <p className="text-xs text-sand-300 mt-0.5">
                {u.childCount > 0 ? `${u.childCount} ילד${u.childCount > 1 ? 'ים' : ''}` : 'אין ילדים'}
                {u.staff_notes && <span className="mr-2 text-sand-400">· {u.staff_notes.slice(0, 30)}{u.staff_notes.length > 30 ? '...' : ''}</span>}
              </p>
            </div>
          </div>

          {/* Communication row */}
          <div className="flex gap-2">
            <a
              href={`https://wa.me/${u.email.replace(/[^0-9]/g, '') || '972559904274'}?text=${encodeURIComponent(`היי ${u.mother_name ?? ''}! 👋`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
            <a
              href={`mailto:${u.email}?subject=Mimo - עדכון עבורך&body=היי ${u.mother_name ?? ''}!`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              מייל
            </a>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setEditUser(u); setEditName(u.mother_name ?? ''); setEditLeadStatus(u.lead_status ?? ''); setEditNotes(u.staff_notes ?? ''); setEditUserMode(u.user_mode ?? '') }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-sand-50 text-sand-600 hover:bg-sand-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              ערוך
            </button>
            <button
              onClick={() => setDeleteUser(u)}
              className="p-2 rounded-xl text-red-400 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Workshop access button */}
          <button
            onClick={() => setAssignAccessUser(u)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
          >
            🎓 הקצה גישה לסדנה
          </button>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-center text-sand-400 text-sm py-8">לא נמצאו משתמשות</p>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sand-800 text-lg">ערוך פרטים</h3>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">שם</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
              />
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">סטטוס CRM</label>
              <select
                value={editLeadStatus}
                onChange={e => setEditLeadStatus(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
              >
                <option value="">ללא סטטוס</option>
                <option value="new_lead">ליד חדש</option>
                <option value="active_workshop">בסדנה פעילה</option>
                <option value="post_service">לאחר שירות</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">מצב משתמשת</label>
              <select
                value={editUserMode}
                onChange={e => setEditUserMode(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
              >
                <option value="">לא הוגדר</option>
                <option value="mom">👶 אמא</option>
                <option value="pregnant">🤰 בהריון</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">הערות פנימיות</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="הערות לצוות..."
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                {saving ? '...' : 'שמירה'}
              </button>
              <button onClick={() => setEditUser(null)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Workshop Access Modal */}
      {assignAccessUser && (
        <AssignAccessModal user={assignAccessUser} onClose={() => setAssignAccessUser(null)} />
      )}

      {/* Delete Confirm Modal */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteUser(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-sand-800">מחיקת משתמשת</h3>
              <p className="text-sm text-sand-500 mt-1">
                האם למחוק את <strong>{deleteUser.mother_name ?? deleteUser.email}</strong>? פעולה זו לא ניתנת לביטול.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600">מחק</button>
              <button onClick={() => setDeleteUser(null)} className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Users Desktop Table ──────────────────────────────────────────────────────
function UsersTabDesktop() {
  const [users, setUsers] = useState<UserWithChildren[]>([])
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'pregnant' | 'mom'>('all')
  const [drawer, setDrawer] = useState<UserWithChildren | null>(null)
  const [editName, setEditName] = useState('')
  const [editLeadStatus, setEditLeadStatus] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editUserMode, setEditUserMode] = useState('')
  const [saving, setSaving] = useState(false)
  const [assignAccessUser, setAssignAccessUser] = useState<UserWithChildren | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserWithChildren | null>(null)

  const load = useCallback(async () => {
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
    const { data: children } = await supabase.from('children').select('user_id')
    const countMap: Record<string, number> = {}
    children?.forEach(c => { countMap[c.user_id] = (countMap[c.user_id] ?? 0) + 1 })
    setUsers((profiles ?? []).map(p => ({ ...p, childCount: countMap[p.id] ?? 0 })))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = users.filter(u => {
    if (modeFilter !== 'all' && u.user_mode !== modeFilter) return false
    return !search || (u.mother_name ?? '').includes(search) || u.email.includes(search)
  })

  function openDrawer(u: UserWithChildren) {
    setDrawer(u)
    setEditName(u.mother_name ?? '')
    setEditLeadStatus(u.lead_status ?? '')
    setEditNotes(u.staff_notes ?? '')
    setEditUserMode(u.user_mode ?? '')
  }

  async function saveDrawer() {
    if (!drawer) return
    setSaving(true)
    const ls = (editLeadStatus || null) as 'new_lead' | 'active_workshop' | 'post_service' | null
    const updates = { mother_name: editName, display_name: editName, lead_status: ls, staff_notes: editNotes || null, user_mode: (editUserMode || null) as 'pregnant' | 'mom' | null }
    await supabase.from('user_profiles').update(updates).eq('id', drawer.id)
    setUsers(prev => prev.map(p => p.id === drawer.id ? { ...p, ...updates } : p))
    setSaving(false)
    setDrawer(null)
  }

  async function confirmDelete() {
    if (!deleteUser) return
    await supabase.from('user_profiles').delete().eq('id', deleteUser.id)
    setUsers(prev => prev.filter(p => p.id !== deleteUser.id))
    setDeleteUser(null)
  }

  return (
    <div className="flex gap-6 h-full" dir="rtl">
      {/* ── Table ── */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם / אימייל..."
              className="w-full pr-9 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-mustard-400 shadow-sm" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'mom', 'pregnant'] as const).map(m => (
              <button key={m} onClick={() => setModeFilter(m)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${modeFilter === m ? 'text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                style={modeFilter === m ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}>
                {m === 'all' ? 'הכל' : m === 'mom' ? '👶 אמהות' : '🤰 הריון'}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-400 mr-auto">{filtered.length} משתמשות</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <table className="w-full text-right" dir="rtl">
            <thead>
              <tr style={{ background: '#f8f8fb' }}>
                {['שם', 'אימייל', 'מצב', 'סטטוס CRM', 'ילדים', 'הצטרף', 'פעולות'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-gray-500 text-right whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-mustard-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-mustard-700">
                        {(u.mother_name ?? u.email)[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{u.mother_name ?? '—'}</p>
                        {u.is_admin && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold">ADMIN</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.user_mode === 'pregnant'
                      ? <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-lg font-bold">🤰 הריון</span>
                      : u.user_mode === 'mom'
                      ? <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-bold">👶 אמא</span>
                      : <span className="text-[10px] text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3"><LeadBadge status={u.lead_status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-center">{u.childCount || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openDrawer(u)} title="ערוך"
                        className="p-1.5 rounded-lg hover:bg-mustard-50 text-gray-400 hover:text-mustard-600">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setAssignAccessUser(u)} title="גישה לסדנה"
                        className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 text-xs">
                        🎓
                      </button>
                      <a href={`mailto:${u.email}`}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                      <button onClick={() => setDeleteUser(u)} title="מחק"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">לא נמצאו משתמשות</p>
          )}
        </div>
      </div>

      {/* ── Side Drawer ── */}
      {drawer && (
        <aside className="w-80 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4 self-start sticky top-24" dir="rtl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">עריכת משתמשת</h3>
            <button onClick={() => setDrawer(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-mustard-100 flex items-center justify-center text-xl font-bold text-mustard-700 mx-auto">
            {(drawer.mother_name ?? drawer.email)[0]?.toUpperCase()}
          </div>
          <p className="text-xs text-center text-gray-400 -mt-2">{drawer.email}</p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">שם</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">סטטוס CRM</label>
              <select value={editLeadStatus} onChange={e => setEditLeadStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white">
                <option value="">ללא סטטוס</option>
                <option value="new_lead">ליד חדש</option>
                <option value="active_workshop">בסדנה פעילה</option>
                <option value="post_service">לאחר שירות</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">מצב</label>
              <select value={editUserMode} onChange={e => setEditUserMode(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white">
                <option value="">לא הוגדר</option>
                <option value="mom">אמא</option>
                <option value="pregnant">בהריון</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">הערות סטאף</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />
            </div>
          </div>

          <button onClick={saveDrawer} disabled={saving}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button onClick={() => setAssignAccessUser(drawer)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-purple-50 text-purple-700">
            🎓 ניהול גישה לסדנאות
          </button>
        </aside>
      )}

      {assignAccessUser && <AssignAccessModal user={assignAccessUser} onClose={() => setAssignAccessUser(null)} />}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteUser(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3"><Trash2 className="w-6 h-6 text-red-500" /></div>
              <h3 className="font-bold text-sand-800">מחיקת משתמשת</h3>
              <p className="text-sm text-sand-500 mt-1">האם למחוק את <strong>{deleteUser.mother_name ?? deleteUser.email}</strong>?</p>
            </div>
            <div className="flex gap-2">
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">מחק</button>
              <button onClick={() => setDeleteUser(null)} className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Leads Desktop Table ──────────────────────────────────────────────────────
function LeadsTabDesktop() {
  // Partner leads (WhatsApp / callback)
  const [partnerLeads, setPartnerLeads] = useState<LeadWithDetails[]>([])
  const [filterType, setFilterType] = useState<'all' | 'whatsapp' | 'callback'>('all')
  const [loadingLeads, setLoadingLeads] = useState(true)

  // CRM user profiles
  const [crmUsers, setCrmUsers] = useState<UserProfile[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [drawer, setDrawer] = useState<UserProfile | null>(null)

  useEffect(() => {
    async function loadLeads() {
      const { data: rawLeads } = await supabase.from('partner_leads').select('*').order('created_at', { ascending: false })
      if (!rawLeads || rawLeads.length === 0) { setPartnerLeads([]); setLoadingLeads(false); return }
      const userIds = [...new Set(rawLeads.map((l: PartnerLead) => l.user_id).filter(Boolean))] as string[]
      const partnerIds = [...new Set(rawLeads.map((l: PartnerLead) => l.partner_id).filter(Boolean))] as string[]
      const [{ data: profiles }, { data: partners }] = await Promise.all([
        supabase.from('user_profiles').select('id, mother_name, phone_number').in('id', userIds),
        supabase.from('service_partners').select('id, title').in('id', partnerIds),
      ])
      const profileMap: Record<string, { mother_name: string | null; phone_number: string | null }> = {}
      ;(profiles ?? []).forEach((p: { id: string; mother_name: string | null; phone_number: string | null }) => { profileMap[p.id] = p })
      const partnerMap: Record<string, string> = {}
      ;(partners ?? []).forEach((p: { id: string; title: string }) => { partnerMap[p.id] = p.title })
      setPartnerLeads(rawLeads.map((l: PartnerLead) => ({
        ...l,
        user_name: l.contact_name ?? (l.user_id ? profileMap[l.user_id]?.mother_name ?? null : null),
        user_phone: l.contact_phone ?? (l.user_id ? profileMap[l.user_id]?.phone_number ?? null : null),
        partner_title: l.partner_id ? (partnerMap[l.partner_id] ?? null) : null,
      })))
      setLoadingLeads(false)
    }
    loadLeads()
    supabase.from('user_profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => setCrmUsers(data ?? []))
  }, [])

  const filteredLeads = partnerLeads.filter(l => filterType === 'all' || l.action_type === filterType)
  const filteredCrm = crmUsers.filter(u => {
    if (statusFilter !== 'all' && u.lead_status !== statusFilter) return false
    return !search || (u.mother_name ?? '').includes(search) || u.email.includes(search)
  })

  async function updateStatus(id: string, status: string) {
    await supabase.from('user_profiles').update({ lead_status: status || null }).eq('id', id)
    setCrmUsers(prev => prev.map(u => u.id === id ? { ...u, lead_status: (status || null) as UserProfile['lead_status'] } : u))
  }

  return (
    <div className="space-y-8" dir="rtl">

      {/* ── Section 1: Partner Leads ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">לידים מהשיתופי פעולה</h2>
            <p className="text-xs text-gray-400 mt-0.5">פניות WA ובקשות התקשרות ממשתמשות</p>
          </div>
          <div className="flex gap-1.5">
            {(['all', 'whatsapp', 'callback'] as const).map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${filterType === t ? 'text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                style={filterType === t ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : {}}>
                {t === 'all' ? 'הכל' : t === 'whatsapp' ? '💬 WhatsApp' : '📞 טלפון'}
              </button>
            ))}
          </div>
        </div>

        {loadingLeads ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500 font-semibold">
                  <th className="px-6 py-3">שם</th>
                  <th className="px-4 py-3">טלפון</th>
                  <th className="px-4 py-3">שירות</th>
                  <th className="px-4 py-3">סוג</th>
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3 font-semibold text-gray-800">{l.user_name ?? '—'}</td>
                    <td className="px-4 py-3 text-green-600 font-semibold text-xs">{l.user_phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">🌿 {l.partner_title ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-1 rounded-lg font-bold ${l.action_type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {l.action_type === 'whatsapp' ? '💬 WhatsApp' : '📞 התקשרות'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {l.user_phone && (
                          <a href={`https://wa.me/${l.user_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {l.user_phone && (
                          <a href={`tel:${l.user_phone}`}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeads.length === 0 && <p className="text-center text-gray-400 text-sm py-12">אין לידים</p>}
          </div>
        )}
      </div>

      {/* ── Section 2: CRM User Profiles ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <h2 className="font-bold text-gray-800 text-lg">CRM משתמשות</h2>
            <p className="text-xs text-gray-400 mt-0.5">ניהול סטטוס וניהול קשר עם משתמשות</p>
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
              className="w-full pr-9 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none shadow-sm" />
          </div>
          <div className="flex gap-1.5">
            {['all', 'new_lead', 'active_workshop', 'post_service'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${statusFilter === s ? 'text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                style={statusFilter === s ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}>
                {s === 'all' ? 'הכל' : s === 'new_lead' ? 'ליד חדש' : s === 'active_workshop' ? 'בסדנה' : 'לאחר שירות'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500 font-semibold">
                  <th className="px-6 py-3">שם</th>
                  <th className="px-4 py-3">אימייל</th>
                  <th className="px-4 py-3">סטטוס</th>
                  <th className="px-4 py-3">הצטרפה</th>
                  <th className="px-4 py-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredCrm.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-3 font-semibold text-gray-800">{u.mother_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{u.email}</td>
                    <td className="px-4 py-3">
                      <select value={u.lead_status ?? ''} onChange={e => updateStatus(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-mustard-400">
                        <option value="">ללא סטטוס</option>
                        <option value="new_lead">ליד חדש</option>
                        <option value="active_workshop">בסדנה פעילה</option>
                        <option value="post_service">לאחר שירות</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('he-IL') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setDrawer(u)} className="p-1.5 rounded-lg hover:bg-mustard-50 text-gray-400 hover:text-mustard-600">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <a href={`mailto:${u.email}`} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCrm.length === 0 && <p className="text-center text-gray-400 text-sm py-12">לא נמצאו רשומות</p>}
          </div>

          {drawer && (
            <aside className="w-72 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 self-start sticky top-24" dir="rtl">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">פרטי משתמשת</h3>
                <button onClick={() => setDrawer(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
              </div>
              <p className="font-semibold text-gray-800">{drawer.mother_name ?? '—'}</p>
              <p className="text-xs text-gray-500">{drawer.email}</p>
              <LeadBadge status={drawer.lead_status} />
              {drawer.staff_notes && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-600">{drawer.staff_notes}</p></div>}
              <p className="text-xs text-gray-400">הצטרפה: {drawer.created_at ? new Date(drawer.created_at).toLocaleDateString('he-IL') : '—'}</p>
            </aside>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── Workshops Desktop Table ──────────────────────────────────────────────────
function WorkshopsTabDesktop() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [contentWorkshop, setContentWorkshop] = useState<Workshop | null>(null)
  const [drawer, setDrawer] = useState<Workshop | null>(null)
  const [form, setForm] = useState({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '' })
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    supabase.from('workshops').select('*').order('display_order')
      .then(({ data }) => setWorkshops(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  async function del(id: string) {
    await supabase.from('workshops').delete().eq('id', id); load()
  }

  function openEdit(w: Workshop) {
    setEditing(w)
    setForm({ title: w.title, description: w.description ?? '', summary: w.summary ?? '', price: w.price?.toString() ?? '', payment_link: w.payment_link ?? '', image_url: w.image_url ?? '', video_url: w.video_url ?? '', stock_quantity: (w as unknown as { stock_quantity?: number }).stock_quantity?.toString() ?? '', whatsapp_number: (w as unknown as { whatsapp_number?: string }).whatsapp_number ?? '', next_workshop_id: w.next_workshop_id ?? '', workshop_type: w.workshop_type ?? '' })
    setDrawer(w)
  }

  async function saveEdit() {
    if (!editing || !form.title.trim()) return
    setSaving(true)
    await supabase.from('workshops').update({
      title: form.title, description: form.description || null,
      summary: form.summary || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null, image_url: form.image_url || null,
      video_url: form.video_url || null,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      whatsapp_number: form.whatsapp_number || null,
      next_workshop_id: form.next_workshop_id || null,
      workshop_type: form.workshop_type || null,
    }).eq('id', editing.id)
    setSaving(false); setDrawer(null); setEditing(null); load()
  }

  return (
    <div className="flex gap-6" dir="rtl">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">סדנאות ({workshops.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500 font-semibold">
                <th className="px-6 py-3">שם</th>
                <th className="px-4 py-3">מחיר</th>
                <th className="px-4 py-3">סטטוס</th>
                <th className="px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {workshops.map(w => (
                <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {w.image_url
                        ? <img src={w.image_url} className="w-9 h-9 rounded-xl object-cover" alt="" />
                        : <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center text-lg">🎓</div>
                      }
                      <div>
                        <p className="font-semibold text-gray-800">{w.title}</p>
                        {w.description && <p className="text-xs text-gray-400 truncate max-w-xs">{w.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{w.price != null ? `₪${w.price}` : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(w)} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {w.is_active ? 'פעיל' : 'לא פעיל'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setContentWorkshop(w)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100">📂 תוכן</button>
                      <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del(w.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workshops.length === 0 && <p className="text-center text-gray-400 text-sm py-12">אין סדנאות</p>}
        </div>
      </div>

      {/* Edit drawer */}
      {drawer && editing && (
        <aside className="w-80 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 self-start sticky top-24" dir="rtl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">עריכת סדנה</h3>
            <button onClick={() => setDrawer(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם הסדנה" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-purple-400" />
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="סיכום / נקודות מפתח (מוצג בכרטיס הסדנה)" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-purple-400" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר (₪)" type="number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
            <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder="מלאי" type="number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="קישור תשלום" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" dir="ltr" />
          <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="URL תמונה" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" dir="ltr" />
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון (URL)" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" dir="ltr" />
          <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="WhatsApp" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" dir="ltr" />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">קטגוריה (בחנות)</label>
            <select value={form.workshop_type} onChange={e => setForm(f => ({ ...f, workshop_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white">
              <option value="">ללא קטגוריה</option>
              <option value="הריון">🤰 הריון</option>
              <option value="תינוקות">תינוקות</option>
              <option value="אימהות">אימהות</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">הסדנה הבאה בסדרה</label>
            <select value={form.next_workshop_id} onChange={e => setForm(f => ({ ...f, next_workshop_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white">
              <option value="">ללא המשך</option>
              {workshops.filter(w => w.id !== editing?.id).map(w => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
              {saving ? '...' : 'שמור'}
            </button>
            <button onClick={() => setDrawer(null)} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm">ביטול</button>
          </div>
        </aside>
      )}

      {contentWorkshop && <WorkshopContentModal workshop={contentWorkshop} onClose={() => setContentWorkshop(null)} />}
    </div>
  )
}

// ─── Forms Desktop Layout ─────────────────────────────────────────────────────
function FormsTabDesktop() {
  const [forms, setForms] = useState<FormRecord[]>([])
  const [selected, setSelected] = useState<FormRecord | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [triggerType, setTriggerType] = useState('after_video_views')
  const [triggerCount, setTriggerCount] = useState('3')

  const load = useCallback(() => {
    supabase.from('forms').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setForms((data ?? []) as FormRecord[]))
  }, [])
  useEffect(() => { load() }, [load])

  async function loadSubmissions(form: FormRecord) {
    setSelected(form); setLoadingSubs(true)
    const { data } = await supabase.from('form_submissions')
      .select('*, user_profiles(mother_name, email)').eq('form_id', form.id)
      .order('created_at', { ascending: false })
    setSubmissions((data ?? []) as Submission[])
    setLoadingSubs(false)
  }

  function copyFormLink(formId: string) {
    navigator.clipboard.writeText(`${APP_URL}/?form=${formId}`)
    setCopiedId(formId); setTimeout(() => setCopiedId(null), 2000)
  }

  async function toggleForm(form: FormRecord) {
    await supabase.from('forms').update({ is_active: !form.is_active }).eq('id', form.id); load()
  }

  async function deleteForm(id: string) {
    await supabase.from('forms').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    load()
  }

  async function deleteSubmission(id: string) {
    await supabase.from('form_submissions').delete().eq('id', id)
    setSubmissions(s => s.filter(x => x.id !== id))
  }

  function startEdit(form: FormRecord) {
    setEditingForm(form); setTitle(form.title); setDescription(form.description ?? '')
    setFolder(form.folder ?? ''); setFields(form.fields_json.map(f => ({ ...f })))
    setShowCreate(false)
  }

  function addField() { setFields(f => [...f, { id: crypto.randomUUID(), type: 'text', label: '', required: false }]) }
  function updateField(id: string, patch: Partial<FormField>) { setFields(f => f.map(field => field.id === id ? { ...field, ...patch } : field)) }
  function removeField(id: string) { setFields(f => f.filter(field => field.id !== id)) }
  function moveField(id: string, dir: -1 | 1) {
    setFields(f => {
      const idx = f.findIndex(field => field.id === id); if (idx < 0) return f
      const next = idx + dir; if (next < 0 || next >= f.length) return f
      const arr = [...f]; [arr[idx], arr[next]] = [arr[next], arr[idx]]; return arr
    })
  }

  async function saveForm() {
    if (!title.trim() || fields.length === 0) return
    setSaving(true)
    if (editingForm) {
      await supabase.from('forms').update({ title: title.trim(), description: description || null, folder: folder.trim() || null, fields_json: fields }).eq('id', editingForm.id)
      setEditingForm(null); setTitle(''); setDescription(''); setFolder(''); setFields([])
    } else {
      await supabase.from('forms').insert({ title: title.trim(), description: description || null, folder: folder.trim() || null, fields_json: fields, trigger_rule: { type: triggerType, count: parseInt(triggerCount) || 3 }, is_active: true })
      setTitle(''); setDescription(''); setFields([]); setShowCreate(false)
    }
    setSaving(false); load()
  }

  const fieldTypes = [
    { value: 'text', label: 'שדה טקסט' }, { value: 'textarea', label: 'טקסט ארוך' },
    { value: 'select', label: 'בחירה מרשימה' }, { value: 'rating', label: 'דירוג 1-5' },
    { value: 'info', label: '📋 בלוק טקסט' }, { value: 'link', label: '🔗 לינק' },
  ]

  return (
    <div className="flex gap-6" dir="rtl">
      {/* Left: form list */}
      <div className="flex-1 min-w-0 space-y-4">
        <button
          onClick={() => { setShowCreate(!showCreate); setEditingForm(null) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
        >
          <Plus className="w-4 h-4" /> טופס חדש
        </button>

        {/* Create / Edit form panel */}
        {(showCreate || editingForm) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500">{editingForm ? `✏️ עריכת: ${editingForm.title}` : '➕ טופס חדש'}</p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הטופס" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-yellow-400" />
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-yellow-400" />
            <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="📁 תיקייה" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-yellow-400" />
            {!editingForm && (
              <div className="flex gap-2">
                <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
                  <option value="after_video_views">אחרי X צפיות</option>
                  <option value="after_days">אחרי X ימים</option>
                  <option value="manual">ידני</option>
                </select>
                <input type="number" value={triggerCount} onChange={e => setTriggerCount(e.target.value)} className="w-16 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" min="1" />
              </div>
            )}
            {/* Fields */}
            <div className="space-y-2">
              {fields.map((field, idx) => (
                <div key={field.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })} className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none">
                      {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} className="p-1 text-gray-400 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1} className="p-1 text-gray-400 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeField(field.id)} className="p-1 text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {field.type !== 'link' && (
                    <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="שאלה / תווית" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  )}
                  {field.type === 'select' && <OptionsTagInput options={field.options ?? []} onChange={opts => updateField(field.id, { options: opts })} />}
                  {field.type === 'link' && <input value={field.options?.[0] ?? ''} onChange={e => updateField(field.id, { options: [e.target.value] })} placeholder="https://..." className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" dir="ltr" />}
                  {!['info', 'link'].includes(field.type) && (
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={field.required ?? false} onChange={e => updateField(field.id, { required: e.target.checked })} />
                      חובה
                    </label>
                  )}
                </div>
              ))}
              <button onClick={addField} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-yellow-400 hover:text-yellow-600 transition-colors">
                + הוסף שאלה
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={saveForm} disabled={saving || !title.trim() || fields.length === 0} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                {saving ? '...' : 'שמור טופס'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditingForm(null); setTitle(''); setDescription(''); setFields([]) }} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm">ביטול</button>
            </div>
          </div>
        )}

        {/* Forms table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500 font-semibold">
                <th className="px-6 py-3">שם</th>
                <th className="px-4 py-3">תיקייה</th>
                <th className="px-4 py-3">סטטוס</th>
                <th className="px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {forms.map(f => (
                <tr key={f.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group cursor-pointer ${selected?.id === f.id ? 'bg-yellow-50' : ''}`} onClick={() => loadSubmissions(f)}>
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-800">{f.title}</p>
                    {f.description && <p className="text-xs text-gray-400 truncate max-w-xs">{f.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{f.folder ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); toggleForm(f) }} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {f.is_active ? 'פעיל' : 'כבוי'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button onClick={() => copyFormLink(f.id)} className="px-2 py-1 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600">{copiedId === f.id ? '✓' : '🔗'}</button>
                      <button onClick={() => startEdit(f)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteForm(f.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {forms.length === 0 && <p className="text-center text-gray-400 text-sm py-12">אין טפסים</p>}
        </div>
      </div>

      {/* Right: submissions panel */}
      {selected && (
        <aside className="w-96 shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 self-start sticky top-24" dir="rtl">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-800">{selected.title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{submissions.length} תשובות</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
            {loadingSubs && <p className="text-center text-gray-400 text-sm py-8">טוען...</p>}
            {!loadingSubs && submissions.length === 0 && <p className="text-center text-gray-400 text-sm py-8">אין תשובות עדיין</p>}
            {submissions.map(s => (
              <div key={s.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">
                    {(s.user_profiles as { mother_name: string | null; email: string } | undefined)?.mother_name
                      ?? (s.user_profiles as { mother_name: string | null; email: string } | undefined)?.email
                      ?? 'אנונימי'}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('he-IL')}</p>
                    <button onClick={() => deleteSubmission(s.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                {Object.entries(s.responses_json).map(([key, val]) => (
                  <div key={key} className="border-t border-gray-50 pt-1.5">
                    <p className="text-[10px] text-gray-400">{key}</p>
                    <p className="text-xs text-gray-700">{val}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

// ─── Insights Tab ─────────────────────────────────────────────────────────────
type VideoPerf = { title: string; total_views: number; completions: number; completion_pct: number }
type RetentionRow = { cohort_week: string; total_users: number; day1: number; day3: number; day7: number }
type User360 = UserProfile & { childCount: number; logCount: number; activityCount: number; lead_status: string | null; staff_notes: string | null }

function InsightsTab() {
  const [stats, setStats] = useState({ users: 0, pregnant: 0, moms: 0, children: 0, logs: 0 })
  const [videoPerf, setVideoPerf] = useState<VideoPerf[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [user360Id, setUser360Id] = useState<string | null>(null)
  const [user360, setUser360] = useState<User360 | null>(null)
  const [user360Logs, setUser360Logs] = useState<{ entry_type: string; created_at: string }[]>([])
  const [user360Activity, setUser360Activity] = useState<{ event_type: string; created_at: string; event_data: Record<string, unknown> }[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('children').select('id'),
      supabase.from('daily_log_entries').select('id'),
      supabase.from('v_video_performance').select('*').limit(10),
      supabase.from('v_retention_cohort').select('*').limit(8),
    ]).then(([{ data: users }, { data: children }, { data: logs }, { data: vids }, { data: ret }]) => {
      setAllUsers(users ?? [])
      setStats({
        users: users?.length ?? 0,
        pregnant: users?.filter(u => u.user_mode === 'pregnant').length ?? 0,
        moms: users?.filter(u => u.user_mode === 'mom').length ?? 0,
        children: children?.length ?? 0,
        logs: logs?.length ?? 0,
      })
      setVideoPerf((vids ?? []).map(v => ({ ...v, title: v.title.slice(0, 20) })))
      setRetention(ret ?? [])
    })
  }, [])

  async function load360(userId: string) {
    setUser360Id(userId)
    const [
      { data: profile },
      { data: children },
      { data: logs },
      { data: acts },
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', userId).single(),
      supabase.from('children').select('id').eq('user_id', userId),
      supabase.from('daily_log_entries').select('entry_type, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('user_activities').select('event_type, created_at, event_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    ])
    setUser360({ ...profile!, childCount: children?.length ?? 0, logCount: logs?.length ?? 0, activityCount: acts?.length ?? 0 })
    setUser360Logs(logs ?? [])
    setUser360Activity(acts ?? [])
  }

  const statCards = [
    { label: 'סה"כ משתמשות', value: stats.users,    emoji: '👩',  color: '#EFF6FF' },
    { label: 'בהריון',        value: stats.pregnant, emoji: '🤰',  color: '#F5F3FF' },
    { label: 'אמהות',         value: stats.moms,     emoji: '👶',  color: '#F0FDF4' },
    { label: 'ילדים',         value: stats.children, emoji: '🍼',  color: '#FFF7ED' },
    { label: 'רשומות יומן',  value: stats.logs,     emoji: '📔',  color: '#FAF5FF' },
  ]

  const retentionChart = retention.map(r => ({
    week: r.cohort_week?.slice(0, 10) ?? '',
    'יום 1': r.total_users ? Math.round((r.day1 / r.total_users) * 100) : 0,
    'יום 3': r.total_users ? Math.round((r.day3 / r.total_users) * 100) : 0,
    'יום 7': r.total_users ? Math.round((r.day7 / r.total_users) * 100) : 0,
  }))

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(c => (
          <div key={c.label} className="rounded-2xl p-4 shadow-sm text-right" style={{ background: c.color }}>
            <div className="text-2xl mb-1">{c.emoji}</div>
            <div className="text-2xl font-black text-sand-800">{c.value}</div>
            <div className="text-xs text-sand-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Retention chart */}
      {retentionChart.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sand-800 text-sm mb-3">Retention (%) לפי שבוע</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={retentionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F0EB" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} />
              <YAxis unit="%" tick={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="יום 1" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 3" stroke="#C49438" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 7" stroke="#22C55E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Video performance chart */}
      {videoPerf.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sand-800 text-sm mb-3">ביצועי סרטונים</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={videoPerf} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis dataKey="title" type="category" width={80} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="total_views" name="צפיות" fill="#C49438" radius={[0, 4, 4, 0]} />
              <Bar dataKey="completions" name="השלמות" fill="#86EFAC" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* User 360 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-sand-100">
          <h3 className="font-bold text-sand-800 text-sm">User 360°</h3>
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-sand-50">
          {allUsers.map(u => (
            <button
              key={u.id}
              onClick={() => load360(u.id)}
              className={`w-full text-right px-4 py-2.5 text-sm hover:bg-sand-50 transition-colors flex items-center justify-between ${user360Id === u.id ? 'bg-mustard-50' : ''}`}
            >
              <span className="font-medium text-sand-700 truncate">{u.mother_name ?? u.email}</span>
              <span className="text-xs text-sand-400 flex-shrink-0 mr-2">{u.lead_status ?? 'new'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 360 Detail Panel */}
      {user360 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sand-800">{user360.mother_name ?? user360.email}</h3>
              <p className="text-xs text-sand-400">{user360.email}</p>
            </div>
            <div className="flex gap-1.5">
              {user360.is_admin && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">ADMIN</span>}
            </div>
          </div>

          {/* Lead status + notes */}
          <LeadStatusEditor user={user360} onSaved={() => load360(user360.id)} />

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'ילדים', value: user360.childCount },
              { label: 'לוגים', value: user360.logCount },
              { label: 'אירועים', value: user360.activityCount },
            ].map(s => (
              <div key={s.label} className="text-center bg-sand-50 rounded-xl py-2">
                <div className="font-black text-lg text-sand-800">{s.value}</div>
                <div className="text-[10px] text-sand-400">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recent logs */}
          {user360Logs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sand-500 mb-1.5">פעילות אחרונה ביומן</p>
              <div className="space-y-1">
                {user360Logs.slice(0, 5).map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-sand-600">
                    <span>{l.entry_type}</span>
                    <span className="text-sand-400">{new Date(l.created_at).toLocaleDateString('he-IL')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity history */}
          {user360Activity.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sand-500 mb-1.5">היסטוריית פעילות</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {user360Activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-sand-600">{a.event_type}</span>
                    <span className="text-sand-400">{new Date(a.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LeadStatusEditor({ user, onSaved }: { user: User360; onSaved: () => void }) {
  const [status, setStatus] = useState(user.lead_status ?? 'new')
  const [notes, setNotes] = useState(user.staff_notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('user_profiles').update({ lead_status: status, staff_notes: notes }).eq('id', user.id)
    setSaving(false)
    onSaved()
  }

  const statuses = [
    { value: 'new', label: 'חדשה', color: '#60A5FA' },
    { value: 'active_coaching', label: 'בתהליך', color: '#F59E0B' },
    { value: 'completed', label: 'הושלם', color: '#22C55E' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {statuses.map(s => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className="flex-1 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
            style={{
              borderColor: status === s.value ? s.color : '#E5DDD2',
              background: status === s.value ? s.color + '20' : 'white',
              color: status === s.value ? s.color : '#9B8E80',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="הערות צוות..."
        rows={2}
        className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 resize-none"
      />
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        {saving ? 'שומר...' : 'שמור הערות'}
      </button>
    </div>
  )
}

// ─── Tips Tab ────────────────────────────────────────────────────────────────
function TipsTab() {
  const [tips, setTips] = useState<DailyTip[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DailyTip | null>(null)
  const [text, setText] = useState('')

  const load = useCallback(() => {
    supabase.from('daily_tips').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setTips(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!text.trim()) return
    if (editing) {
      await supabase.from('daily_tips').update({ tip_text: text }).eq('id', editing.id)
    } else {
      await supabase.from('daily_tips').insert({ tip_text: text, is_active: true })
    }
    setText(''); setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('daily_tips').delete().eq('id', id); load()
  }

  async function toggle(tip: DailyTip) {
    await supabase.from('daily_tips').update({ is_active: !tip.is_active }).eq('id', tip.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setText('') }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        טיפ חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="כתוב טיפ יומי..."
            rows={3}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setText('') }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {tips.map(tip => (
        <div key={tip.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!tip.is_active ? 'opacity-50' : ''}`}>
          <p className="text-sm text-sand-700 leading-relaxed mb-2">{tip.tip_text}</p>
          <div className="flex items-center justify-between">
            <button onClick={() => toggle(tip)} className="text-sand-400 hover:text-mustard-500">
              {tip.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(tip); setText(tip.tip_text); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(tip.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


// ─── Videos Tab ───────────────────────────────────────────────────────────────
function VideosTab() {
  const [videos, setVideos] = useState<VideoType[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<VideoType | null>(null)
  const [tasks, setTasks] = useState<HomeworkTask[]>([])
  const [newTask, setNewTask] = useState('')
  const [form, setForm] = useState({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)

  async function uploadFile(file: File, bucket: 'videos' | 'images'): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (error) { alert('שגיאה בהעלאה: ' + error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingVideo(true)
    const url = await uploadFile(file, 'videos')
    if (url) setForm(f => ({ ...f, video_url: url }))
    setUploadingVideo(false)
  }

  async function handleThumbFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingThumb(true)
    const url = await uploadFile(file, 'images')
    if (url) setForm(f => ({ ...f, thumbnail_url: url }))
    setUploadingThumb(false)
  }

  const load = useCallback(async () => {
    const [{ data: vids }, { data: cats }] = await Promise.all([
      supabase.from('videos').select('*').order('display_order'),
      supabase.from('content_categories').select('*').eq('is_active', true),
    ])
    setVideos(vids ?? [])
    setCategories(cats ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function loadTasks(videoId: string) {
    const { data } = await supabase.from('homework_tasks').select('*').eq('video_id', videoId).order('display_order')
    setTasks(data ?? [])
  }

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      video_url: form.video_url || null,
      thumbnail_url: form.thumbnail_url || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      category_id: form.category_id || null,
    }
    if (editing) {
      await supabase.from('videos').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = videos.length > 0 ? Math.max(...videos.map(v => v.display_order)) : 0
      await supabase.from('videos').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })
    setEditing(null); setShowForm(false); setTasks([]); load()
  }

  async function del(id: string) {
    await supabase.from('videos').delete().eq('id', id); load()
  }

  async function toggle(v: VideoType) {
    await supabase.from('videos').update({ is_active: !v.is_active }).eq('id', v.id); load()
  }

  async function addTask(videoId: string) {
    if (!newTask.trim()) return
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.display_order)) : 0
    await supabase.from('homework_tasks').insert({ video_id: videoId, task_description: newTask, display_order: maxOrder + 1 })
    setNewTask('')
    await loadTasks(videoId)
  }

  async function delTask(id: string, videoId: string) {
    await supabase.from('homework_tasks').delete().eq('id', id)
    await loadTasks(videoId)
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...videos]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('videos').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('videos').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setTasks([]) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סרטון חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          {/* Video upload */}
          <div className="border-2 border-dashed border-sand-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-sand-500">קובץ וידאו</p>
            {form.video_url ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-green-600 truncate">✓ סרטון הועלה</span>
                <button onClick={() => setForm(f => ({ ...f, video_url: '' }))} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingVideo ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
                {uploadingVideo ? 'מעלה...' : '📤 בחר קובץ וידאו'}
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoFile} disabled={uploadingVideo} />
              </label>
            )}
          </div>

          {/* Thumbnail upload */}
          <div className="border-2 border-dashed border-sand-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-sand-500">תמונה ממוזערת</p>
            {form.thumbnail_url ? (
              <div className="flex items-center justify-between gap-2">
                <img src={form.thumbnail_url} className="w-12 h-8 object-cover rounded-lg" alt="thumb" />
                <button onClick={() => setForm(f => ({ ...f, thumbnail_url: '' }))} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingThumb ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
                {uploadingThumb ? 'מעלה...' : '🖼️ בחר תמונה'}
                <input type="file" accept="image/*" className="hidden" onChange={handleThumbFile} disabled={uploadingThumb} />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <input value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="משך (דקות)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Homework tasks (only when editing) */}
          {editing && (
            <div>
              <p className="text-xs font-semibold text-sand-600 mb-2">משימות</p>
              {tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-sand-100 last:border-0">
                  <span className="text-xs text-sand-600 flex-1">{t.task_description}</span>
                  <button onClick={() => delTask(t.id, editing.id)} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="משימה חדשה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-500" onKeyDown={e => e.key === 'Enter' && addTask(editing.id)} />
                <button onClick={() => addTask(editing.id)} className="px-3 py-2 bg-mustard-100 text-mustard-700 rounded-xl"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} disabled={uploadingVideo || uploadingThumb} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {uploadingVideo || uploadingThumb ? 'מעלה...' : 'שמירה'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); setTasks([]) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {videos.map((v, idx) => (
        <div key={v.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!v.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{v.title}</p>
              {v.description && <p className="text-xs text-sand-400 truncate">{v.description}</p>}
              {v.duration_minutes && <p className="text-xs text-sand-400">{v.duration_minutes} דק'</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => toggle(v)} className="text-sand-400 hover:text-mustard-500">
                {v.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(v); setForm({ title: v.title, description: v.description ?? '', video_url: v.video_url ?? '', thumbnail_url: v.thumbnail_url ?? '', duration_minutes: v.duration_minutes?.toString() ?? '', category_id: v.category_id ?? '' }); setShowForm(false); loadTasks(v.id) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(v.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Workshop Content Modal ───────────────────────────────────────────────────
function WorkshopContentModal({ workshop, onClose }: { workshop: Workshop; onClose: () => void }) {
  const [items, setItems] = useState<WorkshopContent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [selType, setSelType] = useState<WorkshopContent['type'] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [tasks, setTasks] = useState<string[]>([])
  const [newTask, setNewTask] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    supabase.from('workshop_content').select('*').eq('workshop_id', workshop.id).order('display_order')
      .then(({ data }) => setItems(data ?? []))
  }, [workshop.id])
  useEffect(() => { load() }, [load])

  function resetForm() {
    setSelType(null); setTitle(''); setDescription(''); setUrl('')
    setTasks([]); setNewTask(''); setShowAdd(false)
  }

  async function uploadFile(file: File) {
    setUploading(true); setUploadPct(0)
    const ext = file.name.split('.').pop()
    const path = `${workshop.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('workshop-content').upload(path, file, { upsert: true })
    if (error) { setUploading(false); return null }
    const { data } = supabase.storage.from('workshop-content').getPublicUrl(path)
    setUploading(false); setUploadPct(100)
    return data.publicUrl
  }

  async function handleFile(file: File) {
    const publicUrl = await uploadFile(file)
    if (publicUrl) setUrl(publicUrl)
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
  }

  async function save() {
    if (!title.trim() || !selType) return
    setSaving(true)
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.display_order)) : 0
    await supabase.from('workshop_content').insert({
      workshop_id: workshop.id,
      type: selType,
      title,
      description: description || null,
      url: url || null,
      tasks_json: selType === 'homework' && tasks.length > 0 ? tasks : null,
      display_order: maxOrder + 1,
    })
    setSaving(false)
    resetForm()
    load()
  }

  async function del(item: WorkshopContent) {
    // Delete storage file if it's from our bucket
    if (item.url?.includes('workshop-content')) {
      const path = item.url.split('/workshop-content/')[1]
      if (path) await supabase.storage.from('workshop-content').remove([path])
    }
    await supabase.from('workshop_content').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  const typeLabel = { video: '🎬 סרטון', homework: '📝 שיעור בית', pdf: '📄 קובץ' }
  const typeBg   = { video: 'bg-mustard-50 text-mustard-700', homework: 'bg-purple-50 text-purple-700', pdf: 'bg-blue-50 text-blue-700' }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-sand-100 sticky top-0 bg-white rounded-t-3xl z-10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sand-800">תוכן הסדנה</h3>
            <p className="text-xs text-sand-400 mt-0.5">{workshop.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-sand-100 text-sand-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">

          {/* Add button */}
          {!showAdd && (
            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              <Plus className="w-4 h-4" /> הוסף פריט
            </button>
          )}

          {/* Add form */}
          {showAdd && (
            <div className="bg-sand-50 rounded-2xl p-4 space-y-3">

              {/* Step 1: pick type */}
              {!selType ? (
                <>
                  <p className="text-xs font-bold text-sand-600 mb-1">בחרי סוג תוכן</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['video', 'homework', 'pdf'] as const).map(t => (
                      <button key={t} onClick={() => setSelType(t)}
                        className="flex flex-col items-center gap-1 py-3 rounded-2xl border-2 border-sand-200 hover:border-mustard-400 hover:bg-mustard-50 transition-all">
                        <span className="text-xl">{t === 'video' ? '🎬' : t === 'homework' ? '📝' : '📄'}</span>
                        <span className="text-[10px] font-semibold text-sand-600">
                          {t === 'video' ? 'סרטון' : t === 'homework' ? 'שיעור בית' : 'PDF / קובץ'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button onClick={resetForm} className="w-full py-2 rounded-xl text-xs text-sand-400 hover:text-sand-600">ביטול</button>
                </>
              ) : (
                <>
                  {/* Type badge + back */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${typeBg[selType]}`}>{typeLabel[selType]}</span>
                    <button onClick={() => setSelType(null)} className="text-xs text-sand-400 hover:text-sand-600">שנה סוג</button>
                  </div>

                  {/* Title */}
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="כותרת *" className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />

                  {/* Description */}
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="תיאור (אופציונלי)" rows={2}
                    className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />

                  {/* Video: drag-drop zone */}
                  {selType === 'video' && (
                    <div>
                      <div
                        className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${dragOver ? 'border-mustard-500 bg-mustard-50' : 'border-sand-200 hover:border-mustard-300'}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={async e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) await handleFile(f) }}
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? (
                          <div className="space-y-2">
                            <div className="w-full bg-sand-200 rounded-full h-1.5"><div className="bg-mustard-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadPct}%` }} /></div>
                            <p className="text-xs text-sand-500">מעלה...</p>
                          </div>
                        ) : url ? (
                          <div className="space-y-1">
                            <p className="text-xs text-green-600 font-semibold">✓ הועלה בהצלחה</p>
                            <p className="text-[10px] text-sand-400 truncate">{url}</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-2xl">🎬</p>
                            <p className="text-xs font-semibold text-sand-600">גרור MP4 לכאן</p>
                            <p className="text-[10px] text-sand-400">או לחץ לבחירה</p>
                          </div>
                        )}
                      </div>
                      <input ref={fileRef} type="file" accept="video/mp4,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                      <p className="text-[10px] text-sand-400 mt-1.5 text-center">או הדבק קישור URL:</p>
                      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." dir="ltr"
                        className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 mt-1" />
                    </div>
                  )}

                  {/* PDF: file upload */}
                  {selType === 'pdf' && (
                    <div>
                      <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${uploading ? 'border-sand-200 bg-sand-50' : 'border-sand-200 hover:border-mustard-300'}`}>
                        {uploading ? <span className="text-xs text-sand-400">מעלה...</span> : url ? (
                          <span className="text-xs text-green-600 font-semibold">✓ הועלה · {url.split('/').pop()}</span>
                        ) : (
                          <><span className="text-xl">📄</span><span className="text-xs font-semibold text-sand-600">בחר קובץ PDF</span></>
                        )}
                        <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                      </label>
                      <p className="text-[10px] text-sand-400 mt-1.5 text-center">או הדבק קישור URL:</p>
                      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." dir="ltr"
                        className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 mt-1" />
                    </div>
                  )}

                  {/* Homework: task list builder */}
                  {selType === 'homework' && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-sand-600">משימות</p>
                      {tasks.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-sand-100">
                          <span className="text-xs text-mustard-500 font-bold w-4 flex-shrink-0">{i + 1}.</span>
                          <span className="flex-1 text-xs text-sand-700">{t}</span>
                          <button onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))} className="text-red-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={newTask} onChange={e => setNewTask(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { setTasks(p => [...p, newTask.trim()]); setNewTask('') } }}
                          placeholder="הוסף משימה..." className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400" />
                        <button onClick={() => { if (newTask.trim()) { setTasks(p => [...p, newTask.trim()]); setNewTask('') } }}
                          className="px-3 py-2 rounded-xl text-xs text-white font-bold" style={{ background: '#D4AA52' }}>+</button>
                      </div>
                    </div>
                  )}

                  {/* Save / Cancel */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={save} disabled={saving || !title.trim() || (selType === 'homework' && tasks.length === 0)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                      {saving ? '...' : 'שמור'}
                    </button>
                    <button onClick={resetForm} className="px-4 py-2.5 rounded-xl text-sm bg-sand-100 text-sand-600">ביטול</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Items list */}
          {items.length === 0 && !showAdd && (
            <p className="text-center text-sand-400 text-sm py-6">אין תוכן עדיין</p>
          )}

          {items.map((item, idx) => (
            <div key={item.id} className="bg-white border border-sand-100 rounded-2xl p-3 flex items-start gap-3">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 mt-0.5 ${typeBg[item.type]}`}>
                {typeLabel[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sand-800 truncate">{item.title}</p>
                {item.type === 'homework' && item.tasks_json && (
                  <p className="text-[10px] text-sand-400">{item.tasks_json.length} משימות</p>
                )}
                {item.url && item.type !== 'homework' && (
                  <p className="text-[10px] text-sand-400 truncate">{item.url}</p>
                )}
              </div>
              <span className="text-[10px] text-sand-300 flex-shrink-0 mt-0.5">#{idx + 1}</span>
              <button onClick={() => del(item)} className="p-1.5 text-red-300 hover:text-red-500 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Workshops Tab ────────────────────────────────────────────────────────────
function WorkshopsTab() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [contentWorkshop, setContentWorkshop] = useState<Workshop | null>(null)
  const [form, setForm] = useState({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '' })
  const [uploadingImage, setUploadingImage] = useState(false)

  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `workshops/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const url = await uploadImage(file)
    if (url) setForm(f => ({ ...f, image_url: url }))
    setUploadingImage(false)
  }

  const load = useCallback(() => {
    supabase.from('workshops').select('*').order('display_order')
      .then(({ data }) => setWorkshops(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      summary: form.summary || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      currency: 'ILS',
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      whatsapp_number: form.whatsapp_number || null,
      next_workshop_id: form.next_workshop_id || null,
      workshop_type: form.workshop_type || null,
    }
    if (editing) {
      await supabase.from('workshops').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = workshops.length > 0 ? Math.max(...workshops.map(w => w.display_order)) : 0
      await supabase.from('workshops').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('workshops').delete().eq('id', id); load()
  }

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סדנה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם הסדנה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="סיכום / נקודות מפתח (מוצג בכרטיס הסדנה)" rows={3} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר (₪)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="קישור רישום" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          {/* Image upload or URL */}
          <div className="space-y-1.5">
            <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingImage ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
              {uploadingImage ? 'מעלה תמונה...' : '🖼️ העלה תמונה (PNG/JPG)'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageFile} disabled={uploadingImage} />
            </label>
            {form.image_url && (
              <div className="relative">
                <img src={form.image_url} alt="preview" className="w-full h-28 object-cover rounded-xl" />
                <button onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="absolute top-1 left-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
              </div>
            )}
            <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="או הדבק קישור URL..." className="w-full px-3 py-2 border border-sand-200 rounded-xl focus:outline-none focus:border-mustard-400 text-xs text-sand-500" dir="ltr" />
          </div>
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder="מלאי (יחידות)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="מספר WhatsApp" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">קטגוריה (בחנות)</label>
            <select value={form.workshop_type} onChange={e => setForm(f => ({ ...f, workshop_type: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">ללא קטגוריה</option>
              <option value="הריון">🤰 הריון</option>
              <option value="תינוקות">תינוקות</option>
              <option value="אימהות">אימהות</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">הסדנה הבאה בסדרה</label>
            <select value={form.next_workshop_id} onChange={e => setForm(f => ({ ...f, next_workshop_id: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">ללא המשך</option>
              {workshops.filter(w => w.id !== editing?.id).map(w => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {workshops.map(w => (
        <div key={w.id} className={`bg-white rounded-2xl p-4 shadow-sm space-y-2 ${!w.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{w.title}</p>
              {w.price != null && <p className="text-xs text-mustard-600">₪{w.price}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(w)} className="text-sand-400 hover:text-mustard-500">
                {w.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(w); setForm({ title: w.title, description: w.description ?? '', summary: w.summary ?? '', price: w.price?.toString() ?? '', payment_link: w.payment_link ?? '', image_url: w.image_url ?? '', video_url: w.video_url ?? '', stock_quantity: (w as unknown as { stock_quantity?: number }).stock_quantity?.toString() ?? '', whatsapp_number: (w as unknown as { whatsapp_number?: string }).whatsapp_number ?? '', next_workshop_id: w.next_workshop_id ?? '', workshop_type: w.workshop_type ?? '' }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(w.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <button
            onClick={() => setContentWorkshop(w)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-mustard-50 text-mustard-700 hover:bg-mustard-100 transition-colors"
          >
            📂 ניהול תוכן
          </button>
        </div>
      ))}

      {contentWorkshop && <WorkshopContentModal workshop={contentWorkshop} onClose={() => setContentWorkshop(null)} />}
    </div>
  )
}

// ─── Perks Tab ────────────────────────────────────────────────────────────────
function PerksTab() {
  const [perks, setPerks] = useState<PartnerPerk[]>([])
  const [analytics, setAnalytics] = useState<PerkAnalytic[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PartnerPerk | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [form, setForm] = useState({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('partner_perks').select('*').order('display_order'),
      supabase.from('perk_analytics').select('*'),
    ])
    setPerks(p ?? [])
    setAnalytics(a ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.partner_name.trim()) return
    const payload = {
      partner_name: form.partner_name,
      short_description: form.short_description || null,
      full_description: form.full_description || null,
      discount_code: form.discount_code || null,
      action_link: form.action_link || null,
      logo_url: form.logo_url || null,
      is_featured: form.is_featured,
    }
    if (editing) {
      await supabase.from('partner_perks').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = perks.length > 0 ? Math.max(...perks.map(p => p.display_order)) : 0
      await supabase.from('partner_perks').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('partner_perks').delete().eq('id', id); load()
  }

  async function toggle(p: PartnerPerk, field: 'is_active' | 'is_featured') {
    await supabase.from('partner_perks').update({ [field]: !p[field] }).eq('id', p.id); load()
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...perks]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('partner_perks').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('partner_perks').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  function perkStats(perkId: string) {
    const pa = analytics.filter(a => a.perk_id === perkId)
    return {
      views: pa.filter(a => a.action_type === 'view').length,
      copies: pa.filter(a => a.action_type === 'copy_code').length,
      visits: pa.filter(a => a.action_type === 'visit_link').length,
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => { setShowForm(true); setEditing(null) }} className="flex-1 flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors">
          <Plus className="w-4 h-4" />
          הטבה חדשה
        </button>
        <button onClick={() => setShowAnalytics(!showAnalytics)} className={`px-4 py-3 rounded-2xl font-semibold text-sm transition-colors ${showAnalytics ? 'bg-sand-200 text-sand-700' : 'bg-white text-sand-600 shadow-sm'}`}>
          📊
        </button>
      </div>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} placeholder="שם השותף" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} placeholder="תיאור קצר" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.full_description} onChange={e => setForm(f => ({ ...f, full_description: e.target.value }))} placeholder="תיאור מלא" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.discount_code} onChange={e => setForm(f => ({ ...f, discount_code: e.target.value }))} placeholder="קוד הנחה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
            <input value={form.action_link} onChange={e => setForm(f => ({ ...f, action_link: e.target.value }))} placeholder="קישור לאתר" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="קישור ללוגו" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <label className="flex items-center gap-2 text-sm text-sand-600 cursor-pointer">
            <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="rounded" />
            מוצג בדף הבית
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {perks.map((p, idx) => {
        const stats = perkStats(p.id)
        return (
          <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!p.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sand-800 text-sm truncate">{p.partner_name}</p>
                  {p.is_featured && <span className="text-xs bg-mustard-100 text-mustard-600 px-1.5 py-0.5 rounded-lg">מוצג</span>}
                </div>
                {p.discount_code && <p className="text-xs text-sand-400">{p.discount_code}</p>}
                {showAnalytics && (
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-sand-400">👁 {stats.views}</span>
                    <span className="text-xs text-sand-400">📋 {stats.copies}</span>
                    <span className="text-xs text-sand-400">🔗 {stats.visits}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggle(p, 'is_featured')} className={`p-1.5 ${p.is_featured ? 'text-mustard-500' : 'text-sand-300'}`}>⭐</button>
                <button onClick={() => toggle(p, 'is_active')} className="text-sand-400 hover:text-mustard-500">
                  {p.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => { setEditing(p); setForm({ partner_name: p.partner_name, short_description: p.short_description ?? '', full_description: p.full_description ?? '', discount_code: p.discount_code ?? '', action_link: p.action_link ?? '', logo_url: p.logo_url ?? '', is_featured: p.is_featured }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(p.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Forms Tab ────────────────────────────────────────────────────────────────
type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'rating' | 'info' | 'link'; label: string; options?: string[]; required?: boolean }
type FormRecord = { id: string; title: string; description: string | null; fields_json: FormField[]; trigger_rule: { type: string; count: number } | null; is_active: boolean; public_link_enabled: boolean; folder: string | null; created_at: string }
type Submission = { id: string; user_id: string; responses_json: Record<string, string>; created_at: string; user_profiles?: { mother_name: string | null; email: string } }
type Assignment = { id: string; user_id: string; is_completed: boolean; user_profiles?: { mother_name: string | null; email: string } }

function AssignFormModal({ form, onClose }: { form: FormRecord; onClose: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('user_profiles').select('*').order('mother_name').then(({ data }) => setUsers(data ?? []))
    supabase.from('form_assignments')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .then(({ data }) => setAssignments((data ?? []) as Assignment[]))
  }, [form.id])

  const assignedIds = new Set(assignments.map(a => a.user_id))

  async function toggle(userId: string) {
    if (assignedIds.has(userId)) {
      await supabase.from('form_assignments').delete().eq('form_id', form.id).eq('user_id', userId)
      setAssignments(a => a.filter(x => x.user_id !== userId))
    } else {
      const { data } = await supabase.from('form_assignments').insert({ form_id: form.id, user_id: userId }).select('*, user_profiles(mother_name, email)').single()
      if (data) setAssignments(a => [...a, data as Assignment])
    }
  }

  const filtered = users.filter(u => !search || (u.mother_name ?? '').includes(search) || u.email.includes(search))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sand-100">
          <h3 className="font-bold text-sand-800">שייך טופס למשתמשות</h3>
          <p className="text-xs text-sand-400 mt-0.5">{form.title}</p>
        </div>
        <div className="p-4 border-b border-sand-100">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש..." className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-right ${assignedIds.has(u.id) ? 'border-mustard-400 bg-mustard-50' : 'border-sand-200 bg-white'}`}
            >
              <div>
                <p className="text-sm font-semibold text-sand-800">{u.mother_name ?? '—'}</p>
                <p className="text-xs text-sand-400">{u.email}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${assignedIds.has(u.id) ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                {assignedIds.has(u.id) && <Check className="w-3 h-3 text-white" />}
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-sand-100">
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-sand-100 text-sand-700 font-semibold text-sm">סגור</button>
        </div>
      </div>
    </div>
  )
}

// ─── Options Tag Input ────────────────────────────────────────────────────────
function OptionsTagInput({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const val = input.trim()
    if (!val || options.includes(val)) return
    onChange([...options, val])
    setInput('')
  }

  function remove(i: number) {
    onChange(options.filter((_, j) => j !== i))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt, i) => (
          <span key={i} className="flex items-center gap-1 bg-mustard-50 text-mustard-700 text-xs font-medium px-2.5 py-1 rounded-xl">
            {opt}
            <button type="button" onClick={() => remove(i)} className="text-mustard-400 hover:text-red-400 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
          placeholder="הקלד אפשרות ← Enter להוספה"
          className="flex-1 px-3 py-1.5 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 bg-white"
        />
        <button type="button" onClick={add} className="px-3 py-1.5 rounded-xl text-xs text-white font-bold" style={{ background: '#D4AA52' }}>+</button>
      </div>
    </div>
  )
}

function FormsTab() {
  const [forms, setForms] = useState<FormRecord[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null)
  const [viewSubmissions, setViewSubmissions] = useState<FormRecord | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignForm, setAssignForm] = useState<FormRecord | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copyFormLink(formId: string) {
    const url = `${APP_URL}/?form=${formId}`
    navigator.clipboard.writeText(url)
    setCopiedId(formId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [triggerType, setTriggerType] = useState('after_video_views')
  const [triggerCount, setTriggerCount] = useState('3')
  const [saving, setSaving] = useState(false)
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['']))

  function startEdit(form: FormRecord) {
    setEditingForm(form)
    setTitle(form.title)
    setDescription(form.description ?? '')
    setFolder(form.folder ?? '')
    setFields(form.fields_json.map(f => ({ ...f })))
    setShowCreate(false)
  }

  function cancelEdit() {
    setEditingForm(null)
    setTitle(''); setDescription(''); setFolder(''); setFields([])
  }

  function toggleFolder(f: string) {
    setOpenFolders(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  const load = useCallback(() => {
    supabase.from('forms').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setForms((data ?? []) as FormRecord[]))
  }, [])
  useEffect(() => { load() }, [load])

  function addField() {
    setFields(f => [...f, { id: crypto.randomUUID(), type: 'text', label: '', required: false }])
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields(f => f.map(field => field.id === id ? { ...field, ...patch } : field))
  }

  function removeField(id: string) {
    setFields(f => f.filter(field => field.id !== id))
  }

  function moveField(id: string, dir: -1 | 1) {
    setFields(f => {
      const idx = f.findIndex(field => field.id === id)
      if (idx < 0) return f
      const next = idx + dir
      if (next < 0 || next >= f.length) return f
      const arr = [...f]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  async function saveForm() {
    if (!title.trim() || fields.length === 0) return
    setSaving(true)
    if (editingForm) {
      await supabase.from('forms').update({
        title: title.trim(),
        description: description || null,
        folder: folder.trim() || null,
        fields_json: fields,
      }).eq('id', editingForm.id)
      cancelEdit()
    } else {
      await supabase.from('forms').insert({
        title: title.trim(),
        description: description || null,
        folder: folder.trim() || null,
        fields_json: fields,
        trigger_rule: { type: triggerType, count: parseInt(triggerCount) || 3 },
        is_active: true,
      })
      setTitle(''); setDescription(''); setFields([]); setShowCreate(false)
    }
    setSaving(false); load()
  }

  async function toggleForm(form: FormRecord) {
    await supabase.from('forms').update({ is_active: !form.is_active }).eq('id', form.id)
    load()
  }

  async function deleteForm(id: string) {
    await supabase.from('forms').delete().eq('id', id); load()
  }

  async function loadSubmissions(form: FormRecord) {
    setViewSubmissions(form)
    const { data } = await supabase
      .from('form_submissions')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
    setSubmissions((data ?? []) as Submission[])
  }

  async function deleteSubmission(id: string) {
    await supabase.from('form_submissions').delete().eq('id', id)
    setSubmissions(s => s.filter(x => x.id !== id))
  }

  const fieldTypes = [
    { value: 'text',     label: 'שדה טקסט' },
    { value: 'textarea', label: 'טקסט ארוך' },
    { value: 'select',   label: 'בחירה מרשימה' },
    { value: 'rating',   label: 'דירוג 1-5' },
    { value: 'info',     label: '📋 בלוק טקסט (תצוגה בלבד)' },
    { value: 'link',     label: '🔗 כפתור לינק (תשלום וכו׳)' },
  ]

  if (viewSubmissions) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setViewSubmissions(null)} className="text-mustard-600 text-sm font-semibold">← חזרה</button>
          <h3 className="font-bold text-sand-800">{viewSubmissions.title}</h3>
        </div>
        <p className="text-xs text-sand-400">{submissions.length} תשובות</p>
        {submissions.map(s => (
          <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-sand-700">
                {(s.user_profiles as { mother_name: string | null; email: string } | undefined)?.mother_name
                  ?? (s.user_profiles as { mother_name: string | null; email: string } | undefined)?.email
                  ?? 'אנונימי'}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-sand-400">{new Date(s.created_at).toLocaleDateString('he-IL')}</p>
                <button onClick={() => deleteSubmission(s.id)} className="p-1 text-sand-300 hover:text-red-500 transition-colors" title="מחק תשובה">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {Object.entries(s.responses_json).map(([key, val]) => (
              <div key={key} className="border-t border-sand-50 pt-1.5">
                <p className="text-xs text-sand-400">{key}</p>
                <p className="text-sm text-sand-800">{val}</p>
              </div>
            ))}
          </div>
        ))}
        {submissions.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין תשובות עדיין</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-2xl transition-colors"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        <Plus className="w-4 h-4" />
        טופס חדש
      </button>

      {(showCreate || editingForm) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {editingForm && <p className="text-xs font-bold text-mustard-600">✏️ עריכת טופס: {editingForm.title}</p>}
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הטופס" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
          <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="📁 תיקייה (למשל: סדנת עיסוי, הרשמות)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />

          {/* Trigger — only for new forms */}
          {!editingForm && (
            <div className="flex gap-2 items-center">
              <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm bg-white focus:outline-none focus:border-mustard-400">
                <option value="after_video_views">אחרי X צפיות בסרטון</option>
                <option value="after_days">אחרי X ימים</option>
                <option value="manual">ידני</option>
              </select>
              <input type="number" value={triggerCount} onChange={e => setTriggerCount(e.target.value)} className="w-16 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" min="1" />
            </div>
          )}

          {/* Fields */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-sand-500">שדות הטופס ({fields.length})</p>
            {fields.map((field, idx) => (
              <div key={field.id} className="flex gap-2 items-start bg-sand-50 rounded-xl p-2">
                <span className="text-xs text-sand-400 pt-2.5 w-5 text-center">{idx + 1}</span>
                <div className="flex-1 space-y-1.5">
                  <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })} className="w-full px-3 py-1.5 border border-sand-200 rounded-xl text-xs bg-white focus:outline-none">
                    {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>

                  {/* info: label = the display text */}
                  {field.type === 'info' && (
                    <textarea
                      rows={3}
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="טקסט שיוצג בטופס (תאריכים, פרטים, הנחיות...)"
                      className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none bg-white resize-none"
                    />
                  )}

                  {/* link: label = display text above button, options[0] = URL */}
                  {field.type === 'link' && (
                    <>
                      <input
                        value={field.label}
                        onChange={e => updateField(field.id, { label: e.target.value })}
                        placeholder="טקסט מעל הכפתור (למשל: נא לבצע תשלום בלינק)"
                        className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none bg-white"
                      />
                      <input
                        value={field.options?.[0] ?? ''}
                        onChange={e => updateField(field.id, { options: [e.target.value] })}
                        placeholder="כתובת הלינק (https://...)"
                        className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none bg-white"
                        dir="ltr"
                      />
                    </>
                  )}

                  {/* regular fields: label input */}
                  {field.type !== 'info' && field.type !== 'link' && (
                    <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="תווית השדה" className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 bg-white" />
                  )}

                  {field.type === 'select' && (
                    <OptionsTagInput
                      options={field.options ?? []}
                      onChange={opts => updateField(field.id, { options: opts })}
                    />
                  )}

                  {/* required toggle — not applicable for info/link */}
                  {field.type !== 'info' && field.type !== 'link' && (
                    <button
                      type="button"
                      onClick={() => updateField(field.id, { required: !field.required })}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all w-fit ${field.required ? 'bg-red-100 text-red-600' : 'bg-sand-100 text-sand-400'}`}
                    >
                      <span>{field.required ? '★' : '☆'}</span>
                      {field.required ? 'חובה' : 'לא חובה'}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} className="p-1 text-sand-300 hover:text-mustard-500 disabled:opacity-20">▲</button>
                  <button onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1} className="p-1 text-sand-300 hover:text-mustard-500 disabled:opacity-20">▼</button>
                  <button onClick={() => removeField(field.id)} className="p-1.5 text-sand-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <button onClick={addField} className="w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-mustard-600 bg-mustard-50 hover:bg-mustard-100">
              <Plus className="w-3.5 h-3.5" /> הוסף שדה
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={saveForm} disabled={saving || !title.trim() || fields.length === 0} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#C49438' }}>
              {saving ? 'שומר...' : editingForm ? 'שמור שינויים' : 'צור טופס'}
            </button>
            <button onClick={() => { setShowCreate(false); cancelEdit() }} className="px-4 py-2.5 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Group forms by folder */}
      {(() => {
        const folderMap = new Map<string, FormRecord[]>()
        forms.forEach(f => {
          const key = f.folder ?? ''
          if (!folderMap.has(key)) folderMap.set(key, [])
          folderMap.get(key)!.push(f)
        })
        const folders = Array.from(folderMap.entries()).sort(([a], [b]) => {
          if (a === '') return 1
          if (b === '') return -1
          return a.localeCompare(b, 'he')
        })
        return folders.map(([folderName, folderForms]) => (
          <div key={folderName || '__none__'} className="space-y-2">
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(folderName)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-sand-100 hover:bg-sand-200 transition-colors"
            >
              <span className="text-xs font-bold text-sand-600">
                {folderName ? `📁 ${folderName}` : '📋 ללא תיקייה'}
                <span className="mr-2 text-sand-400 font-normal">({folderForms.length})</span>
              </span>
              <span className="text-sand-400 text-xs">{openFolders.has(folderName) ? '▲' : '▼'}</span>
            </button>

            {openFolders.has(folderName) && folderForms.map(form => (
              <div key={form.id} className={`bg-white rounded-2xl p-4 shadow-sm mr-2 ${!form.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-bold text-sand-800 text-sm">{form.title}</p>
                    <p className="text-xs text-sand-400 mt-0.5">{form.fields_json.length} שדות</p>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <button onClick={() => startEdit(form)} className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg hover:bg-mustard-100">✏️ ערכי</button>
                    <button onClick={() => loadSubmissions(form)} className="text-xs px-2 py-1 bg-sand-50 text-sand-600 rounded-lg hover:bg-sand-100">תשובות</button>
                    <button onClick={() => copyFormLink(form.id)} className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg hover:bg-mustard-100">
                      {copiedId === form.id ? '✓ הועתק' : '🔗 לינק'}
                    </button>
                    <button onClick={() => toggleForm(form)} className="text-sand-400 hover:text-mustard-500">
                      {form.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => deleteForm(form.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))
      })()}
      {forms.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין טפסים עדיין</p>}

      {assignForm && <AssignFormModal form={assignForm} onClose={() => setAssignForm(null)} />}
    </div>
  )
}

// ─── Owner Settings Section (inside Settings) ─────────────────────────────────
function OwnerSettingsSection() {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['owner_name', 'owner_whatsapp', 'app_subtitle'])
      .then(({ data }) => {
        setName(data?.find(r => r.setting_key === 'owner_name')?.setting_value ?? 'ברנדה')
        setWhatsapp(data?.find(r => r.setting_key === 'owner_whatsapp')?.setting_value ?? '972527506227')
        setSubtitle(data?.find(r => r.setting_key === 'app_subtitle')?.setting_value ?? 'מרכז התפתחות לתינוקות')
      })
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('global_settings').upsert([
      { setting_key: 'owner_name', setting_value: name, setting_type: 'text', category: 'owner', description: 'שם בעלת העסק' },
      { setting_key: 'owner_whatsapp', setting_value: whatsapp, setting_type: 'text', category: 'owner', description: 'מספר WhatsApp של בעלת העסק' },
      { setting_key: 'app_subtitle', setting_value: subtitle, setting_type: 'text', category: 'owner', description: 'כיתוב מתחת ללוגו במסך הכניסה' },
    ], { onConflict: 'setting_key' })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-sand-100">
        <h3 className="font-bold text-sand-800 text-sm">פרטי בעלת העסק</h3>
        <p className="text-xs text-sand-400 mt-0.5">מופיע בכפתורי WhatsApp ובהודעות אוטומטיות</p>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">שם</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">מספר WhatsApp (עם קוד מדינה, ללא +)</label>
          <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} dir="ltr" placeholder="972527506227" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">כיתוב מתחת ללוגו (מסך כניסה)</label>
          <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="מרכז התפתחות לתינוקות" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
          {saved ? '✓ נשמר!' : saving ? '...' : 'שמור'}
        </button>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState<GlobalSetting[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GlobalSetting | null>(null)
  const [form, setForm] = useState({ setting_key: '', setting_value: '', setting_type: 'text' as GlobalSetting['setting_type'], category: '', description: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    supabase.from('global_settings').select('*').order('category').order('setting_key')
      .then(({ data }) => setSettings(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function saveNew() {
    if (!form.setting_key.trim()) return
    if (editing) {
      await supabase.from('global_settings').update({ setting_value: form.setting_value, description: form.description || null }).eq('id', editing.id)
    } else {
      await supabase.from('global_settings').insert({ ...form, description: form.description || null, category: form.category || null })
    }
    setForm({ setting_key: '', setting_value: '', setting_type: 'text', category: '', description: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function saveInline(setting: GlobalSetting) {
    setSaving(setting.id)
    const value = editValues[setting.id] ?? setting.setting_value ?? ''
    await supabase.from('global_settings').update({ setting_value: value }).eq('id', setting.id)
    setSaving(null)
    load()
  }

  async function del(id: string) {
    await supabase.from('global_settings').delete().eq('id', id); load()
  }

  const grouped = settings.reduce((acc, s) => {
    const cat = s.category ?? 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {} as Record<string, GlobalSetting[]>)

  return (
    <div className="space-y-3">
      {/* Owner Settings */}
      <OwnerSettingsSection />

      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        הגדרה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {!editing && <input value={form.setting_key} onChange={e => setForm(f => ({ ...f, setting_key: e.target.value }))} placeholder="מפתח (key)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />}
          <input value={form.setting_value} onChange={e => setForm(f => ({ ...f, setting_value: e.target.value }))} placeholder="ערך" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          {!editing && (
            <div className="flex gap-2">
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="קטגוריה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
              <select value={form.setting_type} onChange={e => setForm(f => ({ ...f, setting_type: e.target.value as GlobalSetting['setting_type'] }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
                <option value="text">טקסט</option>
                <option value="number">מספר</option>
                <option value="boolean">כן/לא</option>
                <option value="url">קישור</option>
                <option value="json">JSON</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={saveNew} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-sand-400 mb-2 px-1">{cat}</p>
          {items.map(s => (
            <div key={s.id} className="bg-white rounded-2xl p-3 shadow-sm mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-sand-400">{s.setting_key}</p>
                  {s.description && <p className="text-xs text-sand-500">{s.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      value={editValues[s.id] ?? s.setting_value ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="flex-1 px-2 py-1 border border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                    />
                    <button onClick={() => saveInline(s)} className={`p-1 rounded-lg transition-colors ${saving === s.id ? 'text-mustard-300' : 'text-mustard-500 hover:bg-mustard-50'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => del(s.id)} className="p-1.5 text-sand-300 hover:text-red-400 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Pregnancy Admin Tab ──────────────────────────────────────────────────────
type PregnancyCat = 'medical' | 'buying' | 'guide'

function PregnancyAdminTab() {
  const [cat, setCat] = useState<PregnancyCat>('medical')
  const [items, setItems] = useState<PregnancyChecklistItem[]>([])
  const [editItem, setEditItem] = useState<PregnancyChecklistItem | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Form state
  const [formText, setFormText] = useState('')
  const [formWeekFrom, setFormWeekFrom] = useState('')
  const [formWeekTo, setFormWeekTo] = useState('')
  const [formOrder, setFormOrder] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('pregnancy_checklist_items')
      .select('*')
      .order('display_order')
    setItems((data ?? []) as PregnancyChecklistItem[])
  }, [])
  useEffect(() => { load() }, [load])

  function openEdit(item: PregnancyChecklistItem) {
    setEditItem(item)
    setFormText(item.text)
    setFormWeekFrom(item.week_from?.toString() ?? '')
    setFormWeekTo(item.week_to?.toString() ?? '')
    setFormOrder(item.display_order.toString())
    setShowAdd(false)
  }

  function openAdd() {
    setEditItem(null)
    setFormText('')
    setFormWeekFrom('')
    setFormWeekTo('')
    setFormOrder('')
    setShowAdd(true)
  }

  async function save() {
    if (!formText.trim()) return
    setSaving(true)
    const payload = {
      text: formText.trim(),
      category: cat,
      week_from: formWeekFrom ? parseInt(formWeekFrom) : null,
      week_to: formWeekTo ? parseInt(formWeekTo) : null,
      display_order: formOrder ? parseInt(formOrder) : 0,
    }
    if (editItem) {
      await supabase.from('pregnancy_checklist_items').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('pregnancy_checklist_items').insert({ ...payload, is_active: true })
    }
    setSaving(false)
    setEditItem(null)
    setShowAdd(false)
    load()
  }

  async function toggleActive(item: PregnancyChecklistItem) {
    await supabase.from('pregnancy_checklist_items').update({ is_active: !item.is_active }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
  }

  async function del(id: string) {
    await supabase.from('pregnancy_checklist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const displayed = items.filter(i => i.category === (cat as 'medical' | 'buying'))

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1 overflow-x-auto">
        {([
          { id: 'medical' as PregnancyCat, label: '🩺 רפואי' },
          { id: 'buying'  as PregnancyCat, label: '🛍️ קניות' },
          { id: 'guide'   as PregnancyCat, label: '📖 מדריך שבועי' },
        ]).map(t => (
          <button key={t.id}
            onClick={() => { setCat(t.id); setEditItem(null); setShowAdd(false) }}
            className={`flex-shrink-0 flex-1 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${cat === t.id ? 'text-white shadow-sm' : 'text-sand-500'}`}
            style={cat === t.id ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Weekly guide sub-section */}
      {cat === 'guide' && <WeeklyGuideAdminSection />}
      {cat !== 'guide' && (<>

      {/* Add button */}
      <button
        onClick={openAdd}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold text-sm"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        <Plus className="w-4 h-4" />
        {cat === 'medical' ? 'הוסף משימה רפואית' : 'הוסף פריט לקנייה'}
      </button>

      {/* Add / Edit form */}
      {(showAdd || editItem) && (
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sand-800 text-sm">{editItem ? 'ערוך פריט' : 'פריט חדש'}</h3>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">טקסט</label>
            <input
              value={formText}
              onChange={e => setFormText(e.target.value)}
              placeholder="תיאור המשימה..."
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
          {cat === 'medical' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-sand-500 mb-1 block">שבוע מ-</label>
                <input
                  type="number"
                  value={formWeekFrom}
                  onChange={e => setFormWeekFrom(e.target.value)}
                  placeholder="1"
                  min={1} max={42}
                  className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-sand-500 mb-1 block">שבוע עד</label>
                <input
                  type="number"
                  value={formWeekTo}
                  onChange={e => setFormWeekTo(e.target.value)}
                  placeholder="42"
                  min={1} max={42}
                  className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-sand-500 mb-1 block">סדר תצוגה</label>
            <input
              type="number"
              value={formOrder}
              onChange={e => setFormOrder(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !formText.trim()}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
            >
              {saving ? '...' : 'שמירה'}
            </button>
            <button
              onClick={() => { setEditItem(null); setShowAdd(false) }}
              className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {displayed.map(item => (
          <div key={item.id} className={`bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 ${!item.is_active ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sand-800">{item.text}</p>
              {item.category === 'medical' && (item.week_from || item.week_to) && (
                <p className="text-xs text-mustard-600 mt-0.5">
                  שבוע {item.week_from ?? '?'}–{item.week_to ?? '?'}
                </p>
              )}
              <p className="text-xs text-sand-300 mt-0.5">סדר: {item.display_order}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => openEdit(item)} className="p-1.5 text-sand-400 hover:text-mustard-600 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => toggleActive(item)} className="p-1.5 text-sand-400 hover:text-sand-700 transition-colors">
                {item.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
              </button>
              <button onClick={() => del(item.id)} className="p-1.5 text-sand-300 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {displayed.length === 0 && (
          <p className="text-center text-sand-400 text-sm py-6">אין פריטים עדיין</p>
        )}
      </div>
      </>)}
    </div>
  )
}

// ─── Weekly Guide Admin Section ───────────────────────────────────────────────
function WeeklyGuideAdminSection() {
  const [guides, setGuides] = useState<PregnancyWeeklyGuide[]>([])
  const [editGuide, setEditGuide] = useState<PregnancyWeeklyGuide | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [formWeek, setFormWeek] = useState('')
  const [formSymptoms, setFormSymptoms] = useState('')
  const [formBabySize, setFormBabySize] = useState('')
  const [formEmoji, setFormEmoji] = useState('🍊')
  const [formDevelopment, setFormDevelopment] = useState('')
  const [formImageUrl, setFormImageUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('pregnancy_weekly_guide').select('*').order('week')
    setGuides((data ?? []) as PregnancyWeeklyGuide[])
  }, [])
  useEffect(() => { load() }, [load])

  function openEdit(g: PregnancyWeeklyGuide) {
    setEditGuide(g)
    setFormWeek(g.week.toString())
    setFormSymptoms(g.symptoms ?? '')
    setFormBabySize(g.baby_size ?? '')
    setFormEmoji(g.baby_size_emoji ?? '🍊')
    setFormDevelopment(g.development ?? '')
    setFormImageUrl(g.image_url ?? '')
    setShowAdd(false)
  }

  function openAdd() {
    setEditGuide(null)
    setFormWeek(''); setFormSymptoms(''); setFormBabySize('')
    setFormEmoji('🍊'); setFormDevelopment(''); setFormImageUrl('')
    setShowAdd(true)
  }

  async function save() {
    if (!formWeek) return
    setSaving(true)
    const payload = {
      week: parseInt(formWeek),
      symptoms: formSymptoms.trim() || null,
      baby_size: formBabySize.trim() || null,
      baby_size_emoji: formEmoji.trim() || '🍊',
      development: formDevelopment.trim() || null,
      image_url: formImageUrl.trim() || null,
    }
    if (editGuide) {
      await supabase.from('pregnancy_weekly_guide').update(payload).eq('id', editGuide.id)
    } else {
      await supabase.from('pregnancy_weekly_guide').insert({ ...payload, is_active: true })
    }
    setSaving(false)
    setEditGuide(null)
    setShowAdd(false)
    load()
  }

  async function delGuide(id: string) {
    await supabase.from('pregnancy_weekly_guide').delete().eq('id', id)
    setGuides(prev => prev.filter(g => g.id !== id))
  }

  const form = (showAdd || editGuide) && (
    <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sand-800 text-sm">{editGuide ? `ערוך שבוע ${editGuide.week}` : 'שבוע חדש'}</h3>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-sand-500 mb-1 block">מספר שבוע</label>
          <input type="number" value={formWeek} onChange={e => setFormWeek(e.target.value)}
            placeholder="20" min={1} max={42} disabled={!!editGuide}
            className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 disabled:bg-sand-50" />
        </div>
        <div className="w-20">
          <label className="text-xs text-sand-500 mb-1 block">אמוג'י</label>
          <input value={formEmoji} onChange={e => setFormEmoji(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-xl text-center focus:outline-none focus:border-mustard-400" />
        </div>
      </div>
      <div>
        <label className="text-xs text-sand-500 mb-1 block">גודל התינוק (למשל: "כגודל בננה")</label>
        <input value={formBabySize} onChange={e => setFormBabySize(e.target.value)}
          placeholder="כגודל בננה"
          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
      </div>
      <div>
        <label className="text-xs text-sand-500 mb-1 block">התפתחות (מה קורה בפנים)</label>
        <textarea rows={3} value={formDevelopment} onChange={e => setFormDevelopment(e.target.value)}
          placeholder="הריאות מתחילות להתפתח..."
          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />
      </div>
      <div>
        <label className="text-xs text-sand-500 mb-1 block">סימפטומים</label>
        <textarea rows={2} value={formSymptoms} onChange={e => setFormSymptoms(e.target.value)}
          placeholder="בחילות, עייפות, כאבי גב..."
          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />
      </div>
      <div>
        <label className="text-xs text-sand-500 mb-1 block">URL תמונה (אופציונלי)</label>
        <input value={formImageUrl} onChange={e => setFormImageUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !formWeek}
          className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
          {saving ? '...' : 'שמירה'}
        </button>
        <button onClick={() => { setEditGuide(null); setShowAdd(false) }}
          className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">
          ביטול
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <button onClick={openAdd}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold text-sm"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
        <Plus className="w-4 h-4" /> הוסף שבוע חדש
      </button>

      {form}

      <div className="space-y-2">
        {guides.map(g => (
          <div key={g.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">{g.baby_size_emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sand-800 text-sm">שבוע {g.week}</p>
              <p className="text-xs text-sand-400 truncate">{g.baby_size ?? '—'}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => openEdit(g)} className="p-1.5 text-sand-400 hover:text-mustard-600 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => delGuide(g.id)} className="p-1.5 text-sand-300 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {guides.length === 0 && <p className="text-center text-sand-400 text-sm py-6">אין תוכן שבועי עדיין</p>}
      </div>
    </div>
  )
}

// ─── Partners Tab ─────────────────────────────────────────────────────────────
const SUBCATS = [
  { value: 'doula',        label: 'דולה' },
  { value: 'pelvic_floor', label: 'רצפת האגן' },
  { value: 'studio',       label: 'סטודיו' },
  { value: 'lactation',    label: 'יועצת הנקה' },
  { value: 'osteopath',    label: 'אוסטאופתיה' },
  { value: 'physio',       label: 'פיזיותרפיה' },
  { value: 'psychologist', label: 'פסיכולוגיה' },
  { value: 'nutrition',    label: 'תזונה' },
  { value: 'other',        label: 'אחר' },
]

function PartnersTab() {
  const [partners, setPartners] = useState<ServicePartner[]>([])
  const [editing, setEditing] = useState<ServicePartner | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'pregnancy' as 'pregnancy' | 'motherhood', subcategory: 'doula', whatsapp_number: '', logo_url: '', display_order: 0 })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_partners').select('*').order('category').order('display_order')
    setPartners((data ?? []) as ServicePartner[])
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ title: '', description: '', category: 'pregnancy', subcategory: 'doula', whatsapp_number: '', logo_url: '', display_order: partners.length })
    setEditing(null)
    setAdding(true)
  }

  function openEdit(p: ServicePartner) {
    setForm({ title: p.title, description: p.description ?? '', category: p.category, subcategory: p.subcategory ?? 'other', whatsapp_number: p.whatsapp_number ?? '', logo_url: p.logo_url ?? '', display_order: p.display_order })
    setEditing(p)
    setAdding(true)
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('service_partners').update(form).eq('id', editing.id)
    } else {
      await supabase.from('service_partners').insert({ ...form, is_active: true })
    }
    await load()
    setAdding(false)
    setEditing(null)
    setSaving(false)
  }

  async function toggleActive(p: ServicePartner) {
    await supabase.from('service_partners').update({ is_active: !p.is_active }).eq('id', p.id)
    setPartners(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function del(id: string) {
    await supabase.from('service_partners').delete().eq('id', id)
    setPartners(prev => prev.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-sand-400">{partners.length} שירותים</p>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-white text-xs font-bold"
          style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
          <Plus className="w-3.5 h-3.5" /> הוסף שירות
        </button>
      </div>

      {adding && (
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
          <p className="font-bold text-sand-800 text-sm">{editing ? 'ערוך שירות' : 'שירות חדש'}</p>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="שם השירות / נותן השירות"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="תיאור קצר..." rows={2}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />
          <div className="flex gap-2">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as 'pregnancy' | 'motherhood' }))}
              className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400">
              <option value="pregnancy">הריון</option>
              <option value="motherhood">אמהות</option>
            </select>
            <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
              className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400">
              {SUBCATS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))}
            placeholder="מספר WhatsApp (972...)" dir="ltr"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
            placeholder="קישור לתמונה (אופציונלי)" dir="ltr"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              {saving ? '...' : editing ? 'שמור שינויים' : 'הוסף'}
            </button>
            <button onClick={() => { setAdding(false); setEditing(null) }}
              className="px-4 py-2.5 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
          </div>
        </div>
      )}

      {partners.map(p => (
        <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sand-800 text-sm truncate">{p.title}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${p.category === 'pregnancy' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
                {p.category === 'pregnancy' ? '🤰 הריון' : '🌸 אמהות'}
              </span>
              {!p.is_active && <span className="text-[10px] bg-sand-100 text-sand-400 px-1.5 py-0.5 rounded-md">מוסתר</span>}
            </div>
            {p.description && <p className="text-xs text-sand-400 truncate mt-0.5">{p.description}</p>}
            {p.whatsapp_number && <p className="text-xs text-sand-300 mt-0.5 font-mono" dir="ltr">{p.whatsapp_number}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => toggleActive(p)} title={p.is_active ? 'הסתר' : 'הפעל'}
              className="p-1.5 text-sand-300 hover:text-mustard-500 transition-colors">
              {p.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <button onClick={() => openEdit(p)} className="p-1.5 text-sand-300 hover:text-mustard-600 transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => del(p.id)} className="p-1.5 text-sand-200 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      {partners.length === 0 && !adding && <p className="text-center text-sand-400 text-sm py-8">אין שירותים עדיין</p>}
    </div>
  )
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────
type LeadWithDetails = PartnerLead & {
  user_name: string | null
  user_phone: string | null
  partner_title: string | null
}

function LeadsTab() {
  const [leads, setLeads] = useState<LeadWithDetails[]>([])
  const [filterType, setFilterType] = useState<'all' | 'whatsapp' | 'callback'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: rawLeads } = await supabase.from('partner_leads').select('*').order('created_at', { ascending: false })
      if (!rawLeads || rawLeads.length === 0) { setLeads([]); setLoading(false); return }

      const userIds = [...new Set(rawLeads.map((l: PartnerLead) => l.user_id).filter(Boolean))] as string[]
      const partnerIds = [...new Set(rawLeads.map((l: PartnerLead) => l.partner_id).filter(Boolean))] as string[]

      const [{ data: profiles }, { data: partners }] = await Promise.all([
        supabase.from('user_profiles').select('id, mother_name, phone_number').in('id', userIds),
        supabase.from('service_partners').select('id, title').in('id', partnerIds),
      ])

      const profileMap: Record<string, { mother_name: string | null; phone_number: string | null }> = {}
      ;(profiles ?? []).forEach((p: { id: string; mother_name: string | null; phone_number: string | null }) => { profileMap[p.id] = p })
      const partnerMap: Record<string, string> = {}
      ;(partners ?? []).forEach((p: { id: string; title: string }) => { partnerMap[p.id] = p.title })

      setLeads(rawLeads.map((l: PartnerLead) => ({
        ...l,
        user_name: l.contact_name ?? (l.user_id ? profileMap[l.user_id]?.mother_name ?? null : null),
        user_phone: l.contact_phone ?? (l.user_id ? profileMap[l.user_id]?.phone_number ?? null : null),
        partner_title: l.partner_id ? (partnerMap[l.partner_id] ?? null) : null,
      })))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = leads.filter(l => filterType === 'all' || l.action_type === filterType)

  if (loading) return <div className="text-center py-12"><div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-sand-400">{filtered.length} לידים</p>
        <div className="flex gap-1">
          {(['all', 'whatsapp', 'callback'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${filterType === t ? 'text-white' : 'bg-sand-50 text-sand-500'}`}
              style={filterType === t ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}>
              {t === 'all' ? 'הכל' : t === 'whatsapp' ? '💬 WA' : '📞 טלפון'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-3xl p-10 text-center shadow-sm">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm text-sand-400">אין לידים עדיין</p>
        </div>
      )}

      {filtered.map(l => (
        <div key={l.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sand-800 text-sm">{l.user_name ?? '—'}</p>
              {l.user_phone && (
                <a href={`https://wa.me/${l.user_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" />{l.user_phone}
                </a>
              )}
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-xl font-bold flex-shrink-0 ${l.action_type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {l.action_type === 'whatsapp' ? '💬 WhatsApp' : '📞 התקשרות'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-sand-500">🌿 {l.partner_title ?? 'שירות לא ידוע'}</p>
            <p className="text-xs text-sand-300">
              {new Date(l.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
