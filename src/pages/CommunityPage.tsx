import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageCircle, MapPin, Filter, Phone, Check, Pencil, AlignLeft, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOwnerSettings } from '../hooks/useOwnerSettings'
import { getBabyAge } from '../utils/dateUtils'
import { CITIES } from '../data/cities'
import { COMMUNITY_TAGS, tagDef, type CommunityTagId } from '../constants/communityTags'
import TagSelector from '../components/community/TagSelector'
import CommunityTagFilter from '../components/community/CommunityTagFilter'
import CommunityMemberSheet from '../components/community/CommunityMemberSheet'

type CommunityProfile = {
  id: string
  mother_name: string | null
  area: string | null
  phone_number: string | null
  community_consent: boolean | null
  community_bio: string | null
  community_tags: string[] | null
  child_id: string
  child_dob: string | null
  child_gender: 'boy' | 'girl' | 'other' | null
}

type PregnantProfile = {
  id: string
  mother_name: string | null
  area: string | null
  phone_number: string | null
  community_consent: boolean | null
  community_bio: string | null
  community_tags: string[] | null
  due_date: string | null
}

type FilterMode = 'age' | 'area' | 'all'
type PregnancyFilter = 'all' | 'week' | 'area'

function ageMonths(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
}

function pregnancyWeek(dueDate: string): number {
  const daysLeft = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000)
  return Math.max(1, Math.min(42, Math.floor((280 - daysLeft) / 7)))
}

export default function CommunityPage() {
  const { selectedChild, profile, user, refreshProfile } = useAuth()
  const { ownerWhatsapp } = useOwnerSettings()
  const isPregnant = profile?.user_mode === 'pregnant'

  // Mom-mode state
  const [profiles, setProfiles] = useState<CommunityProfile[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  // Pregnancy-mode state
  const [pregnantProfiles, setPregnantProfiles] = useState<PregnantProfile[]>([])
  const [pregnancyFilter, setPregnancyFilter] = useState<PregnancyFilter>('all')

  const [editMode, setEditMode] = useState(false)
  const [registeredInSession, setRegisteredInSession] = useState(false)
  const initialized = useRef(false)
  const [areaInput, setAreaInput] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [showCities, setShowCities] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [tagsInput, setTagsInput] = useState<string[]>([])
  const [consentChecked, setConsentChecked] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Phase 4 / C2: single-select tag filter (independent of age/area
  // strip). null = "הכל" — no tag narrowing.
  const [tagFilter, setTagFilter] = useState<CommunityTagId | null>(null)
  // Open member profile in a bottom sheet. Discriminated union over the
  // two view types so the sheet's caller knows whether to render mom
  // or pregnant copy.
  const [openMember, setOpenMember] = useState<
    | { kind: 'mom'; member: CommunityProfile }
    | { kind: 'pregnant'; member: PregnantProfile }
    | null
  >(null)

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true
      setAreaInput(profile.area ?? '')
      setCitySearch(profile.area ?? '')
      setPhoneInput(profile.phone_number ?? '')
      setBioInput(profile.community_bio ?? '')
      setTagsInput(profile.community_tags ?? [])
      setConsentChecked(profile.community_consent ?? false)
    }
  }, [profile])

  const loadMoms = useCallback(async () => {
    const { data } = await supabase.from('community_profiles').select('*')
    setProfiles((data ?? []) as CommunityProfile[])
  }, [])

  const loadPregnant = useCallback(async () => {
    const { data } = await supabase
      .from('community_pregnant_profiles')
      .select('*')
    setPregnantProfiles((data ?? []) as PregnantProfile[])
  }, [])

  useEffect(() => {
    if (isPregnant) loadPregnant()
    else loadMoms()
  }, [isPregnant, loadMoms, loadPregnant])

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
        community_tags: tagsInput,
        community_consent: consentChecked,
      })
      .eq('id', user.id)
    setSavingProfile(false)
    if (error) { setSaveError('שגיאה בשמירה — נסי שוב'); return }
    setRegisteredInSession(true)
    setEditMode(false)
    refreshProfile()
    if (isPregnant) loadPregnant()
    else loadMoms()
  }

  const profileComplete = registeredInSession || !!(profile?.phone_number || profile?.community_consent)
  const showEditSection = !profileComplete || editMode

  const myMonths = selectedChild?.dob ? ageMonths(selectedChild.dob) : null
  const myArea = (registeredInSession ? areaInput : (profile?.area ?? areaInput)).trim().toLowerCase()
  const myWeek = profile?.due_date ? pregnancyWeek(profile.due_date) : null

  // Tag filter — applied AFTER the age/area chip. A null tagFilter
  // means "no tag narrowing"; an untagged mom is hidden whenever a tag
  // is selected (filter intent = "actively looking for X").
  function matchesTag(tags: string[] | null): boolean {
    if (tagFilter == null) return true
    return !!tags?.includes(tagFilter)
  }

  // Filter mom profiles
  const filteredMoms = profiles.filter(p => {
    if (p.id === user?.id) return false
    if (filterMode === 'age') {
      if (myMonths == null || !p.child_dob) return false
      if (Math.abs(ageMonths(p.child_dob) - myMonths) > 2) return false
    }
    if (filterMode === 'area') {
      if (!myArea || !p.area) return false
      if (p.area.trim().toLowerCase() !== myArea) return false
    }
    return matchesTag(p.community_tags)
  })

  // Filter pregnant profiles
  const filteredPregnant = pregnantProfiles.filter(p => {
    if (p.id === user?.id) return false
    if (pregnancyFilter === 'week') {
      if (myWeek == null || !p.due_date) return false
      if (Math.abs(pregnancyWeek(p.due_date) - myWeek) > 2) return false
    }
    if (pregnancyFilter === 'area') {
      if (!myArea || !p.area) return false
      if (p.area.trim().toLowerCase() !== myArea) return false
    }
    return matchesTag(p.community_tags)
  })

  const genderEmoji = (g: string | null) => g === 'boy' ? '👶🏻' : g === 'girl' ? '👧' : '👶'

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">{isPregnant ? '🤰' : '👩‍👩‍👧'}</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-sand-800">קהילת מימו</h1>
          {profileComplete && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#F5F1EB] rounded-2xl text-xs font-semibold text-sand-500 shadow-sm hover:text-sand-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              ערוך פרופיל
            </button>
          )}
        </div>

        {/* Community profile form */}
        {showEditSection && (
          <div className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm space-y-4">
            <p className="text-base font-bold text-sand-800">
              {isPregnant ? 'הצטרפי לקהילת הריון 🤰' : 'הצטרפי לקהילה 🌸'}
            </p>

            <div className="relative">
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <MapPin className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                עיר מגורים / יישוב
              </label>
              <input
                value={citySearch}
                onChange={e => { setCitySearch(e.target.value); setAreaInput(''); setShowCities(true) }}
                onFocus={() => setShowCities(true)}
                onBlur={() => setTimeout(() => setShowCities(false), 150)}
                placeholder="חיפוש עיר..."
                autoComplete="off"
                className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none bg-white ${areaInput ? 'border-mustard-400' : 'border-sand-200 focus:border-mustard-400'}`}
              />
              {showCities && (
                <div className="absolute top-full right-0 left-0 z-50 bg-white border-2 border-mustard-200 rounded-2xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                  {CITIES.filter(c => !citySearch || c.includes(citySearch)).map(c => (
                    <button key={c} type="button"
                      onMouseDown={() => { setAreaInput(c); setCitySearch(c); setShowCities(false) }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-mustard-50 text-sand-800 border-b border-sand-50 last:border-0 transition-colors">
                      {c}
                    </button>
                  ))}
                  {CITIES.filter(c => !citySearch || c.includes(citySearch)).length === 0 && (
                    <p className="text-center text-sand-400 text-sm py-3">לא נמצאו תוצאות</p>
                  )}
                </div>
              )}
            </div>

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

            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <AlignLeft className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                {isPregnant ? 'קצת עליי / שבוע הריון ומה אני מחפשת' : 'קצת עליי / מה אני מחפשת'}
              </label>
              <textarea
                value={bioInput}
                onChange={e => setBioInput(e.target.value)}
                placeholder={isPregnant
                  ? 'למשל: שבוע 28, מחפשת חברותא לטיולים ולמדריכי לידה...'
                  : 'למשל: אמא לתינוקת בת 3 חודשים, מחפשת אמא לטיולים משותפים...'}
                rows={3}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
              />
            </div>

            {/* Phase 4 / C2: structured tags. Optional — empty array
                = mom not surfaced under any tag filter. */}
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                <Tag className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                מה את מחפשת בקהילה?
              </label>
              <TagSelector value={tagsInput} onChange={setTagsInput} />
              <p className="text-[11px] text-sand-400 mt-1.5 leading-relaxed">
                בחירת תגיות תופיע בפרופיל שלך וגם תעזור לאמהות אחרות למצוא אותך.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <div
                onClick={() => setConsentChecked(v => !v)}
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${consentChecked ? 'border-mustard-500' : 'border-sand-300'}`}
                style={consentChecked ? { background: '#E7C78A' } : {}}
              >
                {consentChecked && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs text-sand-600 leading-relaxed">
                אני מסכימה לשתף את מספר הטלפון שלי עם נשים אחרות בקהילת מימו
              </span>
            </label>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}

            <div className="flex gap-2">
              {editMode && (
                <button onClick={() => setEditMode(false)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">
                  ביטול
                </button>
              )}
              <button
                onClick={saveMyProfile}
                disabled={savingProfile}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40 transition-all"
                style={{ background: '#E7C78A' }}
              >
                {savingProfile ? 'שומרת...' : editMode ? 'עדכון' : 'הצטרפי לקהילה ✓'}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        {isPregnant ? (
          <div className="flex bg-[#F5F1EB] rounded-2xl p-1 shadow-sm gap-1">
            {([
              ['all',  'כולן'],
              ['week', 'שבוע דומה'],
              ['area', 'אותו אזור'],
            ] as [PregnancyFilter, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setPregnancyFilter(v)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${pregnancyFilter === v ? 'text-white shadow-sm' : 'text-sand-500'}`}
                style={pregnancyFilter === v ? { background: '#E7C78A' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex bg-[#F5F1EB] rounded-2xl p-1 shadow-sm gap-1">
            {([
              ['all',  'כולן'],
              ['age',  'גיל דומה'],
              ['area', 'אותו אזור'],
            ] as [FilterMode, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilterMode(v as FilterMode)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${filterMode === v ? 'text-white shadow-sm' : 'text-sand-500'}`}
                style={filterMode === v ? { background: '#E7C78A' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Phase 4 / C2: tag filter — independent of age/area, single
            select. Overflows horizontally on narrow screens. */}
        <CommunityTagFilter value={tagFilter} onChange={setTagFilter} />

        {/* ── Pregnant community results ─────────────────────────────────────── */}
        {isPregnant && (
          filteredPregnant.length === 0 ? (
            <div className="bg-[#F5F1EB] rounded-3xl p-8 text-center shadow-sm space-y-2">
              <p className="text-3xl">🔍</p>
              <p className="font-semibold text-sand-700 text-sm">
                {pregnancyFilter === 'week' && myWeek == null
                  ? 'הוסיפי תאריך לידה משוער בפרופיל שלך כדי לסנן לפי שבוע'
                  : pregnancyFilter === 'area' && !myArea
                  ? 'הזיני עיר / אזור בפרופיל שלך כדי לחפש'
                  : tagFilter
                  ? 'אין בנות בהריון עם התגית הזו — נסי "הכל" או תגית אחרת'
                  : 'לא נמצאו בנות בהריון בסינון זה — נסי "כולן"'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-sand-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                {filteredPregnant.length} בנות בהריון נמצאו
              </p>
              {filteredPregnant.map(p => {
                const week = p.due_date ? pregnancyWeek(p.due_date) : null
                const memberTags = (p.community_tags ?? []).map(tagDef).filter((t): t is (typeof COMMUNITY_TAGS)[number] => !!t)
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenMember({ kind: 'pregnant', member: p })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenMember({ kind: 'pregnant', member: p }) } }}
                    className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 mt-0.5"
                        style={{ background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' }}>
                        🤰
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sand-800 text-sm">
                          {p.mother_name ? p.mother_name.split(' ')[0] : 'בהריון'}
                        </p>
                        <p className="text-xs text-sand-400">
                          {week != null ? `שבוע ${week}` : 'בהריון'}
                          {p.area && ` · ${p.area}`}
                        </p>
                        {p.community_bio && (
                          <p className="text-xs text-sand-600 mt-1.5 leading-relaxed line-clamp-2">{p.community_bio}</p>
                        )}
                        {memberTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {memberTags.slice(0, 3).map(t => (
                              <span key={t.id} className="text-[10px] text-mustard-700">
                                {t.emoji} {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {p.community_consent && p.phone_number ? (
                          <a
                            href={`https://wa.me/${p.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent('היי! מצאתי אותך בקהילת הריון של Mimo 🤰')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-2xl text-xs font-semibold hover:bg-green-100 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        ) : (
                          <a
                            href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent('היי! אני בהריון ורוצה להתחבר עם בנות בשבוע דומה 🤰')}`}
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
                )
              })}
            </div>
          )
        )}

        {/* ── Mom community results ──────────────────────────────────────────── */}
        {!isPregnant && (
          filteredMoms.length === 0 ? (
            <div className="bg-[#F5F1EB] rounded-3xl p-8 text-center shadow-sm space-y-2">
              <p className="text-3xl">🔍</p>
              <p className="font-semibold text-sand-700 text-sm">
                {filterMode === 'area' && !myArea
                  ? 'הזיני עיר / אזור בפרופיל שלך כדי לחפש'
                  : filterMode === 'age' && myMonths == null
                  ? 'הוסיפי תאריך לידה לתינוק/ת כדי לסנן לפי גיל'
                  : tagFilter
                  ? 'אין אמהות עם התגית הזו — נסי "הכל" או תגית אחרת'
                  : 'לא נמצאו אמהות בסינון זה — נסי "כולן"'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-sand-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                {filteredMoms.length} אמהות נמצאו
              </p>
              {filteredMoms.map(p => {
                const memberTags = (p.community_tags ?? []).map(tagDef).filter((t): t is (typeof COMMUNITY_TAGS)[number] => !!t)
                return (
                  <div
                    key={p.child_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenMember({ kind: 'mom', member: p })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenMember({ kind: 'mom', member: p }) } }}
                    className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
                        style={{ background: '#FFFFFF' }}>
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
                          <p className="text-xs text-sand-600 mt-1.5 leading-relaxed line-clamp-2">{p.community_bio}</p>
                        )}
                        {memberTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {memberTags.slice(0, 3).map(t => (
                              <span key={t.id} className="text-[10px] text-mustard-700">
                                {t.emoji} {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
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
                            href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`היי! אני רוצה להתחבר עם אמא מהקהילה שיש לה תינוק${p.child_gender === 'girl' ? 'ת' : ''} בגיל דומה 🌿`)}`}
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
                )
              })}
            </div>
          )
        )}

      </div>

      {/* Phase 4 / C2: member profile bottom-sheet. Mom and pregnant
          variants share the same component, parameterized via props. */}
      {openMember?.kind === 'mom' && (() => {
        const m = openMember.member
        const firstName = m.mother_name?.split(' ')[0] ?? 'אמא'
        const secondary = m.child_dob ? `אמא ל${m.child_gender === 'girl' ? 'תינוקת' : 'תינוק'} (${getBabyAge(m.child_dob)})` : 'אמא בקהילה'
        return (
          <CommunityMemberSheet
            member={m}
            avatarEmoji={genderEmoji(m.child_gender)}
            secondaryLine={secondary}
            whatsappGreeting={`היי ${firstName}! מצאתי אותך בקהילת Mimo 🌿`}
            fallbackGreeting={`היי! אני רוצה להתחבר עם אמא מהקהילה שיש לה תינוק${m.child_gender === 'girl' ? 'ת' : ''} בגיל דומה 🌿`}
            onClose={() => setOpenMember(null)}
          />
        )
      })()}

      {openMember?.kind === 'pregnant' && (() => {
        const m = openMember.member
        const firstName = m.mother_name?.split(' ')[0] ?? 'בהריון'
        const week = m.due_date ? pregnancyWeek(m.due_date) : null
        const secondary = week != null ? `שבוע ${week} להריון` : 'בהריון'
        return (
          <CommunityMemberSheet
            member={m}
            avatarEmoji="🤰"
            secondaryLine={secondary}
            whatsappGreeting={`היי ${firstName}! מצאתי אותך בקהילת הריון של Mimo 🤰`}
            fallbackGreeting="היי! אני בהריון ורוצה להתחבר עם בנות בשבוע דומה 🤰"
            onClose={() => setOpenMember(null)}
          />
        )
      })()}
    </div>
  )
}
