import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ChildSwitcher() {
  const { children, selectedChild, setSelectedChild, user, refreshChildren } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDob, setNewDob] = useState('')
  const [newGender, setNewGender] = useState<'boy' | 'girl' | 'other'>('girl')
  const [saving, setSaving] = useState(false)

  async function addChild() {
    if (!user || !newName.trim()) return
    setSaving(true)
    const { data } = await supabase.from('children').insert({
      user_id: user.id,
      name: newName.trim(),
      dob: newDob || null,
      gender: newGender,
    }).select().single()
    await refreshChildren()
    if (data) setSelectedChild(data)
    setNewName('')
    setNewDob('')
    setNewGender('girl')
    setShowAdd(false)
    setSaving(false)
  }

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
          style={selectedChild?.id === child.id ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
        >
          <span>{genderEmoji(child.gender)}</span>
          <span>{child.name}</span>
          {selectedChild?.id === child.id && <Check className="w-3 h-3" />}
        </button>
      ))}

      {showAdd ? (
        <div className="flex items-center gap-2 bg-white rounded-2xl p-2 border border-sand-100 shadow-sm min-w-[220px]">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="שם התינוק/ת"
            className="flex-1 text-sm outline-none text-sand-800 bg-transparent"
            onKeyDown={e => e.key === 'Enter' && addChild()}
          />
          <select
            value={newGender}
            onChange={e => setNewGender(e.target.value as 'boy' | 'girl' | 'other')}
            className="text-sm outline-none bg-transparent text-sand-600"
          >
            <option value="girl">👧</option>
            <option value="boy">👶🏻</option>
            <option value="other">👶</option>
          </select>
          <button onClick={addChild} disabled={saving || !newName.trim()} className="text-mustard-600 disabled:opacity-40">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => setShowAdd(false)} className="text-sand-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-2xl text-sm text-sand-400 bg-white border border-dashed border-sand-200 whitespace-nowrap hover:border-mustard-400 hover:text-mustard-500 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          הוסף תינוק/ת
        </button>
      )}
    </div>
  )
}
