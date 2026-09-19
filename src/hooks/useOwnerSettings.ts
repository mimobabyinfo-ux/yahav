import { useEffect, useState } from 'react'
import { getSettings } from '../lib/settings'

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
    getSettings().then(s => {
      if (s.owner_name) setOwnerName(s.owner_name)
      if (s.owner_whatsapp) setOwnerWhatsapp(s.owner_whatsapp)
      setLoading(false)
    })
  }, [])

  return { ownerName, ownerWhatsapp, loading }
}
