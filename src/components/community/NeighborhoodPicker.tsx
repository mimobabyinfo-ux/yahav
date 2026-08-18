import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { neighborhoodsFor } from '../../data/neighborhoods'
import { foldHebrew } from '../../utils/citySearch'

// Neighbourhood field, shared by onboarding and the community profile.
//
// Brenda 17.8.26: "there is a neighbourhood option but it doesn't let you
// choose — free text, room for typos and far too many variants". So it
// became a list, fed by two sources merged and de-duplicated:
//   · the curated list for her city, from data/neighborhoods.ts
//   · whatever other mothers in that city already chose, via
//     get_neighborhood_suggestions
//
// Brenda 18.8.26: "in the neighbourhood part there should be an option to
// search a neighbourhood too." A native <select> is fine for eight
// options and hostile at forty — תל אביב alone has more than thirty, and
// a picker wheel gives you no way to reach נחלת יצחק except spinning past
// everything before it. So it is now the same control as the city box
// above it: type to filter, tap to choose. Anything she types that is not
// on the list is simply kept as-is, which is what "אחר" used to be — one
// fewer step, and it still becomes a suggestion for the next mother from
// her city.

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
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!city) { setSuggestions([]); return }
    let cancelled = false
    supabase.rpc('get_neighborhood_suggestions', { p_area: city }).then(({ data }) => {
      if (cancelled) return
      setSuggestions(((data ?? []) as { neighborhood: string }[]).map(r => r.neighborhood))
    })
    return () => { cancelled = true }
  }, [city])

  useEffect(() => () => { if (blurTimer.current) window.clearTimeout(blurTimer.current) }, [])

  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const n of [...neighborhoodsFor(city), ...suggestions]) {
      const clean = n?.trim()
      if (!clean) continue
      const key = foldHebrew(clean)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(clean)
    }
    return out.sort((a, b) => a.localeCompare(b, 'he'))
  }, [city, suggestions])

  // Same ranking idea as the city box: an exact hit collapses the list,
  // then names starting with what she typed, then names containing it.
  // Spelling folded, so "נוה שרת" finds "נווה שרת".
  const matches = useMemo(() => {
    const q = foldHebrew(value)
    if (!q) return options
    const starts: string[] = []
    const contains: string[] = []
    for (const n of options) {
      const f = foldHebrew(n)
      if (f === q) return [n]
      if (f.startsWith(q) || f.split(' ').some(w => w.startsWith(q))) starts.push(n)
      else if (f.includes(q)) contains.push(n)
    }
    return [...starts, ...contains]
  }, [options, value])

  const inputCls =
    'w-full px-4 py-3.5 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-400 bg-white text-sand-800 text-sm'

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-sand-600 mb-1.5">{label}</label>
      )}

      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // The old <select> could not store a variant spelling; a search
          // box can, and then נוה שרת and נווה שרת are two neighbourhoods
          // as far as the suggestions list is concerned. So on the way
          // out, if what she typed IS a listed neighbourhood spelled
          // another way, store the listed spelling.
          //
          // And if she typed the beginning of exactly one neighbourhood
          // and walked away — the dropdown sits over the save button on
          // a phone with the keyboard up — "נחל" becomes נחלת יצחק
          // rather than being saved as the fragment it is.
          const q = foldHebrew(value)
          const hit =
            options.find(o => foldHebrew(o) === q) ??
            (q && matches.length === 1 && foldHebrew(matches[0]).startsWith(q) ? matches[0] : undefined)
          if (hit && hit !== value) onChange(hit)
          blurTimer.current = window.setTimeout(() => setOpen(false), 150)
        }}
        placeholder={options.length ? 'חיפוש שכונה…' : 'שם השכונה'}
        autoComplete="off"
        className={inputCls}
      />

      {open && matches.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 bg-white border-2 border-mustard-200 rounded-2xl shadow-xl mt-1 max-h-48 overflow-y-auto">
          {matches.map(n => (
            <button
              key={n}
              type="button"
              onMouseDown={() => { onChange(n); setOpen(false) }}
              className="w-full text-right px-4 py-2.5 text-sm hover:bg-mustard-50 text-sand-800 border-b border-sand-50 last:border-0 transition-colors"
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {/* No "לא נמצאו תוצאות" here on purpose: an unlisted neighbourhood
          is a perfectly good answer, and the text she has already typed
          IS that answer. "Not found" would read as a rejection of it. */}
    </div>
  )
}
