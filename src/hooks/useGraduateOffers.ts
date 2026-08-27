// Brenda 27.8.26: a mother who finishes עטופים is handed the משפחת מימו
// 10% link for מגלים on the last day of the workshop, good for one week.
//
// The grant is minted server side (grant_graduate_offers, nightly). This
// hook is only the reading end: which offers is SHE holding right now.
// get_my_graduate_offers already filters out anything expired, spent or
// switched off, so whatever comes back is claimable as it stands.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type GraduateOffer = {
  grant_id: string
  offer_id: string
  token: string
  workshop_id: string
  workshop_title: string
  list_price: number | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  expires_at: string
  source_workshop_title: string | null
  granted_at: string
  seen_at: string | null
}

/** What she actually pays. Mirrors computeOfferPrice on the public
 *  registration page, so the number in the store is the number she meets
 *  at checkout. */
export function graduateOfferPrice(o: GraduateOffer): number | null {
  if (o.discount_type === 'fixed') return Number(o.discount_value)
  if (o.list_price == null) return null
  return Math.round(Number(o.list_price) * (1 - Number(o.discount_value) / 100))
}

/** Her personal link. The token is the credential and it is hers alone —
 *  max_uses is 1 on every granted clone. */
export function graduateOfferLink(o: GraduateOffer): string {
  return `${window.location.origin}/?offer=${o.token}`
}

/** Whole days left in her window, rounded up, so the last day reads "יום
 *  אחרון" and not "0 ימים". */
export function graduateOfferDaysLeft(o: GraduateOffer): number {
  const ms = new Date(o.expires_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

export function graduateOfferDeadline(o: GraduateOffer): string {
  const d = new Date(o.expires_at)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function useGraduateOffers() {
  const { user } = useAuth()
  const [offers, setOffers] = useState<GraduateOffer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!user) { setOffers([]); setLoading(false); return }
    supabase.rpc('get_my_graduate_offers').then(({ data }) => {
      setOffers((data ?? []) as GraduateOffer[])
      setLoading(false)
    })
  }, [user])

  useEffect(() => { load() }, [load])

  /** Marks the news as delivered so the home screen stops announcing it.
   *  The offer itself is untouched — she keeps it for the full week. */
  const markSeen = useCallback(async (grantId: string) => {
    setOffers(prev => prev.map(o =>
      o.grant_id === grantId ? { ...o, seen_at: new Date().toISOString() } : o))
    await supabase.rpc('mark_graduate_offer_seen', { p_grant_id: grantId })
  }, [])

  const byWorkshop = new Map(offers.map(o => [o.workshop_id, o]))

  return { offers, byWorkshop, loading, markSeen, reload: load }
}
