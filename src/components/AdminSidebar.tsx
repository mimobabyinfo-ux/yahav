import { BarChart2, Users, LogOut, Eye, ShieldAlert, Video, Lightbulb, Gift, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { AdminSection } from '../App'

type Props = {
  section: AdminSection
  onSection: (s: AdminSection) => void
  viewAsUser: boolean
  onToggleUserView: () => void
}

const NAV: { id: AdminSection; label: string; icon?: React.ReactNode; emoji?: string }[] = [
  { id: 'insights',  label: 'BI & Analytics', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'users',     label: 'משתמשים',         icon: <Users className="w-4 h-4" /> },
  { id: 'workshops', label: 'סדנאות',           emoji: '🎓' },
  { id: 'videos',    label: 'סרטונים',          icon: <Video className="w-4 h-4" /> },
  { id: 'tips',      label: 'טיפים יומיים',     icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'perks',     label: 'הטבות',            icon: <Gift className="w-4 h-4" /> },
  { id: 'forms',     label: 'טפסים',            emoji: '📋' },
  { id: 'leads',     label: 'לידים & CRM',      emoji: '📞' },
  { id: 'pregnancy', label: 'הריון',             emoji: '🤰' },
  { id: 'partners',  label: 'שירותים',           emoji: '🌿' },
  { id: 'settings',  label: 'הגדרות',            icon: <Settings className="w-4 h-4" /> },
]

export default function AdminSidebar({ section, onSection, viewAsUser, onToggleUserView }: Props) {
  const { signOut, profile } = useAuth()

  return (
    <aside
      className="hidden lg:flex flex-col w-60 min-h-screen sticky top-0 shrink-0 z-20"
      style={{ background: '#0f0f23', borderLeft: '1px solid #1e1e38' }}
      dir="rtl"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: '#1e1e38' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
            style={{ background: 'linear-gradient(135deg, #3a1a6e, #5a1a8e)' }}>
            🛡️
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Mimo CMS</p>
            <p className="text-[10px] leading-tight" style={{ color: '#5050a0' }}>Admin Panel</p>
          </div>
        </div>
        {profile?.mother_name && (
          <p className="text-[11px] mt-3 font-medium" style={{ color: '#6060a0' }}>
            שלום, {profile.mother_name}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const active = section === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSection(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-right"
              style={active
                ? { background: 'linear-gradient(135deg, #2a1050, #3a1570)', color: '#d0a0ff' }
                : { color: '#5060a0' }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#1a1a38'; (e.currentTarget as HTMLButtonElement).style.color = '#9090c0' }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#5060a0' } }}
            >
              {item.emoji
                ? <span className="text-base w-4 text-center leading-none">{item.emoji}</span>
                : item.icon
              }
              <span>{item.label}</span>
              {active && <div className="mr-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1 border-t pt-3" style={{ borderColor: '#1e1e38' }}>
        {viewAsUser && (
          <div className="px-3 py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-900/20 mb-2">
            👁️ מצב תצוגה כמשתמשת
          </div>
        )}
        <button
          onClick={onToggleUserView}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-right"
          style={{ color: '#7080b0' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a1a38'; (e.currentTarget as HTMLButtonElement).style.color = '#a0b0d0' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7080b0' }}
        >
          <Eye className="w-3.5 h-3.5" />
          {viewAsUser ? 'חזרה לניהול' : 'צפי כמשתמשת'}
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-right"
          style={{ color: '#ff5050' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a1010' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <LogOut className="w-3.5 h-3.5" />
          יציאה
        </button>
        <div className="flex items-center gap-1.5 px-3 pt-2">
          <ShieldAlert className="w-3 h-3 text-red-500" />
          <span className="text-[10px] font-bold text-red-500 tracking-widest">ADMIN MODE</span>
        </div>
      </div>
    </aside>
  )
}
