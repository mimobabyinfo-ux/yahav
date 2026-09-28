import { useEffect, useState } from 'react'
import { UserRound, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { normalizeIlPhone } from './customerLookup'

/** A customer linked to a task. Same keys the customer card looks people up by. */
export type TaskCustomer = { name: string; phone: string | null; email: string | null }

/**
 * Brenda 28.9.26: "לקשר משימה ללקוח, למשל שירלי חייבת 900 ש"ח במזומן".
 * Type a name or part of a phone; searches app accounts (user_profiles) and
 * registrations (registration_leads), one row per person.
 */
export default function CustomerPicker({ value, onChange }: { value: TaskCustomer | null; onChange: (c: TaskCustomer | null) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<TaskCustomer[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setHits([]); return }
    const timer = window.setTimeout(async () => {
      const safe = t.replace(/[,()%*\\]/g, ' ').trim()
      const digits = t.replace(/\D/g, '')
      const parts = (nameCol: string) => [safe ? `${nameCol}.ilike.%${safe}%` : '', digits.length >= 3 ? `normalized_phone.ilike.%${digits.replace(/^972/, '0')}%` : ''].filter(Boolean).join(',')
      if (!parts('x')) { setHits([]); return }
      const [u, l] = await Promise.all([
        supabase.from('user_profiles').select('mother_name, phone_number, normalized_phone, email').or(parts('mother_name')).limit(8),
        supabase.from('registration_leads').select('name, phone, normalized_phone, email').or(parts('name')).order('created_at', { ascending: false }).limit(15),
      ])
      const seen = new Set<string>()
      const out: TaskCustomer[] = []
      const push = (name: string | null, phone: string | null, email: string | null) => {
        const ph = normalizeIlPhone(phone)
        const key = ph || (email ?? '').toLowerCase().trim()
        if (!key || seen.has(key) || !name) return
        seen.add(key)
        out.push({ name: name.trim(), phone: ph, email: email?.trim() || null })
      }
      for (const r of (u.data ?? []) as any[]) push(r.mother_name, r.normalized_phone ?? r.phone_number, r.email)
      for (const r of (l.data ?? []) as any[]) push(r.name, r.normalized_phone ?? r.phone, r.email)
      setHits(out.slice(0, 8))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [q])

  if (value) {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-bold bg-white" style={{ border: '1px solid #E9E2D6', color: '#5E4938' }}>
        <UserRound className="w-3.5 h-3.5" />{value.name}
        <button type="button" onClick={() => onChange(null)} aria-label="ביטול הקישור ללקוחה" className="rounded-full hover:bg-[#F6F3ED] p-0.5"><X className="w-3 h-3" /></button>
      </span>
    )
  }
  return (
    <div className="relative flex-shrink-0" style={{ width: 170 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="לקוחה (לא חובה)"
        aria-label="קישור ללקוחה"
        className="w-full rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
        style={{ border: '1px solid #E9E2D6', color: '#443327' }}
      />
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 bg-white rounded-xl shadow-lg overflow-hidden" style={{ border: '1px solid #E9E2D6', right: 0 }}>
          {hits.map(h => (
            <button type="button" key={(h.phone ?? '') + (h.email ?? '')}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(h); setQ(''); setOpen(false) }}
              className="w-full text-right px-3 py-2 hover:bg-[#FAF7F1] flex justify-between gap-2 text-sm">
              <span className="font-bold truncate" style={{ color: '#443327' }}>{h.name}</span>
              <span dir="ltr" className="flex-shrink-0" style={{ color: '#A2937D', fontSize: 12 }}>{h.phone ?? h.email}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && hits.length === 0 && (
        <div className="absolute z-20 mt-1 w-56 bg-white rounded-xl shadow px-3 py-2 text-xs" style={{ border: '1px solid #E9E2D6', color: '#A2937D', right: 0 }}>לא נמצאה לקוחה</div>
      )}
    </div>
  )
}
