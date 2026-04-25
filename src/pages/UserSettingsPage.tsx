import { ArrowRight, LogOut } from 'lucide-react'
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
  const { user, profile, children, signOut } = useAuth()

  return (
    <div className="min-h-screen p-5 pb-12" dir="rtl" style={{ background: '#FAF8F4' }}>
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
        <section className="bg-white rounded-3xl shadow-sm p-5 space-y-3">
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
        <section className="bg-white rounded-3xl shadow-sm p-5 space-y-3">
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
        </section>

        {/* יציאה */}
        <section className="bg-white rounded-3xl shadow-sm p-5">
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
