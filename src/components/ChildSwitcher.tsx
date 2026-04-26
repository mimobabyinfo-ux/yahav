import { Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function ChildSwitcher() {
  const { children, selectedChild, setSelectedChild } = useAuth()

  const genderEmoji = (g: string | null) => g === 'boy' ? '👶🏻' : g === 'girl' ? '👧' : '👶'

  return (
    <div className="flex items-center gap-2 overflow-x-auto scroll-hide pb-1">
      {children.map(child => (
        <button
          key={child.id}
          onClick={() => setSelectedChild(child)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all ${
            selectedChild?.id === child.id
              ? 'text-white shadow-sm'
              : 'bg-white text-sand-500 border border-sand-100'
          }`}
          style={selectedChild?.id === child.id ? { background: '#E7C78A' } : {}}
        >
          <span>{genderEmoji(child.gender)}</span>
          <span>{child.name}</span>
          {selectedChild?.id === child.id && <Check className="w-3 h-3" />}
        </button>
      ))}
    </div>
  )
}
