import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageCircle, MapPin, Filter, Phone, Check, Pencil, AlignLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'

const WA_ADMIN = '972559904274'

type CommunityProfile = {
  id: string
  mother_name: string | null
  area: string | null
  phone_number: string | null
  community_consent: boolean | null
  community_bio: string | null
  child_id: string
  child_dob: string | null
  child_gender: 'boy' | 'girl' | 'other' | null
}

type FilterMode = 'age' | 'area' | 'all'

function ageMonths(dob: string): number {
  const ms = Date.now() - new Date(dob).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
}

export default function CommunityPage() {
  const { selectedChild, profile, user, refreshProfile } = useAuth()
  const [profiles, setProfiles] = useState<CommunityProfile[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [editMode, setEditMode] = useState(false)

  // After a successful save, immediately hide the form (don't wait for DB refresh)
  const [registeredInSession, setRegisteredInSession] = useState(false)

  // Initialize inputs from profile ONCE
  const initialized = useRef(false)
  const [areaInput, setAreaInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true
      setAreaInput(profile.area ?? '')
      setPhoneInput(profile.phone_number ?? '')
      setBioInput(profile.community_bio ?? '')
      setConsentChecked(profile.community_consent ?? false)
    }
  }, [profile])

  const load = useCallback(async () => {
    const { data } = await supabase.from('community_profiles').select('*')
    setProfiles((data ?? []) as CommunityProfile[])
  }, [])

  useEffect(() => { load() }, [load])

  async function saveMyProfile() {
    if (!user) return
    setSavingProfile(true)
    setSaveError('')

    const { error } = await supabase
      .from('user_profiles')
      .update({
        area: areaInput.trim() || null,
        phone_number: phoneInput.trim() || null,
        community_bio: bioInput.trim() || null,
        community_consent: consentChecked,
      })
      .eq('id', user.id)

    setSavingProfile(false)

    if (error) {
      setSaveError('שגיאה בשמירה — נסי שוב')
      return
    }

    // Immediately hide form (don't wait for profile refresh)
    setRegisteredInSession(true)
    setEditMode(false)

    // Refresh in background
    refreshProfile()
    load()
  }

  // Show edit form if: never registered AND profile has no phone saved in DB
  const profileComplete = registeredInSession || !!(profile?.phone_number)
  const showEditSection = !profileComplete || editMode

  const myMonths = selectedChild?.dob ? ageMonths(selectedChild.dob) : null
  // Use freshly saved area input OR profile area
  const myArea = (registeredInSession ? areaInput : (profile?.area ?? areaInput)).trim().toLowerCase()

  const filtered = profiles.filter(p => {
    if (p.id === user?.id) return false
    if (filterMode === 'age') {
      if (myMonths == null || !p.child_dob) return false
      return Math.abs(ageMonths(p.child_dob) - myMonths) <= 2
    }
    if (filterMode === 'area') {
      if (!myArea || !p.area) return false
      return p.area.trim().toLowerCase() === myArea
    }
    return true
  })

  const genderEmoji = (g: string | null) => g === 'boy' ? '👦' : g === 'girl' ? '👧' : '👶'

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">👩‍👩‍👧</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-sand-800">קהילה</h1>
            <p className="text-sand-400 text-sm">אמהות בשלב דומה כמוך</p>
          </div>
          {profileComplete && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-2xl text-xs font-semibold text-sand-500 shadow-sm hover:text-sand-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              ערוך פרופיל
            </button>
          )}
        </div>

        {/* Community profile form — hidden once complete */}
        {showEditSection && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            <div>
              <p className="text-base font-bold text-sand-800">הצטרפי לקהילה 🌸</p>
              <p className="text-xs text-sand-400 mt-0.5">מלאי פרטים כדי שאמהות אחרות יוכלו להתחבר איתך</p>
            </div>

            {/* Area */}
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <MapPin className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                עיר / אזור
              </label>
              <input
                value={areaInput}
                onChange={e => setAreaInput(e.target.value)}
                placeholder="למשל: תל אביב, ירושלים, חיפה..."
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <Phone className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                מספר טלפון
              </label>
              <input
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                placeholder="050-0000000"
                type="tel"
                dir="ltr"
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <AlignLeft className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                קצת עליי / מה אני מחפשת
              </label>
              <textarea
                value={bioInput}
                onChange={e => setBioInput(e.target.value)}
                placeholder="למשל: אמא לתינוקת בת 3 חודשים, מחפשת אמא לטיולים משותפים..."
                rows={3}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
              />
            </div>

            {/* Consent */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                onClick={() => setConsentChecked(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${consentChecked ? 'border-mustard-500' : 'border-sand-300'}`}
                style={consentChecked ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
              >
                {consentChecked && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-sand-600 leading-relaxed">
                אני מסכימה לשתף את מספר הטלפון שלי עם אמהות אחרות בקהילה
              </span>
            </label>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}

            <div className="flex gap-2">
              {editMode && (
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold"
                >
                  ביטול
                </button>
              )}
              <button
                onClick={saveMyProfile}
                disabled={savingProfile}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
              >
                {savingProfile ? 'שומרת...' : editMode ? 'עדכון' : 'הצטרפי לקהילה ✓'}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {([
            ['all',  'כולן'],
            ['age',  'גיל דומה'],
            ['area', 'אותו אזור'],
          ] as [FilterMode, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilterMode(v as FilterMode)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${filterMode === v ? 'text-white shadow-sm' : 'text-sand-500'}`}
              style={filterMode === v ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-2">
            <p className="text-3xl">🔍</p>
            <p className="font-semibold text-sand-700 text-sm">
              {filterMode === 'area' && !myArea
                ? 'הזיני עיר / אזור בפרופיל שלך כדי לחפש'
                : filterMode === 'age' && myMonths == null
                ? 'הוסיפי תאריך לידה לתינוק/ת כדי לסנן לפי גיל'
                : 'לא נמצאו אמהות בסינון זה — נסי "כולן"'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-sand-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              {filtered.length} אמהות נמצאו
            </p>
            {filtered.map(p => (
              <div key={p.child_id} className="bg-white rounded-3xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
                    {genderEmoji(p.child_gender)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sand-800 text-sm">
                      {p.mother_name ? p.mother_name.split(' ')[0] : 'אמא'}
                    </p>
                    <p className="text-xs text-sand-400">
                      {p.child_dob ? getBabyAge(p.child_dob) : ''}
                      {p.area && ` · ${p.area}`}
                    </p>
                    {p.community_bio && (
                      <p className="text-xs text-sand-600 mt-1.5 leading-relaxed line-clamp-2">
                        {p.community_bio}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {p.community_consent && p.phone_number ? (
                      <a
                        href={`https://wa.me/${p.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent('היי! מצאתי אותך בקהילת Mimo 🌿')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-2xl text-xs font-semibold hover:bg-green-100 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                    ) : (
                      <a
                        href={`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(`היי! אני רוצה להתחבר עם אמא מהקהילה שיש לה תינוק${p.child_gender === 'girl' ? 'ת' : ''} בגיל דומה 🌿`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-sand-100 text-sand-600 rounded-2xl text-xs font-semibold hover:bg-sand-200 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        חיבור
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="bg-mustard-50 border border-mustard-200 rounded-3xl p-4 text-center space-y-2">
          <p className="text-sm font-semibold text-sand-800">רוצה קבוצת וואטסאפ עם אמהות מהאזור?</p>
          <a
            href={`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent('היי! אני רוצה להצטרף לקבוצת אמהות מהאזור שלי 🌿')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
          >
            <MessageCircle className="w-4 h-4" />
            בקשי להצטרף
          </a>
        </div>
      </div>
    </div>
  )
}
