import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Store categories are admin-managed rows in content_categories
// (category_type 'workshop'). The NAME is the value stored in
// workshops.workshop_type, so renames/deletes must cascade to the
// products (CategoryManagerModal handles that).

export type WorkshopCategory = {
  id: string
  name: string
  /** Stable identifier — survives renames. 'store-products' = physical
   *  store products (no cohorts / digital content). */
  slug: string
  icon: string | null
  display_order: number
  is_active: boolean
}

export function categoryLabel(c: WorkshopCategory): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

export function useWorkshopCategories() {
  const [categories, setCategories] = useState<WorkshopCategory[]>([])

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('content_categories')
      .select('id, name, slug, icon, display_order, is_active')
      .in('category_type', ['workshop', 'both'])
      .eq('is_active', true)
      .order('display_order')
    setCategories((data ?? []) as WorkshopCategory[])
  }, [])

  useEffect(() => { reload() }, [reload])

  return { categories, reload }
}
