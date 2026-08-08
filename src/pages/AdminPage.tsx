import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Home as HomeIcon, Plus, Pencil, Trash2, GraduationCap, CreditCard, CalendarDays, Image as ImageIcon, Eye, AlertCircle, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, X, Check, Search, Users, BarChart2, Lightbulb, Video, Gift, Settings, MessageCircle, Mail, Phone, GripVertical, ClipboardList, FileText, Sparkles, Link2, MapPin, ExternalLink } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import { supabase, UserProfile, DailyTip, Video as VideoType, HomeworkTask, Workshop, PartnerPerk, PerkAnalytic, ContentCategory, GlobalSetting, PregnancyChecklistItem, PregnancyWeeklyGuide, ServicePartner, PartnerLead, WorkshopContent, type WorkshopCohort, type VendorAdminInfo } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BUYING_SUBCATEGORIES } from '../data/buyingSubcategories'
import type { AdminSection } from '../App'
import CohortsModal from '../components/admin/CohortsModal'
import FormSubmissionsView from '../components/admin/FormSubmissionsView'
import FormSubmissionsModal from '../components/admin/FormSubmissionsModal'
import AdminLargeModal from '../components/admin/AdminLargeModal'
import ConfirmDialog from '../components/admin/ConfirmDialog'
import WorkshopOffersPanel from '../components/admin/WorkshopOffersPanel'
import { resolveSubmitter } from '../components/admin/formSubmissionResolver'
import { CustomerCardProvider, useOpenCustomer } from '../components/admin/CustomerCardContext'
import { REGISTRATIONS_CHANGED_EVENT } from '../components/admin/CustomerCardModal'
import GlobalSearchBar from '../components/admin/GlobalSearchBar'
import { normalizeIlPhone } from '../components/admin/customerLookup'
import AddRegistrationModal from '../components/admin/AddRegistrationModal'
import EventsAdminPanel from '../components/admin/EventsAdminPanel'
import HomeAnnouncementsPanel from '../components/admin/HomeAnnouncementsPanel'
import CategoryManagerModal from '../components/admin/CategoryManagerModal'
import { useWorkshopCategories } from '../hooks/useWorkshopCategories'
import MimoDuck from '../components/MimoDuck'
import AdminHome from '../components/admin/AdminHome'
import ProductPage from '../components/admin/ProductPage'
import type { AdminOverview } from '../components/admin/useAdminOverview'
import type { AdminTask } from '../components/admin/adminTasks'
import { ChevronRight as CtxBack } from 'lucide-react'

type Tab = 'home' | 'users' | 'insights' | 'tips' | 'videos' | 'workshops' | 'events' | 'perks' | 'forms' | 'settings' | 'pregnancy' | 'partners' | 'leads' | 'registrations'


// Map admin nav sections → internal tabs
const SECTION_TAB: Record<AdminSection, Tab> = {
  home:      'home',
  insights:  'insights',
  users:     'users',
  workshops: 'workshops',
  events:    'events',
  forms:     'forms',
  leads:     'leads',
  tips:      'tips',
  videos:    'videos',
  perks:     'perks',
  pregnancy: 'pregnancy',
  partners:  'partners',
  registrations: 'registrations',
  settings:  'settings',
}

// Phase 5 / A2 Part 1: mirrors the desktop sidebar order — daily-use
// sections (הרשמות / טפסים / סדנאות) leftmost in RTL so they're under
// the thumb on mobile.
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'home',      label: 'בית',           icon: <HomeIcon className="w-3.5 h-3.5" /> },
  { id: 'registrations', label: 'הרשמות',     icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: 'forms',     label: 'שאלונים', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'events',    label: 'אירועי קהילה',  icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'partners',  label: 'ספקי קהילה',     icon: <Link2 className="w-3.5 h-3.5" /> },
  { id: 'workshops', label: 'מוצרים ותשלום', icon: <GraduationCap className="w-3.5 h-3.5" /> },
  { id: 'users',     label: 'משתמשות',      icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'leads',     label: 'לידים',         icon: <Phone className="w-3.5 h-3.5" /> },
  { id: 'insights',  label: 'תובנות',        icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'videos',    label: 'סרטונים',       icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'tips',      label: 'טיפים',         icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: 'perks',     label: 'הטבות',         icon: <Gift className="w-3.5 h-3.5" /> },
  { id: 'pregnancy', label: 'מדריכי הריון',   icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'settings',  label: 'הגדרות',        icon: <Settings className="w-3.5 h-3.5" /> },
]

export default function AdminPage({ defaultSection, unreadForms = 0, onFormsViewed, unreadRegistrations = 0, onRegistrationsViewed, overview }: { defaultSection?: AdminSection; unreadForms?: number; onFormsViewed?: () => void; unreadRegistrations?: number; onRegistrationsViewed?: () => void; overview?: AdminOverview }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>(() => {
    // Product deep-link (?admin=product&id=) wins the opening tab.
    if (new URLSearchParams(window.location.search).get('admin') === 'product') return 'workshops'
    return defaultSection ? SECTION_TAB[defaultSection] : 'home'
  })
  // Skip the first defaultSection sync when a deep link chose the tab.
  const skipFirstSectionSync = useRef(new URLSearchParams(window.location.search).get('admin') === 'product')

  // Phase 3 (handoff §4): a task click carries its context to the
  // destination — label for the context bar, exact lead ids to
  // filter+pre-select, or the object to open.
  const [taskContext, setTaskContext] = useState<{ label: string; section: Tab; targetId?: string; leadIds?: string[] } | null>(null)

  // Phase 4 (handoff §5.2): a product opens as a PAGE, deep-linkable via
  // ?admin=product&id=<id> (read once on mount, kept in sync best-effort).
  const [productPageId, setProductPageId] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('admin') === 'product' ? p.get('id') : null
  })

  function openProductPage(id: string | null) {
    setProductPageId(id)
    const url = new URL(window.location.href)
    if (id) { url.searchParams.set('admin', 'product'); url.searchParams.set('id', id) }
    else { url.searchParams.delete('admin'); url.searchParams.delete('id') }
    window.history.replaceState({}, '', url.toString())
  }

  function openTask(t: AdminTask) {
    setTaskContext({ label: t.title, section: t.section, targetId: t.targetId, leadIds: t.targetLeadIds })
    if (t.section === 'workshops' && t.targetId) openProductPage(t.targetId)
    setTab(t.section)
  }

  // Leaving the task's destination clears its context.
  useEffect(() => {
    if (taskContext && tab !== taskContext.section) setTaskContext(null)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the workshops tab closes the product page.
  useEffect(() => {
    if (productPageId && tab !== 'workshops') openProductPage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Sync when parent nav changes the section
  useEffect(() => {
    if (skipFirstSectionSync.current) { skipFirstSectionSync.current = false; return }
    if (defaultSection) setTab(SECTION_TAB[defaultSection])
  }, [defaultSection])

  // Clear badge whenever the forms tab is active
  useEffect(() => {
    if (tab === 'forms') onFormsViewed?.()
    if (tab === 'registrations') onRegistrationsViewed?.()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-sand-500">אין גישה לפאנל הניהול</p>
      </div>
    )
  }

  const tabLabel = TABS.find(t => t.id === tab)?.label ?? ''

  return (
    // Phase 5 / A2 Part 3: any admin descendant can call
    // useOpenCustomer({ phone, email }) to summon the unified card.
    <CustomerCardProvider>
    <div className="min-h-screen pb-24 lg:pb-6" dir="rtl">
      {/* ── Mobile header (hidden on desktop, sidebar handles nav) ── */}
      <div className="lg:hidden bg-white border-b border-sand-100 shadow-sm px-4 pt-5 pb-3">
        <div className="max-w-sm mx-auto">
          <div className="mb-3">
            <h1 className="text-lg font-bold" style={{ color: '#5E4938' }}>פאנל ניהול</h1>
            <p className="text-xs" style={{ color: '#7B604C' }}>Mimo CMS</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scroll-hide pb-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0 ${tab === t.id ? 'shadow-md' : 'bg-sand-50 hover:bg-sand-100'}`}
                style={tab === t.id ? { background: '#E7C78A', color: '#3A2E18' } : { color: '#7B604C' }}>
                {t.icon}{t.label}
                {t.id === 'forms' && unreadForms > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadForms > 99 ? '99+' : unreadForms}
                  </span>
                )}
                {t.id === 'registrations' && unreadRegistrations > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadRegistrations > 99 ? '99+' : unreadRegistrations}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desktop header (slim top bar) ── */}
      <div className="hidden lg:flex items-center justify-between px-8 py-4 bg-white border-b border-[#E4DAD0] sticky top-0 z-10">
        <div>
          <h2 className="font-display" style={{ fontSize: 30, color: '#5E4938', fontWeight: 400 }}>{tabLabel}</h2>
          <p className="text-[13px] font-semibold" style={{ color: '#7B604C' }}>ניהול מימו</p>
        </div>
      </div>

      {/* Phase 5 / A2 Stage 3: global search — sticky bar above every
          tab's content. Tapping a result opens the customer card. */}
      <GlobalSearchBar />

      {/* Task context bar (handoff §4) — the destination knows WHY you
          arrived and offers the way back. */}
      {taskContext && (
        <div className="px-4 lg:px-8 pt-3">
          <div className="max-w-sm lg:max-w-none mx-auto flex items-center gap-3 rounded-2xl px-4 py-2.5 flex-wrap" style={{ background: '#EEF2F4', border: '1px solid #DDE6EA' }}>
            <button
              onClick={() => { setTaskContext(null); setTab('home') }}
              className="flex items-center gap-1 font-bold flex-shrink-0"
              style={{ fontSize: 13, color: '#35505C' }}
            >
              <CtxBack className="w-4 h-4" /> חזרה לבית
            </button>
            <span className="font-semibold min-w-0 truncate" style={{ fontSize: 13, color: '#35505C' }}>
              מסונן לפי: {taskContext.label}
            </span>
            <button
              onClick={() => setTaskContext(null)}
              className="mr-auto p-1 rounded-lg flex-shrink-0"
              title="ניקוי הסינון"
              aria-label="ניקוי הסינון"
            >
              <X className="w-4 h-4" style={{ color: '#35505C' }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile content ── */}
      <div className="lg:hidden max-w-sm mx-auto px-4 pt-4 space-y-4">
        {tab === 'home'       && (overview ? <AdminHome overview={overview} onSection={t => setTab(t)} onOpenTask={openTask} /> : <p className="text-center text-sand-400 text-sm py-8">טוען...</p>)}
        {tab === 'users'      && <UsersTab />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'tips'       && <TipsTab />}
        {tab === 'videos'     && <VideosTab />}
        {tab === 'workshops'  && (productPageId ? <ProductPage workshopId={productPageId} onBack={() => openProductPage(null)} /> : <WorkshopsTab onOpenProduct={openProductPage} />)}
        {tab === 'events'     && <EventsAdminPanel openEditId={taskContext?.section === 'events' ? taskContext.targetId : undefined} />}
        {tab === 'perks'      && <PerksTab />}
        {tab === 'pregnancy'  && <PregnancyAdminTab />}
        {tab === 'partners'   && <PartnersTab />}
        {tab === 'leads'      && <LeadsTab />}
        {tab === 'forms'      && <FormsTab />}
        {tab === 'registrations' && <RegistrationsTab focusLeadIds={taskContext?.section === 'registrations' ? taskContext.leadIds : undefined} />}
        {tab === 'settings'   && <SettingsTab />}
      </div>

      {/* ── Desktop content ── */}
      <div className="hidden lg:block px-8 py-6">
        {tab === 'home'       && (overview ? <AdminHome overview={overview} onSection={t => setTab(t)} onOpenTask={openTask} /> : <p className="text-center text-sand-400 text-sm py-8">טוען...</p>)}
        {tab === 'users'      && <UsersTabDesktop />}
        {tab === 'leads'      && <LeadsTabDesktop />}
        {tab === 'workshops'  && (productPageId ? <ProductPage workshopId={productPageId} onBack={() => openProductPage(null)} /> : <WorkshopsTabDesktop onOpenProduct={openProductPage} />)}
        {tab === 'events'     && <EventsAdminPanel openEditId={taskContext?.section === 'events' ? taskContext.targetId : undefined} />}
        {tab === 'forms'      && <FormsTabDesktop />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'tips'       && <TipsTab />}
        {tab === 'videos'     && <VideosTab />}
        {tab === 'perks'      && <PerksTab />}
        {tab === 'pregnancy'  && <PregnancyAdminTab />}
        {tab === 'partners'   && <PartnersTab />}
        {tab === 'registrations' && <RegistrationsTab focusLeadIds={taskContext?.section === 'registrations' ? taskContext.leadIds : undefined} />}
        {tab === 'settings'   && <SettingsTab />}
      </div>
    </div>
    </CustomerCardProvider>
  )
}

// ─── CRM helpers ─────────────────────────────────────────────────────────────
const LEAD_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  new_lead:        { label: 'ליד חדש',           color: '#3E5966', bg: '#E4EBEF' },
  active_workshop: { label: 'בסדנה פעילה',       color: '#434434', bg: '#E6E6E0' },
  post_service:    { label: 'לאחר שירות',         color: '#6E6852', bg: '#F0EBE3' },
}

function LeadBadge({ status }: { status: string | null }) {
  const s = status ? (LEAD_STATUS_LABELS[status] ?? null) : null
  if (!s) return <span className="bg-sand-100 whitespace-nowrap font-bold" style={{ fontSize: 13, color: '#7B604C', padding: '5px 12px', borderRadius: 9999 }}>ללא סטטוס</span>
  return (
    <span className="whitespace-nowrap font-bold" style={{ fontSize: 13, padding: '5px 12px', borderRadius: 9999, color: s.color, background: s.bg }}>
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
          <div className="w-12 h-12 bg-[#E4EBEF] rounded-2xl flex items-center justify-center mx-auto mb-2">
            <GraduationCap className="w-6 h-6" style={{ color: '#3E5966' }} />
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
                      <p className="text-[13px] text-sand-400">
                        {e.access_start_date} → {e.access_end_date}
                        {active ? <span className="text-green-600 mr-1"> ✓ פעיל</span> : <span className="text-red-400 mr-1"> פג תוקף</span>}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(e.id); setEditEndDate(e.access_end_date ?? '') }} className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => revokeAccess(e.id)} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {editingId === e.id && (
                    <div className="flex gap-2 items-center">
                      <input type="date" value={editEndDate} onChange={ev => setEditEndDate(ev.target.value)} className="flex-1 px-3 py-1.5 border border-sand-200 rounded-xl text-xs focus:outline-none" />
                      <button onClick={() => saveEditAccess(e.id)} className="px-3 py-1.5 rounded-xl text-xs text-white font-bold" style={{ background: '#D9B978' }}>שמור</button>
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

        {saved && <p className="flex items-center justify-center gap-1.5 font-semibold text-sm" style={{ color: '#434434' }}><Check className="w-4 h-4" style={{ color: '#818267' }} /> נשמר בהצלחה!</p>}
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3"
            style={{ color: '#A35C3D', fontWeight: 700, fontSize: 14 }}>
            <MessageCircle className="w-4 h-4" /> שלחי הודעת WhatsApp לאישור
          </a>
        )}

        <div className="flex gap-2 pb-2">
          <button onClick={save} disabled={saving || !workshopId || !endDate} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#E7C78A' }}>
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
            style={modeFilter === m ? { background: '#E7C78A' } : {}}
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
                {u.is_admin && <span className="text-[13px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-bold">ADMIN</span>}
                {u.user_mode === 'pregnant' && <span className="text-[13px] bg-[#E4EBEF] text-[#3E5966] px-1.5 py-0.5 rounded-md font-bold">🤰 הריון</span>}
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
              href={`https://wa.me/${u.phone_number?.replace(/\D/g, '') ?? ''}?text=${encodeURIComponent(`היי ${u.mother_name ?? ''}! 👋`)}`}
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
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-[#F6ECD8] text-[#6E5836] hover:bg-[#EFDFC2] transition-colors"
          >
            <GraduationCap className="w-4 h-4" /> הקצה גישה לסדנה
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
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: '#E7C78A' }}>
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

      {/* Task A: ConfirmDialog — replaces the ad-hoc modal that
          previously lived here. Same visual outcome, shared component. */}
      <ConfirmDialog
        open={!!deleteUser}
        itemName={deleteUser?.mother_name ?? deleteUser?.email ?? 'משתמשת זו'}
        title="מחיקת משתמשת"
        onConfirm={confirmDelete}
        onClose={() => setDeleteUser(null)}
      />
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
                style={modeFilter === m ? { background: '#E7C78A' } : {}}>
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
                      ? <span className="text-[13px] bg-[#E4EBEF] text-[#3E5966] px-2 py-0.5 rounded-lg font-bold">🤰 הריון</span>
                      : u.user_mode === 'mom'
                      ? <span className="text-[13px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-bold">👶 אמא</span>
                      : <span className="text-[13px] text-gray-400">—</span>
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
                        className="p-1.5 rounded-lg hover:bg-[#F6ECD8] text-[#7B604C] hover:text-[#6E5836] text-xs">
                        <GraduationCap className="w-4 h-4" />
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
            style={{ background: '#E7C78A' }}>
            {saving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button onClick={() => setAssignAccessUser(drawer)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#F6ECD8] text-[#6E5836] flex items-center justify-center gap-2">
            <GraduationCap className="w-4 h-4" /> ניהול גישה לסדנאות
          </button>
        </aside>
      )}

      {assignAccessUser && <AssignAccessModal user={assignAccessUser} onClose={() => setAssignAccessUser(null)} />}
      <ConfirmDialog
        open={!!deleteUser}
        itemName={deleteUser?.mother_name ?? deleteUser?.email ?? 'משתמשת זו'}
        title="מחיקת משתמשת"
        onConfirm={confirmDelete}
        onClose={() => setDeleteUser(null)}
      />
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
                      <span className={`text-[13px] px-2 py-1 rounded-lg font-bold ${l.action_type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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
                style={statusFilter === s ? { background: '#E7C78A' } : {}}>
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
const EMPTY_WORKSHOP_FORM = { title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '', public_registration: false, linked_form_id: '', feedback_form_id: '', age_from: '', age_to: '' }

function WorkshopsTabDesktop({ onOpenProduct }: { onOpenProduct?: (id: string) => void } = {}) {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [contentWorkshop, setContentWorkshop] = useState<Workshop | null>(null)
  // Phase 5 / A1: cohort manager modal. User-facing label "מחזורים".
  const [cohortsWorkshop, setCohortsWorkshop] = useState<Workshop | null>(null)
  const [drawer, setDrawer] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState({ ...EMPTY_WORKSHOP_FORM })
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  // Phase 5 / B: per-workshop registration link copy.
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Task A: delete-confirmation state. Trash button sets pending; the
  // shared ConfirmDialog at the bottom of the return prompts; on
  // confirm, performDelete runs the supabase delete then clears.
  const [pendingDelete, setPendingDelete] = useState<Workshop | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  // Phase 5 / A2 Part 2: forms list for the "שאלון משויך" dropdown.
  const [formsList, setFormsList] = useState<{ id: string; title: string }[]>([])
  // Active discount offers (workshop_offers) per product id.
  const [offersByWorkshop, setOffersByWorkshop] = useState<Record<string, string[]>>({})
  // Store categories are admin-managed (content_categories) + local
  // search / category filter for the products list.
  const { categories, reload: reloadCategories } = useWorkshopCategories()
  const [showCatManager, setShowCatManager] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  function copyRegisterLink(id: string) {
    const link = `${window.location.origin}?register=${id}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1500)
    })
  }

  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `workshops/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) { alert('שגיאה בהעלאה: ' + error.message); return null }
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('הקובץ גדול מ-5MB. נסי תמונה קטנה יותר.'); e.target.value = ''; return }
    setUploadingImage(true)
    const url = await uploadImage(file)
    if (url) setForm(f => ({ ...f, image_url: url }))
    setUploadingImage(false)
    e.target.value = ''
  }

  const load = useCallback(async () => {
    const [{ data: ws }, { data: fs }, { data: offers }] = await Promise.all([
      supabase.from('workshops').select('*').order('display_order'),
      supabase.from('forms').select('id, title').eq('is_active', true).order('title'),
      supabase.from('workshop_offers').select('id, workshop_id, label, is_active, expires_at'),
    ])
    setWorkshops(ws ?? [])
    setFormsList((fs ?? []) as { id: string; title: string }[])
    // Active discounted links per product - shown next to the payment
    // link so which products have offers is visible at a glance.
    const byWs: Record<string, string[]> = {}
    for (const o of (offers ?? []) as { workshop_id: string; label: string; is_active: boolean; expires_at: string | null }[]) {
      if (!o.is_active) continue
      if (o.expires_at && new Date(o.expires_at) <= new Date()) continue
      ;(byWs[o.workshop_id] ??= []).push(o.label)
    }
    setOffersByWorkshop(byWs)
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('workshops').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_WORKSHOP_FORM })
    setDrawer('create')
  }

  function closeDrawer() {
    setDrawer(null); setEditing(null); setForm({ ...EMPTY_WORKSHOP_FORM })
  }

  // Polish #7: drag-to-reorder. PointerSensor + TouchSensor configured
  // identically to the form-fields reorder above (distance/delay
  // thresholds prevent accidental drag on a regular click).
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function handleWorkshopsDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = workshops.findIndex(w => w.id === active.id)
    const newIdx = workshops.findIndex(w => w.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(workshops, oldIdx, newIdx)
    // Optimistic update — the UI snaps to the new order immediately;
    // the DB writes catch up asynchronously. If any write fails we
    // refetch via load().
    setWorkshops(reordered.map((w, i) => ({ ...w, display_order: i })))
    const updates = await Promise.all(
      reordered.map((w, i) =>
        supabase.from('workshops').update({ display_order: i }).eq('id', w.id),
      ),
    )
    if (updates.some(r => r.error)) {
      console.error('[reorder] one or more updates failed:', updates.filter(r => r.error))
      load()
    }
  }

  async function saveEdit() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      title: form.title,
      description: form.description || null,
      summary: form.summary || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      whatsapp_number: form.whatsapp_number || null,
      next_workshop_id: form.next_workshop_id || null,
      workshop_type: form.workshop_type || null,
      public_registration: form.public_registration,
      linked_form_id: form.linked_form_id || null,
      feedback_form_id: form.feedback_form_id || null,
      age_range_start_months: form.age_from !== '' ? parseFloat(form.age_from) : null,
      age_range_end_months: form.age_to !== '' ? parseFloat(form.age_to) : null,
    }
    if (editing) {
      await supabase.from('workshops').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = workshops.length > 0 ? Math.max(...workshops.map(w => w.display_order)) : 0
      await supabase.from('workshops').insert({ ...payload, currency: 'ILS', display_order: maxOrder + 1, is_active: true })
    }
    setSaving(false)
    closeDrawer()
    load()
  }

  const workshopsQ = searchQ.trim()
  const visibleWorkshops = workshops.filter(w =>
    (!workshopsQ || w.title.includes(workshopsQ) || (w.description ?? '').includes(workshopsQ)) &&
    (catFilter === 'all' || (catFilter === '__none__' ? !w.workshop_type : w.workshop_type === catFilter))
  )
  // Physical store products (category slug 'store-products') have no
  // cohorts and no digital content — hide those actions for them.
  const physicalNames = categories.filter(c => c.slug === 'store-products').map(c => c.name)
  const isPhysicalProduct = (w: Workshop) => physicalNames.includes(w.workshop_type ?? '')

  // UX handoff: active priced products missing a payment link — these
  // silently block purchases, so they get a warning banner + per-row flag.
  const missingPaymentLink = workshops.filter(w => w.is_active && (w.price ?? 0) > 0 && !w.payment_link)

  return (
    <div className="flex gap-6" dir="rtl">
      <div className="flex-1 min-w-0 space-y-4">
        {missingPaymentLink.length > 0 && (
          <div className="flex items-center gap-3" style={{ background: '#F5E2D8', border: '1px solid #E8C3B2', borderRadius: 18, padding: '15px 18px' }}>
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 9999, background: '#fff' }}>
              <AlertCircle style={{ width: 19, height: 19, color: '#8B4A30' }} />
            </div>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#713924' }}>
              למוצר "{missingPaymentLink[0].title}" (₪{missingPaymentLink[0].price}) אין קישור תשלום — לא ניתן לשלם עליו.
              {missingPaymentLink.length > 1 ? ` ועוד ${missingPaymentLink.length - 1} מוצרים נוספים ללא קישור.` : ''}
            </p>
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-800">מוצרים ({workshops.length})</h2>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold"
              style={{ background: '#C8A460', color: '#33281B' }}
            >
              <Plus className="w-4 h-4" />
              מוצר חדש
            </button>
          </div>
          {/* Search + category filter + category manager */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 חיפוש מוצר..." className="flex-1 min-w-[160px] px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
              <option value="all">כל הקטגוריות</option>
              <option value="__none__">סדנה דיגיטלית (ללא קטגוריה)</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>)}
            </select>
            <button onClick={() => setShowCatManager(true)} className="px-3 py-2 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 hover:bg-gray-100" title="ניהול קטגוריות">⚙️ קטגוריות</button>
          </div>
          {showCatManager && <CategoryManagerModal onClose={() => setShowCatManager(false)} onChanged={() => { reloadCategories(); load() }} />}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-right text-xs text-gray-500 font-semibold">
                <th className="px-2 py-3 w-8"></th>
                <th className="px-6 py-3">שם</th>
                <th className="px-4 py-3">מחיר</th>
                <th className="px-4 py-3">קישור תשלום</th>
                <th className="px-4 py-3">סטטוס</th>
                <th className="px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleWorkshopsDragEnd}>
                <SortableContext items={visibleWorkshops.map(w => w.id)} strategy={verticalListSortingStrategy}>
                  {visibleWorkshops.map(w => (
                    <SortableTr key={w.id} id={w.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                      {(dragHandle) => (
                        <>
                          <td className="px-2 py-3 w-8 text-center">{dragHandle}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              {w.image_url
                                ? <img src={w.image_url} className="w-9 h-9 rounded-xl object-cover" alt="" />
                                : <div className="w-9 h-9 rounded-xl bg-[#E4EBEF] flex items-center justify-center"><GraduationCap className="w-5 h-5" style={{ color: '#3E5966' }} /></div>
                              }
                              <div>
                                <button onClick={() => onOpenProduct?.(w.id)} className="font-semibold text-gray-800 hover:underline text-right" title="פתיחת עמוד המוצר">{w.title}</button>
                                {w.description && <p className="text-xs text-gray-400 truncate max-w-xs">{w.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{w.price != null ? `₪${w.price}` : '—'}</td>
                          <td className="px-4 py-3">
                            {w.payment_link ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span style={{ width: 9, height: 9, borderRadius: 9999, background: '#818267', display: 'inline-block' }} />
                                <span style={{ color: '#434434', fontSize: 13 }}>קיים</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => onOpenProduct?.(w.id)}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
                                title="פתיחת עמוד המוצר להוספת קישור תשלום"
                              >
                                <span style={{ width: 9, height: 9, borderRadius: 9999, background: '#A35C3D', display: 'inline-block' }} />
                                <span style={{ color: '#8B4A30', fontWeight: 700, fontSize: 14 }}>חסר — הוספה</span>
                              </button>
                            )}
                            {(offersByWorkshop[w.id]?.length ?? 0) > 0 && (
                              <button
                                onClick={() => onOpenProduct?.(w.id)}
                                className="mt-1 block text-right hover:underline"
                                title={`לינקים מוזלים: ${offersByWorkshop[w.id].join(', ')} — לחיצה פותחת את עמוד המוצר`}
                              >
                                <span className="inline-flex items-center rounded-full" style={{ background: '#E4EBEF', color: '#3E5966', fontWeight: 700, fontSize: 12, padding: '3px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {offersByWorkshop[w.id].length === 1
                                    ? `מוזל: ${offersByWorkshop[w.id][0]}`
                                    : `${offersByWorkshop[w.id].length} מוזלים · ${offersByWorkshop[w.id].join(', ')}`}
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => toggle(w)} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {w.is_active ? 'פעיל' : 'לא פעיל'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!isPhysicalProduct(w) && (
                                <>
                                  <button onClick={() => setContentWorkshop(w)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F6ECD8] text-[#6E5836] hover:bg-[#EFDFC2]">📂 תוכן</button>
                                  <button
                                    onClick={() => setCohortsWorkshop(w)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100"
                                    title="ניהול מחזורים"
                                  >
                                    📅 מחזורים
                                  </button>
                                </>
                              )}
                              {(w as unknown as { public_registration?: boolean }).public_registration && (
                                <button
                                  onClick={() => copyRegisterLink(w.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  title="העתקת לינק להרשמה ישירה למוצר הזה"
                                >
                                  {copiedId === w.id ? '✓ הועתק' : '🔗 לינק'}
                                </button>
                              )}
                              <button onClick={() => onOpenProduct?.(w.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setPendingDelete(w)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </SortableTr>
                  ))}
                </SortableContext>
              </DndContext>
            </tbody>
          </table>
          {visibleWorkshops.length === 0 && <p className="text-center text-gray-400 text-sm py-12">{workshops.length === 0 ? 'אין מוצרים' : 'לא נמצאו מוצרים בסינון הזה'}</p>}
        </div>
      </div>

      {/* Polish #6: Create / Edit modal — was a w-80 sticky aside next
          to the workshops table; now a large centered modal sharing
          the AdminLargeModal shell with the customer card + forms
          responses modals. */}
      {drawer && (
        <AdminLargeModal
          title={drawer === 'create' ? 'מוצר חדש' : 'עריכת מוצר'}
          onClose={closeDrawer}
          footer={
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: '#C8A460', color: '#33281B' }}>
                {saving ? '...' : drawer === 'create' ? 'יצירה' : 'שמור'}
              </button>
              <button onClick={closeDrawer} className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm">ביטול</button>
            </div>
          }
        >
        <div className="space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם הסדנה" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-mustard-400" />
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="סיכום / נקודות מפתח (מוצג בכרטיס הסדנה)" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-mustard-400" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר (₪)" type="number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder="מקסימום נרשמות למחזור / מלאי" title="לסדנאות עם מחזורים: מקסימום נרשמות בכל מחזור. למוצרי חנות: מלאי." type="number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
          </div>
          {/* Age targeting — drives the age-matched recommendation on the
              user home screen. Months, decimals allowed (e.g. 3.5). */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">טווח גיל מומלץ (חודשים) — להמלצה אוטומטית בדף הבית לפי גיל התינוק</label>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.age_from} onChange={e => setForm(f => ({ ...f, age_from: e.target.value }))} placeholder="מגיל (למשל 3)" type="number" step="0.5" min="0" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
              <input value={form.age_to} onChange={e => setForm(f => ({ ...f, age_to: e.target.value }))} placeholder="עד גיל (למשל 6)" type="number" step="0.5" min="0" className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            </div>
          </div>
          <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="קישור תשלום" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" dir="ltr" />
          {/* Image upload + URL fallback */}
          <div className="space-y-1.5">
            <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingImage ? 'bg-gray-100 text-gray-400' : 'bg-[#F6ECD8] text-[#6E5836] hover:bg-[#EFDFC2]'}`}>
              {uploadingImage ? 'מעלה תמונה...' : <><ImageIcon className="w-4 h-4" /> {form.image_url ? 'החלפת תמונה' : 'העלאת תמונה (PNG/JPG/WEBP, עד 5MB)'}</>}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageFile} disabled={uploadingImage} />
            </label>
            {form.image_url && (
              <div className="relative">
                <img src={form.image_url} alt="preview" className="w-full h-28 object-cover rounded-xl" />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                  className="absolute top-1 left-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70"
                  title="הסרת תמונה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="או הדבק קישור URL..." className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 focus:outline-none focus:border-mustard-400" dir="ltr" />
          </div>
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון (URL)" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" dir="ltr" />
          <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="WhatsApp" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" dir="ltr" />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">קטגוריה — מוצרים בחנות <span className="text-[#7B604C]">(ללא קטגוריה = סדנה דיגיטלית בלבד)</span></label>
            <select value={form.workshop_type} onChange={e => setForm(f => ({ ...f, workshop_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white">
              <option value="">סדנה דיגיטלית (לא מוצגת בחנות)</option>
              {form.workshop_type && !categories.some(c => c.name === form.workshop_type) && (
                <option value={form.workshop_type}>{form.workshop_type}</option>
              )}
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
              ))}
            </select>
          </div>
          {/* Workshop-only fields — hidden for physical store products */}
          {!physicalNames.includes(form.workshop_type) && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">הסדנה הבאה בסדרה</label>
                <select value={form.next_workshop_id} onChange={e => setForm(f => ({ ...f, next_workshop_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white">
                  <option value="">ללא המשך</option>
                  {workshops.filter(w => w.id !== editing?.id).map(w => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">שאלון פתיחה (מופיע בכרטיס הלקוחה בתחילת המחזור)</label>
                <select
                  value={form.linked_form_id}
                  onChange={e => setForm(f => ({ ...f, linked_form_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
                >
                  <option value="">ללא שאלון</option>
                  {formsList.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  משויך לטופס שמופיע בכרטיס הלקוחה כשאלון התפתחותי ובדו"ח המחזורים.
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">שאלון משוב סיום (נשלח אוטומטית במייל אחרי סיום הסדנה)</label>
                <select
                  value={form.feedback_form_id}
                  onChange={e => setForm(f => ({ ...f, feedback_form_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
                >
                  <option value="">ללא שאלון</option>
                  {formsList.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  נשלח במייל לכל הנרשמות של המחזור, יומיים אחרי תאריך סיום המחזור.
                </p>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.public_registration}
              onChange={e => setForm(f => ({ ...f, public_registration: e.target.checked }))}
              className="w-4 h-4 accent-[#C8A460]"
            />
            <span className="text-xs text-gray-700">הצגה בעמוד ההרשמה הציבורי <span className="text-gray-400">(?register)</span></span>
          </label>
          {/* Task B: per-workshop special-offer manager. Only on edit
              — needs the workshop_id, so a brand-new (unsaved)
              workshop hides the panel until it's been saved once. */}
          {drawer === 'edit' && editing && (
            <div className="pt-3 mt-3 border-t border-sand-200">
              <WorkshopOffersPanel workshopId={editing.id} />
            </div>
          )}
        </div>
        </AdminLargeModal>
      )}

      {contentWorkshop && <WorkshopContentModal workshop={contentWorkshop} onClose={() => setContentWorkshop(null)} />}
      {cohortsWorkshop && <CohortsModal workshop={cohortsWorkshop} onClose={() => setCohortsWorkshop(null)} />}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? 'המוצר'}
        title="מחיקת מוצר"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

// ─── Drag-and-drop sortable row (shared by desktop + mobile) ─────────────────
function SortableRow({ id, children }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const dragHandle = (
    <button
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-400 touch-none"
      title="גרור לשינוי סדר"
      onClick={e => e.preventDefault()}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  )
}

// Polish #7: same render-prop pattern as SortableRow but emits a <tr>
// instead of a <div>, so it slots into a table without breaking the
// table layout. Used by WorkshopsTabDesktop's drag-to-reorder.
function SortableTr({ id, children, className }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const dragHandle = (
    <button
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none"
      title="גרור לשינוי סדר"
      onClick={e => e.preventDefault()}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  )
  return (
    <tr ref={setNodeRef} style={style} className={className}>
      {children(dragHandle)}
    </tr>
  )
}

// ─── Polish #9: Forms-page "what's new" tracking ─────────────────────────────
// Independent of App.tsx's `forms_last_seen` (which drives the admin
// top-nav red badge and auto-clears on tab open). The page-level
// indicator must NOT auto-clear — admin needs to see what's new even
// after landing on the page. So we use:
//   - `forms_page_last_seen`            (global ISO timestamp)
//   - `forms_page_last_seen_<formId>`   (per-form ISO timestamp)
// Effective last-seen for a form = per-form ?? global ?? epoch.
// Both are bumped only by explicit user actions (opening responses,
// clicking a "what's new" row, pressing "סמני הכל כנקרא"), never by
// page navigation. Bumping the global clears per-form keys so they
// fall back to the global on next read.
const FORMS_PAGE_LS_KEY = 'forms_page_last_seen'
const FORMS_PAGE_LS_PER_FORM_PREFIX = 'forms_page_last_seen_'
const EPOCH = '1970-01-01T00:00:00Z'

function getEffectiveFormSeen(formId: string): string {
  try {
    return (
      localStorage.getItem(FORMS_PAGE_LS_PER_FORM_PREFIX + formId)
      ?? localStorage.getItem(FORMS_PAGE_LS_KEY)
      ?? EPOCH
    )
  } catch { return EPOCH }
}
function bumpFormSeen(formId: string) {
  try { localStorage.setItem(FORMS_PAGE_LS_PER_FORM_PREFIX + formId, new Date().toISOString()) } catch { /* ignore */ }
}
function bumpAllFormsSeen(formIds: string[]) {
  try {
    localStorage.setItem(FORMS_PAGE_LS_KEY, new Date().toISOString())
    // Clear per-form overrides so they fall through to the new global
    // (otherwise a stale per-form timestamp could still mark new items).
    for (const id of formIds) localStorage.removeItem(FORMS_PAGE_LS_PER_FORM_PREFIX + id)
  } catch { /* ignore */ }
}

// Compact submission shape carried by the Forms page for both the
// per-form "N חדשים" chip and the "מה חדש" strip. created_at is the
// only field needed for the new/seen check; the rest power the
// strip's row labels.
type FormsPageSubmission = {
  id: string
  form_id: string
  user_id: string | null
  responses_json: Record<string, unknown>
  created_at: string
  // Forms screen §2: NULL = the admin hasn't opened this response yet,
  // which is what the "חדשות" pill on each form row counts.
  read_at: string | null
  user_profiles?: { mother_name: string | null; email: string | null } | null
}

// Derive top-N newest unseen submissions, with resolved mother name +
// form title for the strip rows. Returns sorted newest-first.
function deriveRecentNew(
  allSubs: FormsPageSubmission[],
  forms: FormRecord[],
  topN: number,
): { sub: FormsPageSubmission; form: FormRecord; submitterLabel: string }[] {
  const formById = new Map(forms.map(f => [f.id, f]))
  const out: { sub: FormsPageSubmission; form: FormRecord; submitterLabel: string }[] = []
  // Sort copy; admin scale is small enough that a full sort is cheap.
  const sorted = [...allSubs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const sub of sorted) {
    if (out.length >= topN) break
    const form = formById.get(sub.form_id)
    if (!form) continue
    if (sub.created_at <= getEffectiveFormSeen(form.id)) continue
    const r = resolveSubmitter(
      { fields_json: form.fields_json },
      { responses_json: sub.responses_json, user_profiles: sub.user_profiles ?? null },
    )
    const submitterLabel = r.name ?? sub.user_profiles?.mother_name ?? r.phone ?? r.email ?? 'אנונימי'
    out.push({ sub, form, submitterLabel })
  }
  return out
}

function timeAgoHebrew(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'הרגע'
  if (min < 60) return `לפני ${min} דק'`
  const h = Math.floor(min / 60)
  if (h < 24) return `לפני ${h} שעות`
  const d = Math.floor(h / 24)
  if (d === 1) return 'אתמול'
  if (d < 30) return `לפני ${d} ימים`
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

// Polish #9: shared "מה חדש" strip rendered above the forms list on
// both mobile and desktop tabs. Renders nothing when there's nothing
// new — caller need not gate on it.
function FormsWhatsNewStrip({
  recentNew,
  onOpenForm,
  onMarkAllSeen,
}: {
  recentNew: { sub: FormsPageSubmission; form: FormRecord; submitterLabel: string }[]
  onOpenForm: (form: FormRecord) => void
  onMarkAllSeen: () => void
}) {
  if (recentNew.length === 0) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-amber-800">✨ מה חדש ({recentNew.length})</p>
        <button
          type="button"
          onClick={onMarkAllSeen}
          className="text-[13px] text-amber-700 hover:text-amber-900 underline"
          title="סימון כל ההגשות החדשות כנקראו"
        >
          סמני הכל כנקרא
        </button>
      </div>
      <ul className="space-y-1">
        {recentNew.map(({ sub, form, submitterLabel }) => (
          <li key={sub.id}>
            <button
              type="button"
              onClick={() => onOpenForm(form)}
              className="w-full text-right flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white hover:bg-amber-100/40 transition-colors"
            >
              <span className="text-[13px] flex-shrink-0 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold">חדש</span>
              <span className="text-xs font-semibold text-sand-800 truncate flex-1 min-w-0">{submitterLabel}</span>
              <span className="text-[13px] text-sand-500 truncate flex-shrink min-w-0">{form.title}</span>
              <span className="text-[13px] text-sand-400 flex-shrink-0">{timeAgoHebrew(sub.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Forms Helpers ────────────────────────────────────────────────────────────
function exportCSV(form: FormRecord, submissions: Submission[], filterQuestion: string | null) {
  const inputFields = form.fields_json.filter(f => f.type !== 'info' && f.type !== 'link')
  const cols = filterQuestion ? inputFields.filter(f => f.label === filterQuestion) : inputFields
  const rows = [
    ['תאריך', 'מגישה', ...cols.map(f => f.label)],
    ...submissions.map(s => {
      // Phase 5 / A4: resolved name beats the joined-profile fallback
      // so anonymous submissions still surface their real identity in
      // the CSV.
      const resolved = resolveSubmitter(
        { fields_json: form.fields_json },
        { responses_json: s.responses_json, user_profiles: s.user_profiles ?? null },
      )
      const submitter = resolved.name ?? resolved.phone ?? resolved.email ?? 'אנונימי'
      return [
        new Date(s.created_at).toLocaleDateString('he-IL'),
        submitter,
        ...cols.map(f => s.responses_json[f.label] ?? ''),
      ]
    }),
  ]
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${form.title}_submissions_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function FormAggregatePanel({ form, submissions, filterQuestion, setFilterQuestion }: {
  form: FormRecord
  submissions: Submission[]
  filterQuestion: string | null
  setFilterQuestion: (q: string | null) => void
}) {
  const inputFields = form.fields_json.filter(f => f.type !== 'info' && f.type !== 'link')
  const visible = filterQuestion ? inputFields.filter(f => f.label === filterQuestion) : inputFields

  // Phase 5 / A4 fix-3: each submission's resolved submitter (mother
  // name) so each text answer can be attributed. Computed once per
  // panel render; submissions are small (admin scale).
  const submitterNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of submissions) {
      const r = resolveSubmitter(
        { fields_json: form.fields_json },
        { responses_json: s.responses_json, user_profiles: s.user_profiles ?? null },
      )
      m.set(s.id, r.name ?? r.phone ?? 'אנונימי')
    }
    return m
  }, [form, submissions])

  return (
    <div className="space-y-3">
      <select value={filterQuestion ?? ''} onChange={e => setFilterQuestion(e.target.value || null)}
        className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white text-sand-800">
        <option value="">כל השאלות</option>
        {inputFields.map(f => <option key={f.id} value={f.label}>{f.label.length > 50 ? f.label.slice(0, 50) + '…' : f.label}</option>)}
      </select>
      {submissions.length === 0 && <p className="text-center text-sand-500 text-sm py-6">אין תשובות</p>}
      {visible.map(field => {
        // Phase 5 / A4 fix-3: pair each answer with its submission so
        // the text aggregate can show "who said what".
        const answeredSubs = submissions.filter(s => {
          const v = s.responses_json[field.label]
          return v !== undefined && v !== '' && v !== null
        })
        const answers = answeredSubs.map(s => String(s.responses_json[field.label]))

        if (field.type === 'rating') {
          const avg = answers.length > 0
            ? (answers.reduce((sum, a) => sum + Number(a), 0) / answers.length).toFixed(1)
            : '—'
          return (
            <div key={field.id} className="bg-white border border-sand-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-bold text-sand-800 mb-3 leading-snug">{field.label}</p>
              <div className="space-y-2">
                {[1,2,3,4,5].map(n => {
                  const count = answers.filter(a => a === String(n)).length
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-xs w-4 text-center font-semibold text-sand-700">{n}</span>
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#F1EBE1' }}>
                        <div className="h-full rounded-full" style={{ width: answers.length ? `${(count/answers.length)*100}%` : '0%', background: '#C8A460' }} />
                      </div>
                      <span className="text-xs text-sand-600 w-6 text-left font-semibold">{count}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-sand-500 mt-2.5">ממוצע: {avg} · {answers.length} תשובות</p>
            </div>
          )
        }
        if (field.type === 'select') {
          const counts = (field.options ?? []).map(opt => ({ opt, count: answers.filter(a => a === opt).length }))
          return (
            <div key={field.id} className="bg-white border border-sand-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-bold text-sand-800 mb-3 leading-snug">{field.label}</p>
              <div className="space-y-2">
                {counts.map(({ opt, count }) => (
                  <div key={opt}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-sand-700 truncate max-w-[75%]">{opt}</span>
                      <span className="text-xs font-bold text-sand-600">{count}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#F1EBE1' }}>
                      <div className="h-full rounded-full" style={{ width: answers.length ? `${(count/answers.length)*100}%` : '0%', background: '#C8A460' }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-sand-500 mt-2.5">{answers.length} תשובות</p>
            </div>
          )
        }
        // Text / textarea / date — show each answer with the resolved
        // submitter name (Phase 5 / A4 fix-3).
        return (
          <div key={field.id} className="bg-white border border-sand-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-bold text-sand-800 mb-3 leading-snug">
              {field.label}
              <span className="text-xs font-normal text-sand-500"> ({answers.length})</span>
            </p>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {answeredSubs.map((s) => {
                const submitter = submitterNameById.get(s.id) ?? 'אנונימי'
                const ans = String(s.responses_json[field.label])
                return (
                  <div key={s.id} className="border-b border-sand-100 pb-2 last:border-0 last:pb-0">
                    <p className="text-xs font-bold text-mustard-700 mb-0.5">{submitter}</p>
                    <p className="text-sm text-sand-800 leading-relaxed whitespace-pre-line break-words">
                      {ans}
                    </p>
                  </div>
                )
              })}
              {answers.length === 0 && <p className="text-sm text-sand-500">אין תשובות</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Forms Desktop Layout ─────────────────────────────────────────────────────
// Forms screen redesign: the response count IS the point of the screen.
// One folder-grouped list; clicking a form's count drills into its
// responses in place (breadcrumb, no top tabs). "חדשות" is DB-backed:
// form_submissions.read_at — a response is new until opened in the
// responses view.
function FormsTabDesktop() {
  const [forms, setForms] = useState<FormRecord[]>([])
  const [selected, setSelected] = useState<FormRecord | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null)
  const [assignForm, setAssignForm] = useState<FormRecord | null>(null)
  const [pendingDeleteForm, setPendingDeleteForm] = useState<FormRecord | null>(null)
  const [deletingFormBusy, setDeletingFormBusy] = useState(false)
  const [filterQuestion, setFilterQuestion] = useState<string | null>(null)
  // Drill-down view tab: פרטי (rows) / מצטבר (distribution).
  const [subsTab, setSubsTab] = useState<'list' | 'aggregate'>('list')
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set())
  function toggleFolder(f: string) {
    setClosedFolders(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [triggerType, setTriggerType] = useState('after_video_views')
  const [triggerCount, setTriggerCount] = useState('3')
  // Slim projection of every submission — counts, last-response dates
  // and the unread tally all derive from this one array.
  const [allSubmissions, setAllSubmissions] = useState<FormsPageSubmission[]>([])
  // Form linkage (§3): which product sends this form automatically.
  // linked_form_id = registration questionnaire; feedback_form_id =
  // anonymous feedback. A form in neither silently collects nothing —
  // that fault renders in clay on the row.
  const [linkage, setLinkage] = useState<Map<string, { kind: 'linked' | 'feedback'; title: string }>>(new Map())

  const load = useCallback(async () => {
    const [{ data: formsData }, { data: subsData }, { data: wsData }] = await Promise.all([
      supabase.from('forms').select('*').order('created_at', { ascending: false }),
      supabase
        .from('form_submissions')
        .select('id, form_id, user_id, responses_json, created_at, read_at, user_profiles(mother_name, email)'),
      supabase.from('workshops').select('id, title, linked_form_id, feedback_form_id'),
    ])
    setForms((formsData ?? []) as FormRecord[])
    setAllSubmissions((subsData ?? []) as unknown as FormsPageSubmission[])
    const link = new Map<string, { kind: 'linked' | 'feedback'; title: string }>()
    type WsLink = { id: string; title: string; linked_form_id: string | null; feedback_form_id: string | null }
    for (const w of (wsData ?? []) as WsLink[]) {
      if (w.feedback_form_id) link.set(w.feedback_form_id, { kind: 'feedback', title: w.title })
    }
    for (const w of (wsData ?? []) as WsLink[]) {
      if (w.linked_form_id) link.set(w.linked_form_id, { kind: 'linked', title: w.title })
    }
    setLinkage(link)
  }, [])
  useEffect(() => { load() }, [load])

  const submissionStats = useMemo(() => {
    const stats = new Map<string, { count: number; lastAt: string }>()
    for (const s of allSubmissions) {
      const cur = stats.get(s.form_id) ?? { count: 0, lastAt: '' }
      cur.count++
      if (s.created_at > cur.lastAt) cur.lastAt = s.created_at
      stats.set(s.form_id, cur)
    }
    return stats
  }, [allSubmissions])

  // §2: a response is new until opened — read_at IS NULL.
  const newCountByFormId = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of allSubmissions) {
      if (!s.read_at) m.set(s.form_id, (m.get(s.form_id) ?? 0) + 1)
    }
    return m
  }, [allSubmissions])

  async function loadSubmissions(form: FormRecord) {
    setSelected(form); setSubsTab('list'); setLoadingSubs(true); setFilterQuestion(null)
    const { data } = await supabase.from('form_submissions')
      .select('*, user_profiles(mother_name, email)').eq('form_id', form.id)
      .order('created_at', { ascending: false })
    setSubmissions((data ?? []) as Submission[])
    setLoadingSubs(false)
  }

  // §4: opening a response marks it read and decrements the form row's
  // חדשות count. The in-view "חדש" pill stays for the current visit
  // (submissions keeps the load-time read_at); the .is-null guard
  // keeps the first-read timestamp from being overwritten.
  const markSubmissionRead = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    setAllSubmissions(prev => prev.map(s => (s.id === id && !s.read_at) ? { ...s, read_at: now } : s))
    await supabase.from('form_submissions').update({ read_at: now }).eq('id', id).is('read_at', null)
  }, [])

  const refreshSelectedForm = useCallback(async () => {
    if (!selected) return
    const { data } = await supabase.from('forms').select('*').eq('id', selected.id).maybeSingle()
    if (data) setSelected(data as FormRecord)
    load()
  }, [selected, load])

  function copyFormLink(formId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/?form=${formId}`)
    setCopiedId(formId); setTimeout(() => setCopiedId(null), 2000)
  }

  async function toggleForm(form: FormRecord) {
    await supabase.from('forms').update({ is_active: !form.is_active }).eq('id', form.id); load()
  }

  function requestDeleteForm(form: FormRecord) {
    setPendingDeleteForm(form)
  }
  async function performDeleteForm() {
    if (!pendingDeleteForm) return
    setDeletingFormBusy(true)
    await supabase.from('forms').delete().eq('id', pendingDeleteForm.id)
    if (selected?.id === pendingDeleteForm.id) setSelected(null)
    if (editingForm?.id === pendingDeleteForm.id) { setEditingForm(null); setTitle(''); setDescription(''); setFolder(''); setFields([]) }
    setDeletingFormBusy(false)
    setPendingDeleteForm(null)
    load()
  }

  async function deleteSubmission(id: string) {
    await supabase.from('form_submissions').delete().eq('id', id)
    setSubmissions(s => s.filter(x => x.id !== id))
    setAllSubmissions(s => s.filter(x => x.id !== id))
  }

  function startEdit(form: FormRecord) {
    setEditingForm(form); setTitle(form.title); setDescription(form.description ?? '')
    setFolder(form.folder ?? ''); setFields(form.fields_json.map(f => ({ ...f })))
    setShowCreate(false)
  }

  const [focusFieldId, setFocusFieldId] = useState<string | null>(null)
  function addField() { setFields(f => [...f, { id: crypto.randomUUID(), type: 'text', label: '', required: false }]) }
  function insertFieldAt(idx: number) {
    const newId = crypto.randomUUID()
    setFields(f => { const arr = [...f]; arr.splice(idx, 0, { id: newId, type: 'text', label: '', required: false }); return arr })
    setFocusFieldId(newId)
  }
  useEffect(() => {
    if (!focusFieldId) return
    const el = document.querySelector(`[data-focusid="${focusFieldId}"]`) as HTMLTextAreaElement | null
    el?.focus(); setFocusFieldId(null)
  }, [focusFieldId, fields])
  function updateField(id: string, patch: Partial<FormField>) { setFields(f => f.map(field => field.id === id ? { ...field, ...patch } : field)) }
  function removeField(id: string) { setFields(f => f.filter(field => field.id !== id)) }
  function moveField(id: string, dir: -1 | 1) {
    setFields(f => {
      const idx = f.findIndex(field => field.id === id); if (idx < 0) return f
      const next = idx + dir; if (next < 0 || next >= f.length) return f
      const arr = [...f]; [arr[idx], arr[next]] = [arr[next], arr[idx]]; return arr
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields(f => {
      const oldIdx = f.findIndex(fi => fi.id === active.id)
      const newIdx = f.findIndex(fi => fi.id === over.id)
      return arrayMove(f, oldIdx, newIdx)
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

  const isDirty = useMemo(() => {
    if (!editingForm) return title.trim().length > 0 || fields.length > 0
    return (
      title !== editingForm.title ||
      description !== (editingForm.description ?? '') ||
      folder !== (editingForm.folder ?? '') ||
      JSON.stringify(fields) !== JSON.stringify(editingForm.fields_json)
    )
  }, [editingForm, title, description, folder, fields])

  const saveFormRef = useRef(saveForm)
  useEffect(() => { saveFormRef.current = saveForm })
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && (showCreate || editingForm)) {
        e.preventDefault()
        saveFormRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCreate, editingForm])

  const fieldTypes = [
    { value: 'text', label: 'שדה טקסט' }, { value: 'textarea', label: 'טקסט ארוך' },
    { value: 'select', label: 'בחירה מרשימה' }, { value: 'rating', label: 'דירוג 1-5' },
    { value: 'date', label: '📅 תאריך' },
    { value: 'info', label: '📋 בלוק טקסט' }, { value: 'link', label: '🔗 לינק' },
  ]

  // §3: the linkage line that replaces the description preview.
  function LinkageLine({ form }: { form: FormRecord }) {
    const link = linkage.get(form.id)
    if (link?.kind === 'linked') {
      return <p className="truncate" style={{ fontWeight: 600, fontSize: 12.5, color: '#A2937D' }}>מקושר · {link.title}</p>
    }
    if (link?.kind === 'feedback') {
      return <p className="truncate" style={{ fontWeight: 600, fontSize: 12.5, color: '#A2937D' }}>משוב אנונימי · {link.title}</p>
    }
    return <p style={{ fontWeight: 800, fontSize: 12.5, color: '#8B4A30' }}>לא מקושר למוצר</p>
  }

  // ── §4: drill-down — the form's responses in place, with breadcrumb ─
  if (selected) {
    const stat = submissionStats.get(selected.id)
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setSelected(null); setSubmissions([]) }}
            className="hover:underline whitespace-nowrap"
            style={{ fontWeight: 700, fontSize: 14, color: '#A35C3D' }}
            aria-label="חזרה לרשימת הטפסים"
          >
            שאלונים וטפסים
          </button>
          <span style={{ color: '#A2937D' }}>›</span>
          <div className="min-w-0">
            <h2 className="truncate" style={{ fontWeight: 700, fontSize: 16, color: '#3D2E20' }}>{selected.title}</h2>
            <LinkageLine form={selected} />
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginInlineStart: 'auto' }}>
            <div className="inline-flex items-center" style={{ background: '#F1EBE1', borderRadius: 12, padding: 3 }}>
              {([['list', 'פרטי'], ['aggregate', 'מצטבר']] as ['list' | 'aggregate', string][]).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSubsTab(v)}
                  style={subsTab === v
                    ? { background: '#FFF', color: '#3D2E20', fontWeight: 700, fontSize: 13.5, borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,.06)', padding: '6px 16px' }
                    : { color: '#8A7A63', fontWeight: 600, fontSize: 13.5, padding: '6px 16px' }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportCSV(selected, submissions, filterQuestion)}
              className="rounded-xl whitespace-nowrap transition-colors hover:bg-[#EDE6DA]"
              style={{ background: '#F5F2EA', color: '#5E4938', fontWeight: 700, fontSize: 12.5, padding: '8px 14px' }}
            >
              ייצוא CSV
            </button>
          </div>
        </div>

        <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 18, padding: 18 }}>
          {loadingSubs ? (
            <p className="text-center py-10" style={{ fontWeight: 600, fontSize: 14, color: '#A2937D' }}>טוענת תשובות...</p>
          ) : subsTab === 'list' ? (
            <FormSubmissionsView
              form={selected}
              submissions={submissions}
              onDeleteSubmission={deleteSubmission}
              onFormSaved={refreshSelectedForm}
              isNewSubmission={s => !(s as Submission & { read_at?: string | null }).read_at}
              onSubmissionOpened={s => markSubmissionRead(s.id)}
            />
          ) : (
            <FormAggregatePanel
              form={selected}
              submissions={submissions}
              filterQuestion={filterQuestion}
              setFilterQuestion={setFilterQuestion}
            />
          )}
          {!loadingSubs && stat && stat.count > 0 && subsTab === 'list' && (
            <p className="pt-3" style={{ fontWeight: 600, fontSize: 12.5, color: '#A2937D' }}>
              {stat.count === 1 ? 'תשובה אחת' : `${stat.count} תשובות`} · אחרונה {new Date(stat.lastAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
            </p>
          )}
        </div>

        {assignForm && <AssignFormModal form={assignForm} onClose={() => setAssignForm(null)} />}
        <ConfirmDialog
          open={!!pendingDeleteForm}
          itemName={pendingDeleteForm?.title ?? 'הטופס'}
          title="מחיקת טופס"
          busy={deletingFormBusy}
          onConfirm={performDeleteForm}
          onClose={() => setPendingDeleteForm(null)}
        />
      </div>
    )
  }

  // ── The list — folders › rows, the count as the main element ──
  return (
    <div className="space-y-4" dir="rtl">
      <button
        onClick={() => { setShowCreate(!showCreate); setEditingForm(null) }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all hover:shadow-sm"
        style={{ background: '#C8A460', color: '#33281B', fontSize: 14 }}
      >
        <Plus className="w-4 h-4" /> טופס חדש
      </button>

      {/* Create / Edit form panel (the builder — logic untouched) */}
      {(showCreate || editingForm) && (
        <div className="bg-white rounded-2xl shadow-sm" style={{ border: '1px solid #E9E2D6' }}>
          <div className="sticky top-0 z-10 bg-white px-5 py-3 flex items-center justify-between rounded-t-2xl shadow-sm" style={{ borderBottom: '1px solid #F1EBE1' }}>
            <p className="text-xs font-bold truncate max-w-[240px]" style={{ color: '#8A7A63' }}>
              {editingForm ? <><Pencil className="w-4 h-4 inline-block ml-1" />{editingForm.title}</> : 'טופס חדש'}
            </p>
            <div className="flex gap-2 items-center flex-shrink-0">
              {editingForm && (
                <button
                  onClick={() => requestDeleteForm(editingForm)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold hover:underline"
                  style={{ color: '#8B4A30' }}
                >
                  מחיקת הטופס
                </button>
              )}
              {isDirty && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#C8A460' }} title="שינויים לא שמורים" />}
              <button
                onClick={saveForm}
                disabled={saving || !title.trim() || fields.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
                style={{ background: isDirty ? '#C8A460' : '#F1EBE1', color: isDirty ? '#33281B' : '#8A7A63' }}
                title="Ctrl/Cmd+S"
              >
                {saving ? '...' : 'שמור'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditingForm(null); setTitle(''); setDescription(''); setFolder(''); setFields([]) }} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: '#F5F2EA', color: '#5E4938' }}>ביטול</button>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הטופס" className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור (אופציונלי)" rows={3} className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none leading-relaxed" />
            <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="📁 תיקייה" className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
            {!editingForm && (
              <div className="flex gap-2">
                <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="flex-1 px-3 py-2 border border-sand-200 rounded-xl text-sm bg-white focus:outline-none">
                  <option value="after_video_views">אחרי X צפיות</option>
                  <option value="after_days">אחרי X ימים</option>
                  <option value="manual">ידני</option>
                </select>
                <input type="number" value={triggerCount} onChange={e => setTriggerCount(e.target.value)} className="w-16 px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none" min="1" />
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {fields.map((field, idx) => (
                    <SortableRow key={field.id} id={field.id}>
                      {(dragHandle) => (
                        <div>
                          <button onClick={() => insertFieldAt(idx)} className="group w-full flex items-center gap-2 py-1 mb-1 opacity-30 hover:opacity-100 transition-opacity">
                            <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                            <span className="text-[13px] font-bold text-sand-400 group-hover:text-mustard-600 transition-colors px-1">+ הוסף כאן</span>
                            <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                          </button>

                          <div className="border border-sand-200 rounded-xl p-3 space-y-2 mb-0">
                            <div className="flex gap-2 items-center">
                              <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })} className="flex-1 px-3 py-1.5 border border-sand-200 rounded-lg text-xs bg-white focus:outline-none">
                                {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                              {dragHandle}
                              <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} className="p-1 text-sand-400 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1} className="p-1 text-sand-400 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                              <button onClick={() => removeField(field.id)} className="p-1" style={{ color: '#8B4A30' }}><X className="w-3.5 h-3.5" /></button>
                            </div>
                            {field.type !== 'link' && (
                              <textarea data-focusid={field.id} value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="שאלה / תווית" rows={2} className="w-full px-3 py-1.5 border border-sand-200 rounded-lg text-xs focus:outline-none resize-none leading-relaxed" />
                            )}
                            {field.type === 'select' && <OptionsTagInput options={field.options ?? []} onChange={opts => updateField(field.id, { options: opts })} />}
                            {field.type === 'link' && <input value={field.options?.[0] ?? ''} onChange={e => updateField(field.id, { options: [e.target.value] })} placeholder="https://..." className="w-full px-3 py-1.5 border border-sand-200 rounded-lg text-xs focus:outline-none" dir="ltr" />}
                            {!['info', 'link'].includes(field.type) && (
                              <label className="flex items-center gap-2 text-xs text-sand-500 cursor-pointer">
                                <input type="checkbox" checked={field.required ?? false} onChange={e => updateField(field.id, { required: e.target.checked })} />
                                חובה
                              </label>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableRow>
                  ))}
                  {fields.length > 0 && (
                    <button onClick={() => insertFieldAt(fields.length)} className="group w-full flex items-center gap-2 py-1 my-1 opacity-30 hover:opacity-100 transition-opacity">
                      <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                      <span className="text-[13px] font-bold text-sand-400 group-hover:text-mustard-600 transition-colors px-1">+ הוסף כאן</span>
                      <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                    </button>
                  )}
                  <button onClick={addField} className="w-full py-2 border-2 border-dashed border-sand-200 rounded-xl text-xs text-sand-400 hover:border-mustard-400 hover:text-mustard-600 transition-colors mt-1">
                    + הוסף שאלה
                  </button>
                </div>
              </SortableContext>
            </DndContext>
            <div className="flex gap-2 pt-1">
              <button onClick={saveForm} disabled={saving || !title.trim() || fields.length === 0} className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: '#C8A460', color: '#33281B' }}>
                {saving ? '...' : 'שמור טופס'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditingForm(null); setTitle(''); setDescription(''); setFolder(''); setFields([]) }} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: '#F5F2EA', color: '#5E4938' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* The folder-grouped list. Row (§3):
          [title + linkage, flex] [count button] [last, 96px] [state, 52px] [actions] */}
      <div className="bg-white overflow-hidden" style={{ border: '1px solid #E9E2D6', borderRadius: 18 }}>
        {(() => {
          const folderMap = new Map<string, FormRecord[]>()
          forms.forEach(f => {
            const key = f.folder ?? ''
            if (!folderMap.has(key)) folderMap.set(key, [])
            folderMap.get(key)!.push(f)
          })
          const folders = Array.from(folderMap.entries())
            .filter(([, ff]) => ff.length > 0)
            .sort(([a], [b]) => {
              if (a === '') return 1
              if (b === '') return -1
              return a.localeCompare(b, 'he')
            })
          return folders.map(([folderName, folderForms]) => {
            const isOpen = !closedFolders.has(folderName)
            return (
              <div key={folderName || '__none__'}>
                <button
                  onClick={() => toggleFolder(folderName)}
                  className="w-full flex items-baseline gap-2 text-right"
                  style={{ background: '#FBF9F5', borderBottom: '1px solid #F1EBE1', padding: '9px 18px' }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#5E4938' }}>{folderName || 'ללא תיקייה'}</span>
                  <span style={{ fontWeight: 600, fontSize: 12.5, color: '#A2937D' }}>
                    {folderForms.length === 1 ? 'טופס אחד' : `${folderForms.length} טפסים`}
                  </span>
                </button>
                {isOpen && folderForms.map(f => {
                  const stat = submissionStats.get(f.id)
                  const count = stat?.count ?? 0
                  const newCount = newCountByFormId.get(f.id) ?? 0
                  return (
                    <div key={f.id} className="flex items-center" style={{ padding: '13px 18px', gap: 18, borderBottom: '1px solid #F4EEE4' }}>
                      {/* Title + linkage */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate" style={{ fontWeight: 700, fontSize: 14.5, color: f.is_active ? '#3D2E20' : '#8A7A63' }}>{f.title}</p>
                        <LinkageLine form={f} />
                      </div>
                      {/* §2: the count is the point — largest element, the click target */}
                      <button
                        onClick={() => count > 0 && loadSubmissions(f)}
                        disabled={count === 0}
                        className={`flex items-center gap-1.5 flex-shrink-0 ${count > 0 ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                        title={count > 0 ? 'פתיחת התשובות' : undefined}
                      >
                        <span className="font-display" style={{ fontSize: 21, color: count > 0 ? '#443327' : '#B6A891', lineHeight: 1 }}>{count}</span>
                        <span style={{ fontWeight: 600, fontSize: 12.5, color: '#8A7A63' }}>{count === 1 ? 'תשובה' : 'תשובות'}</span>
                        {newCount > 0 && (
                          <span className="whitespace-nowrap" style={{ fontWeight: 700, fontSize: 12, color: '#8B4A30', background: '#F7EBE4', padding: '3px 9px', borderRadius: 9999 }}>
                            {newCount === 1 ? 'אחת חדשה' : `${newCount} חדשות`}
                          </span>
                        )}
                      </button>
                      {/* Last response */}
                      <span className="flex-shrink-0 whitespace-nowrap hidden sm:block" style={{ width: 96, fontWeight: 600, fontSize: 12.5, color: '#A2937D' }}>
                        {stat && stat.count > 0
                          ? `אחרונה ${new Date(stat.lastAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`
                          : 'אין תשובות'}
                      </span>
                      {/* State — text, not a pill */}
                      <button
                        onClick={() => toggleForm(f)}
                        className="flex-shrink-0 hover:underline"
                        style={{ width: 52, fontWeight: 700, fontSize: 12.5, color: f.is_active ? '#4F5040' : '#A2937D', textAlign: 'right' }}
                        title={f.is_active ? 'לחיצה מכבה את הטופס' : 'לחיצה מפעילה את הטופס'}
                      >
                        {f.is_active ? 'פעיל' : 'כבוי'}
                      </button>
                      {/* Actions — always visible, never hover-gated */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => startEdit(f)}
                          className="rounded-lg whitespace-nowrap transition-colors hover:bg-[#EDE6DA]"
                          style={{ background: '#F5F2EA', color: '#5E4938', fontWeight: 700, fontSize: 12.5, padding: '6px 12px' }}
                        >
                          עריכה
                        </button>
                        <button
                          onClick={() => copyFormLink(f.id)}
                          className="rounded-lg whitespace-nowrap transition-colors hover:bg-[#E2E9EC]"
                          style={{ background: '#EEF2F4', color: '#35505C', fontWeight: 700, fontSize: 12.5, padding: '6px 12px' }}
                          title="העתקת הקישור הציבורי"
                        >
                          {copiedId === f.id ? '✓ הועתק' : 'קישור'}
                        </button>
                        <button
                          onClick={() => setAssignForm(f)}
                          className="rounded-lg whitespace-nowrap transition-colors hover:bg-[#EDE6DA]"
                          style={{ background: '#F5F2EA', color: '#5E4938', fontWeight: 700, fontSize: 12.5, padding: '6px 12px' }}
                        >
                          שיוך
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        })()}
        {forms.length === 0 && <p className="text-center py-12" style={{ fontWeight: 600, fontSize: 14, color: '#A2937D' }}>אין טפסים</p>}
      </div>

      {assignForm && <AssignFormModal form={assignForm} onClose={() => setAssignForm(null)} />}
      <ConfirmDialog
        open={!!pendingDeleteForm}
        itemName={pendingDeleteForm?.title ?? 'הטופס'}
        title="מחיקת טופס"
        busy={deletingFormBusy}
        onConfirm={performDeleteForm}
        onClose={() => setPendingDeleteForm(null)}
      />
    </div>
  )
}

// ─── Insights Tab ─────────────────────────────────────────────────────────────
// Screen B: the tab measures the app as it is NOW — commerce (registrations,
// payments, cohort fill), community (real attendance, measurable since vendor
// check-in shipped), the lead pipeline (lead_stage + lost reasons), and only
// then app usage. Reader-of-views: v_registration_funnel / v_cohort_fill /
// v_event_attendance / v_lead_outcomes + the existing v_video_performance /
// v_retention_cohort.

type VideoPerf = { title: string; total_views: number; completions: number; completion_pct: number }
type RetentionRow = { cohort_week: string; total_users: number; day1: number; day3: number; day7: number }
type FunnelRow = { store_views: number; forms_filled: number; registered: number; paid: number; attended: number }
type CohortFillRow = { cohort_id: string; workshop_title: string; capacity: number | null; registered: number }
type EventAttRow = { past_registered: number; past_attended: number; past_no_show: number; events_this_month: number; events_no_vendor: number; events_no_checkin: number }
type LeadOutRow = { total_leads: number; stage_new: number; stage_contacted: number; stage_registered: number; stage_paid: number; stage_lost: number; open_unanswered_48h: number; avg_days_to_close: number | null }
type InsightsLeadRow = { id: string; status: 'pending' | 'paid' | 'handled'; created_at: string; selected_workshop_id: string | null }
type InsightsUserRow = { id: string; created_at: string; last_active: string | null; lead_stage: string | null; lost_reason: string | null; is_admin: boolean | null }

// B2: rates get a colour + a 5px fill track; plain counts do not.
function rateColor(p: number): string {
  if (p >= 70) return '#4F5040'
  if (p >= 40) return '#7A5C1F'
  return '#8B4A30'
}

export const LOST_REASON_LABELS: Record<string, string> = {
  no_response: 'לא ענתה',
  price: 'המחיר גבוה',
  timing: 'התזמון לא התאים',
  chose_other: 'בחרה מקום אחר',
  not_relevant: 'לא רלוונטי',
  other: 'אחר',
}

function KpiCard({ label, value, sub, subColor, ratePct }: {
  label: string
  value: string
  sub?: string | null
  subColor?: string
  /** When set, the value is a rate: colour it by threshold + render the
   *  5px fill track. Never set for plain counts (₪4,180, 21, 148). */
  ratePct?: number | null
}) {
  const valueColor = ratePct != null ? rateColor(ratePct) : '#443327'
  return (
    <div className="bg-white text-right" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: '14px 16px' }}>
      <p style={{ fontWeight: 700, fontSize: 12.5, color: '#8A7A63' }}>{label}</p>
      <p className="font-display" style={{ fontSize: 26, color: valueColor, marginTop: 2 }}>{value}</p>
      {ratePct != null && (
        <div style={{ height: 5, background: '#F1EBE1', borderRadius: 9999, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, ratePct))}%`, background: valueColor, borderRadius: 9999 }} />
        </div>
      )}
      {sub && <p style={{ fontWeight: 600, fontSize: 12.5, color: subColor ?? '#A2937D', marginTop: 6 }}>{sub}</p>}
    </div>
  )
}

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="font-display" style={{ fontSize: 17, color: '#443327' }}>{title}</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))' }}>
        {children}
      </div>
    </div>
  )
}

function InsightsTab() {
  const [funnel, setFunnel] = useState<FunnelRow | null>(null)
  const [cohortFill, setCohortFill] = useState<CohortFillRow[]>([])
  const [eventAtt, setEventAtt] = useState<EventAttRow | null>(null)
  const [leadOut, setLeadOut] = useState<LeadOutRow | null>(null)
  const [videoPerf, setVideoPerf] = useState<VideoPerf[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [regLeads, setRegLeads] = useState<InsightsLeadRow[]>([])
  const [workshopPrices, setWorkshopPrices] = useState<Map<string, number>>(new Map())
  const [partnerLeadDates, setPartnerLeadDates] = useState<string[]>([])
  const [users, setUsers] = useState<InsightsUserRow[]>([])
  const [journalCount, setJournalCount] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('v_registration_funnel').select('*').limit(1),
      supabase.from('v_cohort_fill').select('*'),
      supabase.from('v_event_attendance').select('*').limit(1),
      supabase.from('v_lead_outcomes').select('*').limit(1),
      supabase.from('v_video_performance').select('*').limit(10),
      supabase.from('v_retention_cohort').select('*').limit(8),
      supabase.from('registration_leads').select('id, status, created_at, selected_workshop_id'),
      supabase.from('workshops').select('id, price'),
      supabase.from('partner_leads').select('created_at'),
      supabase.from('user_profiles').select('id, created_at, last_active, lead_stage, lost_reason, is_admin'),
      supabase.from('daily_log_entries').select('id', { count: 'exact', head: true }),
    ]).then(([f, cf, ea, lo, vids, ret, rl, ws, pl, up, logs]) => {
      setFunnel((f.data?.[0] ?? null) as FunnelRow | null)
      setCohortFill((cf.data ?? []) as CohortFillRow[])
      setEventAtt((ea.data?.[0] ?? null) as EventAttRow | null)
      setLeadOut((lo.data?.[0] ?? null) as LeadOutRow | null)
      setVideoPerf(((vids.data ?? []) as VideoPerf[]).map(v => ({ ...v, title: v.title.slice(0, 20) })))
      setRetention((ret.data ?? []) as RetentionRow[])
      setRegLeads((rl.data ?? []) as InsightsLeadRow[])
      setWorkshopPrices(new Map(((ws.data ?? []) as { id: string; price: number | null }[]).map(w => [w.id, w.price ?? 0])))
      setPartnerLeadDates(((pl.data ?? []) as { created_at: string }[]).map(x => x.created_at))
      setUsers((up.data ?? []) as InsightsUserRow[])
      setJournalCount(logs.count ?? 0)
    })
  }, [])

  // ── כסף והרשמות ────────────────────────────────────────────────────
  const money = useMemo(() => {
    const now = new Date()
    const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const thisMonth = ym(now)
    const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    let regsThis = 0, regsLast = 0, revenueThis = 0
    for (const l of regLeads) {
      const m = l.created_at.slice(0, 7)
      if (m === thisMonth) {
        regsThis++
        if (l.status === 'paid' || l.status === 'handled') {
          revenueThis += l.selected_workshop_id ? (workshopPrices.get(l.selected_workshop_id) ?? 0) : 0
        }
      } else if (m === lastMonth) {
        regsLast++
      }
    }
    const total = regLeads.length
    const paid = regLeads.filter(l => l.status === 'paid' || l.status === 'handled').length
    const conversion = total > 0 ? Math.round((paid / total) * 100) : null
    const withCap = cohortFill.filter(c => c.capacity != null)
    const capSum = withCap.reduce((s, c) => s + (c.capacity ?? 0), 0)
    const regSum = withCap.reduce((s, c) => s + c.registered, 0)
    const occupancy = capSum > 0 ? Math.round((regSum / capSum) * 100) : null
    return { regsThis, regsLast, revenueThis, total, paid, conversion, capSum, regSum, occupancy, openCohorts: cohortFill.length }
  }, [regLeads, workshopPrices, cohortFill])

  // ── קהילה ואירועים ─────────────────────────────────────────────────
  const community = useMemo(() => {
    const attendance = eventAtt && eventAtt.past_registered > 0
      ? Math.round((eventAtt.past_attended / eventAtt.past_registered) * 100)
      : null
    const now = Date.now()
    const last30 = partnerLeadDates.filter(d => now - new Date(d).getTime() < 30 * 86400_000).length
    const newest = partnerLeadDates.length > 0
      ? Math.floor((now - Math.max(...partnerLeadDates.map(d => new Date(d).getTime()))) / 86400_000)
      : null
    return { attendance, partnerTotal: partnerLeadDates.length, partnerLast30: last30, newestAgeDays: newest }
  }, [eventAtt, partnerLeadDates])

  // ── לידים וסגירה (B6: the denominator is DECIDED leads only) ───────
  const leadsKpi = useMemo(() => {
    if (!leadOut) return null
    const decided = leadOut.stage_paid + leadOut.stage_lost
    const closeRate = decided > 0 ? Math.round((leadOut.stage_paid / decided) * 100) : null
    const open = leadOut.stage_new + leadOut.stage_contacted + leadOut.stage_registered
    return { ...leadOut, decided, closeRate, open }
  }, [leadOut])

  // ── B5-3: lost reasons — same source as the לידים שאבדו KPI, so the
  //    bars sum to it exactly ──────────────────────────────────────────
  const lostReasons = useMemo(() => {
    const counts = new Map<string, number>()
    for (const u of users) {
      if (u.is_admin || u.lead_stage !== 'lost') continue
      const key = u.lost_reason ?? 'none'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  }, [users])

  // ── שימוש באפליקציה ────────────────────────────────────────────────
  const usage = useMemo(() => {
    const nonAdmin = users.filter(u => !u.is_admin)
    const now = Date.now()
    const active7 = nonAdmin.filter(u => u.last_active && now - new Date(u.last_active).getTime() < 7 * 86400_000).length
    const newThisMonth = nonAdmin.filter(u => u.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length
    const latestRet = retention[0] ?? null
    const day7 = latestRet && latestRet.total_users > 0 ? Math.round((latestRet.day7 / latestRet.total_users) * 100) : null
    return { total: nonAdmin.length, active7, newThisMonth, day7 }
  }, [users, retention])

  const retentionChart = retention.map(r => ({
    week: r.cohort_week?.slice(5, 10) ?? '',
    'יום 1': r.total_users ? Math.round((r.day1 / r.total_users) * 100) : 0,
    'יום 3': r.total_users ? Math.round((r.day3 / r.total_users) * 100) : 0,
    'יום 7': r.total_users ? Math.round((r.day7 / r.total_users) * 100) : 0,
  }))

  return (
    <div className="space-y-6">
      {/* ── B1-1: כסף והרשמות ── */}
      <KpiGroup title="כסף והרשמות">
        <KpiCard
          label="הרשמות החודש"
          value={String(money.regsThis)}
          sub={money.regsLast > 0 || money.regsThis > 0
            ? `${money.regsLast} בחודש שעבר`
            : 'אין עדיין הרשמות'}
          subColor={money.regsThis > money.regsLast ? '#4F5040' : money.regsThis < money.regsLast ? '#8B4A30' : '#A2937D'}
        />
        <KpiCard
          label="המרה לתשלום"
          value={money.conversion != null ? `${money.conversion}%` : '—'}
          ratePct={money.conversion}
          sub={money.total > 0 ? `${money.paid} מתוך ${money.total} הרשמות` : 'אין עדיין הרשמות'}
        />
        <KpiCard
          label="הכנסה משוערת החודש"
          value={`₪${money.revenueThis.toLocaleString()}`}
          sub="לפי מחיר המוצר"
        />
        <KpiCard
          label="תפוסת מחזורים פתוחים"
          value={money.occupancy != null ? `${money.occupancy}%` : '—'}
          ratePct={money.occupancy}
          sub={money.capSum > 0
            ? `${money.regSum} מתוך ${money.capSum} מקומות ב-${money.openCohorts === 1 ? 'מחזור אחד' : `${money.openCohorts} מחזורים`}`
            : 'אין מחזורים פתוחים עם תפוסה מוגדרת'}
        />
      </KpiGroup>

      {/* ── B1-2: קהילה ואירועים ── */}
      <KpiGroup title="קהילה ואירועים">
        <KpiCard
          label="הגעה בפועל לאירועים"
          value={community.attendance != null ? `${community.attendance}%` : '—'}
          ratePct={community.attendance}
          sub={eventAtt && eventAtt.past_registered > 0
            ? `${eventAtt.past_attended} הגיעו מתוך ${eventAtt.past_registered} שנרשמו`
            : 'ימדד אחרי האירוע הראשון עם צ׳ק-אין'}
        />
        <KpiCard
          label="לידים לספקים (30 יום)"
          value={String(community.partnerLast30)}
          sub={community.partnerTotal > 0
            ? `סה"כ ${community.partnerTotal}${community.newestAgeDays != null ? ` · האחרון לפני ${community.newestAgeDays === 0 ? 'פחות מיום' : `${community.newestAgeDays} ימים`}` : ''}`
            : 'אין עדיין לידים לספקים'}
        />
        <KpiCard
          label="אירועים החודש"
          value={String(eventAtt?.events_this_month ?? 0)}
          sub={eventAtt && eventAtt.events_this_month > 0
            ? (eventAtt.events_no_vendor > 0 || eventAtt.events_no_checkin > 0
              ? `${eventAtt.events_no_vendor} בלי ספק · ${eventAtt.events_no_checkin} בלי קישור צ׳ק-אין`
              : 'לכולם ספק וקישור צ׳ק-אין')
            : 'אין אירועים החודש'}
          subColor={eventAtt && eventAtt.events_this_month > 0 && (eventAtt.events_no_vendor > 0 || eventAtt.events_no_checkin > 0) ? '#8B4A30' : eventAtt && eventAtt.events_this_month > 0 ? '#4F5040' : '#A2937D'}
        />
      </KpiGroup>

      {/* ── B1-3: לידים וסגירה ── */}
      <KpiGroup title="לידים וסגירה">
        <KpiCard
          label="אחוז סגירה"
          value={leadsKpi?.closeRate != null ? `${leadsKpi.closeRate}%` : '—'}
          ratePct={leadsKpi?.closeRate ?? null}
          sub={leadsKpi && leadsKpi.decided > 0
            ? `${leadsKpi.stage_paid} מתוך ${leadsKpi.decided} לידים שהוכרעו`
            : 'אין עדיין לידים שהוכרעו (שולם / אבד)'}
        />
        <KpiCard
          label="זמן ממוצע לסגירה"
          value={leadsKpi?.avg_days_to_close != null ? `${leadsKpi.avg_days_to_close} ימים` : '—'}
          sub={leadsKpi?.avg_days_to_close != null ? 'מליד חדש עד תשלום' : 'ימדד מהסגירה הראשונה'}
        />
        <KpiCard
          label="לידים שאבדו"
          value={String(leadsKpi?.stage_lost ?? 0)}
          sub={leadsKpi && leadsKpi.total_leads > 0 ? `מתוך ${leadsKpi.total_leads} לידים` : null}
        />
        <KpiCard
          label="פתוחים ללא מענה 48 שעות"
          value={String(leadsKpi?.open_unanswered_48h ?? 0)}
          sub={leadsKpi && leadsKpi.open_unanswered_48h > 0 ? 'שוות פנייה היום' : 'אין לידים שמחכים'}
          subColor={leadsKpi && leadsKpi.open_unanswered_48h > 0 ? '#8B4A30' : '#4F5040'}
        />
      </KpiGroup>

      {/* ── B5-1: המסע לסדנה ── */}
      {funnel && <FunnelBlock funnel={funnel} />}

      {/* ── B5-2: צנרת הלידים ── */}
      {leadsKpi && <PipelineBlock leads={leadsKpi} />}

      {/* ── B5-3: למה לידים לא נסגרו ── */}
      <LostReasonsBlock reasons={lostReasons} totalLost={leadsKpi?.stage_lost ?? 0} />

      {/* ── B1-4: שימוש באפליקציה (existing — demoted to last) ── */}
      <KpiGroup title="שימוש באפליקציה">
        <KpiCard
          label="משתמשות פעילות (7 ימים)"
          value={String(usage.active7)}
          sub={`מתוך ${usage.total} רשומות`}
        />
        <KpiCard
          label="הצטרפו החודש"
          value={String(usage.newThisMonth)}
        />
        <KpiCard
          label="רשומות יומן"
          value={String(journalCount)}
        />
        <KpiCard
          label="Retention יום 7 (שבוע אחרון)"
          value={usage.day7 != null ? `${usage.day7}%` : '—'}
          ratePct={usage.day7}
        />
      </KpiGroup>

      {retentionChart.length > 0 && (
        <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: 18 }}>
          <h3 className="font-display" style={{ fontSize: 16, color: '#443327', marginBottom: 12 }}>Retention (%) לפי שבוע הצטרפות</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={retentionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1EBE1" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#8A7A63' }} />
              <YAxis unit="%" tick={{ fontSize: 10, fill: '#8A7A63' }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="יום 1" stroke="#C8A460" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 3" stroke="#35505C" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 7" stroke="#4F5040" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {videoPerf.length > 0 && (
        <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: 18 }}>
          <h3 className="font-display" style={{ fontSize: 16, color: '#443327', marginBottom: 12 }}>ביצועי סרטונים</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, videoPerf.length * 34)}>
            <BarChart data={videoPerf} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#8A7A63' }} />
              <YAxis dataKey="title" type="category" width={110} tick={{ fontSize: 10, fill: '#5E4938' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total_views" name="צפיות" fill="#C8A460" radius={[0, 4, 4, 0]} />
              <Bar dataKey="completions" name="השלמות" fill="#35505C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── B5-1: one funnel crossing screens ──────────────────────────────
function FunnelBlock({ funnel }: { funnel: FunnelRow }) {
  const steps = [
    { key: 'store', label: 'צפו בחנות', value: funnel.store_views },
    { key: 'form', label: 'מילאו שאלון', value: funnel.forms_filled },
    { key: 'reg', label: 'נרשמו', value: funnel.registered },
    { key: 'paid', label: 'שילמו', value: funnel.paid },
    { key: 'att', label: 'השתתפו', value: funnel.attended },
  ]
  const max = Math.max(1, ...steps.map(s => s.value))
  return (
    <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: 18 }}>
      <h3 className="font-display" style={{ fontSize: 16, color: '#443327' }}>המסע לסדנה</h3>
      <div className="space-y-2.5" style={{ marginTop: 14 }}>
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null
          // The drop between steps; clay when a step loses ≥50%. A step
          // larger than its predecessor is stated, not hidden (B6) —
          // the store counter started later than the historical data.
          let dropText = ''
          let dropColor = '#A2937D'
          if (prev != null && prev > 0 && s.value <= prev) {
            const lossPct = Math.round(((prev - s.value) / prev) * 100)
            dropText = lossPct === 0 ? 'ללא נשירה' : `‎-${lossPct}%`
            if (lossPct >= 50) dropColor = '#8B4A30'
          } else if (prev != null && s.value > prev) {
            dropText = 'מעל הצעד הקודם — מדידת החנות התחילה מאוחר'
          }
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="flex-shrink-0" style={{ width: 96, fontWeight: 700, fontSize: 13.5, color: '#5E4938' }}>{s.label}</span>
              <div className="flex-1" style={{ height: 26, background: '#F1EBE1', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.value / max) * 100}%`, background: '#C8A460', borderRadius: 8, minWidth: s.value > 0 ? 4 : 0 }} />
              </div>
              <span className="font-display flex-shrink-0" style={{ width: 40, fontSize: 16, color: '#443327' }}>{s.value}</span>
              <span className="flex-shrink-0 hidden md:block" style={{ width: 210, fontWeight: 700, fontSize: 12, color: dropColor }}>{dropText}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── B5-2: the pipeline — B6: the header states the full breakdown ──
function PipelineBlock({ leads }: { leads: LeadOutRow & { decided: number; closeRate: number | null; open: number } }) {
  const boxes = [
    { label: 'חדשות', value: leads.stage_new },
    { label: 'נוצר קשר', value: leads.stage_contacted },
    { label: 'נרשמו', value: leads.stage_registered },
    { label: 'שילמו', value: leads.stage_paid },
  ]
  return (
    <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: 18 }}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="font-display" style={{ fontSize: 16, color: '#443327' }}>צנרת הלידים</h3>
        <span style={{ fontWeight: 600, fontSize: 12.5, color: '#8A7A63' }}>
          {leads.total_leads === 1 ? 'ליד אחד' : `${leads.total_leads} לידים`} · {leads.open} פעילים · {leads.stage_lost} אבדו
        </span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: 14 }}>
        {boxes.map(b => (
          <div key={b.label} className="text-center" style={{ background: '#FBF9F5', border: '1px solid #F1EBE1', borderRadius: 14, padding: '14px 10px' }}>
            <p className="font-display" style={{ fontSize: 24, color: '#443327' }}>{b.value}</p>
            <p style={{ fontWeight: 700, fontSize: 12.5, color: '#8A7A63', marginTop: 2 }}>{b.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── B5-3: lost reasons, with the remedy beside the top two ─────────
const LOST_REASON_REMEDIES: Record<string, string> = {
  no_response: 'תזכורת אוטומטית אחרי 48 שעות',
  price: 'קישור הצעה בהנחה מעמוד המוצר',
}

function LostReasonsBlock({ reasons, totalLost }: { reasons: { reason: string; count: number }[]; totalLost: number }) {
  const max = Math.max(1, ...reasons.map(r => r.count))
  return (
    <div className="bg-white" style={{ border: '1px solid #E9E2D6', borderRadius: 16, padding: 18 }}>
      <h3 className="font-display" style={{ fontSize: 16, color: '#443327' }}>למה לידים לא נסגרו</h3>
      {totalLost === 0 ? (
        <p style={{ fontWeight: 600, fontSize: 13.5, color: '#A2937D', marginTop: 10 }}>
          אין עדיין לידים שאבדו. כשליד יסומן "אבדה" בכרטיס הלקוחה, הסיבה תיאסף ותופיע כאן.
        </p>
      ) : (
        <div className="space-y-2.5" style={{ marginTop: 14 }}>
          {reasons.map((r, i) => {
            const noReason = r.reason === 'none'
            const label = noReason ? 'ללא סיבה מתועדת' : (LOST_REASON_LABELS[r.reason] ?? r.reason)
            const pct = totalLost > 0 ? Math.round((r.count / totalLost) * 100) : 0
            const remedy = !noReason && i < 2 ? LOST_REASON_REMEDIES[r.reason] : null
            return (
              <div key={r.reason} className="flex items-center gap-3">
                <span className="flex-shrink-0 truncate" style={{ width: 130, fontWeight: 700, fontSize: 13.5, color: noReason ? '#A2937D' : '#5E4938' }}>{label}</span>
                <div className="flex-1" style={{ height: 22, background: '#F1EBE1', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.count / max) * 100}%`, background: noReason ? '#D9CFBC' : '#8B4A30', borderRadius: 8, minWidth: 4 }} />
                </div>
                <span className="font-display flex-shrink-0" style={{ width: 60, fontSize: 14, color: '#443327' }}>{r.count} · {pct}%</span>
                {remedy && (
                  <span className="flex-shrink-0 hidden lg:block" style={{ width: 220, fontWeight: 600, fontSize: 12, color: '#35505C' }}>
                    ← {remedy}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tips Tab ────────────────────────────────────────────────────────────────
// Phase 3 / C2: tips now carry an optional title, an article link, a target
// audience ('mom' or 'pregnancy'), and either a baby-age range (in days)
// or a pregnancy-week range. The dashboard's DailyTipCard queries by these
// fields + picks one deterministically per day.

type TipDraft = {
  title: string
  tip_text: string
  article_link: string
  tip_for: 'mom' | 'pregnancy'
  age_range_start_days: string  // string so the input controls them; coerced on save
  age_range_end_days: string
  pregnancy_week_start: string
  pregnancy_week_end: string
}

const EMPTY_DRAFT: TipDraft = {
  title: '',
  tip_text: '',
  article_link: '',
  tip_for: 'mom',
  age_range_start_days: '0',
  age_range_end_days: '730',
  pregnancy_week_start: '',
  pregnancy_week_end: '',
}

function tipToDraft(t: DailyTip): TipDraft {
  return {
    title: t.title ?? '',
    tip_text: t.tip_text,
    article_link: t.article_link ?? '',
    tip_for: (t.tip_for ?? 'mom') as 'mom' | 'pregnancy',
    age_range_start_days: t.age_range_start_days != null ? String(t.age_range_start_days) : '0',
    age_range_end_days: t.age_range_end_days != null ? String(t.age_range_end_days) : '730',
    pregnancy_week_start: t.pregnancy_week_start != null ? String(t.pregnancy_week_start) : '',
    pregnancy_week_end: t.pregnancy_week_end != null ? String(t.pregnancy_week_end) : '',
  }
}

function describeRange(tip: DailyTip): string {
  if (tip.tip_for === 'pregnancy') {
    const a = tip.pregnancy_week_start ?? '?'
    const b = tip.pregnancy_week_end ?? '?'
    return `הריון · שבוע ${a}–${b}`
  }
  const a = tip.age_range_start_days ?? 0
  const b = tip.age_range_end_days ?? 730
  const labelA = formatAgeDays(a)
  const labelB = formatAgeDays(b)
  return `אמהות · ${labelA} – ${labelB}`
}

function formatAgeDays(days: number): string {
  if (days < 14) return `${days} ימים`
  if (days < 60) return `${Math.round(days / 7)} שבועות`
  return `${Math.round(days / 30)} חודשים`
}

function TipsTab() {
  const [tips, setTips] = useState<DailyTip[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TipDraft>(EMPTY_DRAFT)
  const [filter, setFilter] = useState<'all' | 'mom' | 'pregnancy'>('all')
  // Task A: shared delete confirmation (replaces the inline window.confirm).
  const [pendingDelete, setPendingDelete] = useState<DailyTip | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(() => {
    supabase.from('daily_tips').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setTips((data ?? []) as DailyTip[]))
  }, [])
  useEffect(() => { load() }, [load])

  function resetForm() {
    setDraft(EMPTY_DRAFT)
    setEditingId(null)
    setShowForm(false)
  }

  async function save() {
    if (!draft.tip_text.trim()) return

    // Coerce numeric inputs; clamp where the CHECK constraints care.
    const ageStart = parseInt(draft.age_range_start_days, 10)
    const ageEnd = parseInt(draft.age_range_end_days, 10)
    const wkStart = draft.pregnancy_week_start ? parseInt(draft.pregnancy_week_start, 10) : null
    const wkEnd = draft.pregnancy_week_end ? parseInt(draft.pregnancy_week_end, 10) : null

    const payload = {
      title: draft.title.trim() || null,
      tip_text: draft.tip_text.trim(),
      article_link: draft.article_link.trim() || null,
      tip_for: draft.tip_for,
      age_range_start_days: draft.tip_for === 'mom' && Number.isFinite(ageStart) ? Math.max(0, ageStart) : null,
      age_range_end_days: draft.tip_for === 'mom' && Number.isFinite(ageEnd) ? Math.max(0, ageEnd) : null,
      pregnancy_week_start: draft.tip_for === 'pregnancy' && wkStart != null && Number.isFinite(wkStart)
        ? Math.min(42, Math.max(1, wkStart)) : null,
      pregnancy_week_end: draft.tip_for === 'pregnancy' && wkEnd != null && Number.isFinite(wkEnd)
        ? Math.min(42, Math.max(1, wkEnd)) : null,
    }

    if (editingId) {
      await supabase.from('daily_tips').update(payload).eq('id', editingId)
    } else {
      await supabase.from('daily_tips').insert({ ...payload, is_active: true })
    }
    resetForm()
    load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('daily_tips').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
  }

  async function toggle(tip: DailyTip) {
    await supabase.from('daily_tips').update({ is_active: !tip.is_active }).eq('id', tip.id)
    load()
  }

  function startEdit(tip: DailyTip) {
    setEditingId(tip.id)
    setDraft(tipToDraft(tip))
    setShowForm(true)
  }

  function startCreate() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setShowForm(true)
  }

  const visible = tips.filter(t => filter === 'all' || (t.tip_for ?? 'mom') === filter)

  return (
    <div className="space-y-3">
      <button
        onClick={startCreate}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        טיפ חדש
      </button>

      {/* Filter chips */}
      <div className="flex gap-2">
        {([
          { id: 'all' as const, label: `הכל (${tips.length})` },
          { id: 'mom' as const, label: `אמהות (${tips.filter(t => (t.tip_for ?? 'mom') === 'mom').length})` },
          { id: 'pregnancy' as const, label: `הריון (${tips.filter(t => t.tip_for === 'pregnancy').length})` },
        ]).map(opt => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
              filter === opt.id
                ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                : 'border-sand-200 text-sand-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {/* Audience toggle */}
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-2">למי</label>
            <div className="flex gap-2">
              {(['mom', 'pregnancy'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, tip_for: t }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border-2 ${
                    draft.tip_for === t
                      ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                      : 'border-sand-200 text-sand-600'
                  }`}
                >
                  {t === 'mom' ? 'לאמהות' : 'להריון'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1">כותרת (אופציונלי)</label>
            <input
              type="text"
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="כותרת קצרה ומזמינה"
              className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1">תוכן</label>
            <textarea
              value={draft.tip_text}
              onChange={e => setDraft(d => ({ ...d, tip_text: e.target.value }))}
              placeholder="כתבי טיפ יומי..."
              rows={4}
              className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1">קישור למאמר (אופציונלי)</label>
            <input
              type="url"
              value={draft.article_link}
              onChange={e => setDraft(d => ({ ...d, article_link: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
            />
          </div>

          {draft.tip_for === 'mom' ? (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">טווח גיל (בימים)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={draft.age_range_start_days}
                  onChange={e => setDraft(d => ({ ...d, age_range_start_days: e.target.value }))}
                  className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
                />
                <span className="text-xs text-sand-400">עד</span>
                <input
                  type="number"
                  min="0"
                  value={draft.age_range_end_days}
                  onChange={e => setDraft(d => ({ ...d, age_range_end_days: e.target.value }))}
                  className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
                />
              </div>
              <p className="text-[13px] text-sand-400 mt-1">
                ≈ {formatAgeDays(parseInt(draft.age_range_start_days, 10) || 0)} – {formatAgeDays(parseInt(draft.age_range_end_days, 10) || 0)}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">טווח שבוע הריון (1–42)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="42"
                  value={draft.pregnancy_week_start}
                  onChange={e => setDraft(d => ({ ...d, pregnancy_week_start: e.target.value }))}
                  className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
                  placeholder="התחלה"
                />
                <span className="text-xs text-sand-400">עד</span>
                <input
                  type="number"
                  min="1"
                  max="42"
                  value={draft.pregnancy_week_end}
                  onChange={e => setDraft(d => ({ ...d, pregnancy_week_end: e.target.value }))}
                  className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm"
                  placeholder="סיום"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={resetForm} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {visible.map(tip => (
        <div key={tip.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!tip.is_active ? 'opacity-50' : ''}`}>
          <p className="text-[13px] font-bold text-mustard-600 mb-1.5 uppercase tracking-wide">{describeRange(tip)}</p>
          {tip.title && <p className="text-sm font-bold text-sand-800 leading-snug mb-1">{tip.title}</p>}
          <p className="text-sm text-sand-700 leading-relaxed mb-2">{tip.tip_text}</p>
          {tip.article_link && (
            <a href={tip.article_link} target="_blank" rel="noopener noreferrer" className="text-[13px] text-mustard-700 underline mb-2 inline-block">קישור למאמר ←</a>
          )}
          <div className="flex items-center justify-between mt-2">
            <button onClick={() => toggle(tip)} className="text-sand-400 hover:text-mustard-500">
              {tip.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <div className="flex gap-2">
              <button onClick={() => startEdit(tip)} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => setPendingDelete(tip)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? pendingDelete?.tip_text?.slice(0, 60) ?? 'הטיפ'}
        title="מחיקת טיפ יומי"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}


// ─── Videos Tab ───────────────────────────────────────────────────────────────
function VideosTab() {
  const [videos, setVideos] = useState<VideoType[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<VideoType | null>(null)
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<VideoType | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
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

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('videos').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
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
                {uploadingThumb ? 'מעלה...' : <><ImageIcon className="w-4 h-4" /> בחר תמונה</>}
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
              <button onClick={() => setPendingDelete(v)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? 'הסרטון'}
        title="מחיקת סרטון"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
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
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<WorkshopContent | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
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

  async function performDelete() {
    if (!pendingDelete) return
    const item = pendingDelete
    setDeletingBusy(true)
    if (item.url?.includes('workshop-content')) {
      const path = item.url.split('/workshop-content/')[1]
      if (path) await supabase.storage.from('workshop-content').remove([path])
    }
    await supabase.from('workshop_content').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setDeletingBusy(false)
    setPendingDelete(null)
  }

  const typeLabel = { video: '🎬 סרטון', homework: '📝 שיעור בית', pdf: '📄 קובץ' }
  const typeBg   = { video: 'bg-mustard-50 text-mustard-700', homework: 'bg-[#F6ECD8] text-[#6E5836]', pdf: 'bg-blue-50 text-blue-700' }

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
              style={{ background: '#E7C78A' }}>
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
                        <span className="text-[13px] font-semibold text-sand-600">
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
                            <p className="text-[13px] text-sand-400 truncate">{url}</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-2xl">🎬</p>
                            <p className="text-xs font-semibold text-sand-600">גרור MP4 לכאן</p>
                            <p className="text-[13px] text-sand-400">או לחץ לבחירה</p>
                          </div>
                        )}
                      </div>
                      <input ref={fileRef} type="file" accept="video/mp4,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                      <p className="text-[13px] text-sand-400 mt-1.5 text-center">או הדבק קישור URL:</p>
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
                      <p className="text-[13px] text-sand-400 mt-1.5 text-center">או הדבק קישור URL:</p>
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
                          className="px-3 py-2 rounded-xl text-xs text-white font-bold" style={{ background: '#E7C78A' }}>+</button>
                      </div>
                    </div>
                  )}

                  {/* Save / Cancel */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={save} disabled={saving || !title.trim() || (selType === 'homework' && tasks.length === 0)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: '#E7C78A' }}>
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
              <span className={`text-[13px] font-bold px-2 py-1 rounded-lg flex-shrink-0 mt-0.5 ${typeBg[item.type]}`}>
                {typeLabel[item.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sand-800 truncate">{item.title}</p>
                {item.type === 'homework' && item.tasks_json && (
                  <p className="text-[13px] text-sand-400">{item.tasks_json.length} משימות</p>
                )}
                {item.url && item.type !== 'homework' && (
                  <p className="text-[13px] text-sand-400 truncate">{item.url}</p>
                )}
              </div>
              <span className="text-[13px] text-sand-300 flex-shrink-0 mt-0.5">#{idx + 1}</span>
              <button onClick={() => setPendingDelete(item)} className="p-1.5 text-red-300 hover:text-red-500 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? 'הפריט'}
        title="מחיקת תוכן"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

// ─── Workshops Tab ────────────────────────────────────────────────────────────
function WorkshopsTab({ onOpenProduct }: { onOpenProduct?: (id: string) => void } = {}) {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [contentWorkshop, setContentWorkshop] = useState<Workshop | null>(null)
  // Phase 5 / A1: cohort manager modal. User-facing label "מחזורים".
  const [cohortsWorkshop, setCohortsWorkshop] = useState<Workshop | null>(null)
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<Workshop | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '', public_registration: false, linked_form_id: '', feedback_form_id: '', age_from: '', age_to: '' })
  const [uploadingImage, setUploadingImage] = useState(false)
  // Phase 5 / B: per-workshop registration link copy. Tracks which row
  // just showed the "copied" feedback so the icon flips for ~1.5s.
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Polish #7: drag-to-reorder for mobile cards. Same sensor config
  // as the desktop table; touch sensor uses a 200ms delay so a
  // regular tap on the card buttons doesn't get hijacked as a drag.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function handleWorkshopsDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = workshops.findIndex(w => w.id === active.id)
    const newIdx = workshops.findIndex(w => w.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(workshops, oldIdx, newIdx)
    setWorkshops(reordered.map((w, i) => ({ ...w, display_order: i })))
    const updates = await Promise.all(
      reordered.map((w, i) =>
        supabase.from('workshops').update({ display_order: i }).eq('id', w.id),
      ),
    )
    if (updates.some(r => r.error)) {
      console.error('[reorder] one or more updates failed:', updates.filter(r => r.error))
      load()
    }
  }

  function copyRegisterLink(id: string) {
    const link = `${window.location.origin}?register=${id}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1500)
    })
  }

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
    if (file.size > 5 * 1024 * 1024) { alert('הקובץ גדול מ-5MB. נסי תמונה קטנה יותר.'); e.target.value = ''; return }
    setUploadingImage(true)
    const url = await uploadImage(file)
    if (url) setForm(f => ({ ...f, image_url: url }))
    setUploadingImage(false)
    e.target.value = ''
  }

  // Phase 5 / A2 Part 2: forms list for the "שאלון משויך" dropdown.
  const [formsList, setFormsList] = useState<{ id: string; title: string }[]>([])
  // Store categories are admin-managed (content_categories) + local
  // search / category filter for the products list.
  const { categories, reload: reloadCategories } = useWorkshopCategories()
  const [showCatManager, setShowCatManager] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  const load = useCallback(async () => {
    const [{ data: ws }, { data: fs }] = await Promise.all([
      supabase.from('workshops').select('*').order('display_order'),
      supabase.from('forms').select('id, title').eq('is_active', true).order('title'),
    ])
    setWorkshops(ws ?? [])
    setFormsList((fs ?? []) as { id: string; title: string }[])
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
      public_registration: form.public_registration,
      linked_form_id: form.linked_form_id || null,
      feedback_form_id: form.feedback_form_id || null,
      age_range_start_months: form.age_from !== '' ? parseFloat(form.age_from) : null,
      age_range_end_months: form.age_to !== '' ? parseFloat(form.age_to) : null,
    }
    if (editing) {
      await supabase.from('workshops').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = workshops.length > 0 ? Math.max(...workshops.map(w => w.display_order)) : 0
      await supabase.from('workshops').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', summary: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '', next_workshop_id: '', workshop_type: '', public_registration: false, linked_form_id: '', feedback_form_id: '', age_from: '', age_to: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('workshops').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
  }

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  const workshopsQ = searchQ.trim()
  const visibleWorkshops = workshops.filter(w =>
    (!workshopsQ || w.title.includes(workshopsQ) || (w.description ?? '').includes(workshopsQ)) &&
    (catFilter === 'all' || (catFilter === '__none__' ? !w.workshop_type : w.workshop_type === catFilter))
  )
  // Physical store products (category slug 'store-products') have no
  // cohorts and no digital content — hide those actions for them.
  const physicalNames = categories.filter(c => c.slug === 'store-products').map(c => c.name)
  const isPhysicalProduct = (w: Workshop) => physicalNames.includes(w.workshop_type ?? '')

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        מוצר חדש
      </button>

      {/* Search + category filter + category manager */}
      <div className="flex gap-2">
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 חיפוש מוצר..." className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 bg-white" />
        <button onClick={() => setShowCatManager(true)} className="px-3 py-2 rounded-xl text-sm font-semibold bg-white text-sand-600 shadow-sm" title="ניהול קטגוריות">⚙️</button>
      </div>
      <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm bg-white focus:outline-none focus:border-mustard-400">
        <option value="all">כל הקטגוריות</option>
        <option value="__none__">סדנה דיגיטלית (ללא קטגוריה)</option>
        {categories.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>)}
      </select>
      {showCatManager && <CategoryManagerModal onClose={() => setShowCatManager(false)} onChanged={() => { reloadCategories(); load() }} />}

      {/* Polish #6: mobile editor is also a centered modal using the
          AdminLargeModal shell, matching the desktop pattern. */}
      {(showForm || editing) && (
        <AdminLargeModal
          title={editing ? 'עריכת מוצר' : 'מוצר חדש'}
          onClose={() => { setShowForm(false); setEditing(null) }}
          footer={
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2.5 rounded-xl text-sm font-bold">שמירה</button>
              <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2.5 bg-sand-100 text-sand-700 rounded-xl text-sm">ביטול</button>
            </div>
          }
        >
        <div className="space-y-3">
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
              {uploadingImage ? 'מעלה תמונה...' : <><ImageIcon className="w-4 h-4" /> העלה תמונה (PNG/JPG)</>}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageFile} disabled={uploadingImage} />
            </label>
            {form.image_url && (
              <div className="relative">
                <img src={form.image_url} alt="preview" className="w-full h-28 object-cover rounded-xl" />
                <button onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="absolute top-1 left-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="או הדבק קישור URL..." className="w-full px-3 py-2 border border-sand-200 rounded-xl focus:outline-none focus:border-mustard-400 text-xs text-sand-500" dir="ltr" />
          </div>
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder="מקסימום נרשמות למחזור / מלאי" title="לסדנאות עם מחזורים: מקסימום נרשמות בכל מחזור. למוצרי חנות: מלאי." type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="מספר WhatsApp" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          {/* Age targeting — drives the age-matched recommendation on the
              user home screen. Months, decimals allowed (e.g. 3.5). */}
          <div>
            <label className="text-xs text-sand-500 mb-1 block">טווח גיל מומלץ (חודשים) — להמלצה בדף הבית לפי גיל התינוק</label>
            <div className="flex gap-2">
              <input value={form.age_from} onChange={e => setForm(f => ({ ...f, age_from: e.target.value }))} placeholder="מגיל (למשל 3)" type="number" step="0.5" min="0" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
              <input value={form.age_to} onChange={e => setForm(f => ({ ...f, age_to: e.target.value }))} placeholder="עד גיל (למשל 6)" type="number" step="0.5" min="0" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-sand-500 mb-1 block">קטגוריה — מוצרים בחנות <span className="text-mustard-600">(ללא = סדנה דיגיטלית בלבד)</span></label>
            <select value={form.workshop_type} onChange={e => setForm(f => ({ ...f, workshop_type: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">סדנה דיגיטלית (לא מוצגת בחנות)</option>
              {form.workshop_type && !categories.some(c => c.name === form.workshop_type) && (
                <option value={form.workshop_type}>{form.workshop_type}</option>
              )}
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ${c.name}` : c.name}</option>
              ))}
            </select>
          </div>
          {/* Workshop-only fields — hidden for physical store products */}
          {!physicalNames.includes(form.workshop_type) && (
            <>
              <div>
                <label className="text-xs text-sand-500 mb-1 block">הסדנה הבאה בסדרה</label>
                <select value={form.next_workshop_id} onChange={e => setForm(f => ({ ...f, next_workshop_id: e.target.value }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
                  <option value="">ללא המשך</option>
                  {workshops.filter(w => w.id !== editing?.id).map(w => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-sand-500 mb-1 block">שאלון פתיחה (מופיע בכרטיס הלקוחה בתחילת המחזור)</label>
                <select
                  value={form.linked_form_id}
                  onChange={e => setForm(f => ({ ...f, linked_form_id: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white"
                >
                  <option value="">ללא שאלון</option>
                  {formsList.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <p className="text-[13px] text-sand-400 mt-1 leading-relaxed">
                  משויך לטופס שמופיע בכרטיס הלקוחה כשאלון התפתחותי ובדו"ח המחזורים.
                </p>
              </div>
              <div>
                <label className="text-xs text-sand-500 mb-1 block">שאלון משוב סיום (נשלח אוטומטית במייל אחרי סיום הסדנה)</label>
                <select
                  value={form.feedback_form_id}
                  onChange={e => setForm(f => ({ ...f, feedback_form_id: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white"
                >
                  <option value="">ללא שאלון</option>
                  {formsList.map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <p className="text-[13px] text-sand-400 mt-1 leading-relaxed">
                  נשלח במייל לכל הנרשמות של המחזור, יומיים אחרי תאריך סיום המחזור.
                </p>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.public_registration}
              onChange={e => setForm(f => ({ ...f, public_registration: e.target.checked }))}
              className="w-4 h-4 accent-mustard-500"
            />
            <span className="text-xs text-sand-700">הצגה בעמוד ההרשמה הציבורי <span className="text-sand-400">(?register)</span></span>
          </label>
          {/* Task B: per-workshop special-offer manager (mobile editor).
              Only on edit — needs workshop_id. */}
          {editing && (
            <div className="pt-3 mt-3 border-t border-sand-200">
              <WorkshopOffersPanel workshopId={editing.id} />
            </div>
          )}
        </div>
        </AdminLargeModal>
      )}

      <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleWorkshopsDragEnd}>
        <SortableContext items={visibleWorkshops.map(w => w.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
          {workshops.map(w => (
            <SortableRow key={w.id} id={w.id}>
              {(dragHandle) => (
                <div className={`bg-white rounded-2xl p-4 shadow-sm space-y-2 ${!w.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {dragHandle}
                      <div className="flex-1 min-w-0">
                        <button onClick={() => onOpenProduct?.(w.id)} className="font-semibold text-sand-800 text-sm truncate text-right block w-full" title="פתיחת עמוד המוצר">{w.title}</button>
                        {w.price != null && <p className="text-xs text-mustard-600">₪{w.price}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggle(w)} className="text-sand-400 hover:text-mustard-500">
                        {w.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button onClick={() => onOpenProduct?.(w.id)} className="p-1.5 text-sand-400 hover:text-mustard-500" title="פתיחת עמוד המוצר"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setPendingDelete(w)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {!isPhysicalProduct(w) && (
                      <>
                    <button
                      onClick={() => setContentWorkshop(w)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-mustard-50 text-mustard-700 hover:bg-mustard-100 transition-colors"
                    >
                      📂 ניהול תוכן
                    </button>
                    <button
                      onClick={() => setCohortsWorkshop(w)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                      title="ניהול מחזורים — תאריכי התחלה למוצר הזה"
                    >
                      📅 מחזורים
                    </button>
                      </>
                    )}
                    {(w as unknown as { public_registration?: boolean }).public_registration && (
                      <button
                        onClick={() => copyRegisterLink(w.id)}
                        className="col-span-2 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="העתקת לינק להרשמה ישירה למוצר הזה"
                      >
                        {copiedId === w.id ? '✓ הועתק' : '🔗 לינק ייעודי'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </SortableRow>
          ))}
          </div>
        </SortableContext>
      </DndContext>

      {contentWorkshop && <WorkshopContentModal workshop={contentWorkshop} onClose={() => setContentWorkshop(null)} />}
      {cohortsWorkshop && <CohortsModal workshop={cohortsWorkshop} onClose={() => setCohortsWorkshop(null)} />}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? 'המוצר'}
        title="מחיקת מוצר"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
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
  const [form, setForm] = useState({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false, redeem_in_person: false })
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<PartnerPerk | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // Home-visibility switch (global_settings.show_home_perks): some of
  // Mimo's own products are sold in the store, so third-party perks on
  // the home page can look odd — admin decides when to show them.
  const [showOnHome, setShowOnHome] = useState(false)

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }, { data: hp }] = await Promise.all([
      supabase.from('partner_perks').select('*').order('display_order'),
      supabase.from('perk_analytics').select('*'),
      supabase.from('global_settings').select('setting_value').eq('setting_key', 'show_home_perks').maybeSingle(),
    ])
    setPerks(p ?? [])
    setAnalytics(a ?? [])
    setShowOnHome(hp?.setting_value === 'true')
  }, [])

  async function toggleHomeVisibility() {
    const next = !showOnHome
    setShowOnHome(next)
    await supabase.from('global_settings').upsert(
      { setting_key: 'show_home_perks', setting_value: next ? 'true' : 'false', setting_type: 'boolean', category: 'home', description: 'הצגת הטבות מומלצות במסך הבית' },
      { onConflict: 'setting_key' },
    )
  }
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
      redeem_in_person: form.redeem_in_person,
    }
    if (editing) {
      await supabase.from('partner_perks').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = perks.length > 0 ? Math.max(...perks.map(p => p.display_order)) : 0
      await supabase.from('partner_perks').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false, redeem_in_person: false })
    setEditing(null); setShowForm(false); load()
  }

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('partner_perks').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
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
      {/* Admin-controlled home-page announcements (מבצעים / הנחות) —
          rendered on the user dashboard by HomeAnnouncementsBanner */}
      <HomeAnnouncementsPanel />

      {/* Show/hide the perks section on the moms' home screen */}
      <button
        onClick={toggleHomeVisibility}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-sm font-bold transition-all ${showOnHome ? 'border-green-300 bg-green-50 text-green-700' : 'border-sand-200 bg-white text-sand-500'}`}
      >
        <span>🏠 הטבות במסך הבית של האמהות</span>
        <span>{showOnHome ? 'מוצג ✓' : 'מוסתר'}</span>
      </button>

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
          {/* Physical businesses: the perk is claimed by showing the digital
              membership card at the counter — so it appears ON the card.
              Online perks (code / link) stay in the benefits page only. */}
          <label className="flex items-center gap-2 text-sm text-sand-600 cursor-pointer">
            <input type="checkbox" checked={form.redeem_in_person} onChange={e => setForm(f => ({ ...f, redeem_in_person: e.target.checked }))} className="rounded" />
            מימוש בהצגת הכרטיס הדיגיטלי (עסק פיזי)
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
                  <span className="text-xs px-1.5 py-0.5 rounded-lg font-semibold" style={p.redeem_in_person ? { background: '#E4EBEF', color: '#3E5966' } : { background: '#F6ECD8', color: '#8A6A2F' }}>
                    {p.redeem_in_person ? 'בהצגת הכרטיס' : 'אונליין'}
                  </span>
                </div>
                {p.discount_code && <p className="text-xs text-sand-400">{p.discount_code}</p>}
                {showAnalytics && (
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-sand-400 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {stats.views}</span>
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
                <button onClick={() => { setEditing(p); setForm({ partner_name: p.partner_name, short_description: p.short_description ?? '', full_description: p.full_description ?? '', discount_code: p.discount_code ?? '', action_link: p.action_link ?? '', logo_url: p.logo_url ?? '', is_featured: p.is_featured, redeem_in_person: p.redeem_in_person }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setPendingDelete(p)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )
      })}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.partner_name ?? 'הטבה זו'}
        title="מחיקת הטבה"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

// ─── Forms Tab ────────────────────────────────────────────────────────────────
// Phase 5 / A4: optional `role` lets admin override the
// formSubmissionResolver's heuristic per text field. Stored inside
// fields_json — no migration needed.
type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'rating' | 'date' | 'info' | 'link'; label: string; options?: string[]; required?: boolean; role?: 'name' | 'phone' | 'email' | 'none' }
type FormRecord = { id: string; title: string; description: string | null; fields_json: FormField[]; trigger_rule: { type: string; count: number } | null; is_active: boolean; public_link_enabled: boolean; folder: string | null; created_at: string }
type Submission = { id: string; user_id: string; responses_json: Record<string, string>; created_at: string; user_profiles?: { mother_name: string | null; email: string } }
type Assignment = { id: string; user_id: string; user_profiles?: { mother_name: string | null; email: string } }

function AssignFormModal({ form, onClose }: { form: FormRecord; onClose: () => void }) {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [existing, setExisting] = useState<Assignment[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [taskTitle, setTaskTitle] = useState(form.title)
  const [taskDesc, setTaskDesc] = useState(form.description ?? '')
  const [dueDate, setDueDate] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('user_profiles').select('*').order('mother_name').then(({ data }) => setAllUsers(data ?? []))
    supabase.from('form_assignments')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .then(({ data }) => setExisting((data ?? []) as Assignment[]))
  }, [form.id])

  const existingUserIds = new Set(existing.map(a => a.user_id))

  function toggleSelect(userId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  async function removeAssignment(id: string) {
    await supabase.from('form_assignments').delete().eq('id', id)
    setExisting(a => a.filter(x => x.id !== id))
  }

  async function save() {
    if (selectedIds.size === 0) return
    setSaving(true); setSaveError(null)
    const rows = Array.from(selectedIds).map(userId => ({
      form_id: form.id,
      user_id: userId,
      title: taskTitle.trim() || form.title,
      ...(taskDesc.trim() ? { description: taskDesc.trim() } : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
    }))
    const { data, error } = await supabase
      .from('form_assignments')
      .insert(rows)
      .select('*, user_profiles(mother_name, email)')
    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }
    setExisting(a => [...a, ...(data ?? []) as Assignment[]])
    setSelectedIds(new Set())
    setTaskTitle(form.title); setTaskDesc(form.description ?? ''); setDueDate(''); setShowOptional(false)
    setSaving(false)
  }

  const filterable = allUsers.filter(u => !existingUserIds.has(u.id))
  const filtered = filterable.filter(u => !search || (u.mother_name ?? '').includes(search) || u.email.includes(search))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-2xl overflow-hidden max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-sand-100 flex-shrink-0">
          <h3 className="font-bold text-sand-800">שייך טופס למשתמשות</h3>
          <p className="text-xs text-sand-400 mt-0.5">{form.title}</p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* Existing assignments */}
          {existing.length > 0 && (
            <div className="px-4 pt-4 pb-2 space-y-1.5 border-b border-sand-100">
              <p className="text-xs font-bold text-sand-500 mb-2">הוקצה כבר ל-{existing.length} משתמשות</p>
              {existing.map(a => {
                const up = a.user_profiles as { mother_name: string | null; email: string } | undefined
                return (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2 bg-mustard-50 rounded-xl">
                    <div>
                      <p className="text-sm font-semibold text-sand-800">{up?.mother_name ?? up?.email ?? '—'}</p>
                      {up?.mother_name && <p className="text-xs text-sand-400">{up.email}</p>}
                    </div>
                    <button onClick={() => removeAssignment(a.id)} className="text-xs text-sand-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">הסר</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* User selection list */}
          <div className="p-4 space-y-2">
            <p className="text-xs font-bold text-sand-500">בחרי משתמשות להקצות</p>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חפש לפי שם או אימייל..."
              className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
            />
            <div className="space-y-1.5">
              {filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => toggleSelect(u.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-right ${selectedIds.has(u.id) ? 'border-mustard-400 bg-mustard-50' : 'border-sand-200 bg-white hover:border-sand-300'}`}
                >
                  <div className="text-right">
                    <p className="text-sm font-semibold text-sand-800">{u.mother_name ?? '—'}</p>
                    <p className="text-xs text-sand-400">{u.email}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedIds.has(u.id) ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                    {selectedIds.has(u.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && filterable.length === 0 && (
                <p className="text-xs text-sand-400 text-center py-4">כל המשתמשות כבר מוקצות לטופס זה</p>
              )}
              {filtered.length === 0 && filterable.length > 0 && (
                <p className="text-xs text-sand-400 text-center py-4">לא נמצאו תוצאות</p>
              )}
            </div>
          </div>

          {/* Optional fields — shown after selecting users */}
          {selectedIds.size > 0 && (
            <div className="px-4 pb-4 border-t border-sand-100 pt-3 space-y-2">
              <button onClick={() => setShowOptional(p => !p)} className="text-xs text-mustard-600 font-semibold">
                {showOptional ? '▲ הסתר הגדרות' : '▼ כותרת ותיאור מותאמים (אופציונלי)'}
              </button>
              {showOptional && (
                <div className="space-y-3 pt-1">
                  <div>
                    <p className="text-xs text-sand-500 mb-1">כותרת המשימה</p>
                    <input
                      value={taskTitle}
                      onChange={e => setTaskTitle(e.target.value)}
                      placeholder={form.title}
                      className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-sand-500 mb-1">תיאור (אופציונלי)</p>
                    <textarea
                      value={taskDesc}
                      onChange={e => setTaskDesc(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-sand-500 mb-1">תאריך יעד (אופציונלי)</p>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div className="mx-4 mb-4 px-3 py-2 bg-red-50 rounded-xl">
              <p className="text-xs text-red-600">{saveError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sand-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-700 font-semibold text-sm">סגור</button>
          {selectedIds.size > 0 && (
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: '#E7C78A' }}
            >
              {saving ? '...' : `הקצה ל-${selectedIds.size}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Options Tag Input ────────────────────────────────────────────────────────
function OptionsTagInput({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const val = input.replace(/^\n+|\n+$/g, '') // trim leading/trailing newlines only
    if (!val || options.includes(val)) return
    onChange([...options, val])
    setInput('')
  }

  function remove(i: number) {
    onChange(options.filter((_, j) => j !== i))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => (
          <span key={i} className="flex items-start gap-1 bg-mustard-50 text-mustard-700 text-xs font-medium px-2.5 py-1.5 rounded-xl">
            <span className="flex-1 whitespace-pre-line leading-relaxed">{opt}</span>
            <button type="button" onClick={() => remove(i)} className="text-mustard-400 hover:text-red-400 leading-none flex-shrink-0 mt-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 items-start">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add() } }}
          placeholder={"הקלד אפשרות\nEnter = שורה חדשה\nCtrl+Enter = הוסף"}
          rows={3}
          className="flex-1 px-3 py-1.5 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 bg-white resize-none leading-relaxed"
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-xl text-xs text-white font-bold flex-shrink-0" style={{ background: '#E7C78A' }}>+</button>
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
  // Polish follow-up: subsView state moved into FormSubmissionsModal —
  // each form opens fresh on 'list', remounted via key=form.id.
  const [filterQuestion, setFilterQuestion] = useState<string | null>(null)
  const [loadingSubs, setLoadingSubs] = useState(false)
  // Phase 5 / A4: per-form { count, lastAt } so the list shows
  // response volume without having to open each form.
  const [submissionStats, setSubmissionStats] = useState<Map<string, { count: number; lastAt: string }>>(new Map())
  // Task A: form-row trash → pendingDeleteForm; dialog at end of return.
  const [pendingDeleteForm, setPendingDeleteForm] = useState<FormRecord | null>(null)
  const [deletingFormBusy, setDeletingFormBusy] = useState(false)
  // Polish #9: full submission rows (slim) for "what's new" derivation.
  const [allSubmissions, setAllSubmissions] = useState<FormsPageSubmission[]>([])
  const [seenBumpTick, setSeenBumpTick] = useState(0)
  const [modalSeenCutoff, setModalSeenCutoff] = useState<string>(EPOCH)

  function copyFormLink(formId: string) {
    const url = `${window.location.origin}/?form=${formId}`
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
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set())

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
    setClosedFolders(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  const load = useCallback(async () => {
    const [{ data: formsData }, { data: subsData }] = await Promise.all([
      supabase.from('forms').select('*').order('created_at', { ascending: false }),
      // Polish #9: extended select for the what's-new strip + per-form
      // unread chip. Slim shape; admin scale.
      supabase
        .from('form_submissions')
        .select('id, form_id, user_id, responses_json, created_at, user_profiles(mother_name, email)'),
    ])
    setForms((formsData ?? []) as FormRecord[])
    const subs = (subsData ?? []) as unknown as FormsPageSubmission[]
    setAllSubmissions(subs)
    const stats = new Map<string, { count: number; lastAt: string }>()
    for (const s of subs) {
      const cur = stats.get(s.form_id) ?? { count: 0, lastAt: '' }
      cur.count++
      if (s.created_at > cur.lastAt) cur.lastAt = s.created_at
      stats.set(s.form_id, cur)
    }
    setSubmissionStats(stats)
  }, [])
  useEffect(() => { load() }, [load])

  // Polish #9: derived strip data + per-form unread counts. Re-runs
  // on every seenBumpTick increment.
  const recentNew = useMemo(
    () => deriveRecentNew(allSubmissions, forms, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seenBumpTick is a re-derive trigger
    [allSubmissions, forms, seenBumpTick],
  )
  const newCountByFormId = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of allSubmissions) {
      if (s.created_at > getEffectiveFormSeen(s.form_id)) {
        m.set(s.form_id, (m.get(s.form_id) ?? 0) + 1)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seenBumpTick is a re-derive trigger
  }, [allSubmissions, seenBumpTick])

  // Phase 5 / A4: refetch the open form so the resolver picks up
  // updated field-role overrides; also refresh the list view's counts.
  const refreshViewSubmissions = useCallback(async () => {
    if (!viewSubmissions) return
    const { data } = await supabase.from('forms').select('*').eq('id', viewSubmissions.id).maybeSingle()
    if (data) setViewSubmissions(data as FormRecord)
    load()
  }, [viewSubmissions, load])

  const [focusFieldId, setFocusFieldId] = useState<string | null>(null)
  function addField() {
    setFields(f => [...f, { id: crypto.randomUUID(), type: 'text', label: '', required: false }])
  }
  function insertFieldAt(idx: number) {
    const newId = crypto.randomUUID()
    setFields(f => { const arr = [...f]; arr.splice(idx, 0, { id: newId, type: 'text', label: '', required: false }); return arr })
    setFocusFieldId(newId)
  }
  useEffect(() => {
    if (!focusFieldId) return
    const el = document.querySelector(`[data-focusid="${focusFieldId}"]`) as HTMLTextAreaElement | null
    el?.focus(); setFocusFieldId(null)
  }, [focusFieldId, fields])

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFields(f => {
      const oldIdx = f.findIndex(fi => fi.id === active.id)
      const newIdx = f.findIndex(fi => fi.id === over.id)
      return arrayMove(f, oldIdx, newIdx)
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

  const isDirty = useMemo(() => {
    if (!editingForm) return title.trim().length > 0 || fields.length > 0
    return (
      title !== editingForm.title ||
      description !== (editingForm.description ?? '') ||
      folder !== (editingForm.folder ?? '') ||
      JSON.stringify(fields) !== JSON.stringify(editingForm.fields_json)
    )
  }, [editingForm, title, description, folder, fields])

  const saveFormRef = useRef(saveForm)
  useEffect(() => { saveFormRef.current = saveForm })
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && (showCreate || editingForm)) {
        e.preventDefault()
        saveFormRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCreate, editingForm])

  async function toggleForm(form: FormRecord) {
    await supabase.from('forms').update({ is_active: !form.is_active }).eq('id', form.id)
    load()
  }

  // Task A: form-row trash → pendingDeleteForm; dialog confirms.
  function requestDeleteForm(form: FormRecord) {
    setPendingDeleteForm(form)
  }
  async function performDeleteForm() {
    if (!pendingDeleteForm) return
    setDeletingFormBusy(true)
    await supabase.from('forms').delete().eq('id', pendingDeleteForm.id)
    setDeletingFormBusy(false)
    setPendingDeleteForm(null)
    load()
  }

  async function loadSubmissions(form: FormRecord) {
    setViewSubmissions(form); setFilterQuestion(null); setLoadingSubs(true)
    // Polish #9: snapshot the pre-bump cutoff for the in-modal pill,
    // then bump per-form seen so the page-level chip + strip drop
    // this form's new items.
    setModalSeenCutoff(getEffectiveFormSeen(form.id))
    bumpFormSeen(form.id)
    setSeenBumpTick(t => t + 1)
    const { data } = await supabase
      .from('form_submissions')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
    setSubmissions((data ?? []) as Submission[])
    setLoadingSubs(false)
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
    { value: 'date',     label: '📅 תאריך' },
    { value: 'info',     label: '📋 בלוק טקסט (תצוגה בלבד)' },
    { value: 'link',     label: '🔗 כפתור לינק (תשלום וכו׳)' },
  ]

  // Polish follow-up: the responses view used to FULL-PAGE swap when a
  // form was opened, hiding the list. Now it renders as a centered
  // modal on top of the list (same shell as CustomerCardModal).
  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-2xl transition-colors"
        style={{ background: '#E7C78A' }}
      >
        <Plus className="w-4 h-4" />
        טופס חדש
      </button>

      {(showCreate || editingForm) && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Sticky save header */}
          <div className="sticky top-0 z-10 bg-white border-b border-sand-100 px-4 py-3 flex items-center justify-between shadow-sm">
            <p className="text-xs font-bold text-mustard-600 truncate max-w-[160px]">
              {editingForm ? <><Pencil className="w-4 h-4 inline-block ml-1" />{editingForm.title}</> : '➕ טופס חדש'}
            </p>
            <div className="flex gap-2 items-center flex-shrink-0">
              {isDirty && <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title="שינויים לא שמורים" />}
              <button
                onClick={saveForm}
                disabled={saving || !title.trim() || fields.length === 0}
                className="px-3 py-1.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 transition-all"
                style={{ background: isDirty ? '#E7C78A' : '#9CA3AF' }}
              >
                {saving ? '...' : 'שמור'}
              </button>
              <button onClick={() => { setShowCreate(false); cancelEdit() }} className="p-1.5 bg-sand-100 rounded-xl"><X className="w-4 h-4 text-sand-500" /></button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div>
                  <p className="text-xs font-semibold text-sand-500 mb-2">שדות הטופס ({fields.length})</p>
                  {fields.map((field, idx) => (
                    <SortableRow key={field.id} id={field.id}>
                      {(dragHandle) => (
                        <div>
                          {/* Insert-above divider */}
                          <button onClick={() => insertFieldAt(idx)} className="group w-full flex items-center gap-2 py-1 mb-1 opacity-40 hover:opacity-100 transition-opacity">
                            <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                            <span className="text-[13px] font-bold text-sand-400 group-hover:text-mustard-600 transition-colors px-1">+ הוסף כאן</span>
                            <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                          </button>

                          <div className="flex gap-2 items-start bg-sand-50 rounded-xl p-2 mb-0">
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
                                <textarea data-focusid={field.id} value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="תווית השדה" rows={2} className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 bg-white resize-none leading-relaxed" />
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
                              {dragHandle}
                              <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} className="p-1 text-sand-300 hover:text-mustard-500 disabled:opacity-20">▲</button>
                              <button onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1} className="p-1 text-sand-300 hover:text-mustard-500 disabled:opacity-20">▼</button>
                              <button onClick={() => removeField(field.id)} className="p-1.5 text-sand-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableRow>
                  ))}
                  {/* Insert-after-last divider */}
                  {fields.length > 0 && (
                    <button onClick={() => insertFieldAt(fields.length)} className="group w-full flex items-center gap-2 py-1 my-1 opacity-40 hover:opacity-100 transition-opacity">
                      <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                      <span className="text-[13px] font-bold text-sand-400 group-hover:text-mustard-600 transition-colors px-1">+ הוסף כאן</span>
                      <div className="flex-1 h-px bg-sand-200 group-hover:bg-mustard-400 transition-colors" />
                    </button>
                  )}
                  <button onClick={addField} className="w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-mustard-600 bg-mustard-50 hover:bg-mustard-100 mt-1">
                    <Plus className="w-3.5 h-3.5" /> הוסף שדה
                  </button>
                </div>
              </SortableContext>
            </DndContext>

            {/* Bottom save — convenience duplicate */}
            <div className="flex gap-2 pt-1">
              <button onClick={saveForm} disabled={saving || !title.trim() || fields.length === 0} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#E7C78A' }}>
                {saving ? 'שומר...' : editingForm ? 'שמור שינויים' : 'צור טופס'}
              </button>
              <button onClick={() => { setShowCreate(false); cancelEdit() }} className="px-4 py-2.5 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Polish #9: "מה חדש" strip — see desktop tab for the rationale. */}
      <FormsWhatsNewStrip
        recentNew={recentNew}
        onOpenForm={loadSubmissions}
        onMarkAllSeen={() => { bumpAllFormsSeen(forms.map(f => f.id)); setSeenBumpTick(t => t + 1) }}
      />

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
              <span className="text-sand-400 text-xs">{!closedFolders.has(folderName) ? '▲' : '▼'}</span>
            </button>

            {!closedFolders.has(folderName) && folderForms.map(form => {
              const stat = submissionStats.get(form.id)
              return (
              <div key={form.id} className={`bg-white rounded-2xl p-4 shadow-sm mr-2 ${!form.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sand-800 text-sm">{form.title}</p>
                      {/* Polish #9: per-form unread chip. */}
                      {(newCountByFormId.get(form.id) ?? 0) > 0 && (
                        <span className="text-[13px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-bold">
                          {newCountByFormId.get(form.id)} חדשים
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sand-400 mt-0.5">{form.fields_json.length} שדות</p>
                    {stat && stat.count > 0 && (
                      <p className="text-xs text-[#3E5966] font-semibold mt-1">
                        {stat.count} תשובות
                        <span className="text-[#7B604C] font-normal"> · אחרון {new Date(stat.lastAt).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <button onClick={() => startEdit(form)} className="text-[13px] px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg hover:bg-mustard-100 inline-flex items-center gap-1"><Pencil className="w-4 h-4" /> ערכי</button>
                    <button onClick={() => loadSubmissions(form)} className="text-xs px-2 py-1 bg-sand-50 text-sand-600 rounded-lg hover:bg-sand-100">תשובות</button>
                    <button onClick={() => setAssignForm(form)} className="text-xs px-2 py-1 bg-[#F6ECD8] text-[#6E5836] rounded-lg hover:bg-[#EFDFC2]">👥 שייך</button>
                    <button onClick={() => copyFormLink(form.id)} className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg hover:bg-mustard-100">
                      {copiedId === form.id ? '✓ הועתק' : '🔗 לינק'}
                    </button>
                    <button onClick={() => toggleForm(form)} className="text-sand-400 hover:text-mustard-500">
                      {form.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => requestDeleteForm(form)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        ))
      })()}
      {forms.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין טפסים עדיין</p>}

      {assignForm && <AssignFormModal form={assignForm} onClose={() => setAssignForm(null)} />}

      {/* Polish follow-up: centered responses modal — same shell as
          CustomerCardModal. key=form.id remounts on each form open so
          the modal's internal tab state resets to "פרטי". */}
      {viewSubmissions && (
        <FormSubmissionsModal
          key={viewSubmissions.id}
          formTitle={viewSubmissions.title}
          count={submissions.length}
          loading={loadingSubs}
          listContent={
            <FormSubmissionsView
              form={viewSubmissions}
              submissions={submissions}
              onDeleteSubmission={deleteSubmission}
              onFormSaved={refreshViewSubmissions}
              isNewSubmission={s => s.created_at > modalSeenCutoff}
            />
          }
          aggregateContent={
            <FormAggregatePanel
              form={viewSubmissions}
              submissions={submissions}
              filterQuestion={filterQuestion}
              setFilterQuestion={setFilterQuestion}
            />
          }
          onExportCsv={() => exportCSV(viewSubmissions, submissions, filterQuestion)}
          onClose={() => setViewSubmissions(null)}
        />
      )}
      <ConfirmDialog
        open={!!pendingDeleteForm}
        itemName={pendingDeleteForm?.title ?? 'הטופס'}
        title="מחיקת טופס"
        busy={deletingFormBusy}
        onConfirm={performDeleteForm}
        onClose={() => setPendingDeleteForm(null)}
      />
    </div>
  )
}

// ─── Owner Settings Section (inside Settings) ─────────────────────────────────
function OwnerSettingsSection() {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [hero, setHero] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['owner_name', 'owner_whatsapp', 'app_subtitle', 'landing_hero_text'])
      .then(({ data }) => {
        setName(data?.find(r => r.setting_key === 'owner_name')?.setting_value ?? 'ברנדה')
        setWhatsapp(data?.find(r => r.setting_key === 'owner_whatsapp')?.setting_value ?? '972527506227')
        setSubtitle(data?.find(r => r.setting_key === 'app_subtitle')?.setting_value ?? 'מרכז התפתחות לתינוקות')
        setHero(data?.find(r => r.setting_key === 'landing_hero_text')?.setting_value ?? 'ברוכה הבאה לסדנאות מימו')
      })
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('global_settings').upsert([
      { setting_key: 'owner_name', setting_value: name, setting_type: 'text', category: 'owner', description: 'שם בעלת העסק' },
      { setting_key: 'owner_whatsapp', setting_value: whatsapp, setting_type: 'text', category: 'owner', description: 'מספר WhatsApp של בעלת העסק' },
      { setting_key: 'app_subtitle', setting_value: subtitle, setting_type: 'text', category: 'owner', description: 'כיתוב מתחת ללוגו במסך הכניסה' },
      { setting_key: 'landing_hero_text', setting_value: hero, setting_type: 'text', category: 'landing', description: 'כיתוב ראשי בעמוד ההרשמה הציבורי' },
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
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">כיתוב ראשי בעמוד ההרשמה הציבורי <span className="text-sand-400">(?register)</span></label>
          <input value={hero} onChange={e => setHero(e.target.value)} placeholder="ברוכה הבאה לסדנאות מימו" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#E7C78A' }}>
          {saved ? '✓ נשמר!' : saving ? '...' : 'שמור'}
        </button>
      </div>
    </div>
  )
}

// ─── Thank-You Page Settings (inside Settings) ────────────────────────────────
function ThankYouSettingsSection() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [waLink, setWaLink] = useState('')
  const [igLink, setIgLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['thank_you_title', 'thank_you_body', 'whatsapp_community_link', 'instagram_link', 'owner_name'])
      .then(({ data }) => {
        const get = (k: string) => data?.find(r => r.setting_key === k)?.setting_value ?? ''
        setTitle(get('thank_you_title') || 'ברוכה הבאה למימו 🐣')
        const ownerName = get('owner_name')
        const defaultBody = ownerName
          ? `מחכה לפגוש אותך ואת הבייבי שלך.\nפרטים נוספים יישלחו בקבוצת ווטסאפ ייעודית לקראת מועד המפגש.\nאני כאן בשבילך לכל שאלה, התייעצות או כל דבר קטן 🤍\nבאהבה, ${ownerName}`
          : `מחכה לפגוש אותך ואת הבייבי שלך.\nפרטים נוספים יישלחו בקבוצת ווטסאפ ייעודית לקראת מועד המפגש.\nאני כאן בשבילך לכל שאלה, התייעצות או כל דבר קטן 🤍`
        setBody(get('thank_you_body') || defaultBody)
        setWaLink(get('whatsapp_community_link'))
        setIgLink(get('instagram_link'))
      })
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('global_settings').upsert([
      { setting_key: 'thank_you_title', setting_value: title, setting_type: 'text', category: 'thanks', description: 'כותרת בעמוד התודה אחרי תשלום' },
      { setting_key: 'thank_you_body', setting_value: body, setting_type: 'text', category: 'thanks', description: 'גוף הטקסט בעמוד התודה אחרי תשלום' },
      { setting_key: 'whatsapp_community_link', setting_value: waLink, setting_type: 'url', category: 'thanks', description: 'קישור לקהילת WhatsApp של מימו' },
      { setting_key: 'instagram_link', setting_value: igLink, setting_type: 'url', category: 'thanks', description: 'קישור לאינסטגרם של מימו' },
    ], { onConflict: 'setting_key' })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-sand-100">
        <h3 className="font-bold text-sand-800 text-sm">עמוד תודה אחרי תשלום <span className="text-sand-400 font-normal">(?thanks)</span></h3>
        <p className="text-xs text-sand-400 mt-0.5">מוצג לאמא אחרי שמורנינג מפנה אותה חזרה לאפליקציה</p>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">כותרת</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="ברוכה הבאה למימו 🐣" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">גוף הטקסט</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400 resize-none" />
        </div>
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">קישור לקהילת WhatsApp</label>
          <input value={waLink} onChange={e => setWaLink(e.target.value)} dir="ltr" placeholder="https://chat.whatsapp.com/..." className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div>
          <label className="text-xs font-semibold text-sand-500 mb-1 block">קישור לאינסטגרם</label>
          <input value={igLink} onChange={e => setIgLink(e.target.value)} dir="ltr" placeholder="https://instagram.com/..." className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#E7C78A' }}>
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
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<GlobalSetting | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

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

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('global_settings').delete().eq('id', pendingDelete.id)
    setDeletingBusy(false)
    setPendingDelete(null)
    load()
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

      {/* Thank-You Page Settings */}
      <ThankYouSettingsSection />

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
                <button onClick={() => setPendingDelete(s)} className="p-1.5 text-sand-300 hover:text-red-400 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.setting_key ?? 'הגדרה זו'}
        title="מחיקת הגדרה"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
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
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<PregnancyChecklistItem | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // Form state
  const [formText, setFormText] = useState('')
  const [formWeekFrom, setFormWeekFrom] = useState('')
  const [formWeekTo, setFormWeekTo] = useState('')
  const [formOrder, setFormOrder] = useState('')
  const [formSubcategory, setFormSubcategory] = useState<string>('other')
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
    setFormSubcategory(item.subcategory ?? 'other')
    setShowAdd(false)
  }

  function openAdd() {
    setEditItem(null)
    setFormText('')
    setFormWeekFrom('')
    setFormWeekTo('')
    setFormOrder('')
    setFormSubcategory('other')
    setShowAdd(true)
  }

  async function save() {
    if (!formText.trim()) return
    setSaving(true)
    const payload = {
      text: formText.trim(),
      category: cat,
      subcategory: cat === 'buying' ? formSubcategory : null,
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

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('pregnancy_checklist_items').delete().eq('id', pendingDelete.id)
    setItems(prev => prev.filter(i => i.id !== pendingDelete.id))
    setDeletingBusy(false)
    setPendingDelete(null)
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
            style={cat === t.id ? { background: '#E7C78A' } : {}}
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
        style={{ background: '#E7C78A' }}
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
          {cat === 'buying' && (
            <div>
              <label className="text-xs text-sand-500 mb-1 block">קטגוריה</label>
              <select value={formSubcategory} onChange={e => setFormSubcategory(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 bg-white">
                {BUYING_SUBCATEGORIES.map(s => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
                ))}
              </select>
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
              style={{ background: '#E7C78A' }}
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
              <button onClick={() => setPendingDelete(item)} className="p-1.5 text-sand-300 hover:text-red-400 transition-colors">
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
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.text ?? 'הפריט'}
        title="מחיקת פריט"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
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
  const [formFunFact, setFormFunFact] = useState('')
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
    setFormFunFact(g.fun_fact ?? '')
    setFormImageUrl(g.image_url ?? '')
    setShowAdd(false)
  }

  function openAdd() {
    setEditGuide(null)
    setFormWeek(''); setFormSymptoms(''); setFormBabySize('')
    setFormEmoji('🍊'); setFormDevelopment(''); setFormFunFact(''); setFormImageUrl('')
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
      fun_fact: formFunFact.trim() || null,
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
        <label className="text-xs text-sand-500 mb-1 block">💡 ידעת? (עובדה מעניינת)</label>
        <textarea rows={2} value={formFunFact} onChange={e => setFormFunFact(e.target.value)}
          placeholder="עובדה מעניינת אחת לשבוע..."
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
          style={{ background: '#E7C78A' }}>
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
        style={{ background: '#E7C78A' }}>
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
// Vendor topics ("תיקיות") are free Hebrew text the admin types — the
// list below only maps LEGACY English values (early rows) to Hebrew.
// The moms' marketplace groups by the same subcategory value.
const SUBCAT_LEGACY: Record<string, string> = {
  doula: 'דולה', pelvic_floor: 'רצפת האגן', studio: 'סטודיו',
  lactation: 'יועצת הנקה', osteopath: 'אוסטאופתיה', physio: 'פיזיותרפיה',
  psychologist: 'פסיכולוגיה', nutrition: 'תזונה', other: 'אחר',
}
const subcatLabel = (v: string | null | undefined) => v ? (SUBCAT_LEGACY[v] ?? v) : 'ללא נושא'
const SUBCAT_PRESETS = ['מאמנות כושר', 'תזונה', 'אוסטאופתיה', 'דולה', 'יועצת הנקה', 'פיזיותרפיה', 'פסיכולוגיה', 'רצפת האגן', 'סטודיו', 'מרצות']

function PartnersTab() {
  const [partners, setPartners] = useState<ServicePartner[]>([])
  const [editing, setEditing] = useState<ServicePartner | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'pregnancy' as 'pregnancy' | 'motherhood', subcategory: '', whatsapp_number: '', logo_url: '', display_order: 0, cost: '', cost_notes: '' })
  const [saving, setSaving] = useState(false)
  // Admin-only cost info per vendor (vendor_admin_info, admin RLS) —
  // lets Brenda/Yahav compare what vendors charge inside each topic
  // folder and pick. Never rendered anywhere user-facing.
  const [adminInfo, setAdminInfo] = useState<Record<string, VendorAdminInfo>>({})
  // Task A: shared delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<ServicePartner | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  // Folder view: vendors grouped by topic, collapsible per group.
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({})
  // Topic filter — null = show all folders.
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  // Phase 6 (handoff §6): each vendor carries its leads + events context
  // instead of the leads living in a separate tab with no connection.
  type VendorLead = { id: string; partner_id: string | null; action_type: string; contact_name: string | null; contact_phone: string | null; created_at: string }
  const [leadsByVendor, setLeadsByVendor] = useState<Record<string, VendorLead[]>>({})
  const [eventsByVendor, setEventsByVendor] = useState<Record<string, { id: string; title: string; event_date: string }[]>>({})
  const [openLeadsVendor, setOpenLeadsVendor] = useState<string | null>(null)

  const load = useCallback(async () => {
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
    const [{ data }, { data: info }, { data: pls }, { data: evs }] = await Promise.all([
      supabase.from('service_partners').select('*').order('category').order('display_order'),
      supabase.from('vendor_admin_info').select('*'),
      supabase.from('partner_leads').select('id, partner_id, action_type, contact_name, contact_phone, created_at').order('created_at', { ascending: false }),
      supabase.from('community_events').select('id, title, event_date, vendor_id').gte('event_date', todayIso).eq('is_active', true).order('event_date'),
    ])
    setPartners((data ?? []) as ServicePartner[])
    const m: Record<string, VendorAdminInfo> = {}
    for (const i of (info ?? []) as VendorAdminInfo[]) m[i.vendor_id] = i
    setAdminInfo(m)
    const lb: Record<string, VendorLead[]> = {}
    for (const l of (pls ?? []) as VendorLead[]) {
      if (!l.partner_id) continue
      ;(lb[l.partner_id] ??= []).push(l)
    }
    setLeadsByVendor(lb)
    const eb: Record<string, { id: string; title: string; event_date: string }[]> = {}
    for (const e of (evs ?? []) as { id: string; title: string; event_date: string; vendor_id: string | null }[]) {
      if (!e.vendor_id) continue
      ;(eb[e.vendor_id] ??= []).push({ id: e.id, title: e.title, event_date: e.event_date })
    }
    setEventsByVendor(eb)
  }, [])
  useEffect(() => { load() }, [load])

  function openNew() {
    setForm({ title: '', description: '', category: 'pregnancy', subcategory: '', whatsapp_number: '', logo_url: '', display_order: partners.length, cost: '', cost_notes: '' })
    setEditing(null)
    setAdding(true)
  }

  function openEdit(p: ServicePartner) {
    const info = adminInfo[p.id]
    setForm({ title: p.title, description: p.description ?? '', category: p.category, subcategory: subcatLabel(p.subcategory) === 'ללא נושא' ? '' : subcatLabel(p.subcategory), whatsapp_number: p.whatsapp_number ?? '', logo_url: p.logo_url ?? '', display_order: p.display_order, cost: info?.cost != null ? String(info.cost) : '', cost_notes: info?.cost_notes ?? '' })
    setEditing(p)
    setAdding(true)
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const { cost, cost_notes, ...partnerForm } = form
    const payload = { ...partnerForm, subcategory: form.subcategory.trim() || null }
    let vendorId = editing?.id ?? null
    if (editing) {
      await supabase.from('service_partners').update(payload).eq('id', editing.id)
    } else {
      const { data: inserted } = await supabase.from('service_partners').insert({ ...payload, is_active: true }).select('id').single()
      vendorId = (inserted as { id: string } | null)?.id ?? null
    }
    // Admin-only cost info — separate table (see vendor_admin_info).
    if (vendorId) {
      await supabase.from('vendor_admin_info').upsert({
        vendor_id: vendorId,
        cost: cost !== '' ? parseFloat(cost) : null,
        cost_notes: cost_notes.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'vendor_id' })
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

  async function performDelete() {
    if (!pendingDelete) return
    setDeletingBusy(true)
    await supabase.from('service_partners').delete().eq('id', pendingDelete.id)
    setPartners(prev => prev.filter(x => x.id !== pendingDelete.id))
    setDeletingBusy(false)
    setPendingDelete(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-sand-600">{partners.length} ספקים</p>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold"
          style={{ background: '#C8A460', color: '#33281B' }}>
          <Plus className="w-4 h-4" /> ספק חדש
        </button>
      </div>

      {/* Topic filter chips — הכל / one per existing topic */}
      {partners.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
          {[null, ...[...new Set(partners.map(p => subcatLabel(p.subcategory)))]].map(t => (
            <button key={t ?? 'all'} onClick={() => setTopicFilter(t)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${topicFilter === t ? 'text-white shadow-sm' : 'bg-white text-sand-500 border border-sand-200'}`}
              style={topicFilter === t ? { background: '#E7C78A' } : {}}>
              {t ?? 'הכל'}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
          <p className="font-bold text-sand-800 text-sm">{editing ? 'עריכת ספק' : 'ספק חדש'}</p>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="שם הספק / נותנת השירות"
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
            <input value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
              list="partner-subcats" placeholder="נושא / תיקייה — למשל: מאמנות כושר"
              className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400" />
            <datalist id="partner-subcats">
              {[...new Set([...partners.map(p => subcatLabel(p.subcategory)), ...SUBCAT_PRESETS])].filter(s => s !== 'ללא נושא').map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))}
            placeholder="מספר WhatsApp (972...)" dir="ltr"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
            placeholder="קישור לתמונה (אופציונלי)" dir="ltr"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400" />
          {/* Admin-only cost block — stored in vendor_admin_info (admin
              RLS), never shown to users anywhere in the app */}
          <div className="rounded-2xl p-3 space-y-2" style={{ background: '#F8F4EC', border: '1px dashed #C6BDA0' }}>
            <p className="text-xs font-bold text-sand-600">💰 עלות — לעיניים שלך בלבד (לא מוצג לאמהות)</p>
            <div className="flex gap-2">
              <input value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                placeholder="עלות לאירוע (₪)" type="number" min="0"
                className="w-36 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400" />
              <input value={form.cost_notes} onChange={e => setForm(f => ({ ...f, cost_notes: e.target.value }))}
                placeholder="הערות — מה כלול, תנאים, התרשמות..."
                className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm bg-white focus:outline-none focus:border-mustard-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40"
              style={{ background: '#E7C78A' }}>
              {saving ? '...' : editing ? 'שמור שינויים' : 'הוסף'}
            </button>
            <button onClick={() => { setAdding(false); setEditing(null) }}
              className="px-4 py-2.5 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
          </div>
        </div>
      )}

      {/* Vendors grouped into collapsible topic folders */}
      {(() => {
        const groups: { name: string; items: ServicePartner[] }[] = []
        for (const p of partners) {
          const name = subcatLabel(p.subcategory)
          if (topicFilter && name !== topicFilter) continue
          const g = groups.find(x => x.name === name)
          if (g) g.items.push(p)
          else groups.push({ name, items: [p] })
        }
        return groups.map(g => (
          <div key={g.name} className="space-y-2">
            <button
              onClick={() => setClosedGroups(c => ({ ...c, [g.name]: !c[g.name] }))}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white rounded-2xl shadow-sm border border-sand-100"
            >
              <span className="font-bold text-sand-700" style={{ fontSize: 15 }}>{g.name} <span className="text-sand-500 font-semibold">({g.items.length})</span></span>
              <ChevronDown className={`w-4 h-4 text-sand-400 transition-transform ${closedGroups[g.name] ? '' : 'rotate-180'}`} />
            </button>
            {!closedGroups[g.name] && (
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {g.items.map(p => (
                  <div
                    key={p.id}
                    className="relative flex flex-col"
                    style={p.is_active
                      ? { background: '#fff', border: '1px solid #E4DAD0', borderRadius: 20, padding: 18, gap: 12 }
                      : { background: '#F8F4EC', border: '1px dashed #C6BDA0', borderRadius: 20, padding: 18, gap: 12, opacity: 0.85 }}
                  >
                    {/* is_active pill toggle — same handler as the old row icon */}
                    <button
                      onClick={() => toggleActive(p)}
                      title={p.is_active ? 'הסתר' : 'הפעל'}
                      dir="ltr"
                      className="absolute"
                      style={{ top: 14, left: 14, width: 42, height: 24, borderRadius: 9999, background: p.is_active ? '#818267' : '#DCD4C8', padding: 3, display: 'flex', alignItems: 'center', justifyContent: p.is_active ? 'flex-end' : 'flex-start', transition: 'background .15s' }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 9999, background: '#fff', display: 'block' }} />
                    </button>
                    <div className="flex items-center gap-3">
                      {p.logo_url
                        ? <img src={p.logo_url} alt="" className="flex-shrink-0 object-cover" style={{ width: 50, height: 50, borderRadius: 16 }} />
                        : (
                          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 50, height: 50, borderRadius: 16, background: '#E4EBEF', color: '#3E5966', fontWeight: 700, fontSize: 22 }}>
                            {(p.title ?? '').trim().charAt(0) || '?'}
                          </div>
                        )}
                      <div className="min-w-0">
                        <p className="truncate" style={{ fontWeight: 700, fontSize: 16, color: '#443327' }}>{p.title}</p>
                        <p className="truncate" style={{ fontWeight: 600, fontSize: 13, color: '#7B604C' }}>
                          {subcatLabel(p.subcategory)} · {p.category === 'pregnancy' ? 'הריון' : 'אמהות'}
                        </p>
                        {/* Admin-only cost chip — from vendor_admin_info */}
                        {adminInfo[p.id]?.cost != null && (
                          <p className="truncate mt-0.5" style={{ fontWeight: 700, fontSize: 13, color: '#8A6A2F' }} title={adminInfo[p.id]?.cost_notes ?? undefined}>
                            💰 ₪{adminInfo[p.id].cost} לאירוע
                            {adminInfo[p.id]?.cost_notes && <span style={{ fontWeight: 500, color: '#957860' }}> · {adminInfo[p.id].cost_notes}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    {p.description && (
                      <p className="line-clamp-3" style={{ fontWeight: 400, fontSize: 14, lineHeight: 1.55, color: '#7B604C' }}>{p.description}</p>
                    )}
                    {/* Phase 6: leads + upcoming-event context ON the vendor */}
                    {((leadsByVendor[p.id]?.length ?? 0) > 0 || (eventsByVendor[p.id]?.length ?? 0) > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(leadsByVendor[p.id]?.length ?? 0) > 0 && (
                          <button
                            onClick={() => setOpenLeadsVendor(cur => cur === p.id ? null : p.id)}
                            className="font-bold rounded-full transition-all hover:brightness-95"
                            style={{ fontSize: 12, padding: '4px 10px', background: '#E4EBEF', color: '#3E5966' }}
                          >
                            📞 {leadsByVendor[p.id].length} לידים {openLeadsVendor === p.id ? '▲' : '▼'}
                          </button>
                        )}
                        {(eventsByVendor[p.id]?.length ?? 0) > 0 && (
                          <span className="font-bold rounded-full" style={{ fontSize: 12, padding: '4px 10px', background: '#F4EDE1', color: '#8A6A2F' }} title={eventsByVendor[p.id].map(e => e.title).join(', ')}>
                            🎪 אירוע קרוב: {(() => { const [, m2, d2] = eventsByVendor[p.id][0].event_date.split('-'); return `${d2}/${m2}` })()}
                          </span>
                        )}
                      </div>
                    )}
                    {openLeadsVendor === p.id && (leadsByVendor[p.id]?.length ?? 0) > 0 && (
                      <div className="space-y-1.5 rounded-xl p-2.5" style={{ background: '#F8F4EC' }}>
                        {leadsByVendor[p.id].slice(0, 6).map(l => (
                          <div key={l.id} className="flex items-center gap-2">
                            <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: 600, color: '#443327' }}>
                              {l.contact_name ?? 'ללא שם'}
                              <span style={{ color: '#A2937D', fontWeight: 500 }}> · {(() => { const [, m2, d2] = l.created_at.slice(0, 10).split('-'); return `${d2}/${m2}` })()} · {l.action_type === 'callback' ? 'ביקשה שיחה' : 'וואטסאפ'}</span>
                            </span>
                            {l.contact_phone && (
                              <a href={`https://wa.me/${l.contact_phone.replace(/\D/g, '').replace(/^0/, '972')}`} target="_blank" rel="noopener noreferrer"
                                className="flex-shrink-0 font-bold" style={{ fontSize: 12, color: '#A35C3D' }}>
                                💬 {l.contact_phone}
                              </a>
                            )}
                          </div>
                        ))}
                        {leadsByVendor[p.id].length > 6 && (
                          <p style={{ fontSize: 12, color: '#A2937D' }}>ועוד {leadsByVendor[p.id].length - 6} בטאב לידים</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-4" style={{ borderTop: '1px solid #F0EBE3', paddingTop: 12, marginTop: 'auto' }}>
                      {p.whatsapp_number && (
                        <a
                          href={`https://wa.me/${p.whatsapp_number.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1"
                          style={{ color: '#A35C3D', fontWeight: 700, fontSize: 14 }}
                        >
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                        </a>
                      )}
                      <button onClick={() => openEdit(p)} style={{ color: '#7B604C', fontWeight: 700, fontSize: 14 }}>
                        עריכה
                      </button>
                      <button
                        onClick={() => setPendingDelete(p)}
                        className="p-1.5 text-sand-300 hover:text-red-400 transition-colors"
                        style={{ marginInlineStart: 'auto' }}
                        title="מחיקה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      })()}
      {partners.length === 0 && !adding && <p className="text-center text-sand-400 text-sm py-8">אין ספקים עדיין</p>}
      <ConfirmDialog
        open={!!pendingDelete}
        itemName={pendingDelete?.title ?? 'הספק'}
        title="מחיקת ספק"
        busy={deletingBusy}
        onConfirm={performDelete}
        onClose={() => setPendingDelete(null)}
      />
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
              style={filterType === t ? { background: '#E7C78A' } : {}}>
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
            <span className={`text-[13px] px-2 py-1 rounded-xl font-bold flex-shrink-0 ${l.action_type === 'whatsapp' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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

// ─── Registrations Tab (public ?register page leads) ──────────────────────────
type RegistrationLead = {
  id: string
  name: string
  phone: string
  email: string
  selected_workshop_id: string | null
  status: 'pending' | 'paid' | 'handled'
  source: string | null
  created_at: string
  // Phase 5 / A1: attached cohort ("מחזור"). Nullable — existing
  // registrations remain valid until admin assigns one.
  cohort_id: string | null
  workshops?: { title: string } | null
}

// "DD/MM/YY HH:MM · label" or "DD/MM/YY · label" when no time set.
// Used in group headers + (compact variant) the picker option.
function cohortDateTimeLabel(c: WorkshopCohort, opts: { shortYear?: boolean } = {}): string {
  const [y, m, d] = c.start_date.split('-')
  const year = opts.shortYear ? y.slice(2) : y
  const time = c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''
  return `${d}/${m}/${year}${time}`
}

// Phase 5 / A3 fix-2: cohort considered "past" once its start moment
// is behind us. NULL start_time = whole-day event, so a date-only
// cohort isn't past until the day itself has fully passed (i.e.
// today's local date > start_date).
function isCohortPast(c: WorkshopCohort): boolean {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${day}`
  if (c.start_date < today) return true
  if (c.start_date > today) return false
  // Same calendar day: depends on start_time. NULL = not past yet.
  if (!c.start_time) return false
  const [hh, mm] = c.start_time.split(':').map(Number)
  const cohortMoment = new Date()
  cohortMoment.setHours(hh, mm, 0, 0)
  return d > cohortMoment
}

// Display-derived effective status. The DB still holds the financial
// truth (paid stays paid); the display rolls 'paid' → 'handled' once
// the assigned cohort is past, so admin sees מומש without a cron job
// destroying the original record. Reversible: move the cohort date,
// the display flips back.
//
// Rules:
//   - stored 'pending' → always 'pending'
//   - stored 'handled' → always 'handled' (manual override sticks even
//     on future cohorts)
//   - stored 'paid' → 'handled' iff cohort assigned AND cohort past;
//     otherwise stays 'paid'
//   - no cohort / cohort missing from map → no auto-flip; dateless
//     registrations (ליווי פרטני וכו') live in their own פרטני section
//     instead of aging out by time.
function effectiveStatus(
  lead: RegistrationLead,
  cohortById: Map<string, WorkshopCohort>,
): RegistrationLead['status'] {
  if (lead.status !== 'paid') return lead.status
  if (!lead.cohort_id) return lead.status
  const c = cohortById.get(lead.cohort_id)
  if (!c) return lead.status
  return isCohortPast(c) ? 'handled' : 'paid'
}

function RegistrationsTab({ focusLeadIds }: { focusLeadIds?: string[] } = {}) {
  const [leads, setLeads] = useState<RegistrationLead[]>([])
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  // Phase 5 / A1: all cohorts loaded once and filtered client-side per
  // registration's workshop in the picker. Includes inactive cohorts so
  // existing assignments to deactivated cohorts still render their
  // label (no orphan rows).
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  // Phase 5 / A2 Stage 3: linked-form submissions for the gap report.
  // One batched query per RegistrationsTab load — admin scale, totally
  // fine. The resolver runs over these once to build filledIndex.
  type LinkedFormDef = { id: string; title: string; fields_json: { id: string; type: string; label: string; role?: 'name' | 'phone' | 'email' | 'none' }[]; public_link_enabled: boolean }
  type LinkedSubmission = { id: string; form_id: string; user_id: string | null; responses_json: Record<string, unknown>; created_at: string; user_profiles?: { mother_name: string | null; email: string | null } | null }
  const [linkedFormDefs, setLinkedFormDefs] = useState<Map<string, LinkedFormDef>>(new Map())
  const [linkedSubmissions, setLinkedSubmissions] = useState<LinkedSubmission[]>([])
  // Screen A / A1: ONE filter layer. The old status chips, the cohort
  // dropdown and the רשימה/מחזורים tabs are gone — the list is always
  // grouped by cohort, filtered by exactly one chip row.
  const [chip, setChip] = useState<'all' | 'pending' | 'no_form' | 'paid'>('all')
  const [workshopFilter, setWorkshopFilter] = useState<string>('all')
  // פרטני section: dateless products (no cohorts defined) get their own
  // bucket so they don't clutter the main cohort-based list forever.
  const [showPrivateSection, setShowPrivateSection] = useState(false)
  // Workshop-first UX: the page opens with a workshop picker, not a
  // 90-row list. A registration list renders only after a choice
  // (workshop / פרטני / search / "הצג הכל").
  const [showAllAnyway, setShowAllAnyway] = useState(false)
  const [search, setSearch] = useState('')
  // Phase 5 / A3: bulk-action selection. Persists across filter and
  // view-mode changes for convenience, but bulk actions act ONLY on
  // rows that are both selected AND currently visible — the bar
  // always displays the visible/total split so the user sees exactly
  // what an action will hit. Reset on tab switch (component unmount).
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectGroup(groupLeads: RegistrationLead[]) {
    setSelected(prev => {
      const next = new Set(prev)
      const allOn = groupLeads.every(l => next.has(l.id))
      if (allOn) {
        for (const l of groupLeads) next.delete(l.id)
      } else {
        for (const l of groupLeads) next.add(l.id)
      }
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const load = useCallback(async () => {
    const [{ data: l }, { data: w }, { data: c }] = await Promise.all([
      supabase.from('registration_leads').select('*, workshops:selected_workshop_id(title)').order('created_at', { ascending: false }),
      supabase.from('workshops').select('*').order('display_order'),
      supabase.from('workshop_cohorts').select('*').order('start_date', { ascending: false }),
    ])
    setLeads((l ?? []) as RegistrationLead[])
    const wsList = (w ?? []) as Workshop[]
    setWorkshops(wsList)
    setCohorts((c ?? []) as WorkshopCohort[])

    // Phase 5 / A2 Stage 3: load all submissions for the union of
    // workshop linked forms. Batched — one query each for the forms
    // (need fields_json for the resolver + public_link_enabled +
    // title) and the submissions themselves.
    const linkedFormIds = Array.from(
      new Set(wsList.map(x => x.linked_form_id).filter((x): x is string => !!x)),
    )
    if (linkedFormIds.length === 0) {
      setLinkedFormDefs(new Map())
      setLinkedSubmissions([])
      return
    }
    // Phase 5 / A2 Stage 3 fix: use select('*') instead of an explicit
    // column list. The explicit list silently returned 0 rows even
    // though linked_form_id arrived on workshops and form_submissions
    // returned 26 rows for the same IDs — likely a PostgREST
    // schema-cache fragility on one of `fields_json` /
    // `public_link_enabled`. select('*') mirrors the FormsTab pattern
    // (known-working) and brings all columns the resolver needs.
    // Errors are logged to the console so future silent failures are
    // visible.
    const [formsRes, subsRes] = await Promise.all([
      supabase.from('forms').select('*').in('id', linkedFormIds),
      supabase
        .from('form_submissions')
        .select('id, form_id, user_id, responses_json, created_at, user_profiles(mother_name, email)')
        .in('form_id', linkedFormIds),
    ])
    if (formsRes.error) console.error('[gap-report] forms query error:', formsRes.error)
    if (subsRes.error) console.error('[gap-report] form_submissions query error:', subsRes.error)
    setLinkedFormDefs(new Map(((formsRes.data ?? []) as LinkedFormDef[]).map(f => [f.id, f])))
    setLinkedSubmissions((subsRes.data ?? []) as unknown as LinkedSubmission[])
  }, [])
  useEffect(() => { load() }, [load])

  // Screen A / A3: single-person edits (status, contact, cohort,
  // delete) live in the panel now. It writes to supabase itself and
  // announces; the list refetches.
  useEffect(() => {
    const h = () => { load() }
    window.addEventListener(REGISTRATIONS_CHANGED_EVENT, h)
    return () => window.removeEventListener(REGISTRATIONS_CHANGED_EVENT, h)
  }, [load])

  async function updateStatus(id: string, status: RegistrationLead['status']) {
    await supabase.from('registration_leads').update({ status }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  // Phase 5 / A3 fix-2: cohorts keyed by id for fast effective-status
  // lookup. Recompute when the cohorts list changes.
  const cohortById = useMemo(() => {
    const m = new Map<string, WorkshopCohort>()
    for (const c of cohorts) m.set(c.id, c)
    return m
  }, [cohorts])

  // Phase 5 / A2 Stage 3: filledIndex maps "<formId>|p|<normalizedPhone>"
  // and "<formId>|e|<lowerEmail>" → present iff that person has
  // submitted that linked form. Built once per load using the A4
  // resolver. Per-row gap lookup is then O(1) Set check.
  const workshopIdsWithCohorts = useMemo(() => new Set(cohorts.map(c => c.workshop_id)), [cohorts])

  // Workshops with a live future: an active cohort that hasn't started
  // yet. Only these earn a picker card — a workshop whose cohorts are
  // all past isn't "activity", it just crowds the page (Yahav: בוקר של
  // מימו has no upcoming cohort — don't show it). Everything stays
  // reachable through the full-list link.
  const workshopIdsWithUpcoming = useMemo(
    () => new Set(cohorts.filter(c => c.is_active && !isCohortPast(c)).map(c => c.workshop_id)),
    [cohorts],
  )

  // Nearest upcoming cohort per workshop — shown on the picker card so
  // the next date jumps out without drilling in.
  const nextCohortByWorkshop = useMemo(() => {
    const m = new Map<string, WorkshopCohort>()
    for (const c of cohorts) {
      if (!c.is_active || isCohortPast(c)) continue
      const cur = m.get(c.workshop_id)
      if (!cur || c.start_date < cur.start_date || (c.start_date === cur.start_date && (c.start_time ?? '') < (cur.start_time ?? ''))) {
        m.set(c.workshop_id, c)
      }
    }
    return m
  }, [cohorts])

  const workshopById = useMemo(() => {
    const m = new Map<string, Workshop>()
    for (const w of workshops) m.set(w.id, w)
    return m
  }, [workshops])

  const filledIndex = useMemo(() => {
    const idx = new Set<string>()
    for (const sub of linkedSubmissions) {
      const form = linkedFormDefs.get(sub.form_id)
      if (!form) continue
      const r = resolveSubmitter(
        { fields_json: form.fields_json },
        { responses_json: sub.responses_json, user_profiles: sub.user_profiles ?? null },
      )
      const phone = normalizeIlPhone(r.phone)
      const emailL = r.email?.toLowerCase().trim()
      if (phone) idx.add(`${sub.form_id}|p|${phone}`)
      if (emailL) idx.add(`${sub.form_id}|e|${emailL}`)
    }
    return idx
  }, [linkedSubmissions, linkedFormDefs])

  // Per-lead gap status: which linked form (if any), and whether she
  // filled it. Cached by lead.id so re-renders are cheap.
  type GapStatus = {
    form: { id: string; title: string; public_link_enabled: boolean }
    isFilled: boolean
  }
  const gapByLeadId = useMemo(() => {
    const m = new Map<string, GapStatus | null>()
    for (const lead of leads) {
      const w = lead.selected_workshop_id ? workshopById.get(lead.selected_workshop_id) : null
      if (!w?.linked_form_id) { m.set(lead.id, null); continue }
      const form = linkedFormDefs.get(w.linked_form_id)
      if (!form) { m.set(lead.id, null); continue }
      const phone = normalizeIlPhone(lead.phone)
      const emailL = lead.email?.toLowerCase().trim()
      const isFilled = (!!phone && filledIndex.has(`${form.id}|p|${phone}`))
        || (!!emailL && filledIndex.has(`${form.id}|e|${emailL}`))
      m.set(lead.id, { form: { id: form.id, title: form.title, public_link_enabled: form.public_link_enabled }, isFilled })
    }
    return m
  }, [leads, workshopById, linkedFormDefs, filledIndex])

  const filtered = useMemo(() => {
    // Phase 3 focus mode (handoff §4): a task click lands here with the
    // exact lead ids — show them and nothing else, bypassing the picker.
    if (focusLeadIds) {
      const set = new Set(focusLeadIds)
      return leads.filter(l => set.has(l.id))
    }
    if (workshopFilter === 'all' && !showPrivateSection && !search.trim() && !showAllAnyway) return []
    return leads.filter(l => {
      // The chip targets the EFFECTIVE status (paid + past cohort
      // displays as מומש and is neither ממתינה nor שילמה).
      const eff = effectiveStatus(l, cohortById)
      // Dateless products (workshop with no cohorts at all, or no
      // workshop) belong to the פרטני section; the main list hides them.
      const isDateless = !l.selected_workshop_id || !workshopIdsWithCohorts.has(l.selected_workshop_id)
      if (showPrivateSection !== isDateless) return false
      if (workshopFilter !== 'all' && l.selected_workshop_id !== workshopFilter) return false
      if (chip === 'pending' && eff !== 'pending') return false
      if (chip === 'paid' && eff !== 'paid') return false
      if (chip === 'no_form') {
        const gap = gapByLeadId.get(l.id)
        if (!gap || gap.isFilled) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q) && !l.email.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [leads, chip, workshopFilter, search, cohortById, showPrivateSection, workshopIdsWithCohorts, showAllAnyway, focusLeadIds, gapByLeadId])

  // Chip counts also reflect effective status so the numbers match
  // what the filter would actually surface.
  const counts = useMemo(() => {
    const c = { all: leads.length, pending: 0, paid: 0, handled: 0 } as Record<'all' | RegistrationLead['status'], number>
    for (const l of leads) c[effectiveStatus(l, cohortById)]++
    return c
  }, [leads, cohortById])


  // Polish #8: cohort-scoped form responses modal. Opened from a
  // CohortGroup header button when the cohort's workshop has a linked
  // form. The modal reuses FormSubmissionsModal + FormSubmissionsView +
  // FormAggregatePanel (same components the Forms page uses) so the
  // Q/A layout stays identical — only the submissions list is scoped.
  // Filtering is done via the same phone/email identity check that
  // powers the gap report: resolve each submission's submitter via the
  // A4 resolver, then match against the cohort leads' normalized
  // phones + lowercase emails. Submission-list state lives here so it
  // can be mutated by the modal's delete + form-saved callbacks.
  const [cohortResponses, setCohortResponses] = useState<
    { cohort: WorkshopCohort; form: LinkedFormDef; subs: LinkedSubmission[] } | null
  >(null)
  const [cohortRespFilter, setCohortRespFilter] = useState<string | null>(null)

  const openCohortResponses = useCallback((cohort: WorkshopCohort) => {
    const w = workshopById.get(cohort.workshop_id)
    if (!w?.linked_form_id) return
    const form = linkedFormDefs.get(w.linked_form_id)
    if (!form) return
    const cohortLeads = leads.filter(l => l.cohort_id === cohort.id)
    const identities = new Set<string>()
    for (const l of cohortLeads) {
      const p = normalizeIlPhone(l.phone)
      const e = l.email?.toLowerCase().trim()
      if (p) identities.add(`p|${p}`)
      if (e) identities.add(`e|${e}`)
    }
    const subs = linkedSubmissions.filter(sub => {
      if (sub.form_id !== form.id) return false
      const r = resolveSubmitter(
        { fields_json: form.fields_json },
        { responses_json: sub.responses_json, user_profiles: sub.user_profiles ?? null },
      )
      const p = normalizeIlPhone(r.phone)
      const e = r.email?.toLowerCase().trim()
      return (!!p && identities.has(`p|${p}`)) || (!!e && identities.has(`e|${e}`))
    })
    setCohortResponses({ cohort, form, subs })
    setCohortRespFilter(null)
  }, [leads, linkedFormDefs, linkedSubmissions, workshopById])

  // Task A: confirmation lives inside FormSubmissionsView (one dialog
  // covers every "delete this submission" surface). Caller just runs
  // the actual delete here.
  async function deleteCohortSubmission(id: string) {
    await supabase.from('form_submissions').delete().eq('id', id)
    setLinkedSubmissions(prev => prev.filter(s => s.id !== id))
    setCohortResponses(prev =>
      prev ? { ...prev, subs: prev.subs.filter(s => s.id !== id) } : prev,
    )
  }

  async function refreshCohortResponsesForm() {
    if (!cohortResponses) return
    const { data } = await supabase
      .from('forms')
      .select('*')
      .eq('id', cohortResponses.form.id)
      .single()
    if (!data) return
    const fresh = data as LinkedFormDef
    setLinkedFormDefs(prev => {
      const next = new Map(prev)
      next.set(fresh.id, fresh)
      return next
    })
    setCohortResponses(prev => prev ? { ...prev, form: fresh } : prev)
  }

  // Phase 5 / A3: visible-selected = intersection of `selected` with
  // the currently-filtered list. Bulk actions act on this set, NEVER
  // on hidden selections — guarantees no surprise edits.
  const visibleSelectedIds = useMemo(() => {
    if (selected.size === 0) return [] as string[]
    return filtered.filter(l => selected.has(l.id)).map(l => l.id)
  }, [filtered, selected])

  async function bulkSetStatus(status: RegistrationLead['status']) {
    if (visibleSelectedIds.length === 0) return
    const idSet = new Set(visibleSelectedIds)
    await supabase.from('registration_leads').update({ status }).in('id', visibleSelectedIds)
    setLeads(prev => prev.map(l => idSet.has(l.id) ? { ...l, status } : l))
    // Selection NOT cleared — user may want to chain another action
    // (e.g. copy phones, then mark שילמה). Explicit × clears.
  }

  // Screen A / A4: the bar's reminder action targets the selected rows
  // whose questionnaire is missing (the only ones a reminder makes
  // sense for). One target → open WhatsApp; several → copy phones.
  const reminderTargets = useMemo(() => {
    const idSet = new Set(visibleSelectedIds)
    const out: { href: string; phone: string }[] = []
    for (const l of filtered) {
      if (!idSet.has(l.id)) continue
      const href = regReminderHref(l, cohorts, workshops, gapByLeadId.get(l.id) ?? null)
      if (href) out.push({ href, phone: l.phone })
    }
    return out
  }, [visibleSelectedIds, filtered, cohorts, workshops, gapByLeadId])

  // Phase 5 / A2 Stage 3 (Part 3): manual "+ הרשמה חדשה" entry point.
  const [addRegOpen, setAddRegOpen] = useState(false)

  // README-IA PR10: per-group "עוד n" expansion in the מחכה לך inbox.
  const [inboxOpen, setInboxOpen] = useState<Record<string, boolean>>({})

  const pickerMode = !focusLeadIds && workshopFilter === 'all' && !showPrivateSection && !search.trim() && !showAllAnyway

  // Focus mode pre-selects the matching rows so the existing bulk bar
  // (visible-only contract intact) appears ready for action.
  useEffect(() => {
    if (focusLeadIds && focusLeadIds.length > 0) setSelected(new Set(focusLeadIds))
  }, [focusLeadIds])

  // Per-workshop registration counts for the picker cards.
  const pickerCards = (() => {
    const stats = new Map<string, { total: number; active: number }>()
    let privTotal = 0
    let privActive = 0
    for (const l of leads) {
      const dateless = !l.selected_workshop_id || !workshopIdsWithCohorts.has(l.selected_workshop_id)
      const isActive = effectiveStatus(l, cohortById) !== 'handled'
      if (dateless) { privTotal++; if (isActive) privActive++; continue }
      const s = stats.get(l.selected_workshop_id!) ?? { total: 0, active: 0 }
      s.total++; if (isActive) s.active++
      stats.set(l.selected_workshop_id!, s)
    }
    const withRegs = workshops.filter(w => stats.has(w.id))
    const cards = withRegs
      .filter(w => workshopIdsWithUpcoming.has(w.id))
      .map(w => ({ id: w.id, title: w.title, ...stats.get(w.id)! }))
    return { cards, privTotal, privActive, hiddenCount: withRegs.length - cards.length }
  })()

  const backToPicker = () => {
    setWorkshopFilter('all')
    setChip('all')
    setShowPrivateSection(false)
    setShowAllAnyway(false)
    setSearch('')
  }

  // README-IA PR10: "מחכה לך" inbox groups — computed from data already
  // loaded (no queries). q1 = paid, workshop has a linked form, no
  // matched submission; q2 = pending payment; q3 = paid, workshop has
  // cohorts, none assigned.
  const inboxGroups = (() => {
    const pending: RegistrationLead[] = []
    const unassigned: RegistrationLead[] = []
    const q1urgent: RegistrationLead[] = []
    const q1quiet: RegistrationLead[] = []
    // Urgency window for missing questionnaires: only cohorts starting
    // within the next 3 days are loud (Yahav: a week out = there's
    // time, don't shout). No cohort date = can't be urgent.
    const soonLimit = (() => {
      const d = new Date()
      d.setDate(d.getDate() + 3)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${dd}`
    })()
    for (const l of leads) {
      const eff = effectiveStatus(l, cohortById)
      const gap = gapByLeadId.get(l.id)
      if (eff === 'pending') pending.push(l)
      if (eff === 'paid' && l.selected_workshop_id && workshopIdsWithCohorts.has(l.selected_workshop_id) && !l.cohort_id) unassigned.push(l)
      if (eff === 'paid' && gap && !gap.isFilled) {
        const c = l.cohort_id ? cohortById.get(l.cohort_id) : null
        if (c && c.start_date <= soonLimit) q1urgent.push(l)
        else q1quiet.push(l)
      }
    }
    return { pending, unassigned, q1urgent, q1quiet, total: pending.length + unassigned.length + q1urgent.length }
  })()
  const unfilledByWorkshop = (() => {
    const m = new Map<string, number>()
    for (const l of [...inboxGroups.q1urgent, ...inboxGroups.q1quiet]) {
      if (!l.selected_workshop_id) continue
      m.set(l.selected_workshop_id, (m.get(l.selected_workshop_id) ?? 0) + 1)
    }
    return m
  })()
  // Row click in the inbox drills into that lead's workshop (or the
  // פרטני bucket for dateless products).
  const drillToLead = (l: RegistrationLead) => {
    const dateless = !l.selected_workshop_id || !workshopIdsWithCohorts.has(l.selected_workshop_id)
    if (dateless) setShowPrivateSection(true)
    else setWorkshopFilter(l.selected_workshop_id!)
    setShowAllAnyway(false)
  }

  // PR10 follow-up: non-urgent unfilled questionnaires (cohort further
  // than 7 days out, or no cohort date) collapse into one quiet footer
  // line — "יש עוד זמן" — instead of shouting from the warm strips.
  const renderQuietFooter = (withTopBorder: boolean) => {
    if (inboxGroups.q1quiet.length === 0) return null
    return (
      <div className={withTopBorder ? 'border-t border-[#F0EBE3]' : undefined}>
        <button
          onClick={() => setInboxOpen(o => ({ ...o, quiet: !o.quiet }))}
          className="w-full flex items-center justify-between text-right"
          style={{ fontWeight: 600, fontSize: 14, color: '#7B604C', padding: '12px 20px' }}
        >
          <span>עוד {inboxGroups.q1quiet.length} שאלונים לא מולאו — יש עוד זמן</span>
          <ChevronDown className={`flex-shrink-0 transition-transform ${inboxOpen.quiet ? 'rotate-180' : ''}`} style={{ width: 16, height: 16 }} />
        </button>
        {inboxOpen.quiet && inboxGroups.q1quiet.map(l => {
          const cohort = l.cohort_id ? cohortById.get(l.cohort_id) : null
          const wTitle = (l.selected_workshop_id ? workshopById.get(l.selected_workshop_id)?.title : null) ?? l.workshops?.title ?? '—'
          const gap = gapByLeadId.get(l.id)
          const href = regReminderHref(l, cohorts, workshops, gap ?? null)
          return (
            <div
              key={l.id}
              onClick={() => drillToLead(l)}
              className="flex items-center cursor-pointer border-t border-[#F0EBE3] hover:bg-[#FBF8F3] transition-colors"
              style={{ padding: '15px 20px', gap: 16 }}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontWeight: 700, fontSize: 17, color: '#443327' }}>{l.name}</p>
                <p className="truncate" style={{ fontWeight: 600, fontSize: 14, color: '#7B604C' }}>
                  {wTitle} · {cohort ? `מחזור ${cohortDateTimeLabel(cohort, { shortYear: true })}` : 'אין מחזור'}
                </p>
              </div>
              <span className="whitespace-nowrap flex-shrink-0" style={{ fontWeight: 700, fontSize: 13, color: '#8B4A30', background: '#F5E2D8', padding: '5px 12px', borderRadius: 9999 }}>שאלון לא מולא</span>
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="whitespace-nowrap flex-shrink-0" style={{ fontWeight: 700, fontSize: 14, color: '#A35C3D' }}>
                  שלחי תזכורת
                </a>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* README-IA PR10: compact header — one search + new-registration. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2" style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 440, background: '#F8F4EC', border: '1px solid #E4DAD0', borderRadius: 16, padding: '0 14px', height: 44 }}>
          <Search className="flex-shrink-0" style={{ width: 17, height: 17, color: '#7B604C' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="שם, טלפון או אימייל"
            className="flex-1 min-w-0 bg-transparent focus:outline-none placeholder:text-[#7B604C]"
            style={{ fontSize: 15, color: '#443327', height: '100%' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setAddRegOpen(true)}
          className="inline-flex items-center gap-2 transition-all hover:shadow-sm"
          style={{ background: '#C8A460', color: '#33281B', borderRadius: 16, padding: '12px 20px', fontWeight: 700, fontSize: 15 }}
        >
          <Plus style={{ width: 17, height: 17 }} />
          הרשמה חדשה
        </button>
        <a
          href="?register"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
          style={{ fontWeight: 700, fontSize: 14, color: '#A35C3D' }}
          title="עמוד ההרשמה הציבורי — מה שהאמהות רואות"
        >
          עמוד ההרשמה
          <ExternalLink style={{ width: 14, height: 14 }} />
        </a>
      </div>
      {addRegOpen && (
        <AddRegistrationModal
          mode="new-mother"
          onClose={() => setAddRegOpen(false)}
          onSaved={load}
        />
      )}

      {/* ── לפי סדנה — workshop picker, the page's opening state ── */}
      {pickerMode && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 style={{ fontWeight: 700, fontSize: 22, color: '#443327' }}>לפי סדנה</h2>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#7B604C' }}>{leads.length} הרשמות · {counts.pending + counts.paid} פעילות</span>
            <button onClick={() => setShowAllAnyway(true)} className="hover:underline" style={{ fontWeight: 700, fontSize: 14, color: '#A35C3D', marginInlineStart: 'auto' }}>
              הצגת כל ההרשמות ברשימה אחת
            </button>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {pickerCards.cards.map(c => (
              <button
                key={c.id}
                onClick={() => { setWorkshopFilter(c.id); setShowAllAnyway(false) }}
                className="text-right transition-all hover:shadow-sm"
                style={{ border: '1px solid #E4DAD0', borderRadius: 18, padding: '16px 18px', background: c.active > 0 ? '#fff' : '#FAF7F1' }}
              >
                <p className="font-bold" style={{ fontSize: 15, color: '#443327' }}>{c.title}</p>
                {nextCohortByWorkshop.has(c.id) && (
                  <p className="mt-1 font-bold flex items-center gap-1" style={{ fontSize: 13, color: '#8A6A2F' }}>
                    <CalendarDays style={{ width: 14, height: 14 }} />
                    מחזור קרוב · {cohortDateTimeLabel(nextCohortByWorkshop.get(c.id)!, { shortYear: true })}
                  </p>
                )}
                <p className="mt-1.5 font-semibold" style={{ fontSize: 13, color: '#7B604C' }}>
                  {c.active > 0
                    ? <><span style={{ color: '#8A6A2F', fontWeight: 700 }}>{c.active} פעילות</span> · {c.total} סה"כ</>
                    : `${c.total} סה"כ · אין פעילות`}
                </p>
                {(unfilledByWorkshop.get(c.id) ?? 0) > 0 && (
                  <span className="inline-block mt-2 whitespace-nowrap" style={{ fontWeight: 700, fontSize: 13, color: '#8B4A30', background: '#F5E2D8', padding: '4px 10px', borderRadius: 9999 }}>
                    {unfilledByWorkshop.get(c.id)} שאלונים
                  </span>
                )}
              </button>
            ))}
            {pickerCards.privTotal > 0 && (
              <button
                onClick={() => { setShowPrivateSection(true); setShowAllAnyway(false) }}
                className="text-right transition-all hover:shadow-sm"
                style={{ border: '1px solid #C3CDD2', borderRadius: 18, padding: '16px 18px', background: '#E4EBEF' }}
              >
                <p className="font-bold" style={{ fontSize: 15, color: '#3E5966' }}>פרטני וללא תאריך</p>
                <p className="mt-1.5 font-semibold" style={{ fontSize: 13, color: '#3E5966' }}>
                  {pickerCards.privActive > 0 ? `${pickerCards.privActive} פעילות · ` : ''}{pickerCards.privTotal} סה"כ
                </p>
              </button>
            )}
          </div>
          {pickerCards.hiddenCount > 0 && (
            <p style={{ fontWeight: 600, fontSize: 13, color: '#7B604C' }}>
              {pickerCards.hiddenCount === 1 ? 'סדנה אחת ללא מחזור קרוב מוסתרת' : `${pickerCards.hiddenCount} סדנאות ללא מחזור קרוב מוסתרות`}
              {' · '}
              <button onClick={() => setShowAllAnyway(true)} className="hover:underline" style={{ fontWeight: 700, color: '#A35C3D' }}>לרשימה המלאה</button>
            </p>
          )}
        </div>
      )}

      {/* README-IA PR10: "מחכה לך" inbox — the page's needs-action queue. */}
      {pickerMode && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 style={{ fontWeight: 700, fontSize: 22, color: '#443327' }}>מחכה לך</h2>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#7B604C' }}>{inboxGroups.total} פריטים</span>
          </div>
          {inboxGroups.total === 0 ? (
            <>
              <div className="bg-white flex flex-col items-center text-center" style={{ border: '1px solid #E4DAD0', borderRadius: 20, padding: 40 }}>
                <MimoDuck variant="chick" size={64} />
                <p className="font-display" style={{ fontSize: 26, color: '#5E4938', marginTop: 10 }}>הכל מטופל</p>
                <p style={{ fontWeight: 400, fontSize: 16, color: '#7B604C', marginTop: 4 }}>אין הרשמות שמחכות לך הבוקר</p>
              </div>
              {inboxGroups.q1quiet.length > 0 && (
                <div className="bg-white" style={{ border: '1px solid #E4DAD0', borderRadius: 20, overflow: 'hidden' }}>
                  {renderQuietFooter(false)}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white" style={{ border: '1px solid #E4DAD0', borderRadius: 20, overflow: 'hidden' }}>
              {([
                { key: 'q2', items: inboxGroups.pending, stripBg: '#F5E2D8', stripBorder: '#E8C3B2', stripColor: '#713924', icon: <CreditCard style={{ width: 17, height: 17, color: '#8B4A30' }} />, stripLabel: `${inboxGroups.pending.length} ממתינות לתשלום`, badge: { label: 'ממתינה לתשלום', color: '#8B4A30', bg: '#F5E2D8' }, action: null },
                { key: 'q3', items: inboxGroups.unassigned, stripBg: '#E4EBEF', stripBorder: '#D3DEE4', stripColor: '#3E5966', icon: <CalendarDays style={{ width: 17, height: 17, color: '#3E5966' }} />, stripLabel: `${inboxGroups.unassigned.length} ללא שיבוץ למחזור`, badge: { label: 'ללא שיבוץ', color: '#3E5966', bg: '#E4EBEF' }, action: 'assign' as const },
                { key: 'q1', items: inboxGroups.q1urgent, stripBg: '#F5E2D8', stripBorder: '#E8C3B2', stripColor: '#713924', icon: <AlertCircle style={{ width: 17, height: 17, color: '#8B4A30' }} />, stripLabel: `${inboxGroups.q1urgent.length} שאלונים שחסרים לסדנאות הקרובות`, badge: { label: 'שאלון לא מולא', color: '#8B4A30', bg: '#F5E2D8' }, action: 'reminder' as const },
              ]).filter(g => g.items.length > 0).map(g => {
                const shown = inboxOpen[g.key] ? g.items : g.items.slice(0, 3)
                return (
                  <div key={g.key}>
                    <div className="flex items-center gap-2" style={{ background: g.stripBg, borderBottom: `1px solid ${g.stripBorder}`, padding: '10px 20px' }}>
                      {g.icon}
                      <span style={{ fontWeight: 700, fontSize: 15, color: g.stripColor }}>{g.stripLabel}</span>
                    </div>
                    {shown.map(l => {
                      const cohort = l.cohort_id ? cohortById.get(l.cohort_id) : null
                      const wTitle = (l.selected_workshop_id ? workshopById.get(l.selected_workshop_id)?.title : null) ?? l.workshops?.title ?? '—'
                      const gap = gapByLeadId.get(l.id)
                      const href = g.action === 'reminder' ? regReminderHref(l, cohorts, workshops, gap ?? null) : null
                      return (
                        <div
                          key={l.id}
                          onClick={() => drillToLead(l)}
                          className="flex items-center cursor-pointer border-b border-[#F0EBE3] last:border-b-0 hover:bg-[#FBF8F3] transition-colors"
                          style={{ padding: '15px 20px', gap: 16 }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="truncate" style={{ fontWeight: 700, fontSize: 17, color: '#443327' }}>{l.name}</p>
                            <p className="truncate" style={{ fontWeight: 600, fontSize: 14, color: '#7B604C' }}>
                              {wTitle} · {cohort ? `מחזור ${cohortDateTimeLabel(cohort, { shortYear: true })}` : 'אין מחזור'}
                            </p>
                          </div>
                          <span className="whitespace-nowrap flex-shrink-0" style={{ fontWeight: 700, fontSize: 13, color: g.badge.color, background: g.badge.bg, padding: '5px 12px', borderRadius: 9999 }}>{g.badge.label}</span>
                          {href && (
                            <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="whitespace-nowrap flex-shrink-0" style={{ fontWeight: 700, fontSize: 14, color: '#A35C3D' }}>
                              שלחי תזכורת
                            </a>
                          )}
                          {g.action === 'assign' && (
                            <>
                              <button onClick={e => { e.stopPropagation(); drillToLead(l) }} className="whitespace-nowrap flex-shrink-0" style={{ fontWeight: 700, fontSize: 14, color: '#3E5966' }}>
                                שבצי למחזור
                              </button>
                              {/* The escape hatch for a registration that never
                                  materialized (e.g. עיסוי that didn't happen):
                                  mark it מומש so it stops waiting forever. */}
                              <button onClick={e => { e.stopPropagation(); updateStatus(l.id, 'handled') }} className="whitespace-nowrap flex-shrink-0 hover:underline" style={{ fontWeight: 600, fontSize: 13, color: '#7B604C' }}>
                                סמני כמומש
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                    {g.items.length > 3 && !inboxOpen[g.key] && (
                      <button
                        onClick={() => setInboxOpen(o => ({ ...o, [g.key]: true }))}
                        className="w-full text-center border-b border-[#F0EBE3] last:border-b-0"
                        style={{ fontWeight: 700, fontSize: 14, color: '#7B604C', padding: '12px 0' }}
                      >
                        עוד {g.items.length - 3}
                      </button>
                    )}
                  </div>
                )
              })}
              {renderQuietFooter(true)}
            </div>
          )}
        </div>
      )}
      {/* ── Screen A / A1: header + the ONE chip row ── */}
      {!pickerMode && <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 lg:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={backToPicker} className="font-bold hover:underline whitespace-nowrap" style={{ fontSize: 13, color: '#8A6A2F' }}>
              → בחירת סדנה
            </button>
            <h2 className="font-bold text-sand-800 text-sm lg:text-base">
              {showPrivateSection
                ? 'פרטני וללא תאריך'
                : workshopFilter !== 'all'
                  ? (workshopById.get(workshopFilter)?.title ?? 'הרשמות')
                  : 'כל ההרשמות'}
            </h2>
          </div>
          <a
            href="?register"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#A35C3D] hover:underline"
          >
            פתחי עמוד ההרשמה ↗
          </a>
        </div>

        {/* ONE filter layer. The status chips + counters, the cohort
            dropdown and the רשימה/מחזורים tabs that used to stack here
            are deleted — this row replaces all three. */}
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'הכל'],
            ['pending', 'ממתינות לתשלום'],
            ['no_form', 'ללא שאלון'],
            ['paid', 'שילמו'],
          ] as ['all' | 'pending' | 'no_form' | 'paid', string][]).map(([v, label]) => {
            const active = chip === v
            return (
              <button
                key={v}
                onClick={() => setChip(v)}
                className="rounded-full font-bold transition-all"
                style={active
                  ? { background: '#F6ECD8', color: '#4A3A28', padding: '9px 18px', fontSize: 14, border: '1.5px solid #E7C78A' }
                  : { background: 'transparent', color: '#7B604C', padding: '9px 18px', fontSize: 14, border: '1px solid #E4DAD0' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>}

      {/* ── Screen A / A4: dark bulk bar, directly above the list ── */}
      {!pickerMode && (
        <BulkActionBar
          visibleCount={visibleSelectedIds.length}
          reminderTargets={reminderTargets}
          onClear={clearSelection}
          onMarkPaid={() => bulkSetStatus('paid')}
        />
      )}

      {/* ── Screen A / A5: one global empty state ── */}
      {!pickerMode && filtered.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm flex flex-col items-center text-center" style={{ padding: 40 }}>
          <MimoDuck variant="chick" size={64} />
          <p className="font-display" style={{ fontSize: 24, color: '#5E4938', marginTop: 10 }}>
            {leads.length === 0 ? 'אין הרשמות עדיין' : 'אין נרשמות שתואמות לסינון'}
          </p>
          {leads.length > 0 && chip !== 'all' && (
            <button
              onClick={() => setChip('all')}
              className="mt-3 font-bold hover:underline"
              style={{ fontSize: 14, color: '#A35C3D' }}
            >
              חזרה להכל
            </button>
          )}
        </div>
      )}

      {/* ── The list — always grouped by cohort ── */}
      {!pickerMode && filtered.length > 0 && (
        <RegistrationsGroupedView
          leads={filtered}
          allLeads={leads}
          workshops={workshops}
          cohorts={cohorts}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectGroup={toggleSelectGroup}
          gapByLeadId={gapByLeadId}
          cohortById={cohortById}
          onOpenResponses={openCohortResponses}
        />
      )}


      {/* Polish #8: cohort-scoped form responses. Reuses the same
          FormSubmissionsModal / FormSubmissionsView / FormAggregatePanel
          components as the Forms page, so the Q/A rendering, "⚙️ זיהוי
          שדות" panel, פרטי / מצטבר toggle, CSV export, mother-name
          resolution, delete + override flows all behave identically —
          only the submissions list is scoped to mothers in this cohort.
          The Forms page general all-responses view is untouched. */}
      {cohortResponses && (() => {
        // Inflate the LinkedFormDef (which carries only the columns the
        // gap-report needs) into the wide FormRecord shape that
        // exportCSV + FormAggregatePanel were typed against. Defaults
        // are harmless — those consumers only read id/title/fields_json.
        const formRecord: FormRecord = {
          id: cohortResponses.form.id,
          title: cohortResponses.form.title,
          fields_json: cohortResponses.form.fields_json as FormField[],
          description: null,
          trigger_rule: null,
          is_active: true,
          public_link_enabled: cohortResponses.form.public_link_enabled,
          folder: null,
          created_at: '',
        }
        const subs = cohortResponses.subs as unknown as Submission[]
        return (
          <FormSubmissionsModal
            key={`${cohortResponses.cohort.id}|${cohortResponses.form.id}`}
            formTitle={`${cohortResponses.form.title} · ${cohortDateTimeLabel(cohortResponses.cohort)}`}
            count={subs.length}
            listContent={
              <FormSubmissionsView
                form={formRecord}
                submissions={subs}
                onDeleteSubmission={deleteCohortSubmission}
                onFormSaved={refreshCohortResponsesForm}
              />
            }
            aggregateContent={
              <FormAggregatePanel
                form={formRecord}
                submissions={subs}
                filterQuestion={cohortRespFilter}
                setFilterQuestion={setCohortRespFilter}
              />
            }
            onExportCsv={() => exportCSV(formRecord, subs, cohortRespFilter)}
            onClose={() => setCohortResponses(null)}
          />
        )
      })()}

    </div>
  )
}

// ─── Screen A / A2: the registration row ────────────────────────────
// One registrant is ONE row, 52px, horizontal, vertically centred:
//   [checkbox] [avatar 30px] [name 118px] [status] [questionnaire]
//   [phone, muted, flex] [timestamp]
// The whole row (except the checkbox) is a single button that opens
// the panel. No icons, no per-row selects, no edit pencil, no trash —
// those live in the panel and the bulk bar.
type GapStatusType = {
  form: { id: string; title: string; public_link_enabled: boolean }
  isFilled: boolean
}

// README-IA PR10: reminder WhatsApp link builder — shared by the מחכה
// לך inbox and the bulk bar. Returns null when the questionnaire is
// filled or there's no usable phone.
function regReminderHref(
  l: RegistrationLead,
  cohorts: WorkshopCohort[],
  workshops: Workshop[],
  gapStatus: GapStatusType | null,
): string | null {
  if (!gapStatus || gapStatus.isFilled) return null
  const c = l.cohort_id ? cohorts.find(x => x.id === l.cohort_id) : null
  const w = l.selected_workshop_id ? workshops.find(x => x.id === l.selected_workshop_id) : null
  const firstName = l.name?.split(' ')[0] ?? ''
  let context = ''
  if (c) {
    const [y, m, d] = c.start_date.split('-')
    const t = c.start_time ? ` ${c.start_time.slice(0, 5)}` : ''
    context = `${w?.title ?? ''} ${d}/${m}/${y.slice(2)}${t}${c.label ? ' · ' + c.label : ''}`.trim()
  } else if (w?.title) {
    context = w.title
  }
  const url = `${window.location.origin}/?form=${gapStatus.form.id}`
  const msg = `היי ${firstName}! זה Mimo ❤️\nעדיין לא קיבלנו ממך את התשובות ל"${gapStatus.form.title}"${context ? ` לקראת ${context}` : ''}.\nאשמח אם תמלאי כאן: ${url}`
  const phoneDigits = (l.phone ?? '').replace(/\D/g, '')
  const waPhone = phoneDigits.startsWith('0') ? '972' + phoneDigits.slice(1) : phoneDigits
  if (!waPhone) return null
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
}

// Status is TEXT, not a pill (A2): שילמה blue-grey, ממתינה clay,
// מומש muted.
const REG_ROW_STATUS: Record<RegistrationLead['status'], { label: string; color: string }> = {
  pending: { label: 'ממתינה', color: '#8B4A30' },
  paid:    { label: 'שילמה',  color: '#35505C' },
  handled: { label: 'מומש',   color: '#A2937D' },
}

function regInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return parts[0][0] + parts[1][0]
}

function RegistrationRow52({ lead: l, eff, gap, navOrder, navIndex, selected, onToggleSelect }: {
  lead: RegistrationLead
  eff: RegistrationLead['status']
  gap: GapStatusType | null
  navOrder: RegistrationLead[]
  navIndex: number
  selected: boolean
  onToggleSelect: (id: string) => void
}) {
  const openCustomer = useOpenCustomer()
  const st = REG_ROW_STATUS[eff]
  return (
    <div
      className="flex items-center"
      style={{ height: 52, padding: '0 14px', gap: 12, background: selected ? '#FBF4E4' : undefined }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(l.id)}
        aria-label={`בחירת ${l.name}`}
        className="w-[18px] h-[18px] accent-mustard-500 flex-shrink-0 cursor-pointer"
      />
      <button
        type="button"
        onClick={() => openCustomer(
          { phone: l.phone, email: l.email, leadId: l.id },
          { list: navOrder.map(x => ({ phone: x.phone, email: x.email, leadId: x.id })), index: Math.max(0, navIndex) },
        )}
        className="flex-1 min-w-0 flex items-center text-right"
        style={{ gap: 12, height: '100%' }}
        title="פתיחת ההרשמה"
      >
        <span
          className="flex-shrink-0 rounded-full flex items-center justify-center font-bold"
          style={{ width: 30, height: 30, background: '#F1EBE1', color: '#6E5836', fontSize: 12 }}
          aria-hidden="true"
        >
          {regInitials(l.name)}
        </span>
        <span className="truncate flex-shrink-0" style={{ width: 118, fontWeight: 700, fontSize: 14.5, color: '#443327' }}>
          {l.name}
        </span>
        <span className="flex-shrink-0 whitespace-nowrap" style={{ fontWeight: 800, fontSize: 12.5, color: st.color }}>
          {st.label}
        </span>
        {gap && (
          <span className="flex-shrink-0 whitespace-nowrap" style={{ fontWeight: 800, fontSize: 12.5, color: gap.isFilled ? '#A2937D' : '#8B4A30' }}>
            {gap.isFilled ? 'שאלון מולא' : 'שאלון חסר'}
          </span>
        )}
        {/* Phone + timestamp yield on narrow screens — the mobile row
            keeps name/status/questionnaire and the panel has the rest. */}
        <span className="flex-1 min-w-0 truncate hidden sm:block" dir="ltr" style={{ fontWeight: 600, fontSize: 13, color: '#A2937D', textAlign: 'right' }}>
          {l.phone}
        </span>
        <span className="flex-1 sm:hidden" />
        <span className="flex-shrink-0 whitespace-nowrap hidden sm:block" style={{ fontWeight: 600, fontSize: 12, color: '#A2937D' }}>
          {new Date(l.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
      </button>
    </div>
  )
}

// ─── Screen A: grouped-by-cohort list ───────────────────────────────
// The ONLY list rendering. Buckets the filtered registrations by
// cohort: ללא מחזור pinned first (expanded), upcoming cohorts next
// (expanded), past cohorts last (collapsed). A cohort with no rows
// matching the current filter renders nothing at all (A5).
function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type GroupedViewProps = {
  leads: RegistrationLead[]        // filtered — what renders
  allLeads: RegistrationLead[]     // everything — real cohort totals
  workshops: Workshop[]
  cohorts: WorkshopCohort[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectGroup: (groupLeads: RegistrationLead[]) => void
  gapByLeadId: Map<string, GapStatusType | null>
  cohortById: Map<string, WorkshopCohort>
  onOpenResponses: (cohort: WorkshopCohort) => void
}

function RegistrationsGroupedView({
  leads,
  allLeads,
  workshops,
  cohorts: _cohorts,
  selected,
  onToggleSelect,
  onToggleSelectGroup,
  gapByLeadId,
  cohortById,
  onOpenResponses,
}: GroupedViewProps) {
  const workshopById = useMemo(() => {
    const m = new Map<string, Workshop>()
    for (const w of workshops) m.set(w.id, w)
    return m
  }, [workshops])

  const groups = useMemo(() => {
    const NULL_KEY = '__none__'
    const buckets = new Map<string, RegistrationLead[]>()
    for (const l of leads) {
      const k = l.cohort_id && cohortById.has(l.cohort_id) ? l.cohort_id : NULL_KEY
      let list = buckets.get(k)
      if (!list) { list = []; buckets.set(k, list) }
      list.push(l)
    }
    // Newest registration first inside each bucket.
    for (const list of buckets.values()) {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    const today = todayLocalIso()
    const noCohort = buckets.get(NULL_KEY) ?? []
    type G = { cohort: WorkshopCohort; leads: RegistrationLead[] }
    const upcoming: G[] = []
    const past: G[] = []
    for (const [k, list] of buckets) {
      if (k === NULL_KEY) continue
      const c = cohortById.get(k)
      if (!c) continue
      if (c.start_date >= today) upcoming.push({ cohort: c, leads: list })
      else past.push({ cohort: c, leads: list })
    }
    function cmp(a: G, b: G) {
      const dc = a.cohort.start_date.localeCompare(b.cohort.start_date)
      if (dc !== 0) return dc
      const at = a.cohort.start_time ?? '99:99:99'
      const bt = b.cohort.start_time ?? '99:99:99'
      return at.localeCompare(bt)
    }
    upcoming.sort(cmp)
    past.sort((a, b) => -cmp(a, b))
    return { noCohort, upcoming, past }
  }, [leads, cohortById])

  // A3: the panel's ‹ › arrows walk the list in display order.
  const navOrder = useMemo(() => [
    ...groups.noCohort,
    ...groups.upcoming.flatMap(g => g.leads),
    ...groups.past.flatMap(g => g.leads),
  ], [groups])
  const navIndexById = useMemo(() => {
    const m = new Map<string, number>()
    navOrder.forEach((l, i) => m.set(l.id, i))
    return m
  }, [navOrder])

  // Real (unfiltered) totals + questionnaire fill per cohort — the
  // header's `N מתוך M נרשמו` states real fullness even when a chip
  // hides some rows (B6: numbers must reconcile, so the denominator
  // is the cohort itself, not the filter).
  const cohortTotals = useMemo(() => {
    const m = new Map<string, { total: number; hasForm: boolean; filled: number }>()
    for (const l of allLeads) {
      if (!l.cohort_id) continue
      let t = m.get(l.cohort_id)
      if (!t) { t = { total: 0, hasForm: false, filled: 0 }; m.set(l.cohort_id, t) }
      t.total++
      const g = gapByLeadId.get(l.id)
      if (g) { t.hasForm = true; if (g.isFilled) t.filled++ }
    }
    return m
  }, [allLeads, gapByLeadId])

  // Per-group expand state. Defaults: noCohort + upcoming expanded,
  // past collapsed. User taps flip via overrides map.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  function isExpanded(key: string, defaultExpanded: boolean) {
    return key in overrides ? overrides[key] : defaultExpanded
  }
  function toggle(key: string, defaultExpanded: boolean) {
    setOverrides(o => ({ ...o, [key]: !isExpanded(key, defaultExpanded) }))
  }

  const shared = { selected, onToggleSelect, onToggleSelectGroup, gapByLeadId, navOrder, navIndexById }

  return (
    <>
      {groups.noCohort.length > 0 && (
        <CohortGroup
          headerLabel="ללא מחזור"
          subLabel=""
          totals={{ total: groups.noCohort.length, hasForm: false, filled: 0 }}
          capacity={null}
          leads={groups.noCohort}
          effectiveOf={l => l.status}
          expanded={isExpanded('no-cohort', true)}
          onToggle={() => toggle('no-cohort', true)}
          {...shared}
        />
      )}
      {groups.upcoming.map(({ cohort, leads: gl }) => (
        <CohortGroup
          key={cohort.id}
          headerLabel={workshopById.get(cohort.workshop_id)?.title ?? '—'}
          subLabel={`${cohortDateTimeLabel(cohort)}${cohort.label ? ' · ' + cohort.label : ''}`}
          totals={cohortTotals.get(cohort.id) ?? { total: gl.length, hasForm: false, filled: 0 }}
          capacity={cohort.capacity ?? workshopById.get(cohort.workshop_id)?.stock_quantity ?? null}
          leads={gl}
          effectiveOf={l => (l.status === 'paid' && isCohortPast(cohort)) ? 'handled' : l.status}
          expanded={isExpanded(cohort.id, true)}
          onToggle={() => toggle(cohort.id, true)}
          onOpenResponses={() => onOpenResponses(cohort)}
          {...shared}
        />
      ))}
      {groups.past.map(({ cohort, leads: gl }) => (
        <CohortGroup
          key={cohort.id}
          past
          headerLabel={workshopById.get(cohort.workshop_id)?.title ?? '—'}
          subLabel={`${cohortDateTimeLabel(cohort)}${cohort.label ? ' · ' + cohort.label : ''}`}
          totals={cohortTotals.get(cohort.id) ?? { total: gl.length, hasForm: false, filled: 0 }}
          capacity={cohort.capacity ?? workshopById.get(cohort.workshop_id)?.stock_quantity ?? null}
          leads={gl}
          effectiveOf={l => (l.status === 'paid' && isCohortPast(cohort)) ? 'handled' : l.status}
          expanded={isExpanded(cohort.id, false)}
          onToggle={() => toggle(cohort.id, false)}
          onOpenResponses={() => onOpenResponses(cohort)}
          {...shared}
        />
      ))}
    </>
  )
}

// ─── CohortGroup ────────────────────────────────────────────────────
// A1-2: the header shows exactly two things — `N מתוך M נרשמו` and
// one questionnaire line. The checkbox selects the whole group; the
// questionnaire line doubles as the door to the cohort's answers.
function CohortGroup({
  headerLabel,
  subLabel,
  totals,
  capacity,
  leads,
  effectiveOf,
  expanded,
  onToggle,
  past,
  selected,
  onToggleSelect,
  onToggleSelectGroup,
  gapByLeadId,
  navOrder,
  navIndexById,
  onOpenResponses,
}: {
  headerLabel: string
  subLabel: string
  totals: { total: number; hasForm: boolean; filled: number }
  capacity: number | null
  leads: RegistrationLead[]
  effectiveOf: (l: RegistrationLead) => RegistrationLead['status']
  expanded: boolean
  onToggle: () => void
  past?: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectGroup: (groupLeads: RegistrationLead[]) => void
  gapByLeadId: Map<string, GapStatusType | null>
  navOrder: RegistrationLead[]
  navIndexById: Map<string, number>
  onOpenResponses?: () => void
}) {
  let selectedInGroup = 0
  for (const l of leads) if (selected.has(l.id)) selectedInGroup++
  const allSelected = leads.length > 0 && selectedInGroup === leads.length
  const someSelected = selectedInGroup > 0 && !allSelected
  const checkboxRef = (el: HTMLInputElement | null) => {
    if (el) el.indeterminate = someSelected
  }

  const countText = capacity != null
    ? `${totals.total} מתוך ${capacity} נרשמו`
    : totals.total === 1 ? 'נרשמת אחת' : `${totals.total} נרשמו`

  const qLine = totals.hasForm
    ? totals.filled === 0
      ? { text: 'אף אחת לא מילאה שאלון', color: '#8B4A30' }
      : totals.filled >= totals.total
        ? { text: 'כולן מילאו את השאלון', color: '#4F5040' }
        : { text: `${totals.filled} מתוך ${totals.total} מילאו`, color: '#7A5C1F' }
    : null

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden${past ? ' opacity-75' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-right cursor-pointer hover:bg-sand-50/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <input
            type="checkbox"
            ref={checkboxRef}
            checked={allSelected}
            onChange={() => onToggleSelectGroup(leads)}
            onClick={e => e.stopPropagation()}
            aria-label={`בחירת כל ההרשמות בקבוצה ${headerLabel}`}
            className="w-[18px] h-[18px] accent-mustard-500 flex-shrink-0 cursor-pointer"
          />
          <ChevronDown className={`w-4 h-4 text-sand-400 flex-shrink-0 transition-transform ${expanded ? '' : 'rotate-90'}`} />
          <div className="flex-1 min-w-0">
            <p className="truncate" style={{ fontWeight: 700, fontSize: 14.5, color: '#443327' }}>
              {headerLabel}{subLabel ? ` · ${subLabel}` : ''}
            </p>
            {qLine && (
              onOpenResponses && totals.filled > 0 ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onOpenResponses() }}
                  className="hover:underline"
                  style={{ fontWeight: 700, fontSize: 12.5, color: qLine.color }}
                  title="צפייה בתשובות לשאלון של המחזור"
                >
                  {qLine.text}
                </button>
              ) : (
                <p style={{ fontWeight: 700, fontSize: 12.5, color: qLine.color }}>{qLine.text}</p>
              )
            )}
          </div>
        </div>
        <span className="flex-shrink-0 whitespace-nowrap" style={{ fontWeight: 700, fontSize: 13, color: '#8A7A63' }}>
          {countText}
        </span>
      </div>
      {expanded && leads.length > 0 && (
        <div className="border-t border-[#F1EBE1]">
          {leads.map((l, i) => (
            <div key={l.id} className={i > 0 ? 'border-t border-[#F6F1E9]' : undefined}>
              <RegistrationRow52
                lead={l}
                eff={effectiveOf(l)}
                gap={gapByLeadId.get(l.id) ?? null}
                navOrder={navOrder}
                navIndex={navIndexById.get(l.id) ?? 0}
                selected={selected.has(l.id)}
                onToggleSelect={onToggleSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Screen A / A4: the bulk bar ────────────────────────────────────
// Dark bar directly above the list, shown when ≥1 VISIBLE row is
// selected. Actions act on visible-selected only (the visible-only
// contract) — selections hidden by the current filter are never
// touched.
function BulkActionBar({
  visibleCount,
  reminderTargets,
  onClear,
  onMarkPaid,
}: {
  visibleCount: number
  reminderTargets: { href: string; phone: string }[]
  onClear: () => void
  onMarkPaid: () => void
}) {
  const [flash, setFlash] = useState<string | null>(null)
  if (visibleCount === 0) return null
  const label = visibleCount === 1 ? 'נרשמת אחת סומנה' : `${visibleCount} נרשמות סומנו`
  function handleReminders() {
    if (reminderTargets.length === 0) return
    if (reminderTargets.length === 1) {
      window.open(reminderTargets[0].href, '_blank', 'noopener')
      return
    }
    // Several targets: popup blockers kill a wa.me tab per row, so
    // copy the phones of everyone missing a questionnaire instead.
    const phones = reminderTargets.map(t => t.phone.replace(/\D/g, '')).filter(Boolean).join('\n')
    navigator.clipboard.writeText(phones).then(() => {
      setFlash(`הועתקו ${reminderTargets.length} טלפונים`)
      setTimeout(() => setFlash(null), 2500)
    })
  }
  return (
    <div
      dir="rtl"
      className="flex items-center gap-x-4 gap-y-2 flex-wrap"
      style={{ background: '#443327', borderRadius: 13, padding: '11px 16px' }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, color: '#F6F3ED' }}>{label}</span>
      <span className="flex-1" />
      <button
        onClick={handleReminders}
        disabled={reminderTargets.length === 0}
        className="font-bold hover:underline disabled:opacity-40 disabled:no-underline whitespace-nowrap"
        style={{ fontSize: 14, color: '#E7C78A' }}
        title={reminderTargets.length === 0
          ? 'אין שאלונים חסרים בבחירה'
          : reminderTargets.length === 1
            ? 'פתיחת תזכורת בוואטסאפ'
            : 'העתקת הטלפונים של מי שחסר לה שאלון'}
      >
        {flash ?? `שליחת תזכורת${reminderTargets.length > 0 ? ` (${reminderTargets.length})` : ''}`}
      </button>
      <button onClick={onMarkPaid} className="font-bold hover:underline whitespace-nowrap" style={{ fontSize: 14, color: '#F6F3ED' }}>
        סימון כשילמה
      </button>
      <button onClick={onClear} className="font-semibold hover:underline whitespace-nowrap" style={{ fontSize: 14, color: '#C9BCA8' }}>
        ניקוי
      </button>
    </div>
  )
}
