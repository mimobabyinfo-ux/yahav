import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function parseEntryDateTime(entry_date: string, entry_time: string): Date | null {
  const t = entry_time.length === 5 ? `${entry_time}:00` : entry_time
  const dt = new Date(`${entry_date}T${t}`)
  return isNaN(dt.getTime()) ? null : dt
}

// Returns the timestamp of the most recent entry of the given type for the
// selected child (or the current user, if no child is selected). Refetches
// when refetchKey changes — typically bumped by the parent after a save —
// and triggers a re-render every 60s so consumers using formatTimeSince()
// see the elapsed text update without manually wiring an interval.
export function useLastEntry(entryType: string, refetchKey: number = 0): Date | null {
  const { user, selectedChild } = useAuth()
  const [last, setLast] = useState<Date | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      if (!user) return
      let q = supabase
        .from('daily_log_entries')
        .select('entry_date, entry_time')
        .eq('entry_type', entryType)
        .order('entry_date', { ascending: false })
        .order('entry_time', { ascending: false })
        .limit(1)
      if (selectedChild) q = q.eq('child_id', selectedChild.id)
      else q = q.eq('user_id', user.id)
      const { data } = await q
      if (cancelled) return
      const row = data?.[0]
      setLast(row?.entry_date && row?.entry_time ? parseEntryDateTime(row.entry_date, row.entry_time) : null)
    }
    load()
    return () => { cancelled = true }
  }, [user, selectedChild, entryType, refetchKey])

  return last
}
