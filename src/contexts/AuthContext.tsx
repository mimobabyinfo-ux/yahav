import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, UserProfile, Child } from '../lib/supabase'

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children: reactChildren }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data ?? null)
  }

  async function fetchChildren(userId: string) {
    const { data } = await supabase
      .from('children')
      .select('*')
      .eq('user_id', userId)
      .order('created_at')
    const list = data ?? []
    setChildren(list)
    if (list.length > 0 && !selectedChild) {
      setSelectedChild(list[0])
    }
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
        Promise.all([
          fetchProfile(session.user.id),
          fetchChildren(session.user.id),
        ]).finally(() => setLoading(false))
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
  }

  return (
    <AuthContext.Provider value={{
      user, profile, children, selectedChild, setSelectedChild,
      loading, signOut, refreshProfile, refreshChildren,
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
