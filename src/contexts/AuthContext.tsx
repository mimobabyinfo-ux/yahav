import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, UserProfile, Child, Family, PurchasedWorkshop } from '../lib/supabase'
import type { ShareRole } from '../constants/shareRoles'
import { clearQueryCache } from '../lib/queryCache'

type AuthContextType = {
  user: User | null
  profile: UserProfile | null
  children: Child[]
  selectedChild: Child | null
  setSelectedChild: (child: Child) => void
  loading: boolean
  isGuest: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshChildren: () => Promise<void>
  family: Family | null
  familyMembers: UserProfile[]
  createFamily: (name: string) => Promise<string | null>
  // Phase 4 / C1: role + recipient_name flow through to the invite row so
  // the guest's profile can be greeted by name. familyId stays optional
  // — falls back to the caller's own family_id.
  createFamilyInvite: (
    childId: string,
    opts?: { role?: ShareRole; recipientName?: string; familyId?: string },
  ) => Promise<string | null>
  redeemFamilyInvite: (token: string) => Promise<boolean>
  hasActiveWorkshopAccess: boolean
  activeAccessUntil: string | null
  purchasedWorkshops: PurchasedWorkshop[]
  refreshPurchasedWorkshops: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children: reactChildren }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [loading, setLoading] = useState(true)
  const [family, setFamily] = useState<Family | null>(null)
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([])
  const [purchasedWorkshops, setPurchasedWorkshops] = useState<PurchasedWorkshop[]>([])

  // ── Boot: one round trip ──────────────────────────────────────────────
  //
  // יהב 19.9.26: "לפעמים לוקח זמן לדפים להיטען". Measured: this context used
  // to open the app with SIX requests in a chain (profile → family →
  // members → members again → children → purchases), each waiting for the
  // one before, at ~500ms per round trip from Israel to the ap-northeast-1
  // database. And auth-js fires onAuthStateChange twice on every open
  // (INITIAL_SESSION, then SIGNED_IN) and again each time the tab comes
  // back from the background — so the chain ran twice per open and once
  // more per return. get_my_bootstrap returns the same rows, under the same
  // RLS, in one call; loadedFor makes sure it runs once per signed-in user.
  const loadedFor = useRef<string | null>(null)
  const loadedAt = useRef(0)

  type Bootstrap = {
    profile: UserProfile | null
    family: Family | null
    members: UserProfile[]
    children: Child[]
    purchased_workshops: PurchasedWorkshop[]
  }

  async function fetchBootstrap(): Promise<Bootstrap | null> {
    const { data, error } = await supabase.rpc('get_my_bootstrap')
    if (error || !data) {
      if (error) console.error('[auth] bootstrap', error.message)
      return null
    }
    const b = data as Partial<Bootstrap>
    return {
      profile: b.profile ?? null,
      family: b.family ?? null,
      members: b.members ?? [],
      children: b.children ?? [],
      purchased_workshops: b.purchased_workshops ?? [],
    }
  }

  async function ensureGuestProfile(userId: string): Promise<boolean> {
    // Anonymous/guest user: create minimal profile from sessionStorage
    const guestFamilyId = sessionStorage.getItem('guestFamilyId')
    if (!guestFamilyId) return false
    const { data: newProfile } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email: `guest-${userId.slice(0, 12)}@mimo.internal`,
        family_id: guestFamilyId,
        is_pro: false,
        is_admin: false,
        lead_status: 'new_lead',
      }, { onConflict: 'id' })
      .select()
      .maybeSingle()
    return !!newProfile
  }

  function applyBootstrap(b: Bootstrap, list: Child[]) {
    setProfile(b.profile)
    setFamily(b.family)
    setFamilyMembers(b.members)
    setPurchasedWorkshops(b.purchased_workshops)
    setChildren(list)
    const guestChildId = sessionStorage.getItem('guestChildId')
    const preferred = guestChildId ? list.find(c => c.id === guestChildId) : null
    // The functional form matters. This runs from onAuthStateChange, which
    // is registered once and therefore closes over the FIRST render's
    // selectedChild — always null. Reading the state variable here meant
    // the guard was always true, so every hourly token refresh silently
    // reset a mother of twins back to her first baby, and everything she
    // logged afterwards went to the wrong child. Reading the live value
    // inside the updater keeps a deliberate choice.
    setSelectedChild(cur => {
      if (cur && list.some(c => c.id === cur.id)) return cur
      return preferred ?? list[0] ?? null
    })
  }

  async function loadBootstrap(userId: string): Promise<UserProfile | null> {
    let b = await fetchBootstrap()
    if (b && !b.profile && await ensureGuestProfile(userId)) b = await fetchBootstrap()
    if (!b) return null
    let list = b.children
    // Guests: if family RLS blocked the lookup, fetch the invited child directly
    if (list.length === 0) {
      const guestChildId = sessionStorage.getItem('guestChildId')
      if (guestChildId) {
        const { data: directChild } = await supabase
          .from('children')
          .select('*')
          .eq('id', guestChildId)
          .maybeSingle()
        if (directChild) list = [directChild]
      }
    }
    applyBootstrap(b, list)
    loadedFor.current = userId
    loadedAt.current = Date.now()
    return b.profile
  }

  async function refreshPurchasedWorkshops() {
    if (user) await loadBootstrap(user.id)
  }

  const today = new Date().toISOString().split('T')[0]
  const activeAccess = purchasedWorkshops.find(
    pw => pw.access_start_date && pw.access_end_date &&
          pw.access_start_date <= today && pw.access_end_date >= today
  )
  const hasActiveWorkshopAccess = !!activeAccess
  const activeAccessUntil = activeAccess?.access_end_date ?? null

  async function createFamily(name: string): Promise<string | null> {
    if (!user) return null
    const { data: fam, error } = await supabase
      .from('families')
      .insert({ created_by: user.id, family_name: name })
      .select()
      .single()
    if (error || !fam) return null
    await supabase.from('user_profiles').update({ family_id: fam.id }).eq('id', user.id)
    setFamily(fam)
    setFamilyMembers([profile!])
    setProfile(prev => prev ? { ...prev, family_id: fam.id } : prev)
    return fam.id
  }

  async function createFamilyInvite(
    childId: string,
    opts?: { role?: ShareRole; recipientName?: string; familyId?: string },
  ): Promise<string | null> {
    const fid = opts?.familyId ?? profile?.family_id
    if (!user || !fid) return null
    const token = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from('family_invite_tokens').insert({
      family_id: fid,
      child_id: childId,
      token,
      created_by: user.id,
      role: opts?.role ?? null,
      recipient_name: opts?.recipientName?.trim() || null,
    })
    if (error) return null
    return token
  }

  async function redeemFamilyInvite(token: string): Promise<boolean> {
    // Never trade a real account for a guest one. App gates the guest
    // route on `!user`, but that is a render-time check against state that
    // can still be loading — and AuthContext gives up waiting after five
    // seconds, so on a slow cold start a signed-in mother could reach
    // here. Signing in anonymously at that point would replace her own
    // session with a read-only guest view of someone else's journal.
    const { data: existing } = await supabase.auth.getSession()
    if (existing.session?.user?.email) return false

    // Look up the token (anon RLS allows this). Phase 4 / C1: also
    // filter out revoked invites — mom can kill access from the
    // management page by stamping revoked_at.
    const { data: invite } = await supabase
      .from('family_invite_tokens')
      .select('*')
      .eq('token', token.toUpperCase())
      .gt('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .maybeSingle()
    if (!invite) return false

    // Store family info BEFORE sign-in so fetchProfile can use it immediately
    sessionStorage.setItem('guestFamilyId', invite.family_id)
    if (invite.child_id) sessionStorage.setItem('guestChildId', invite.child_id)

    // Sign in anonymously (Supabase: Auth → Providers → Anonymous must be ON)
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError || !authData.user) {
      sessionStorage.removeItem('guestFamilyId')
      sessionStorage.removeItem('guestChildId')
      return false
    }

    // Upsert profile immediately with a unique email to avoid conflicts.
    // Phase 4 / C1: mirror role + recipient_name onto the guest profile
    // so the journal greeting doesn't need to re-query the invite row.
    await supabase.from('user_profiles').upsert({
      id: authData.user.id,
      email: `guest-${authData.user.id.slice(0, 12)}@mimo.internal`,
      family_id: invite.family_id,
      is_pro: false,
      is_admin: false,
      lead_status: 'new_lead',
      family_role: invite.role ?? null,
      family_display_name: invite.recipient_name ?? null,
    }, { onConflict: 'id' })

    // Stamp last_accessed_at on the invite so the management page can
    // show "נכנס לאחרונה: …". Fire-and-forget — failure here shouldn't
    // block the redeem flow.
    supabase
      .from('family_invite_tokens')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', invite.id)
      .then(() => {})

    // Force refresh so App.tsx sees the profile without waiting for onAuthStateChange
    setUser(authData.user)
    await loadBootstrap(authData.user.id)

    // Directly set the invited child — don't rely on the if(!selectedChild) guard
    // which can silently no-op due to async race conditions
    if (invite.child_id) {
      const { data: theChild } = await supabase
        .from('children')
        .select('*')
        .eq('id', invite.child_id)
        .maybeSingle()
      if (theChild) setSelectedChild(theChild)
    }

    return true
  }

  // All three refreshers are the same one-call reload: the rows travel
  // together anyway, and one round trip is cheaper than three.
  async function refreshProfile() {
    if (user) await loadBootstrap(user.id)
  }

  async function refreshChildren() {
    if (user) await loadBootstrap(user.id)
  }

  /**
   * A mother who pays for a community event can land on the thank-you page
   * with no session (Morning opens checkout in a new tab; some phones make
   * it a private one). `mark_event_paid` then answers 'unauthorized', so
   * ThankYouPage parks the id under `mimo_paid_event_id` and we flush it
   * the moment she is signed in.
   *
   * BUG FIXED 17.8.26 (Brenda: "there's a bug with the credit, we never
   * paid and it already said you have a credit"). This used to read
   * `mimo_pending_event_id` — the key written the instant she TAPS
   * register, before any payment. A mother who opened the payment page
   * and closed it left that key behind, and the next app load marked her
   * paid, gave her a seat she never bought, and on cancellation minted a
   * real credit out of nothing. Intent is not payment: only the payment
   * provider's success redirect (the thank-you page) may promote the id
   * to `mimo_paid_event_id`, and only that key is retried here.
   */
  async function flushPendingEventPayment() {
    let eventId: string | null = null
    try {
      const stored = localStorage.getItem('mimo_paid_event_id')
      if (stored && /^[0-9a-f-]{36}$/.test(stored)) eventId = stored
    } catch { return /* private mode */ }
    if (!eventId) return
    const { data, error } = await supabase.rpc('mark_event_paid', { p_event_id: eventId })
    if (error || data === 'unauthorized') {
      console.error('[auth] pending event payment still unconfirmed:', error ?? data)
      return
    }
    try { localStorage.removeItem('mimo_paid_event_id') } catch { /* ignore */ }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null
      if (!next) {
        loadedFor.current = null
        clearQueryCache()
        setUser(null)
        setProfile(null)
        setChildren([])
        setSelectedChild(null)
        setPurchasedWorkshops([])
        setLoading(false)
        return
      }
      // Same person, same rows. INITIAL_SESSION + SIGNED_IN on every open,
      // SIGNED_IN on every return from the background, TOKEN_REFRESHED
      // every hour: none of these changes who she is. Keep the user object
      // stable too, so hooks keyed on `user` do not refetch either.
      // USER_UPDATED (ConsentGate stamping terms_accepted_at) does carry new
      // metadata, so that one replaces the object without reloading rows.
      setUser(prev => (prev && prev.id === next.id && event !== 'USER_UPDATED') ? prev : next)
      if (loadedFor.current === next.id) return
      if (loadedFor.current) clearQueryCache() // another account in the same tab
      loadedFor.current = next.id
      loadBootstrap(next.id).finally(() => setLoading(false))
      flushPendingEventPayment()
    })

    // A purchase confirmed by the Morning webhook while the app sat in the
    // background used to show up because the SIGNED_IN storm refetched
    // everything. Keep that one benefit, cheaply: on return, if the rows
    // are older than ten minutes, reload them once in the background.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const uid = loadedFor.current
      if (!uid || Date.now() - loadedAt.current < 10 * 60_000) return
      loadBootstrap(uid)
    }
    document.addEventListener('visibilitychange', onVisible)

    const timeout = setTimeout(() => setLoading(false), 5000)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await supabase.auth.signOut()
    loadedFor.current = null
    clearQueryCache()
    setUser(null)
    setProfile(null)
    setChildren([])
    setSelectedChild(null)
    setFamily(null)
    setFamilyMembers([])
  }

  // Anonymous Supabase users have no email — treat them as guests
  const isGuest = !!(user && !user.email)

  return (
    <AuthContext.Provider value={{
      user, profile, children, selectedChild, setSelectedChild,
      loading, isGuest, signOut, refreshProfile, refreshChildren,
      family, familyMembers, createFamily,
      createFamilyInvite, redeemFamilyInvite,
      hasActiveWorkshopAccess, activeAccessUntil,
      purchasedWorkshops, refreshPurchasedWorkshops,
    }}>
      {reactChildren}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
