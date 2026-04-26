import { useState } from 'react'
import { ArrowRight, LogOut, Plus, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'

function genderEmoji(g: string | null) {
  return g === 'boy' ? '👶🏻' : g === 'girl' ? '👧' : '👶'
}

function genderLabel(g: string | null) {
  return g === 'boy' ? 'בן' : g === 'girl' ? 'בת' : 'אחר'
}

function exitSettings() {
  // Drop the ?settings query param and return to the app root
  window.location.assign(window.location.pathname)
}

export default function UserSettingsPage() {
  const { user, profile, children, signOut, refreshChildren } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDob, setNewDob] = useState('')
  const [newGender, setNewGender] = useState<'girl' | 'boy' | 'other'>('girl')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function addChild(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaveError('')
    if (!newName.trim()) { setSaveError('נא למלא שם'); return }
    if (!newDob) { setSaveError('נא לבחור תאריך לידה'); return }
    setSaving(true)
    const { error } = await supabase.from('children').insert({
      user_id: user.id,
      name: newName.trim(),
      dob: newDob,
      gender: newGender,
    })
    setSaving(false)
    if (error) { setSaveError('שגיאה בשמירה — נסי שוב'); return }
    await refreshChildren()
    setNewName(''); setNewDob(''); setNewGender('girl')
    setShowAdd(false)
  }

  return (
    <div className="min-h-screen p-5 pb-12" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-sm mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-2xl font-bold text-sand-800">הגדרות</h1>
          <button
            onClick={exitSettings}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-500"
            title="חזרה"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* פרטים אישיים — read-only */}
        <section className="bg-[#F5F5F5] rounded-3xl shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-sand-700">פרטים אישיים</h2>
          <div className="space-y-2.5">
            <div>
              <p className="text-[11px] text-sand-400">שם</p>
              <p className="text-sm text-sand-800 font-medium">
                {profile?.mother_name || <span className="text-sand-400 italic">לא הוגדר</span>}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-sand-400">טלפון</p>
              <p className="text-sm text-sand-800 font-medium" dir="ltr">
                {profile?.phone_number || <span className="text-sand-400 italic">לא הוגדר</span>}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-sand-400">אימייל</p>
              <p className="text-sm text-sand-800 font-medium" dir="ltr">
                {user?.email || <span className="text-sand-400 italic">—</span>}
              </p>
            </div>
          </div>
        </section>

        {/* הילדים שלי */}
        <section className="bg-[#F5F5F5] rounded-3xl shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-sand-700">הילדים שלי</h2>

          {children.length === 0 && (
            <p className="text-xs text-sand-400 italic">עדיין לא הוספת ילדים.</p>
          )}

          <div className="space-y-2">
            {children.map(child => (
              <div key={child.id} className="flex items-center gap-3 px-3 py-2.5 bg-sand-50 rounded-2xl">
                <span className="text-2xl">{genderEmoji(child.gender)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-sand-800">{child.name}</p>
                  <p className="text-[11px] text-sand-500">
                    {genderLabel(child.gender)}
                    {child.dob && ` · נולד/ה ${new Date(child.dob + 'T12:00:00').toLocaleDateString('he-IL')}`}
                    {child.dob && ` · ${getBabyAge(child.dob)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {showAdd ? (
            <form onSubmit={addChild} className="space-y-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-sand-500 mb-1">שם <span className="text-red-400">*</span></label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="שם התינוק/ת"
                  className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-sand-500 mb-1">תאריך לידה <span className="text-red-400">*</span></label>
                <div dir="ltr">
                  <input
                    type="date"
                    value={newDob}
                    onChange={e => setNewDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-sand-500 mb-1">מגדר</label>
                <div className="flex gap-2">
                  {(['girl', 'boy', 'other'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setNewGender(g)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${newGender === g ? 'border-mustard-400 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-500'}`}
                    >
                      {g === 'girl' ? 'בת 👧' : g === 'boy' ? 'בן 👶🏻' : 'אחר 👶'}
                    </button>
                  ))}
                </div>
              </div>
              {saveError && <p className="text-xs text-red-500">{saveError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                  style={{ background: '#E7C78A' }}
                >
                  {saving ? '...' : <><Check className="w-4 h-4" /> שמירה</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setSaveError('') }}
                  className="px-3 py-2.5 rounded-xl bg-sand-100 text-sand-600 text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-semibold text-mustard-700 bg-mustard-50 hover:bg-mustard-100 border-2 border-dashed border-mustard-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף תינוק/ת
            </button>
          )}
        </section>

        {/* יציאה */}
        <section className="bg-[#F5F5F5] rounded-3xl shadow-sm p-5">
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            יציאה
          </button>
        </section>
      </div>
    </div>
  )
}
