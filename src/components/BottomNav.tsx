import { Home, BookOpen, Gift, Play, Settings, Wrench } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { Page } from '../App'

type Props = {
  currentPage: Page
  onNavigate: (page: Page) => void
}

type NavItem = {
  id: Page
  label: string
  icon: React.ReactNode
  proOnly?: boolean
  adminOnly?: boolean
}

export default function BottomNav({ currentPage, onNavigate }: Props) {
  const { profile } = useAuth()

  const items: NavItem[] = [
    { id: 'dashboard', label: 'בית', icon: <Home className="w-5 h-5" /> },
    { id: 'journal', label: 'יומן', icon: <BookOpen className="w-5 h-5" /> },
    { id: 'benefits', label: 'הטבות', icon: <Gift className="w-5 h-5" /> },
    { id: 'workshops', label: 'סדנאות', icon: <Wrench className="w-5 h-5" /> },
    { id: 'pro', label: 'סרטונים', icon: <Play className="w-5 h-5" />, proOnly: true },
    { id: 'admin', label: 'ניהול', icon: <Settings className="w-5 h-5" />, adminOnly: true },
  ]

  const visible = items.filter(item => {
    if (item.adminOnly) return profile?.is_admin
    if (item.proOnly) return profile?.is_pro || profile?.is_admin
    return true
  })

  return (
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto bg-white border-t border-sand-100 shadow-xl z-50">
      <div className="flex items-center justify-around px-2 py-2">
        {visible.map(item => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all min-w-[52px] ${
                active
                  ? 'text-mustard-600 bg-mustard-50'
                  : 'text-sand-400 hover:text-sand-600'
              }`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
