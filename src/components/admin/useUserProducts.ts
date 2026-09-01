import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Which products each mother owns — the missing half of the משתמשות list.
 *
 * Brenda 1.9.26: "אולי להוסיף גם סינונים בתוך המשתמשות של איזה קורס הם -
 * למשל עטופים מגלים או קורס דיגיטלי או קורס עיסוי תינוקות". The list could
 * only be sliced by user_mode (הריון / אמא) and by where the account came
 * from, which says nothing about what she bought.
 *
 * Source of truth is purchased_workshops: the row that grants her access.
 * A registration that was never paid is not ownership and does not appear
 * here — that lives in the customer card, next to the payment status.
 */

export type ProductFacet = { id: string; title: string; buyers: number }

export type UserProducts = {
  loading: boolean
  /** user_id → the workshop ids she owns. */
  byUser: Map<string, string[]>
  /** Every product anyone owns, biggest first — the filter chips. */
  products: ProductFacet[]
  titleById: Map<string, string>
  reload: () => void
}

export function useUserProducts(): UserProducts {
  const [loading, setLoading] = useState(true)
  const [byUser, setByUser] = useState<Map<string, string[]>>(new Map())
  const [products, setProducts] = useState<ProductFacet[]>([])
  const [titleById, setTitleById] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: owned }, { data: ws }] = await Promise.all([
      supabase.from('purchased_workshops').select('user_id, workshop_id'),
      supabase.from('workshops').select('id, title').order('display_order'),
    ])
    const titles = new Map<string, string>(
      ((ws ?? []) as { id: string; title: string }[]).map(w => [w.id, w.title]),
    )
    const owners = new Map<string, Set<string>>()   // workshop → users
    const mine = new Map<string, string[]>()
    for (const r of (owned ?? []) as { user_id: string; workshop_id: string }[]) {
      const list = mine.get(r.user_id) ?? []
      if (!list.includes(r.workshop_id)) list.push(r.workshop_id)
      mine.set(r.user_id, list)
      const set = owners.get(r.workshop_id) ?? new Set<string>()
      set.add(r.user_id)
      owners.set(r.workshop_id, set)
    }
    setByUser(mine)
    setTitleById(titles)
    setProducts(
      [...owners.entries()]
        .map(([id, set]) => ({ id, title: titles.get(id) ?? 'מוצר', buyers: set.size }))
        .sort((a, b) => b.buyers - a.buyers),
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { loading, byUser, products, titleById, reload: load }
}

/** "ליווי התפתחותי - סדנת עטופים" → "עטופים". The filter chips and the
 *  row badges have no room for the full catalogue name, and Brenda calls
 *  them by the short name anyway. */
export function shortProductName(title: string): string {
  const t = title.trim()
  if (t.includes('עטופים')) return 'עטופים'
  if (t.includes('מגלים')) return 'מגלים'
  if (t.includes('הקורס הדיגיטלי')) return 'קורס דיגיטלי'
  // "ליווי התפתחותי - סדנת X" → the part after the dash, when there is one.
  const dash = t.split(' - ')
  return (dash.length > 1 ? dash[dash.length - 1] : t).replace(/^סדנת /, '')
}
