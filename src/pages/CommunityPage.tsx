import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { MessageCircle, MapPin, Filter, Phone, Check, Pencil, AlignLeft, Tag, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getBabyAge } from '../utils/dateUtils'
import { CITIES } from '../data/cities'
import { COMMUNITY_TAGS, tagDef, type CommunityTagId } from '../constants/communityTags'
import TagSelector from '../components/community/TagSelector'
import CommunityTagFilter from '../components/community/CommunityTagFilter'
import NeighborhoodPicker from '../components/community/NeighborhoodPicker'
import CommunityMemberSheet from '../components/community/CommunityMemberSheet'
import EventsTab from '../components/community/EventsTab'
import MyBookingsTab from '../components/community/MyBookingsTab'
import MembershipCard from '../components/community/MembershipCard'

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
  /** First name only — the view deliberately does not expose the surname. */
  child_name: string | null
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

// Top-level page tabs: community events ("הקהילה של מימו") vs the
// member directory. Events is the default tab; the dashboard teaser
// deep-links here via sessionStorage('mimo_community_tab').
type PageTab = 'events' | 'bookings' | 'members'

type FilterMode = 'age' | 'area' | 'all'
type PregnancyFilter = 'all' | 'week' | 'area'

// City-match ranking: the city she typed, then cities that start with
// it, then anything else containing it. 0 is best.
function rankCity(city: string, query: string): number {
  if (city === query) return 0
  if (city.startsWith(query)) return 1
  return 2
}

function ageMonths(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
}

function pregnancyWeek(dueDate: string): number {
  const daysLeft = Math.round((new Date(dueDate).getTime() - Date.now()) / 86400000)
  return Math.max(1, Math.min(42, Math.floor((280 - daysLeft) / 7)))
}

export default function CommunityPage() {
  const { selectedChild, profile, user, refreshProfile } = useAuth()
  const isPregnant = profile?.user_mode === 'pregnant'

  // Brenda 17.8.26: "add some kind of balance tab at the top". Credit is
  // money she already paid, so it should be visible from anywhere in the
  // community, not buried inside ההזמנות שלי.
  const [creditBalance, setCreditBalance] = useState(0)
  useEffect(() => {
    supabase.rpc('get_my_credit_balance').then(({ data }) => setCreditBalance(Number(data ?? 0)))
  }, [])

  const [pageTab, setPageTab] = useState<PageTab>(() => {
    const stored = sessionStorage.getItem('mimo_community_tab')
    sessionStorage.removeItem('mimo_community_tab')
    return stored === 'members' ? 'members' : stored === 'bookings' ? 'bookings' : 'events'
  })

  // Mom-mode state
  const [profiles, setProfiles] = useState<CommunityProfile[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  // Pregnancy-mode state
  const [pregnantProfiles, setPregnantProfiles] = useState<PregnantProfile[]>([])
  const [pregnancyFilter, setPregnancyFilter] = useState<PregnancyFilter>('all')

  const [editMode, setEditMode] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const [registeredInSession, setRegisteredInSession] = useState(false)
  const initialized = useRef(false)
  const [areaInput, setAreaInput] = useState('')
  const [citySearch, setCitySearch] = useState('')
  // Yahav 11.8.26: "אם רשמתי רמת גן אני רוצה לראות רק רמת גן".
  // A plain substring match buried the city she typed under every other
  // name containing it. Exact match first, then names that START with
  // what she typed, then the rest.
  const cityMatches = useMemo(() => {
    const q = citySearch.trim()
    if (!q) return CITIES
    const hits = CITIES.filter(c => c.includes(q))
    return hits.sort((a, b) => rankCity(a, q) - rankCity(b, q) || a.localeCompare(b, 'he'))
  }, [citySearch])

  // Neighbourhood inside the city. Brenda 17.8.26 turned this from free
  // text into a real picker — see components/community/NeighborhoodPicker,
  // which is the same control the signup form uses so the two screens
  // cannot drift apart or store the same neighbourhood two ways.
  const [neighborhoodInput, setNeighborhoodInput] = useState('')
  const [showCities, setShowCities] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [tagsInput, setTagsInput] = useState<string[]>([])
  const [consentChecked, setConsentChecked] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Phase 4 / C2: single-select tag filter (independent of age/area
  // strip). null = "הכל" — no tag narrowing.
  const [tagFilters, setTagFilters] = useState<CommunityTagId[]>([])
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
      setNeighborhoodInput(profile.neighborhood ?? '')
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
        neighborhood: neighborhoodInput.trim() || null,
        phone_number: phoneInput.trim() || null,
        community_bio: bioInput.trim() || null,
        community_tags: tagsInput,
        community_consent: consentChecked,
      })
      .eq('id', user.id)
    setSavingProfile(false)
    if (error) { setSaveError('שגיאה בשמירה. נסי שוב'); return }
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

  // Tag filter — applied AFTER the age/area chip. Empty means "no tag
  // narrowing"; an untagged mom is hidden whenever a tag is selected
  // (filter intent = "actively looking for X").
  //
  // Several tags are ANDed, not ORed (Yahav 11.8.26): each chip she
  // adds is another thing she wants in common, so it should narrow.
  function matchesTag(tags: string[] | null): boolean {
    if (tagFilters.length === 0) return true
    return tagFilters.every(t => !!tags?.includes(t))
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

  const genderEmoji = (g: string | null) => g === 'boy' ? '👶🏼' : g === 'girl' ? '👧🏼' : '👶🏼'

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">{isPregnant ? '🤰🏼' : '👩‍👩‍👧🏼'}</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 400, color: '#5E4938' }}>קהילת מימו</h1>
          <div className="flex items-center gap-2">
            {pageTab === 'members' && profileComplete && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-2xl text-xs font-semibold text-sand-500 shadow-sm hover:text-sand-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                ערוך פרופיל
              </button>
            )}
            {creditBalance > 0 && (
              <button
                onClick={() => setPageTab('bookings')}
                className="flex items-center gap-1 px-2.5 py-2 rounded-2xl text-xs font-bold shadow-sm transition-all"
                style={{ background: '#EADBDD', color: '#5E4938' }}
                title="הזיכוי שלך, לשימוש באירועי הקהילה"
              >
                יתרה ₪{creditBalance}
              </button>
            )}
            {/* Digital membership card — shown at partner businesses for perks */}
            <button
              onClick={() => setCardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold shadow-sm transition-all"
              style={{ background: '#F6ECD8', border: '1px solid #E7C78A', color: '#4A3A28' }}
            >
              <WalletCards className="w-4 h-4" />
              כרטיס קהילה
            </button>
          </div>
        </div>

        {/* Page tabs — underlined: these switch WORLDS (events/members),
            unlike the list/calendar pair which is just a rendering of
            the events (IA handoff §3). */}
        <div className="flex" style={{ gap: 26, borderBottom: '1px solid #E4DAD0' }}>
          {([
            ['events',   'אירועים'],
            ['bookings', 'ההזמנות שלי'],
            ['members',  'חברות'],
          ] as [PageTab, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPageTab(v)}
              className="transition-all"
              style={pageTab === v
                ? { fontWeight: 700, fontSize: 18, color: '#443327', padding: '0 0 12px', borderBottom: '3px solid #C8A460', marginBottom: -1 }
                : { fontWeight: 600, fontSize: 18, color: '#7B604C', padding: '0 0 12px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Events tab ── */}
        {pageTab === 'events' && <EventsTab />}

        {/* ── ההזמנות שלי — what she already signed up for, with the
             calendar file. Same RPC as the events tab, filtered to her. */}
        {pageTab === 'bookings' && <MyBookingsTab />}

        {/* Brenda 17.8.26: "when you tap edit profile there's no reason to
            see all the members underneath — it should be separate, and
            then take you back to the members page". So the members tab is
            one of two screens, never both at once: the profile form, or
            the directory. The same rule serves the first-time join, where
            a half-filled form under a list of strangers is worse still. */}
        {pageTab === 'members' && (showEditSection ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            <p className="text-base font-bold text-sand-800">
              {isPregnant ? 'הצטרפי לקהילת הריון 🤰🏼' : 'הצטרפי לקהילה 🌸'}
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
                  {cityMatches.map(c => (
                    <button key={c} type="button"
                      onMouseDown={() => { setAreaInput(c); setCitySearch(c); setShowCities(false) }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-mustard-50 text-sand-800 border-b border-sand-50 last:border-0 transition-colors">
                      {c}
                    </button>
                  ))}
                  {cityMatches.length === 0 && (
                    <p className="text-center text-sand-600 text-sm py-3">לא נמצאו תוצאות</p>
                  )}
                </div>
              )}
            </div>

            {/* Neighbourhood — only once a city is chosen, and only ever
                optional. In a big city "רמת גן" is not enough to find
                someone you'd actually meet for coffee. */}
            {areaInput.trim() && (
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-1.5">
                  <MapPin className="w-3.5 h-3.5 inline ml-1 text-mustard-500" />
                  שכונה ב{areaInput.trim()} <span className="text-sand-400 font-normal">(לא חובה)</span>
                </label>
                <NeighborhoodPicker
                  city={areaInput.trim()}
                  value={neighborhoodInput}
                  onChange={setNeighborhoodInput}
                />
              </div>
            )}

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
                מה ההעדפות החברתיות שלך?
              </label>
              <TagSelector value={tagsInput} onChange={setTagsInput} />
              <p className="text-[13px] text-sand-600 mt-1.5 leading-relaxed">
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
                <button onClick={() => setEditMode(false)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold whitespace-nowrap">
                  חזרה לחברות
                </button>
              )}
              <button
                onClick={saveMyProfile}
                disabled={savingProfile}
                className="flex-1 py-3 rounded-2xl text-[#4A3A28] text-sm font-bold disabled:opacity-40 transition-all"
                style={{ background: '#E7C78A' }}
              >
                {savingProfile ? 'שומרת...' : editMode ? 'עדכון' : 'הצטרפי לקהילה ✓'}
              </button>
            </div>
          </div>
        ) : (<>

        {/* Filters */}
        {isPregnant ? (
          <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
            {([
              ['all',  'כולן'],
              ['week', 'שבוע דומה'],
              ['area', 'אותו אזור'],
            ] as [PregnancyFilter, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setPregnancyFilter(v)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${pregnancyFilter === v ? 'text-[#4A3A28] shadow-sm' : 'text-sand-500'}`}
                style={pregnancyFilter === v ? { background: '#E7C78A' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
            {([
              ['all',  'כולן'],
              ['age',  'גיל דומה'],
              ['area', 'אותו אזור'],
            ] as [FilterMode, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilterMode(v as FilterMode)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${filterMode === v ? 'text-[#4A3A28] shadow-sm' : 'text-sand-500'}`}
                style={filterMode === v ? { background: '#E7C78A' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Phase 4 / C2: tag filter — independent of age/area, single
            select. Overflows horizontally on narrow screens. */}
        <CommunityTagFilter value={tagFilters} onChange={setTagFilters} />

        {/* ── Pregnant community results ─────────────────────────────────────── */}
        {isPregnant && (
          filteredPregnant.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-2">
              <p className="text-3xl">🔍</p>
              <p className="font-semibold text-sand-700 text-sm">
                {pregnancyFilter === 'week' && myWeek == null
                  ? 'הוסיפי תאריך לידה משוער בפרופיל שלך כדי לסנן לפי שבוע'
                  : pregnancyFilter === 'area' && !myArea
                  ? 'הזיני עיר / אזור בפרופיל שלך כדי לחפש'
                  : tagFilters.length > 0
                  ? (tagFilters.length === 1
                      ? 'אין בנות בהריון עם התגית הזו. נסי "הכל" או תגית אחרת'
                      : 'אין בנות בהריון שמחפשות את כל הדברים האלה. נסי להוריד תגית')
                  : 'לא נמצאו בנות בהריון בסינון זה. נסי "כולן"'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-sand-600 flex items-center gap-1">
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
                    className="bg-white rounded-3xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 mt-0.5"
                        style={{ background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)' }}>
                        🤰🏼
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sand-800 text-sm">
                          {p.mother_name ?? 'בהריון'}
                        </p>
                        <p className="text-xs text-sand-600">
                          {week != null ? `שבוע ${week}` : 'בהריון'}
                          {p.area && ` · ${p.area}`}
                        </p>
                        {p.community_bio && (
                          <p className="text-xs text-sand-600 mt-1.5 leading-relaxed line-clamp-2">{p.community_bio}</p>
                        )}
                        {memberTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {memberTags.slice(0, 3).map(t => (
                              <span key={t.id} className="text-[13px] text-mustard-700">
                                {t.emoji} {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {p.community_consent && p.phone_number && (
                        <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <a
                            href={`https://wa.me/${p.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent('היי! מצאתי אותך בקהילת הריון של Mimo 🤰🏼')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-2xl text-xs font-semibold hover:bg-green-100 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        </div>
                      )}
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
            <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-2">
              <p className="text-3xl">🔍</p>
              <p className="font-semibold text-sand-700 text-sm">
                {filterMode === 'area' && !myArea
                  ? 'הזיני עיר / אזור בפרופיל שלך כדי לחפש'
                  : filterMode === 'age' && myMonths == null
                  ? 'הוסיפי תאריך לידה לתינוק/ת כדי לסנן לפי גיל'
                  : tagFilters.length > 0
                  ? (tagFilters.length === 1
                      ? 'אין אמהות עם התגית הזו. נסי "הכל" או תגית אחרת'
                      : 'אין אמהות שמחפשות את כל הדברים האלה. נסי להוריד תגית')
                  : 'לא נמצאו אמהות בסינון זה. נסי "כולן"'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-sand-600 flex items-center gap-1">
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
                    className="bg-white rounded-3xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      {/* Brenda 17.8.26: the name on this card is the
                          MOTHER's, so the baby emoji had to go — it read as
                          if the baby were the member. Her initial instead,
                          and the baby moves to its own "אמא של" line. */}
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 font-display"
                        style={{ background: '#F4EDE1', fontSize: 19, color: '#8A6A2F' }}>
                        {(p.mother_name ?? 'א').trim().charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sand-800 text-sm">
                          {p.mother_name ?? 'אמא'}
                        </p>
                        <p className="text-xs text-sand-600">
                          {[
                            p.child_name ? `אמא של ${p.child_name}` : 'אמא',
                            p.child_dob ? getBabyAge(p.child_dob) : null,
                            p.area,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        {p.community_bio && (
                          <p className="text-xs text-sand-600 mt-1.5 leading-relaxed line-clamp-2">{p.community_bio}</p>
                        )}
                        {memberTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {memberTags.slice(0, 3).map(t => (
                              <span key={t.id} className="text-[13px] text-mustard-700">
                                {t.emoji} {t.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Brenda 17.8.26: no "חיבור" fallback. A mother who
                          did not tick the phone-sharing box should show no
                          contact route at all — routing around her consent
                          through Mimo's own WhatsApp is exactly what she
                          declined. */}
                      {p.community_consent && p.phone_number && (
                        <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <a
                            href={`https://wa.me/${p.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent('היי! מצאתי אותך בקהילת Mimo 🌿')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-2xl text-xs font-semibold hover:bg-green-100 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
        </>))}

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
            avatarEmoji="🤰🏼"
            secondaryLine={secondary}
            whatsappGreeting={`היי ${firstName}! מצאתי אותך בקהילת הריון של Mimo 🤰🏼`}
            fallbackGreeting="היי! אני בהריון ורוצה להתחבר עם בנות בשבוע דומה 🤰🏼"
            onClose={() => setOpenMember(null)}
          />
        )
      })()}

      {cardOpen && <MembershipCard onClose={() => setCardOpen(false)} />}
    </div>
  )
}
