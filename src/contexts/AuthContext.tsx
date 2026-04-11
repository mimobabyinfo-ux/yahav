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
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshChildren: () => Promise<void>
  family: Family | null
  familyMembers: UserProfile[]
  createFamily: (name: string) => Promise<string | null>
  joinFamily: (code: string) => Promise<boolean>
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
    const list = data ?? []
    setChildren(list)
    if (list.length > 0 && !selectedChild) {
      setSelectedChild(list[0])
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

  return (
    <AuthContext.Provider value={{
      user, profile, children, selectedChild, setSelectedChild,
      loading, signOut, refreshProfile, refreshChildren,
      family, familyMembers, createFamily, joinFamily,
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
