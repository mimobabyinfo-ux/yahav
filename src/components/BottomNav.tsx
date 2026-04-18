import { Home, BookOpen, ShoppingBag, Users, BarChart2, LogOut, ShieldAlert, Eye, PlayCircle } from 'lucide-react'
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
          <span className="text-[11px] font-semibold text-mustard-700">
            👁️ צופה ביומן של {selectedChild?.name ?? 'התינוק'}
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
                  active ? 'text-mustard-600 bg-mustard-50' : 'text-sand-400 hover:text-sand-600'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-2xl transition-all text-red-300 hover:text-red-500"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">יציאה</span>
          </button>
        </div>
      </nav>
    )
  }
  if (isAdminMode) {
    const adminItems: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
      { id: 'insights', label: 'דשבורד',  icon: <BarChart2 className="w-5 h-5" /> },
      { id: 'users',    label: 'ניהול',   icon: <Users className="w-5 h-5" /> },
      { id: 'forms',    label: 'טפסים',   icon: <span className="text-lg leading-none">📋</span> },
    ]

    return (
      <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto z-50" style={{ background: '#12122a', borderTop: '1px solid #2a2a4a' }}>
        {/* "View as User" banner */}
        <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{ borderColor: '#2a2a4a' }}>
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[10px] font-bold text-red-400 tracking-wide">ADMIN MODE</span>
          </div>
          <button
            onClick={onToggleUserView}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold transition-all"
            style={{ background: '#2a2a4a', color: '#a0a0c0' }}
          >
            <Eye className="w-3 h-3" />
            צפי כמשתמשת
          </button>
        </div>

        {/* Admin tabs */}
        <div className="flex items-center justify-around px-1 py-2">
          {adminItems.map(item => {
            const active = adminSection === item.id && currentPage === 'admin'
            return (
              <button
                key={item.id}
                onClick={() => onAdminSection(item.id)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all"
                style={active
                  ? { background: 'linear-gradient(135deg, #3a1a6e, #5a1a8e)', color: '#e0b0ff' }
                  : { color: '#6060a0' }
                }
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}

          {/* Logout */}
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all"
            style={{ color: '#ff6060' }}
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium">יציאה</span>
          </button>
        </div>
      </nav>
    )
  }

  // ── User nav ──────────────────────────────────────────────────────────────
  const userItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard',   label: 'בית',      icon: <Home className="w-5 h-5" /> },
    { id: 'pro',         label: 'סרטונים',  icon: <PlayCircle className="w-5 h-5" /> },
    { id: 'workshops',   label: 'מוצרים',   icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'community',   label: 'קהילה',    icon: <span className="text-lg leading-none">🌸</span> },
    { id: 'marketplace', label: 'שירותים',  icon: <span className="text-lg leading-none">🌿</span> },
  ]

  const pregnancyItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard',   label: 'מעקב',     icon: <Home className="w-5 h-5" /> },
    { id: 'pro',         label: 'סרטונים',  icon: <PlayCircle className="w-5 h-5" /> },
    { id: 'workshops',   label: 'מוצרים',   icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'community',   label: 'קהילה',    icon: <span className="text-lg leading-none">🌸</span> },
    { id: 'marketplace', label: 'שירותים',  icon: <span className="text-lg leading-none">🌿</span> },
  ]

  const isPregnant = !!(profile?.user_mode === 'pregnant')
  const navItems = isPregnant ? pregnancyItems : userItems

  return (
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto bg-white border-t border-sand-100 shadow-xl z-50">
      {/* "Back to Admin" banner when viewing as user */}
      {viewAsUser && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-sand-100" style={{ background: '#fff3cd' }}>
          <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1"><Eye className="w-3 h-3" /> מצב תצוגה כמשתמשת</span>
          <button onClick={onToggleUserView} className="text-[10px] font-bold text-amber-700 underline">חזרה לניהול</button>
        </div>
      )}
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map(item => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-2xl transition-all ${
                active ? 'text-mustard-600 bg-mustard-50' : 'text-sand-400 hover:text-sand-600'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
        {/* Logout */}
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-2xl transition-all text-red-300 hover:text-red-500"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-medium">יציאה</span>
        </button>
      </div>
    </nav>
  )
}
