import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, UserProfile, Child, Family } from '../lib/supabase'

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
  joinFamily: (code: string) => Promise<boolean>
  createFamilyInvite: (childId: string) => Promise<string | null>
  redeemFamilyInvite: (token: string) => Promise<boolean>
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

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!data) {
      // Anonymous/guest user: create minimal profile from sessionStorage
      const guestFamilyId = sessionStorage.getItem('guestFamilyId')
      if (guestFamilyId) {
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
        setProfile(newProfile ?? null)
        if (newProfile?.family_id) fetchFamily(newProfile.family_id)
        return newProfile
      }
    }

    setProfile(data ?? null)
    if (data?.family_id) {
      fetchFamily(data.family_id)
    }
    return data
  }

  async function fetchFamily(familyId: string) {
    const { data: fam } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .maybeSingle()
    setFamily(fam ?? null)
    const { data: members } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('family_id', familyId)
    setFamilyMembers(members ?? [])
  }

  async function fetchChildren(userId: string, profileData?: UserProfile | null) {
    // Fetch children for user + all family members if linked
    const prof = profileData ?? profile
    let userIds = [userId]
    if (prof?.family_id) {
      const { data: members } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('family_id', prof.family_id)
      if (members && members.length > 0) {
        userIds = members.map(m => m.id)
      }
    }
    const { data } = await supabase
      .from('children')
      .select('*')
      .in('user_id', userIds)
      .order('created_at')
    let list = data ?? []

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

    setChildren(list)
    const guestChildId = sessionStorage.getItem('guestChildId')
    const preferred = guestChildId ? list.find(c => c.id === guestChildId) : null
    if (!selectedChild) {
      setSelectedChild(preferred ?? list[0] ?? null)
    }
  }

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
    return fam.invite_code
  }

  async function createFamilyInvite(childId: string): Promise<string | null> {
    if (!user || !profile?.family_id) return null
    const token = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from('family_invite_tokens').insert({
      family_id: profile.family_id,
      child_id: childId,
      token,
      created_by: user.id,
    })
    if (error) return null
    return token
  }

  async function redeemFamilyInvite(token: string): Promise<boolean> {
    // Look up the token (anon RLS allows this)
    const { data: invite } = await supabase
      .from('family_invite_tokens')
      .select('*')
      .eq('token', token.toUpperCase())
      .gt('expires_at', new Date().toISOString())
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

    // Upsert profile immediately with a unique email to avoid conflicts
    await supabase.from('user_profiles').upsert({
      id: authData.user.id,
      email: `guest-${authData.user.id.slice(0, 12)}@mimo.internal`,
      family_id: invite.family_id,
      is_pro: false,
      is_admin: false,
      lead_status: 'new_lead',
    }, { onConflict: 'id' })

    // Force refresh so App.tsx sees the profile without waiting for onAuthStateChange
    const prof = await fetchProfile(authData.user.id)
    await fetchChildren(authData.user.id, prof as UserProfile | null)

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

  async function joinFamily(code: string): Promise<boolean> {
    if (!user) return false
    const { data: fam } = await supabase
      .from('families')
      .select('*')
      .eq('invite_code', code.toUpperCase())
      .maybeSingle()
    if (!fam) return false
    await supabase.from('user_profiles').update({ family_id: fam.id }).eq('id', user.id)
    setFamily(fam)
    setProfile(prev => prev ? { ...prev, family_id: fam.id } : prev)
    await fetchFamily(fam.id)
    await fetchChildren(user.id)
    return true
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  async function refreshChildren() {
    if (user) await fetchChildren(user.id)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).then(prof => {
          fetchChildren(session.user.id, prof as UserProfile | null)
        }).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setChildren([])
        setSelectedChild(null)
        setLoading(false)
      }
    })

    const timeout = setTimeout(() => setLoading(false), 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
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
      family, familyMembers, createFamily, joinFamily,
      createFamilyInvite, redeemFamilyInvite,
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
