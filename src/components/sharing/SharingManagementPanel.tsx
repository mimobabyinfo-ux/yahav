import { useCallback, useEffect, useState } from 'react'
import { Trash2, Loader2, MessageCircle, Copy, Check } from 'lucide-react'
import { supabase, type FamilyInviteToken, type Child } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { roleDef } from '../../constants/shareRoles'

// Phase 4 / C1: lists every active family invite the current user
// created, lets her revoke any of them, and surfaces the WhatsApp / copy
// actions per row so she doesn't have to re-create an invite to resend.
// Rendered inline inside UserSettingsPage so we don't need new routing.

type Row = FamilyInviteToken & { child?: Child | null }

function timeAgoHe(iso: string | null): string {
  if (!iso) return 'טרם נכנס/ה'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'הרגע'
  if (min < 60) return `לפני ${min} דק'`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `לפני ${hours} שעות`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'אתמול'
  if (days < 30) return `לפני ${days} ימים`
  const months = Math.floor(days / 30)
  return `לפני ${months} חודשים`
}

export default function SharingManagementPanel() {
  const { user, profile, children: kids } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('family_invite_tokens')
      .select('*')
      .eq('created_by', user.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
    const childMap = new Map(kids.map(c => [c.id, c]))
    setRows(
      (data ?? []).map(r => ({
        ...(r as FamilyInviteToken),
        child: r.child_id ? childMap.get(r.child_id) ?? null : null,
      })),
    )
    setLoading(false)
  }, [user, kids])

  useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    if (!window.confirm('לבטל את הגישה? המקבל לא יוכל להיכנס יותר.')) return
    setRevokingId(id)
    const { error } = await supabase
      .from('family_invite_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    setRevokingId(null)
    if (error) {
      alert('שגיאה בביטול הגישה — נסי שנית')
      return
    }
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function joinLink(token: string) {
    return `${window.location.origin}?join=${token}`
  }

  function resendWhatsApp(row: Row) {
    const def = roleDef(row.role)
    const greeting = row.recipient_name?.trim() || def?.label || 'שלום'
    const babyName = row.child?.name ?? 'התינוק'
    const motherName = profile?.mother_name ?? 'אמא'
    const msg = [
      `היי ${greeting}!`,
      `${motherName} משתפת איתך את היומן של ${babyName} ב-Mimo.`,
      '',
      'לחצי על הלינק כדי להיכנס:',
      joinLink(row.token),
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function copyJoinLink(row: Row) {
    navigator.clipboard.writeText(joinLink(row.token)).then(() => {
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sand-400">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-sand-500 text-center py-4 leading-relaxed">
        עדיין לא שיתפת את היומן עם בני משפחה.
        <br />
        ניתן לשתף מהאייקון שבעמוד היומן.
      </p>
    )
  }

  return (
    <ul className="space-y-2.5">
      {rows.map(row => {
        const def = roleDef(row.role)
        const displayName = row.recipient_name?.trim() || def?.label || 'אורח'
        return (
          <li key={row.id} className="rounded-2xl bg-white border border-sand-200 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-sand-800 truncate">
                  <span className="ml-1">{def?.emoji ?? '👤'}</span>
                  {displayName}
                  {def && row.recipient_name?.trim() && (
                    <span className="text-xs font-normal text-sand-400 mr-1">({def.label})</span>
                  )}
                </p>
                <p className="text-[11px] text-sand-500 mt-0.5">
                  {row.child?.name ? `יומן: ${row.child.name} · ` : ''}
                  {timeAgoHe(row.last_accessed_at)}
                </p>
              </div>
              <button
                onClick={() => revoke(row.id)}
                disabled={revokingId === row.id}
                className="p-2 rounded-xl text-sand-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                aria-label="בטלי גישה"
                title="בטלי גישה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => resendWhatsApp(row)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-[11px] font-semibold py-1.5 rounded-lg transition-all"
              >
                <MessageCircle className="w-3 h-3" />
                שלחי שוב
              </button>
              <button
                onClick={() => copyJoinLink(row)}
                className="flex-1 flex items-center justify-center gap-1.5 border border-sand-200 text-sand-700 text-[11px] font-semibold py-1.5 rounded-lg transition-all hover:bg-sand-50"
              >
                {copiedId === row.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copiedId === row.id ? 'הועתק' : 'העתק לינק'}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
