import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOpenCustomer } from './CustomerCardContext'
import { normalizeIlPhone } from './customerLookup'

// Phase 5 / A2 Stage 3 (Part 4): global admin search. Sticky at the
// top of the content area. Searches user_profiles + registration_leads
// by name / normalized phone / email; dedupes likely-same-person
// across both tables; tap a result → unified customer card.

type SearchResult = {
  name: string
  phone: string | null
  email: string | null
  normalizedPhone: string | null
  hasUserProfile: boolean
}

export default function GlobalSearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bump on every new keystroke; in-flight queries check this before
  // committing their results so a stale slow response can't overwrite
  // a fresh fast one.
  const queryGenRef = useRef(0)
  const openCustomer = useOpenCustomer()

  useEffect(() => {
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const gen = ++queryGenRef.current
    debounceRef.current = setTimeout(async () => {
      const r = await runSearch(q)
      if (gen !== queryGenRef.current) return
      setResults(r)
      setLoading(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function close() {
    setOpen(false)
    setQuery('')
    setResults([])
  }

  function pick(r: SearchResult) {
    if (!r.phone && !r.email) return
    openCustomer({ phone: r.phone, email: r.email })
    close()
  }

  // Compose the placeholder so it adapts on mobile vs desktop without
  // a media query — short on tight screens, helpful on wide.
  const placeholder = useMemo(
    () => 'חיפוש לפי שם / טלפון / אימייל...',
    [],
  )

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-sand-200" dir="rtl">
      <div className="max-w-3xl mx-auto px-3 lg:px-6 py-2 relative">
        <div className="flex items-center gap-2 rounded-2xl bg-sand-50 border border-sand-200 px-3 focus-within:border-mustard-400 transition-colors">
          <SearchIcon className="w-4 h-4 text-sand-400 flex-shrink-0" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Escape') close() }}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none text-sand-800 placeholder:text-sand-400"
          />
          {query && (
            <button
              type="button"
              onClick={close}
              className="p-1 text-sand-400 hover:text-sand-700 flex-shrink-0"
              aria-label="ניקוי חיפוש"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {open && query.trim() && (
          // Floating results panel. Absolutely positioned so it
          // overlays the content below — no layout shift, no
          // pushing the page down on each keystroke.
          <div className="absolute right-3 left-3 lg:right-6 lg:left-6 mt-1 bg-white rounded-2xl shadow-xl border border-sand-200 max-h-[60vh] overflow-y-auto z-40">
            {loading && (
              <div className="px-4 py-4 text-xs text-sand-400 text-center">מחפשת...</div>
            )}
            {!loading && results.length === 0 && (
              <div className="px-4 py-4 text-xs text-sand-400 text-center">לא נמצאו תוצאות</div>
            )}
            {!loading && results.map((r, i) => (
              <button
                key={`${r.normalizedPhone ?? ''}-${(r.email ?? '').toLowerCase()}-${i}`}
                type="button"
                onClick={() => pick(r)}
                className="w-full text-right px-4 py-3 hover:bg-mustard-50 border-b border-sand-100 last:border-0 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-sand-800 truncate">{r.name}</span>
                  {r.hasUserProfile && (
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                      👩‍💻 משתמשת רשומה
                    </span>
                  )}
                </div>
                <p className="text-xs text-sand-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {r.phone && <span dir="ltr">{r.phone}</span>}
                  {r.email && <span dir="ltr">{r.email}</span>}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// PostgREST .or() string-escaping for ILIKE patterns. Commas separate
// OR clauses and `%` is the wildcard — neither is in normal Hebrew
// names but emails / typed phone fragments need a safety pass for the
// comma case.
function safeForOr(s: string): string {
  return s.replace(/,/g, '')
}

async function runSearch(q: string): Promise<SearchResult[]> {
  const safe = safeForOr(q)
  const lower = safe.toLowerCase()
  const phoneDigits = normalizeIlPhone(q) ?? q.replace(/\D/g, '')

  const userOr: string[] = [
    `mother_name.ilike.%${safe}%`,
    `email.ilike.%${lower}%`,
  ]
  if (phoneDigits) userOr.push(`normalized_phone.like.${phoneDigits}%`)

  const leadOr: string[] = [
    `name.ilike.%${safe}%`,
    `email.ilike.%${lower}%`,
  ]
  if (phoneDigits) leadOr.push(`normalized_phone.like.${phoneDigits}%`)

  const [{ data: profiles }, { data: leads }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, mother_name, phone_number, email, normalized_phone')
      .or(userOr.join(','))
      .limit(15),
    supabase
      .from('registration_leads')
      .select('id, name, phone, email, normalized_phone')
      .or(leadOr.join(','))
      .limit(15),
  ])

  // Dedupe by likely-same-person across the two tables. Two records
  // merge into one bucket when they share normalized_phone OR
  // lowercased email — the same rule customerLookup uses.
  type Bucket = {
    name: string
    phone: string | null
    email: string | null
    normalizedPhone: string | null
    hasUserProfile: boolean
  }
  const buckets: Bucket[] = []

  type ProfileRow = { mother_name: string | null; phone_number: string | null; email: string | null; normalized_phone: string | null }
  type LeadRow = { name: string; phone: string | null; email: string | null; normalized_phone: string | null }

  function merge(rec: { name: string; phone: string | null; email: string | null; normalized_phone: string | null; isProfile: boolean }) {
    const phoneL = rec.normalized_phone ?? ''
    const emailL = rec.email?.toLowerCase().trim() ?? ''
    for (const b of buckets) {
      const bPhone = b.normalizedPhone ?? ''
      const bEmail = b.email?.toLowerCase().trim() ?? ''
      const sharePhone = phoneL && phoneL === bPhone
      const shareEmail = emailL && emailL === bEmail
      if (sharePhone || shareEmail) {
        // Prefer the profile's mother_name as the display name (more
        // reliable than registration_leads.name which may be split).
        if (rec.isProfile && !b.hasUserProfile) {
          b.name = rec.name
          b.hasUserProfile = true
        }
        if (!b.phone) b.phone = rec.phone
        if (!b.email) b.email = rec.email
        if (!b.normalizedPhone) b.normalizedPhone = rec.normalized_phone
        return
      }
    }
    buckets.push({
      name: rec.name,
      phone: rec.phone,
      email: rec.email,
      normalizedPhone: rec.normalized_phone,
      hasUserProfile: rec.isProfile,
    })
  }

  for (const p of (profiles ?? []) as ProfileRow[]) {
    // Skip profiles with no usable identity — they'd just confuse
    // the result list.
    if (!p.mother_name && !p.email) continue
    merge({
      name: p.mother_name ?? p.email ?? 'משתמשת',
      phone: p.phone_number,
      email: p.email,
      normalized_phone: p.normalized_phone,
      isProfile: true,
    })
  }
  for (const l of (leads ?? []) as LeadRow[]) {
    if (!l.name && !l.email && !l.phone) continue
    merge({
      name: l.name,
      phone: l.phone,
      email: l.email,
      normalized_phone: l.normalized_phone,
      isProfile: false,
    })
  }

  return buckets.slice(0, 15)
}
