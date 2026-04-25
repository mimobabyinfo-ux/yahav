import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getBabyAge, entryTypeEmoji, entryTypeLabel } from '../utils/dateUtils'
import MimoLogo from '../components/MimoLogo'

type BabyInfo = {
  id: string
  name: string
  dob: string | null
  gender: 'boy' | 'girl' | 'other' | null
}

type LogEntry = {
  id: string
  entry_date: string
  entry_time: string
  entry_type: string
  notes: string | null
}

type Props = {
  token: string
}

export default function PublicBabyPage({ token }: Props) {
  const [baby, setBaby] = useState<BabyInfo | null>(null)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      // Fetch child by share_token
      const { data: child } = await supabase
        .from('children')
        .select('id, name, dob, gender')
        .eq('share_token', token)
        .maybeSingle()

      if (!child) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setBaby(child)

      // Fetch today's entries
      const today = new Date().toISOString().split('T')[0]
      const { data: todayEntries } = await supabase
        .from('daily_log_entries')
        .select('id, entry_date, entry_time, entry_type, notes')
        .eq('child_id', child.id)
        .eq('entry_date', today)
        .order('entry_time', { ascending: false })

      // Fetch last 3 days entries if today is empty
      if (!todayEntries || todayEntries.length === 0) {
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
        const from = threeDaysAgo.toISOString().split('T')[0]
        const { data: recentEntries } = await supabase
          .from('daily_log_entries')
          .select('id, entry_date, entry_time, entry_type, notes')
          .eq('child_id', child.id)
          .gte('entry_date', from)
          .order('entry_date', { ascending: false })
          .order('entry_time', { ascending: false })
          .limit(20)
        setEntries(recentEntries ?? [])
      } else {
        setEntries(todayEntries ?? [])
      }

      setLoading(false)
    }
    load()
  }, [token])

  const genderEmoji = baby?.gender === 'boy' ? '👶🏻' : baby?.gender === 'girl' ? '👧' : '👶'

  const today = new Date().toISOString().split('T')[0]
  const todayEntries = entries.filter(e => e.entry_date === today)

  const countType = (type: string) => todayEntries.filter(e => e.entry_type === type).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }}>
        <div className="text-center flex flex-col items-center gap-4">
          <div className="animate-pulse">
            <MimoLogo size={100} />
          </div>
          <p className="text-sand-400 text-sm">טוענת...</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }} dir="rtl">
        <div className="text-center space-y-4">
          <p className="text-5xl">🔍</p>
          <p className="font-bold text-sand-800">קישור לא תקין</p>
          <p className="text-sand-400 text-sm">לא נמצא פרופיל תינוק — בקשי קישור מעודכן מההורה</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-10" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }} dir="rtl">
      <div className="max-w-sm mx-auto space-y-4 pt-4">

        {/* Header */}
        <div className="flex justify-center pt-2 pb-1">
          <MimoLogo size={55} />
        </div>

        {/* Baby card */}
        <div className="bg-white rounded-3xl p-5 shadow-sm text-center space-y-2">
          <div className="text-5xl">{genderEmoji}</div>
          <div>
            <h1 className="text-2xl font-bold text-sand-800">{baby?.name}</h1>
            {baby?.dob && (
              <p className="text-sand-400 text-sm mt-0.5">{getBabyAge(baby.dob)}</p>
            )}
          </div>
          <p className="text-xs text-sand-300">עדכון חי דרך Mimo 🐣</p>
        </div>

        {/* Today's summary */}
        <div>
          <p className="text-xs font-semibold text-sand-500 mb-2 px-1">
            {todayEntries.length > 0 ? 'היום' : 'פעילות אחרונה'}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { type: 'feeding',    emoji: '🍼', label: 'האכלות' },
              { type: 'sleep',      emoji: '😴', label: 'שינות'   },
              { type: 'diaper',     emoji: '🧷', label: 'חיתולים' },
              { type: 'tummy_time', emoji: '🐣', label: 'זמן בטן' },
            ].map(item => (
              <div key={item.type} className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className="text-2xl">{item.emoji}</div>
                <div className="text-lg font-bold text-sand-800">{countType(item.type)}</div>
                <div className="text-[10px] text-sand-400">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent entries */}
        {entries.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-sand-500 px-1">
              {todayEntries.length > 0 ? 'פירוט' : 'הפעילויות האחרונות'}
            </p>
            {entries.slice(0, 15).map(entry => (
              <div key={entry.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                <span className="text-xl flex-shrink-0">{entryTypeEmoji(entry.entry_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-sand-800">{entryTypeLabel(entry.entry_type)}</p>
                  {entry.notes && (
                    <p className="text-xs text-sand-400 truncate">{entry.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-medium text-sand-600">{entry.entry_time?.slice(0, 5)}</p>
                  {entry.entry_date !== today && (
                    <p className="text-[10px] text-sand-300">
                      {new Date(entry.entry_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 text-center shadow-sm space-y-2">
            <p className="text-3xl">📝</p>
            <p className="text-sand-400 text-sm">עדיין אין רשומות להיום</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 pb-4 space-y-2">
          <p className="text-xs text-sand-300">מידע זה עדכני ומשותף דרך Mimo</p>
          <a
            href="https://mimoapp.vercel.app"
            className="inline-block text-xs font-semibold text-mustard-600"
          >
            הורידי את Mimo →
          </a>
        </div>
      </div>
    </div>
  )
}
