import { useState } from 'react'
import { LANG, setLang, type Lang } from '../i18n'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// עברית | Español. Two places use it: the login screen (compact, before
// she has an account) and Settings (full width, like the night-mode
// selector). The labels are each language's own name, never translated,
// so a mother who landed in the wrong language can always find hers.
//
// Picking saves on the device, on her profile when she is signed in (so
// it follows her to another phone), and reloads into the new language.

const OPTIONS: { id: Lang; label: string }[] = [
  { id: 'he', label: 'עברית' },
  { id: 'es', label: 'Español' },
]

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)

  async function pick(lang: Lang) {
    if (lang === LANG || busy) return
    setBusy(true)
    if (user) {
      const { error } = await supabase.from('user_profiles').update({ language: lang }).eq('id', user.id)
      if (error) console.error('[language]', error)
    }
    setLang(lang)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[13px] font-semibold" role="group" aria-label="Language / שפה">
        {OPTIONS.map((o, i) => (
          <span key={o.id} className="flex items-center gap-1">
            {i > 0 && <span style={{ color: '#C9BFAE' }}>|</span>}
            <button
              type="button"
              onClick={() => pick(o.id)}
              lang={o.id}
              aria-pressed={LANG === o.id}
              className="px-1.5 py-0.5 rounded-lg transition-all"
              style={LANG === o.id ? { color: '#4A3A28', background: '#F6ECD8' } : { color: '#9A8F78' }}
            >
              {o.label}
            </button>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex bg-white rounded-2xl p-1 gap-1 border border-[#F0EAE0]">
      {OPTIONS.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => pick(o.id)}
          lang={o.id}
          aria-pressed={LANG === o.id}
          disabled={busy}
          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${LANG === o.id ? 'shadow-sm' : 'text-sand-500'}`}
          style={LANG === o.id ? { background: '#E7C78A', color: '#4A3A28' } : {}}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
