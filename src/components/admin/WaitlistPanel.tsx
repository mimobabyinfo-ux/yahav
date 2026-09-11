import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import WaitlistOutreach from './WaitlistOutreach'

// Who is waiting for the next cohort of this product, on the product page.
//
// Yahav 25.8.26: "כשיפתח מחזור חדש אני רוצה לדעת / ואז יהיה לי רשימה של
// לידים פונטציאלים לסדנאות שכרגע לא פתוחות".
//
// Yahav 11.9.26: the list became a control panel (proposed date, who can
// and who cannot). All of that lives in WaitlistOutreach, shared with the
// home card, so this file is just the card around it. Nobody is hidden
// behind "הצג N שכבר עודכנו" any more; every row stays visible with her
// status.

export default function WaitlistPanel({ workshopId, workshopTitle }: {
  workshopId: string
  workshopTitle: string
}) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('workshop_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_id', workshopId)
      .then(({ count: c }) => setCount(c ?? 0))
  }, [workshopId])

  if (!count) return null

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-bold text-sand-800 text-sm flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-mustard-500" />
          ממתינות למחזור הבא · {count}
        </h3>
        <p className="text-xs text-sand-500 mt-1 leading-relaxed">
          ביקשו שנעדכן אותן כשייפתח מחזור חדש. קבע תאריך, שלח, וסמן מי יכולה.
        </p>
      </div>
      <WaitlistOutreach workshopId={workshopId} workshopTitle={workshopTitle} />
    </div>
  )
}
