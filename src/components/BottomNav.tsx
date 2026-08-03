import { Home, BookOpen, ShoppingBag, LogOut, Eye, Users, ClipboardList, FileText, Sparkles, Link2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { Page, AdminSection } from '../App'

type Props = {
  currentPage: Page
  onNavigate: (page: Page) => void
  isAdminMode: boolean
  isGuest: boolean
  adminSection: AdminSection
  onAdminSection: (section: AdminSection) => void
  viewAsUser: boolean
  onToggleUserView: () => void
}

export default function BottomNav({ currentPage, onNavigate, isAdminMode, isGuest, adminSection, onAdminSection, viewAsUser, onToggleUserView }: Props) {
  const { signOut, selectedChild, profile } = useAuth()

  // ── Guest nav ─────────────────────────────────────────────────────────────
  if (isGuest) {
    const guestItems: { id: Page; label: string; icon: React.ReactNode }[] = [
      { id: 'journal',   label: 'יומן',  icon: <BookOpen className="w-5 h-5" /> },
      { id: 'dashboard', label: 'בית',   icon: <Home className="w-5 h-5" /> },
    ]
    return (
      <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto bg-white border-t border-sand-100 shadow-xl z-50">
        <div className="px-4 py-1.5 border-b border-mustard-100 bg-mustard-50 flex items-center justify-center gap-1.5">
          <span className="text-[13px] font-semibold text-mustard-700 inline-flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> צופה ביומן של {selectedChild?.name ?? 'התינוק'}
          </span>
        </div>
        <div className="flex items-center justify-around px-4 py-2">
          {guestItems.map(item => {
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-2xl transition-all ${
                  active ? 'text-mustard-600 bg-mustard-50' : 'text-sand-600 hover:text-sand-600'
                }`}
              >
                {item.icon}
                <span className="text-[13px] font-medium">{item.label}</span>
              </button>
            )
          })}
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-2xl transition-all text-red-300 hover:text-red-500"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[13px] font-medium">יציאה</span>
          </button>
        </div>
      </nav>
    )
  }

  // ── Admin nav ─────────────────────────────────────────────────────────────
  // Mobile admin answers one question — "did a new registration come
  // in?" — so it carries only the יומיומי four. Dark = admin, same rule
  // as the desktop sidebar. Content/analytics stay reachable by URL.
  if (isAdminMode) {
    const adminItems: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
      { id: 'registrations', label: 'הרשמות',   icon: <ClipboardList className="w-[21px] h-[21px]" /> },
      { id: 'forms',     label: 'שאלונים',  icon: <FileText className="w-[21px] h-[21px]" /> },
      { id: 'events',    label: 'אירועים',  icon: <Sparkles className="w-[21px] h-[21px]" /> },
      { id: 'partners',  label: 'ספקות',    icon: <Link2 className="w-[21px] h-[21px]" /> },
    ]
    void signOut

    return (
      <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto z-50" style={{ background: '#2E2C24' }}>
        <div className="flex items-center justify-around" style={{ padding: '9px 4px 12px' }}>
          {adminItems.map(item => {
            const active = adminSection === item.id && currentPage === 'admin'
            return (
              <button
                key={item.id}
                onClick={() => onAdminSection(item.id)}
                className="flex flex-col items-center transition-all"
                style={{
                  gap: 4,
                  padding: '7px 16px',
                  borderRadius: 16,
                  background: active ? '#E7C78A' : 'transparent',
                  color: active ? '#3A2E18' : '#C6C0AE',
                }}
              >
                {item.icon}
                <span className={active ? 'font-bold' : 'font-semibold'} style={{ fontSize: 13 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    )
  }

  // ── User nav ──────────────────────────────────────────────────────────────
  // Note: 'pro' (סדנאות / ProAreaPage) is intentionally hidden from nav in
  // Phase 1 but the route stays functional for direct admin access.
  // Community-first (2.8.26): the app's primary draw is now the
  // community — קהילה sits right after בית, tracking (יומן) after it.
  const userItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard',  label: 'בית',     icon: <Home className="w-5 h-5" /> },
    { id: 'community',  label: 'קהילה',   icon: <Users className="w-5 h-5" /> },
    { id: 'journal',    label: 'יומן',    icon: <BookOpen className="w-5 h-5" /> },
    { id: 'workshops',  label: 'מוצרים',  icon: <ShoppingBag className="w-5 h-5" /> },
  ]

  const pregnancyItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard',  label: 'מעקב',    icon: <Home className="w-5 h-5" /> },
    { id: 'community',  label: 'קהילה',   icon: <Users className="w-5 h-5" /> },
    { id: 'workshops',  label: 'מוצרים',  icon: <ShoppingBag className="w-5 h-5" /> },
  ]

  const isPregnant = !!(profile?.user_mode === 'pregnant')
  const navItems = isPregnant ? pregnancyItems : userItems

  // Logout used to be a 5th/4th tab here; it now lives in UserSettingsPage
  // ("?settings"). The signOut handler is still used by the guest + admin
  // navs above, so the import stays.

  return (
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto bg-white z-50" style={{ borderTop: '1px solid #E4DAD0' }}>
      {/* "Back to Admin" banner when viewing as user */}
      {viewAsUser && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-sand-100" style={{ background: '#FDF8EE' }}>
          <span className="text-[13px] font-bold text-amber-700 flex items-center gap-1"><Eye className="w-3 h-3" /> מצב תצוגה כמשתמשת</span>
          <button onClick={onToggleUserView} className="text-[13px] font-bold text-amber-700 underline">חזרה לניהול</button>
        </div>
      )}
      <div className="flex items-center justify-around" style={{ padding: '8px 4px 10px' }}>
        {navItems.map(item => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center transition-all"
              style={{
                gap: 4,
                padding: '6px 14px',
                borderRadius: 18,
                background: active ? '#F6ECD8' : 'transparent',
                color: active ? '#8A6A2F' : '#818267',
              }}
            >
              {item.icon}
              <span className={`whitespace-nowrap ${active ? 'font-bold' : 'font-semibold'}`} style={{ fontSize: 12 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
