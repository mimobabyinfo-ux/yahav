import { useState } from 'react'
import { BarChart2, Users, LogOut, Eye, Video, Baby, Gift, Settings, ClipboardList, FileText, Sparkles, Link2, GraduationCap, Phone, MapPin, Home, ChevronDown, CalendarDays } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import MimoLeaf from './MimoLeaf'
import type { AdminSection } from '../App'

type Props = {
  section: AdminSection
  onSection: (s: AdminSection) => void
  viewAsUser: boolean
  onToggleUserView: () => void
  unreadForms?: number
  unreadRegistrations?: number
  /** Open derived-task count — the בית badge (design handoff §2). */
  taskCount?: number
  /** Products with a problem (missing payment link / low stock). */
  workshopIssues?: number
  /** Partner leads waiting (currently: last-7-days count — partner_leads
   *  has no handled flag yet). */
  partnersWaiting?: number
  /** Declared Bit/transfer payments awaiting confirmation. Brenda 17.8.26:
   *  "I want it to pop up as a 1 and then I'll go in." */
  paymentClaims?: number
}

// Admin nav — SIX primary items ordered by what gets touched weekly
// (design handoff §2), everything else foldable under "עוד". Nothing is
// deleted: every section stays routable. Mimo dark chrome (#2E2C24).
type NavItem = { id: AdminSection; label: string; icon: React.ReactNode }

const PRIMARY: NavItem[] = [
  { id: 'home',          label: 'בית',              icon: <Home className="w-[18px] h-[18px]" /> },
  { id: 'registrations', label: 'הרשמות',           icon: <ClipboardList className="w-[18px] h-[18px]" /> },
  { id: 'forms',         label: 'שאלונים וטפסים',    icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: 'workshops',     label: 'מוצרים ותשלומים',   icon: <GraduationCap className="w-[18px] h-[18px]" /> },
  { id: 'events',        label: 'אירועי קהילה',      icon: <Sparkles className="w-[18px] h-[18px]" /> },
  { id: 'partners',      label: 'ספקים',             icon: <Link2 className="w-[18px] h-[18px]" /> },
]

const MORE: NavItem[] = [
  { id: 'makeups',   label: 'השלמות',         icon: <CalendarDays className="w-[18px] h-[18px]" /> },
  { id: 'users',     label: 'משתמשות',       icon: <Users className="w-[18px] h-[18px]" /> },
  { id: 'leads',     label: 'לידים',          icon: <Phone className="w-[18px] h-[18px]" /> },
  { id: 'insights',  label: 'תובנות',         icon: <BarChart2 className="w-[18px] h-[18px]" /> },
  { id: 'videos',    label: 'סרטונים',        icon: <Video className="w-[18px] h-[18px]" /> },
  { id: 'tips',      label: 'מדריך גיל',       icon: <Baby className="w-[18px] h-[18px]" /> },
  { id: 'perks',     label: 'הטבות',          icon: <Gift className="w-[18px] h-[18px]" /> },
  { id: 'pregnancy', label: 'מדריכי הריון',   icon: <MapPin className="w-[18px] h-[18px]" /> },
]

export default function AdminSidebar({ section, onSection, viewAsUser, onToggleUserView, unreadForms = 0, unreadRegistrations = 0, taskCount = 0, workshopIssues = 0, partnersWaiting = 0, paymentClaims = 0 }: Props) {
  const { signOut, profile } = useAuth()
  // Screen A / A1-5: "עוד" ships COLLAPSED — the overflow group exists
  // to reduce the visible nav, so it must not start expanded. The
  // active-section highlight still works when the admin opens it.
  const [moreOpen, setMoreOpen] = useState(false)

  function badgeFor(id: AdminSection): number {
    if (id === 'home') return taskCount
    if (id === 'forms') return unreadForms
    if (id === 'registrations') return unreadRegistrations
    if (id === 'workshops') return workshopIssues
    if (id === 'partners') return partnersWaiting
    if (id === 'events') return paymentClaims
    return 0
  }

  function navButton(item: NavItem) {
    const active = section === item.id
    const badge = badgeFor(item.id)
    return (
      <button
        key={item.id}
        onClick={() => onSection(item.id)}
        className="w-full flex items-center gap-3 text-right transition-all"
        style={{
          padding: '9px 12px',
          borderRadius: 14,
          fontSize: 15,
          fontWeight: active ? 700 : 600,
          background: active ? '#E7C78A' : 'transparent',
          color: active ? '#3A2E18' : '#C6C0AE',
        }}
        onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#3A3730'; e.currentTarget.style.color = '#EFE8DC' } }}
        onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#C6C0AE' } }}
      >
        <span style={{ strokeWidth: active ? 2.1 : 2 } as React.CSSProperties}>{item.icon}</span>
        <span>{item.label}</span>
        {badge > 0 && (
          <span
            className="mr-auto min-w-[20px] h-[20px] px-1.5 rounded-full text-white font-bold flex items-center justify-center"
            style={{ background: active ? '#8B4A30' : '#A35C3D', fontSize: 13 }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside
      className="hidden lg:flex flex-col w-60 min-h-screen sticky top-0 shrink-0 z-20"
      style={{ background: '#2E2C24', borderLeft: '1px solid #45423636' }}
      dir="rtl"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: '#45423636' }}>
        <div className="flex items-center gap-3">
          <MimoLeaf variant="sand-1" size={30} rotate={-12} className="flex-shrink-0" />
          <div>
            <p className="font-display leading-tight" style={{ fontSize: 20, color: '#EFE8DC' }}>מימו</p>
            <p className="leading-tight font-semibold" style={{ fontSize: 12, color: '#A8A088' }}>ניהול</p>
          </div>
        </div>
        {profile?.mother_name && (
          <p className="mt-3 font-medium" style={{ fontSize: 13, color: '#A8A088' }}>
            שלום, {profile.mother_name}
          </p>
        )}
      </div>

      {/* Nav — six primary + collapsible עוד */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {PRIMARY.map(navButton)}
        </div>

        <button
          onClick={() => setMoreOpen(o => !o)}
          className="w-full flex items-center gap-2 text-right transition-all mt-3"
          style={{ padding: '7px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#A8A088', letterSpacing: '0.08em' }}
        >
          עוד
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && (
          <div className="space-y-0.5">
            {MORE.map(navButton)}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1 border-t pt-3" style={{ borderColor: '#45423636' }}>
        {viewAsUser && (
          <div className="px-3 py-2 rounded-xl text-xs font-bold mb-1 flex items-center gap-1.5" style={{ color: '#E7C78A', background: '#3A3730' }}>
            <Eye className="w-3.5 h-3.5" /> מצב תצוגה כמשתמשת
          </div>
        )}
        <button
          onClick={onToggleUserView}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-right"
          style={{ color: '#A8A088' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#3A3730'; e.currentTarget.style.color = '#EFE8DC' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A088' }}
        >
          <Eye className="w-4 h-4" />
          {viewAsUser ? 'חזרה לניהול' : 'צפי כמשתמשת'}
        </button>
        <button
          onClick={() => onSection('settings')}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-right"
          style={{ color: section === 'settings' ? '#E7C78A' : '#A8A088' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#3A3730' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <Settings className="w-4 h-4" />
          הגדרות
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-right"
          style={{ color: '#A8A088' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#3A3730'; e.currentTarget.style.color = '#EFE8DC' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A088' }}
        >
          <LogOut className="w-4 h-4" />
          יציאה
        </button>
      </div>
    </aside>
  )
}
