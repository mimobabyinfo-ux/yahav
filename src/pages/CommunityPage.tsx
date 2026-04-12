import { useEffect, useState, useCallback } from 'react'
import { MessageCircle, MapPin, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'

const WA_ADMIN = '972559904274'

type CommunityProfile = {
  id: string
  mother_name: string | null
  area: string | null
  child_id: string
  child_dob: string | null
  child_gender: 'boy' | 'girl' | 'other' | null
}

type FilterMode = 'age' | 'area' | 'all'

function ageRangeLabel(months: number): string {
  if (months < 3) return '0–3 חודשים'
  if (months < 6) return '3–6 חודשים'
  if (months < 9) return '6–9 חודשים'
  if (months < 12) return '9–12 חודשים'
  if (months < 18) return '12–18 חודשים'
  if (months < 24) return '18–24 חודשים'
  return '2+ שנים'
}

function ageMonths(dob: string): number {
  const ms = Date.now() - new Date(dob).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
}

export default function CommunityPage() {
  const { selectedChild, profile, user } = useAuth()
  const [profiles, setProfiles] = useState<CommunityProfile[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>('age')
  const [areaInput, setAreaInput] = useState(profile?.area ?? '')
  const [savingArea, setSavingArea] = useState(false)
  const [areaSaved, setAreaSaved] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('community_profiles')
      .select('*')
    setProfiles((data ?? []) as CommunityProfile[])
  }, [])

  useEffect(() => { load() }, [load])

  async function saveArea() {
    if (!user || !areaInput.trim()) return
    setSavingArea(true)
    await supabase.from('user_profiles').update({ area: areaInput.trim() }).eq('id', user.id)
    setSavingArea(false)
    setAreaSaved(true)
    setTimeout(() => setAreaSaved(false), 2000)
    load()
  }

  const myMonths = selectedChild?.dob ? ageMonths(selectedChild.dob) : null

  const filtered = profiles.filter(p => {
    if (p.id === user?.id) return false // exclude self
    if (filterMode === 'age' && myMonths != null && p.child_dob) {
      const diff = Math.abs(ageMonths(p.child_dob) - myMonths)
      return diff <= 2 // ±2 months
    }
    if (filterMode === 'area') {
      const myArea = profile?.area ?? areaInput
      return myArea && p.area && p.area === myArea
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
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">קהילה</h1>
          <p className="text-sand-400 text-sm">אמהות בשלב דומה כמוך</p>
        </div>

        {/* Area setup */}
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-mustard-500" />
            <p className="text-sm font-semibold text-sand-700">האזור שלי</p>
          </div>
          <div className="flex gap-2">
            <input
              value={areaInput}
              onChange={e => setAreaInput(e.target.value)}
              placeholder="למשל: תל אביב, חיפה..."
              className="flex-1 px-3 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            <button
              onClick={saveArea}
              disabled={savingArea || !areaInput.trim()}
              className="px-4 py-2.5 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
            >
              {areaSaved ? '✓' : savingArea ? '...' : 'שמור'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {([
            ['age',  `גיל דומה ${myMonths != null ? `(${ageRangeLabel(myMonths)})` : ''}`],
            ['area', 'אותו אזור'],
            ['all',  'כולן'],
          ] as [FilterMode, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilterMode(v)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all truncate px-1 ${filterMode === v ? 'text-white shadow-sm' : 'text-sand-500'}`}
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
              {filterMode === 'area' && !profile?.area
                ? 'הזיני את האזור שלך למעלה כדי לחפש'
                : 'לא נמצאו אמהות בסינון זה'}
            </p>
            <p className="text-xs text-sand-400">נסי סינון אחר, או הכרי אמהות חדשות דרך הקהילה שלנו</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-sand-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              {filtered.length} אמהות נמצאו
            </p>
            {filtered.map(p => (
              <div key={p.child_id} className="bg-white rounded-3xl p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
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
                  </div>
                  <a
                    href={`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(`היי! אני רוצה להתחבר עם אמא אחרת מהקהילה שיש לה תינוק${p.child_gender === 'girl' ? 'ת' : ''} בגיל דומה 🌿`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-2xl text-xs font-semibold hover:bg-green-100 transition-colors flex-shrink-0"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    חיבור
                  </a>
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
