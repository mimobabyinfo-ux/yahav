import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { neighborhoodsFor } from '../../data/neighborhoods'

// Neighbourhood field, shared by onboarding and the community profile.
//
// Brenda 17.8.26: "there is a neighbourhood option but it doesn't let you
// choose — free text, room for typos and far too many variants". So this
// is a native <select> (the control a phone renders as a proper picker
// wheel), fed by two sources merged and de-duplicated:
//   · the curated list for her city, from data/neighborhoods.ts
//   · whatever other mothers in that city already chose, via
//     get_neighborhood_suggestions
// "אחר" stays as the last option and reveals a text box, so a mother from
// a city we have not curated is never stuck. Anything she types that way
// becomes a suggestion for the next mother from her city.

const OTHER = '__other__'

type Props = {
  city: string | null
  value: string
  onChange: (next: string) => void
  /** Field label; the city name is appended by the caller's copy. */
  label?: string
  className?: string
}

export default function NeighborhoodPicker({ city, value, onChange, label, className = '' }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [freeText, setFreeText] = useState(false)

  useEffect(() => {
    if (!city) { setSuggestions([]); return }
    let cancelled = false
    supabase.rpc('get_neighborhood_suggestions', { p_area: city }).then(({ data }) => {
      if (cancelled) return
      setSuggestions(((data ?? []) as { neighborhood: string }[]).map(r => r.neighborhood))
    })
    return () => { cancelled = true }
  }, [city])

  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of [...neighborhoodsFor(city), ...suggestions]) {
      const clean = n?.trim()
      if (!clean || seen.has(clean)) continue
      seen.add(clean)
      out.push(clean)
    }
    return out.sort((a, b) => a.localeCompare(b, 'he'))
  }, [city, suggestions])

  // A value saved before this field became a list (or typed via "אחר")
  // must still show as selected rather than silently reset to nothing.
  const known = value.trim() !== '' && options.includes(value.trim())
  const showFreeText = freeText || (value.trim() !== '' && !known) || options.length === 0

  const selectCls =
    'mimo-select w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm appearance-none'

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-sand-600 mb-1.5">{label}</label>
      )}

      {options.length > 0 && (
        <select
          value={showFreeText ? OTHER : (known ? value.trim() : '')}
          onChange={e => {
            if (e.target.value === OTHER) { setFreeText(true); onChange('') }
            else { setFreeText(false); onChange(e.target.value) }
          }}
          className={selectCls}
        >
          <option value="">בחרי שכונה…</option>
          {options.map(n => <option key={n} value={n}>{n}</option>)}
          <option value={OTHER}>אחר…</option>
        </select>
      )}

      {showFreeText && (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="שם השכונה"
          autoComplete="off"
          className={`w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm ${options.length > 0 ? 'mt-2' : ''}`}
        />
      )}
    </div>
  )
}
