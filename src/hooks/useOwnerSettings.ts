import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type OwnerSettings = {
  ownerName: string
  ownerWhatsapp: string
  loading: boolean
}

const DEFAULTS = {
  ownerName: 'ברנדה',
  ownerWhatsapp: '972527506227',
}

export function useOwnerSettings(): OwnerSettings {
  const [ownerName, setOwnerName] = useState(DEFAULTS.ownerName)
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(DEFAULTS.ownerWhatsapp)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['owner_name', 'owner_whatsapp'])
      .then(({ data }) => {
        if (data) {
          const name = data.find(r => r.setting_key === 'owner_name')?.setting_value
          const wa = data.find(r => r.setting_key === 'owner_whatsapp')?.setting_value
          if (name) setOwnerName(name)
          if (wa) setOwnerWhatsapp(wa)
        }
        setLoading(false)
      })
  }, [])

  return { ownerName, ownerWhatsapp, loading }
}
