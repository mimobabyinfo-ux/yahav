import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, X, Check, ShieldAlert, Search, Users, BarChart2, Lightbulb, Video, ShoppingBag, Gift, LayoutGrid, Settings, MessageCircle, Mail } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts'
import { supabase, UserProfile, DailyTip, Video as VideoType, HomeworkTask, Workshop, PartnerPerk, PerkAnalytic, ContentCategory, GlobalSetting } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { AdminSection } from '../App'

type Tab = 'users' | 'insights' | 'tips' | 'videos' | 'workshops' | 'perks' | 'categories' | 'forms' | 'settings'

const APP_URL = 'https://mimoapp.vercel.app'

// Map admin nav sections → internal tabs
const SECTION_TAB: Record<AdminSection, Tab> = {
  insights: 'insights',
  users: 'users',
  forms: 'forms',
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'users',      label: 'משתמשים',       icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'insights',   label: 'תובנות',         icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: 'tips',       label: 'טיפים',          icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: 'videos',     label: 'סרטונים',        icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'workshops',  label: 'מוצרים',         icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { id: 'perks',      label: 'הטבות שותפים',   icon: <Gift className="w-3.5 h-3.5" /> },
  { id: 'categories', label: 'קטגוריות',       icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: 'forms',      label: 'טפסים',          icon: <span className="text-xs">📋</span> },
  { id: 'settings',   label: 'הגדרות',         icon: <Settings className="w-3.5 h-3.5" /> },
]

export default function AdminPage({ defaultSection }: { defaultSection?: AdminSection }) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>(defaultSection ? SECTION_TAB[defaultSection] : 'insights')

  // Sync when parent nav changes the section
  useEffect(() => {
    if (defaultSection) setTab(SECTION_TAB[defaultSection])
  }, [defaultSection])

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-sand-500">אין גישה לפאנל הניהול</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24" dir="rtl">
      {/* Admin Header */}
      <div className="bg-white border-b border-sand-100 shadow-sm px-4 pt-5 pb-3">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-sand-800">פאנל ניהול</h1>
              <p className="text-xs text-sand-400">Mimo CMS</p>
            </div>
          </div>

          {/* Tab scroll */}
          <div className="flex gap-1.5 overflow-x-auto scroll-hide pb-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                  tab === t.id
                    ? 'text-white shadow-md'
                    : 'bg-sand-50 text-sand-500 hover:bg-sand-100'
                }`}
                style={tab === t.id ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-sm mx-auto px-4 pt-4 space-y-4">
        {tab === 'users'      && <UsersTab />}
        {tab === 'insights'   && <InsightsTab />}
        {tab === 'tips'       && <TipsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'videos'     && <VideosTab />}
        {tab === 'workshops'  && <WorkshopsTab />}
        {tab === 'perks'      && <PerksTab />}
        {tab === 'forms'      && <FormsTab />}
        {tab === 'settings'   && <SettingsTab />}
      </div>
    </div>
  )
}

// ─── CRM helpers ─────────────────────────────────────────────────────────────
const LEAD_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  new_lead:        { label: 'ליד חדש',           color: '#3b82f6', bg: '#eff6ff' },
  active_workshop: { label: 'בסדנה פעילה',       color: '#16a34a', bg: '#f0fdf4' },
  post_service:    { label: 'לאחר שירות',         color: '#9ca3af', bg: '#f9fafb' },
}

function LeadBadge({ status }: { status: string | null }) {
  const s = status ? (LEAD_STATUS_LABELS[status] ?? null) : null
  if (!s) return <span className="text-[10px] bg-sand-100 text-sand-400 px-1.5 py-0.5 rounded-md">ללא סטטוס</span>
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
type UserWithChildren = UserProfile & { childCount: number }

function UsersTab() {
  const [users, setUsers] = useState<UserWithChildren[]>([])
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<UserWithChildren | null>(null)
  const [editName, setEditName] = useState('')
  const [editLeadStatus, setEditLeadStatus] = useState<string>('')
  const [editNotes, setEditNotes] = useState('')
  const [deleteUser, setDeleteUser] = useState<UserWithChildren | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
    const { data: children } = await supabase.from('children').select('user_id')
    const countMap: Record<string, number> = {}
    children?.forEach(c => { countMap[c.user_id] = (countMap[c.user_id] ?? 0) + 1 })
    setUsers((profiles ?? []).map(p => ({ ...p, childCount: countMap[p.id] ?? 0 })))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    !search || (u.mother_name ?? '').includes(search) || u.email.includes(search)
  )

  async function upgradePro(u: UserWithChildren) {
    await supabase.from('user_profiles').update({ is_pro: !u.is_pro }).eq('id', u.id)
    setUsers(prev => prev.map(p => p.id === u.id ? { ...p, is_pro: !p.is_pro } : p))
  }

  async function saveEdit() {
    if (!editUser || !editName.trim()) return
    setSaving(true)
    const ls = (editLeadStatus || null) as 'new_lead' | 'active_workshop' | 'post_service' | null
    const updates = {
      mother_name: editName,
      display_name: editName,
      lead_status: ls,
      staff_notes: editNotes || null,
    }
    await supabase.from('user_profiles').update(updates).eq('id', editUser.id)
    setUsers(prev => prev.map(p => p.id === editUser.id ? { ...p, ...updates } : p))
    setEditUser(null)
    setSaving(false)
  }

  async function confirmDelete() {
    if (!deleteUser) return
    await supabase.from('user_profiles').delete().eq('id', deleteUser.id)
    setUsers(prev => prev.filter(p => p.id !== deleteUser.id))
    setDeleteUser(null)
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sand-300" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חפש לפי שם אמא..."
          className="w-full pr-9 pl-4 py-3 bg-white border border-sand-100 rounded-2xl text-sm text-sand-800 focus:outline-none focus:border-mustard-400 shadow-sm"
        />
      </div>

      <p className="text-xs text-sand-400">{filtered.length} משתמשות</p>

      {filtered.map(u => (
        <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sand-800 text-sm truncate">{u.mother_name ?? '—'}</p>
                {u.is_admin && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-bold">ADMIN</span>}
                {u.is_pro && <span className="text-[10px] bg-mustard-100 text-mustard-700 px-1.5 py-0.5 rounded-md font-bold">PRO</span>}
                <LeadBadge status={u.lead_status} />
              </div>
              <p className="text-xs text-sand-400 truncate">{u.email}</p>
              <p className="text-xs text-sand-300 mt-0.5">
                {u.childCount > 0 ? `${u.childCount} ילד${u.childCount > 1 ? 'ים' : ''}` : 'אין ילדים'}
                {u.staff_notes && <span className="mr-2 text-sand-400">· {u.staff_notes.slice(0, 30)}{u.staff_notes.length > 30 ? '...' : ''}</span>}
              </p>
            </div>
          </div>

          {/* Communication row */}
          <div className="flex gap-2">
            <a
              href={`https://wa.me/${u.email.replace(/[^0-9]/g, '') || '972559904274'}?text=${encodeURIComponent(`היי ${u.mother_name ?? ''}! 👋`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
            <a
              href={`mailto:${u.email}?subject=Mimo - עדכון עבורך&body=היי ${u.mother_name ?? ''}!`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              מייל
            </a>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setEditUser(u); setEditName(u.mother_name ?? ''); setEditLeadStatus(u.lead_status ?? ''); setEditNotes(u.staff_notes ?? '') }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-sand-50 text-sand-600 hover:bg-sand-100 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              ערוך
            </button>
            <button
              onClick={() => upgradePro(u)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                u.is_pro
                  ? 'bg-mustard-100 text-mustard-700'
                  : 'bg-mustard-50 text-mustard-600 hover:bg-mustard-100'
              }`}
            >
              ⭐ {u.is_pro ? 'בטל PRO' : 'PRO'}
            </button>
            <button
              onClick={() => setDeleteUser(u)}
              className="p-2 rounded-xl text-red-400 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-center text-sand-400 text-sm py-8">לא נמצאו משתמשות</p>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-sand-800 text-lg">ערוך פרטים</h3>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">שם</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
              />
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">סטטוס CRM</label>
              <select
                value={editLeadStatus}
                onChange={e => setEditLeadStatus(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 bg-white"
              >
                <option value="">ללא סטטוס</option>
                <option value="new_lead">ליד חדש</option>
                <option value="active_workshop">בסדנה פעילה</option>
                <option value="post_service">לאחר שירות</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-sand-500 mb-1 block">הערות פנימיות</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="הערות לצוות..."
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
                {saving ? '...' : 'שמירה'}
              </button>
              <button onClick={() => setEditUser(null)} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteUser(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-sand-800">מחיקת משתמשת</h3>
              <p className="text-sm text-sand-500 mt-1">
                האם למחוק את <strong>{deleteUser.mother_name ?? deleteUser.email}</strong>? פעולה זו לא ניתנת לביטול.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600">מחק</button>
              <button onClick={() => setDeleteUser(null)} className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-600 font-semibold text-sm">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Insights Tab ─────────────────────────────────────────────────────────────
type VideoPerf = { title: string; total_views: number; completions: number; completion_pct: number }
type RetentionRow = { cohort_week: string; total_users: number; day1: number; day3: number; day7: number }
type User360 = UserProfile & { childCount: number; logCount: number; activityCount: number; lead_status: string | null; staff_notes: string | null }

function InsightsTab() {
  const [stats, setStats] = useState({ users: 0, pro: 0, children: 0, logs: 0 })
  const [videoPerf, setVideoPerf] = useState<VideoPerf[]>([])
  const [retention, setRetention] = useState<RetentionRow[]>([])
  const [user360Id, setUser360Id] = useState<string | null>(null)
  const [user360, setUser360] = useState<User360 | null>(null)
  const [user360Logs, setUser360Logs] = useState<{ entry_type: string; created_at: string }[]>([])
  const [user360Activity, setUser360Activity] = useState<{ event_type: string; created_at: string; event_data: Record<string, unknown> }[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('children').select('id'),
      supabase.from('daily_log_entries').select('id'),
      supabase.from('v_video_performance').select('*').limit(10),
      supabase.from('v_retention_cohort').select('*').limit(8),
    ]).then(([{ data: users }, { data: children }, { data: logs }, { data: vids }, { data: ret }]) => {
      setAllUsers(users ?? [])
      setStats({
        users: users?.length ?? 0,
        pro: users?.filter(u => u.is_pro).length ?? 0,
        children: children?.length ?? 0,
        logs: logs?.length ?? 0,
      })
      setVideoPerf((vids ?? []).map(v => ({ ...v, title: v.title.slice(0, 20) })))
      setRetention(ret ?? [])
    })
  }, [])

  async function load360(userId: string) {
    setUser360Id(userId)
    const [
      { data: profile },
      { data: children },
      { data: logs },
      { data: acts },
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', userId).single(),
      supabase.from('children').select('id').eq('user_id', userId),
      supabase.from('daily_log_entries').select('entry_type, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('user_activities').select('event_type, created_at, event_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    ])
    setUser360({ ...profile!, childCount: children?.length ?? 0, logCount: logs?.length ?? 0, activityCount: acts?.length ?? 0 })
    setUser360Logs(logs ?? [])
    setUser360Activity(acts ?? [])
  }

  const statCards = [
    { label: 'סה"כ משתמשות', value: stats.users, emoji: '👩', color: '#EFF6FF' },
    { label: 'מנויות PRO',    value: stats.pro,   emoji: '⭐', color: '#FFFBEB' },
    { label: 'ילדים',         value: stats.children, emoji: '👶', color: '#F0FDF4' },
    { label: 'רשומות יומן',  value: stats.logs,  emoji: '📔', color: '#FAF5FF' },
  ]

  const retentionChart = retention.map(r => ({
    week: r.cohort_week?.slice(0, 10) ?? '',
    'יום 1': r.total_users ? Math.round((r.day1 / r.total_users) * 100) : 0,
    'יום 3': r.total_users ? Math.round((r.day3 / r.total_users) * 100) : 0,
    'יום 7': r.total_users ? Math.round((r.day7 / r.total_users) * 100) : 0,
  }))

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(c => (
          <div key={c.label} className="rounded-2xl p-4 shadow-sm text-right" style={{ background: c.color }}>
            <div className="text-2xl mb-1">{c.emoji}</div>
            <div className="text-2xl font-black text-sand-800">{c.value}</div>
            <div className="text-xs text-sand-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Retention chart */}
      {retentionChart.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sand-800 text-sm mb-3">Retention (%) לפי שבוע</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={retentionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F0EB" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} />
              <YAxis unit="%" tick={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="יום 1" stroke="#3B82F6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 3" stroke="#C49438" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="יום 7" stroke="#22C55E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Video performance chart */}
      {videoPerf.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-sand-800 text-sm mb-3">ביצועי סרטונים</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={videoPerf} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis dataKey="title" type="category" width={80} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="total_views" name="צפיות" fill="#C49438" radius={[0, 4, 4, 0]} />
              <Bar dataKey="completions" name="השלמות" fill="#86EFAC" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* User 360 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-sand-100">
          <h3 className="font-bold text-sand-800 text-sm">User 360°</h3>
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-sand-50">
          {allUsers.map(u => (
            <button
              key={u.id}
              onClick={() => load360(u.id)}
              className={`w-full text-right px-4 py-2.5 text-sm hover:bg-sand-50 transition-colors flex items-center justify-between ${user360Id === u.id ? 'bg-mustard-50' : ''}`}
            >
              <span className="font-medium text-sand-700 truncate">{u.mother_name ?? u.email}</span>
              <span className="text-xs text-sand-400 flex-shrink-0 mr-2">{u.lead_status ?? 'new'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 360 Detail Panel */}
      {user360 && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sand-800">{user360.mother_name ?? user360.email}</h3>
              <p className="text-xs text-sand-400">{user360.email}</p>
            </div>
            <div className="flex gap-1.5">
              {user360.is_pro && <span className="text-[10px] bg-mustard-100 text-mustard-700 px-2 py-0.5 rounded-full font-bold">PRO</span>}
              {user360.is_admin && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">ADMIN</span>}
            </div>
          </div>

          {/* Lead status + notes */}
          <LeadStatusEditor user={user360} onSaved={() => load360(user360.id)} />

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'ילדים', value: user360.childCount },
              { label: 'לוגים', value: user360.logCount },
              { label: 'אירועים', value: user360.activityCount },
            ].map(s => (
              <div key={s.label} className="text-center bg-sand-50 rounded-xl py-2">
                <div className="font-black text-lg text-sand-800">{s.value}</div>
                <div className="text-[10px] text-sand-400">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recent logs */}
          {user360Logs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sand-500 mb-1.5">פעילות אחרונה ביומן</p>
              <div className="space-y-1">
                {user360Logs.slice(0, 5).map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-sand-600">
                    <span>{l.entry_type}</span>
                    <span className="text-sand-400">{new Date(l.created_at).toLocaleDateString('he-IL')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity history */}
          {user360Activity.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-sand-500 mb-1.5">היסטוריית פעילות</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {user360Activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-sand-600">{a.event_type}</span>
                    <span className="text-sand-400">{new Date(a.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LeadStatusEditor({ user, onSaved }: { user: User360; onSaved: () => void }) {
  const [status, setStatus] = useState(user.lead_status ?? 'new')
  const [notes, setNotes] = useState(user.staff_notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('user_profiles').update({ lead_status: status, staff_notes: notes }).eq('id', user.id)
    setSaving(false)
    onSaved()
  }

  const statuses = [
    { value: 'new', label: 'חדשה', color: '#60A5FA' },
    { value: 'active_coaching', label: 'בתהליך', color: '#F59E0B' },
    { value: 'completed', label: 'הושלם', color: '#22C55E' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {statuses.map(s => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className="flex-1 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
            style={{
              borderColor: status === s.value ? s.color : '#E5DDD2',
              background: status === s.value ? s.color + '20' : 'white',
              color: status === s.value ? s.color : '#9B8E80',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="הערות צוות..."
        rows={2}
        className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400 resize-none"
      />
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        {saving ? 'שומר...' : 'שמור הערות'}
      </button>
    </div>
  )
}

// ─── Tips Tab ────────────────────────────────────────────────────────────────
function TipsTab() {
  const [tips, setTips] = useState<DailyTip[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DailyTip | null>(null)
  const [text, setText] = useState('')

  const load = useCallback(() => {
    supabase.from('daily_tips').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setTips(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!text.trim()) return
    if (editing) {
      await supabase.from('daily_tips').update({ tip_text: text }).eq('id', editing.id)
    } else {
      await supabase.from('daily_tips').insert({ tip_text: text, is_active: true })
    }
    setText(''); setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('daily_tips').delete().eq('id', id); load()
  }

  async function toggle(tip: DailyTip) {
    await supabase.from('daily_tips').update({ is_active: !tip.is_active }).eq('id', tip.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setText('') }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        טיפ חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="כתוב טיפ יומי..."
            rows={3}
            className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setText('') }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {tips.map(tip => (
        <div key={tip.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!tip.is_active ? 'opacity-50' : ''}`}>
          <p className="text-sm text-sand-700 leading-relaxed mb-2">{tip.tip_text}</p>
          <div className="flex items-center justify-between">
            <button onClick={() => toggle(tip)} className="text-sand-400 hover:text-mustard-500">
              {tip.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(tip); setText(tip.tip_text); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(tip.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────
function CategoriesTab() {
  const [cats, setCats] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ContentCategory | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', category_type: 'both' as ContentCategory['category_type'] })

  const load = useCallback(() => {
    supabase.from('content_categories').select('*').order('display_order')
      .then(({ data }) => setCats(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.name.trim()) return
    if (editing) {
      await supabase.from('content_categories').update(form).eq('id', editing.id)
    } else {
      const maxOrder = cats.length > 0 ? Math.max(...cats.map(c => c.display_order)) : 0
      await supabase.from('content_categories').insert({ ...form, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ name: '', slug: '', category_type: 'both' }); setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('content_categories').delete().eq('id', id); load()
  }

  async function toggle(cat: ContentCategory) {
    await supabase.from('content_categories').update({ is_active: !cat.is_active }).eq('id', cat.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', slug: '', category_type: 'both' }) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        קטגוריה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם הקטגוריה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="slug (אנגלית)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <select value={form.category_type} onChange={e => setForm(f => ({ ...f, category_type: e.target.value as ContentCategory['category_type'] }))} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
            <option value="video">סרטונים</option>
            <option value="workshop">סדנאות</option>
            <option value="both">שניהם</option>
          </select>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {cats.map(cat => (
        <div key={cat.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!cat.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sand-800 text-sm">{cat.name}</p>
              <p className="text-xs text-sand-400">{cat.slug} · {cat.category_type}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(cat)} className="text-sand-400 hover:text-mustard-500">
                {cat.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(cat); setForm({ name: cat.name, slug: cat.slug, category_type: cat.category_type }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(cat.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Videos Tab ───────────────────────────────────────────────────────────────
function VideosTab() {
  const [videos, setVideos] = useState<VideoType[]>([])
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<VideoType | null>(null)
  const [tasks, setTasks] = useState<HomeworkTask[]>([])
  const [newTask, setNewTask] = useState('')
  const [form, setForm] = useState({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)

  async function uploadFile(file: File, bucket: 'videos' | 'images'): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
    if (error) { alert('שגיאה בהעלאה: ' + error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingVideo(true)
    const url = await uploadFile(file, 'videos')
    if (url) setForm(f => ({ ...f, video_url: url }))
    setUploadingVideo(false)
  }

  async function handleThumbFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingThumb(true)
    const url = await uploadFile(file, 'images')
    if (url) setForm(f => ({ ...f, thumbnail_url: url }))
    setUploadingThumb(false)
  }

  const load = useCallback(async () => {
    const [{ data: vids }, { data: cats }] = await Promise.all([
      supabase.from('videos').select('*').order('display_order'),
      supabase.from('content_categories').select('*').eq('is_active', true),
    ])
    setVideos(vids ?? [])
    setCategories(cats ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function loadTasks(videoId: string) {
    const { data } = await supabase.from('homework_tasks').select('*').eq('video_id', videoId).order('display_order')
    setTasks(data ?? [])
  }

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      video_url: form.video_url || null,
      thumbnail_url: form.thumbnail_url || null,
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      category_id: form.category_id || null,
    }
    if (editing) {
      await supabase.from('videos').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = videos.length > 0 ? Math.max(...videos.map(v => v.display_order)) : 0
      await supabase.from('videos').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', video_url: '', thumbnail_url: '', duration_minutes: '', category_id: '' })
    setEditing(null); setShowForm(false); setTasks([]); load()
  }

  async function del(id: string) {
    await supabase.from('videos').delete().eq('id', id); load()
  }

  async function toggle(v: VideoType) {
    await supabase.from('videos').update({ is_active: !v.is_active }).eq('id', v.id); load()
  }

  async function addTask(videoId: string) {
    if (!newTask.trim()) return
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.display_order)) : 0
    await supabase.from('homework_tasks').insert({ video_id: videoId, task_description: newTask, display_order: maxOrder + 1 })
    setNewTask('')
    await loadTasks(videoId)
  }

  async function delTask(id: string, videoId: string) {
    await supabase.from('homework_tasks').delete().eq('id', id)
    await loadTasks(videoId)
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...videos]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('videos').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('videos').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null); setTasks([]) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סרטון חדש
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="כותרת" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          {/* Video upload */}
          <div className="border-2 border-dashed border-sand-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-sand-500">קובץ וידאו</p>
            {form.video_url ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-green-600 truncate">✓ סרטון הועלה</span>
                <button onClick={() => setForm(f => ({ ...f, video_url: '' }))} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingVideo ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
                {uploadingVideo ? 'מעלה...' : '📤 בחר קובץ וידאו'}
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoFile} disabled={uploadingVideo} />
              </label>
            )}
          </div>

          {/* Thumbnail upload */}
          <div className="border-2 border-dashed border-sand-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-sand-500">תמונה ממוזערת</p>
            {form.thumbnail_url ? (
              <div className="flex items-center justify-between gap-2">
                <img src={form.thumbnail_url} className="w-12 h-8 object-cover rounded-lg" alt="thumb" />
                <button onClick={() => setForm(f => ({ ...f, thumbnail_url: '' }))} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingThumb ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
                {uploadingThumb ? 'מעלה...' : '🖼️ בחר תמונה'}
                <input type="file" accept="image/*" className="hidden" onChange={handleThumbFile} disabled={uploadingThumb} />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <input value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="משך (דקות)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Homework tasks (only when editing) */}
          {editing && (
            <div>
              <p className="text-xs font-semibold text-sand-600 mb-2">משימות</p>
              {tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-sand-100 last:border-0">
                  <span className="text-xs text-sand-600 flex-1">{t.task_description}</span>
                  <button onClick={() => delTask(t.id, editing.id)} className="text-sand-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="משימה חדשה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-500" onKeyDown={e => e.key === 'Enter' && addTask(editing.id)} />
                <button onClick={() => addTask(editing.id)} className="px-3 py-2 bg-mustard-100 text-mustard-700 rounded-xl"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={save} disabled={uploadingVideo || uploadingThumb} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {uploadingVideo || uploadingThumb ? 'מעלה...' : 'שמירה'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); setTasks([]) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {videos.map((v, idx) => (
        <div key={v.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!v.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{v.title}</p>
              {v.description && <p className="text-xs text-sand-400 truncate">{v.description}</p>}
              {v.duration_minutes && <p className="text-xs text-sand-400">{v.duration_minutes} דק'</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => toggle(v)} className="text-sand-400 hover:text-mustard-500">
                {v.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(v); setForm({ title: v.title, description: v.description ?? '', video_url: v.video_url ?? '', thumbnail_url: v.thumbnail_url ?? '', duration_minutes: v.duration_minutes?.toString() ?? '', category_id: v.category_id ?? '' }); setShowForm(false); loadTasks(v.id) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(v.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Workshops Tab ────────────────────────────────────────────────────────────
function WorkshopsTab() {
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Workshop | null>(null)
  const [form, setForm] = useState({ title: '', description: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '' })
  const [uploadingImage, setUploadingImage] = useState(false)

  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `workshops/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const url = await uploadImage(file)
    if (url) setForm(f => ({ ...f, image_url: url }))
    setUploadingImage(false)
  }

  const load = useCallback(() => {
    supabase.from('workshops').select('*').order('display_order')
      .then(({ data }) => setWorkshops(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      price: form.price ? parseFloat(form.price) : null,
      payment_link: form.payment_link || null,
      image_url: form.image_url || null,
      video_url: form.video_url || null,
      currency: 'ILS',
      stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
      whatsapp_number: form.whatsapp_number || null,
    }
    if (editing) {
      await supabase.from('workshops').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = workshops.length > 0 ? Math.max(...workshops.map(w => w.display_order)) : 0
      await supabase.from('workshops').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ title: '', description: '', price: '', payment_link: '', image_url: '', video_url: '', stock_quantity: '', whatsapp_number: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('workshops').delete().eq('id', id); load()
  }

  async function toggle(w: Workshop) {
    await supabase.from('workshops').update({ is_active: !w.is_active }).eq('id', w.id); load()
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        סדנה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="שם הסדנה" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר (₪)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="קישור רישום" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          {/* Image upload or URL */}
          <div className="space-y-1.5">
            <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${uploadingImage ? 'bg-sand-100 text-sand-400' : 'bg-mustard-50 text-mustard-700 hover:bg-mustard-100'}`}>
              {uploadingImage ? 'מעלה תמונה...' : '🖼️ העלה תמונה (PNG/JPG)'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageFile} disabled={uploadingImage} />
            </label>
            {form.image_url && (
              <div className="relative">
                <img src={form.image_url} alt="preview" className="w-full h-28 object-cover rounded-xl" />
                <button onClick={() => setForm(f => ({ ...f, image_url: '' }))} className="absolute top-1 left-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">✕</button>
              </div>
            )}
            <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="או הדבק קישור URL..." className="w-full px-3 py-2 border border-sand-200 rounded-xl focus:outline-none focus:border-mustard-400 text-xs text-sand-500" dir="ltr" />
          </div>
          <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="קישור סרטון" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <input value={form.stock_quantity} onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))} placeholder="מלאי (יחידות)" type="number" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
            <input value={form.whatsapp_number} onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} placeholder="מספר WhatsApp" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {workshops.map(w => (
        <div key={w.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!w.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sand-800 text-sm truncate">{w.title}</p>
              {w.price != null && <p className="text-xs text-mustard-600">₪{w.price}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(w)} className="text-sand-400 hover:text-mustard-500">
                {w.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => { setEditing(w); setForm({ title: w.title, description: w.description ?? '', price: w.price?.toString() ?? '', payment_link: w.payment_link ?? '', image_url: w.image_url ?? '', video_url: w.video_url ?? '', stock_quantity: (w as unknown as { stock_quantity?: number }).stock_quantity?.toString() ?? '', whatsapp_number: (w as unknown as { whatsapp_number?: string }).whatsapp_number ?? '' }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => del(w.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Perks Tab ────────────────────────────────────────────────────────────────
function PerksTab() {
  const [perks, setPerks] = useState<PartnerPerk[]>([])
  const [analytics, setAnalytics] = useState<PerkAnalytic[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PartnerPerk | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [form, setForm] = useState({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })

  const load = useCallback(async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('partner_perks').select('*').order('display_order'),
      supabase.from('perk_analytics').select('*'),
    ])
    setPerks(p ?? [])
    setAnalytics(a ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.partner_name.trim()) return
    const payload = {
      partner_name: form.partner_name,
      short_description: form.short_description || null,
      full_description: form.full_description || null,
      discount_code: form.discount_code || null,
      action_link: form.action_link || null,
      logo_url: form.logo_url || null,
      is_featured: form.is_featured,
    }
    if (editing) {
      await supabase.from('partner_perks').update(payload).eq('id', editing.id)
    } else {
      const maxOrder = perks.length > 0 ? Math.max(...perks.map(p => p.display_order)) : 0
      await supabase.from('partner_perks').insert({ ...payload, display_order: maxOrder + 1, is_active: true })
    }
    setForm({ partner_name: '', short_description: '', full_description: '', discount_code: '', action_link: '', logo_url: '', is_featured: false })
    setEditing(null); setShowForm(false); load()
  }

  async function del(id: string) {
    await supabase.from('partner_perks').delete().eq('id', id); load()
  }

  async function toggle(p: PartnerPerk, field: 'is_active' | 'is_featured') {
    await supabase.from('partner_perks').update({ [field]: !p[field] }).eq('id', p.id); load()
  }

  async function reorder(idx: number, dir: 'up' | 'down') {
    const arr = [...perks]
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= arr.length) return
    const a = arr[idx], b = arr[swap]
    await Promise.all([
      supabase.from('partner_perks').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('partner_perks').update({ display_order: a.display_order }).eq('id', b.id),
    ])
    load()
  }

  function perkStats(perkId: string) {
    const pa = analytics.filter(a => a.perk_id === perkId)
    return {
      views: pa.filter(a => a.action_type === 'view').length,
      copies: pa.filter(a => a.action_type === 'copy_code').length,
      visits: pa.filter(a => a.action_type === 'visit_link').length,
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => { setShowForm(true); setEditing(null) }} className="flex-1 flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors">
          <Plus className="w-4 h-4" />
          הטבה חדשה
        </button>
        <button onClick={() => setShowAnalytics(!showAnalytics)} className={`px-4 py-3 rounded-2xl font-semibold text-sm transition-colors ${showAnalytics ? 'bg-sand-200 text-sand-700' : 'bg-white text-sand-600 shadow-sm'}`}>
          📊
        </button>
      </div>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} placeholder="שם השותף" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} placeholder="תיאור קצר" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <textarea value={form.full_description} onChange={e => setForm(f => ({ ...f, full_description: e.target.value }))} placeholder="תיאור מלא" rows={2} className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm resize-none" />
          <div className="flex gap-2">
            <input value={form.discount_code} onChange={e => setForm(f => ({ ...f, discount_code: e.target.value }))} placeholder="קוד הנחה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
            <input value={form.action_link} onChange={e => setForm(f => ({ ...f, action_link: e.target.value }))} placeholder="קישור לאתר" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          </div>
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="קישור ללוגו" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />
          <label className="flex items-center gap-2 text-sm text-sand-600 cursor-pointer">
            <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="rounded" />
            מוצג בדף הבית
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {perks.map((p, idx) => {
        const stats = perkStats(p.id)
        return (
          <div key={p.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!p.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sand-800 text-sm truncate">{p.partner_name}</p>
                  {p.is_featured && <span className="text-xs bg-mustard-100 text-mustard-600 px-1.5 py-0.5 rounded-lg">מוצג</span>}
                </div>
                {p.discount_code && <p className="text-xs text-sand-400">{p.discount_code}</p>}
                {showAnalytics && (
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-sand-400">👁 {stats.views}</span>
                    <span className="text-xs text-sand-400">📋 {stats.copies}</span>
                    <span className="text-xs text-sand-400">🔗 {stats.visits}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => reorder(idx, 'up')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => reorder(idx, 'down')} className="p-1 text-sand-300 hover:text-sand-600"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggle(p, 'is_featured')} className={`p-1.5 ${p.is_featured ? 'text-mustard-500' : 'text-sand-300'}`}>⭐</button>
                <button onClick={() => toggle(p, 'is_active')} className="text-sand-400 hover:text-mustard-500">
                  {p.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button onClick={() => { setEditing(p); setForm({ partner_name: p.partner_name, short_description: p.short_description ?? '', full_description: p.full_description ?? '', discount_code: p.discount_code ?? '', action_link: p.action_link ?? '', logo_url: p.logo_url ?? '', is_featured: p.is_featured }); setShowForm(false) }} className="p-1.5 text-sand-400 hover:text-mustard-500"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(p.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Forms Tab ────────────────────────────────────────────────────────────────
type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'rating'; label: string; options?: string[]; required?: boolean }
type FormRecord = { id: string; title: string; description: string | null; fields_json: FormField[]; trigger_rule: { type: string; count: number } | null; is_active: boolean; public_link_enabled: boolean; created_at: string }
type Submission = { id: string; user_id: string; responses_json: Record<string, string>; created_at: string; user_profiles?: { mother_name: string | null; email: string } }
type Assignment = { id: string; user_id: string; is_completed: boolean; user_profiles?: { mother_name: string | null; email: string } }

function AssignFormModal({ form, onClose }: { form: FormRecord; onClose: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('user_profiles').select('*').order('mother_name').then(({ data }) => setUsers(data ?? []))
    supabase.from('form_assignments')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .then(({ data }) => setAssignments((data ?? []) as Assignment[]))
  }, [form.id])

  const assignedIds = new Set(assignments.map(a => a.user_id))

  async function toggle(userId: string) {
    if (assignedIds.has(userId)) {
      await supabase.from('form_assignments').delete().eq('form_id', form.id).eq('user_id', userId)
      setAssignments(a => a.filter(x => x.user_id !== userId))
    } else {
      const { data } = await supabase.from('form_assignments').insert({ form_id: form.id, user_id: userId }).select('*, user_profiles(mother_name, email)').single()
      if (data) setAssignments(a => [...a, data as Assignment])
    }
  }

  const filtered = users.filter(u => !search || (u.mother_name ?? '').includes(search) || u.email.includes(search))

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm mx-auto shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sand-100">
          <h3 className="font-bold text-sand-800">שייך טופס למשתמשות</h3>
          <p className="text-xs text-sand-400 mt-0.5">{form.title}</p>
        </div>
        <div className="p-4 border-b border-sand-100">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש..." className="w-full px-3 py-2 border border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-right ${assignedIds.has(u.id) ? 'border-mustard-400 bg-mustard-50' : 'border-sand-200 bg-white'}`}
            >
              <div>
                <p className="text-sm font-semibold text-sand-800">{u.mother_name ?? '—'}</p>
                <p className="text-xs text-sand-400">{u.email}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${assignedIds.has(u.id) ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                {assignedIds.has(u.id) && <Check className="w-3 h-3 text-white" />}
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-sand-100">
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-sand-100 text-sand-700 font-semibold text-sm">סגור</button>
        </div>
      </div>
    </div>
  )
}

function FormsTab() {
  const [forms, setForms] = useState<FormRecord[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [viewSubmissions, setViewSubmissions] = useState<FormRecord | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignForm, setAssignForm] = useState<FormRecord | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function copyFormLink(formId: string) {
    const url = `${APP_URL}/?form=${formId}`
    navigator.clipboard.writeText(url)
    setCopiedId(formId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function togglePublicLink(form: FormRecord) {
    const newVal = !(form as FormRecord & { public_link_enabled?: boolean }).public_link_enabled
    await supabase.from('forms').update({ public_link_enabled: newVal }).eq('id', form.id)
    load()
  }
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [triggerType, setTriggerType] = useState('after_video_views')
  const [triggerCount, setTriggerCount] = useState('3')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    supabase.from('forms').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setForms((data ?? []) as FormRecord[]))
  }, [])
  useEffect(() => { load() }, [load])

  function addField() {
    setFields(f => [...f, { id: crypto.randomUUID(), type: 'text', label: '', required: false }])
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setFields(f => f.map(field => field.id === id ? { ...field, ...patch } : field))
  }

  function removeField(id: string) {
    setFields(f => f.filter(field => field.id !== id))
  }

  async function saveForm() {
    if (!title.trim() || fields.length === 0) return
    setSaving(true)
    await supabase.from('forms').insert({
      title: title.trim(),
      description: description || null,
      fields_json: fields,
      trigger_rule: { type: triggerType, count: parseInt(triggerCount) || 3 },
      is_active: true,
    })
    setTitle(''); setDescription(''); setFields([]); setShowCreate(false)
    setSaving(false); load()
  }

  async function toggleForm(form: FormRecord) {
    await supabase.from('forms').update({ is_active: !form.is_active }).eq('id', form.id)
    load()
  }

  async function deleteForm(id: string) {
    await supabase.from('forms').delete().eq('id', id); load()
  }

  async function loadSubmissions(form: FormRecord) {
    setViewSubmissions(form)
    const { data } = await supabase
      .from('form_submissions')
      .select('*, user_profiles(mother_name, email)')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
    setSubmissions((data ?? []) as Submission[])
  }

  const fieldTypes = [
    { value: 'text', label: 'שדה טקסט' },
    { value: 'textarea', label: 'טקסט ארוך' },
    { value: 'rating', label: 'דירוג 1-5' },
    { value: 'select', label: 'בחירה מרשימה' },
  ]

  if (viewSubmissions) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setViewSubmissions(null)} className="text-mustard-600 text-sm font-semibold">← חזרה</button>
          <h3 className="font-bold text-sand-800">{viewSubmissions.title}</h3>
        </div>
        <p className="text-xs text-sand-400">{submissions.length} תשובות</p>
        {submissions.map(s => (
          <div key={s.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-sand-700">{(s.user_profiles as { mother_name: string | null; email: string } | undefined)?.mother_name ?? (s.user_profiles as { mother_name: string | null; email: string } | undefined)?.email}</p>
              <p className="text-xs text-sand-400">{new Date(s.created_at).toLocaleDateString('he-IL')}</p>
            </div>
            {Object.entries(s.responses_json).map(([key, val]) => (
              <div key={key}>
                <p className="text-xs text-sand-500">{key}</p>
                <p className="text-sm text-sand-800">{val}</p>
              </div>
            ))}
          </div>
        ))}
        {submissions.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין תשובות עדיין</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-2xl transition-colors"
        style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
      >
        <Plus className="w-4 h-4" />
        טופס חדש
      </button>

      {showCreate && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="כותרת הטופס" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" />

          {/* Trigger */}
          <div className="flex gap-2 items-center">
            <select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm bg-white focus:outline-none focus:border-mustard-400">
              <option value="after_video_views">אחרי X צפיות בסרטון</option>
              <option value="after_days">אחרי X ימים</option>
              <option value="manual">ידני</option>
            </select>
            <input type="number" value={triggerCount} onChange={e => setTriggerCount(e.target.value)} className="w-16 px-3 py-2 border-2 border-sand-200 rounded-xl text-sm focus:outline-none focus:border-mustard-400" min="1" />
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-sand-500">שדות הטופס</p>
            {fields.map(field => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1.5">
                  <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="תווית השדה" className="w-full px-3 py-2 border border-sand-200 rounded-xl text-xs focus:outline-none focus:border-mustard-400" />
                  <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value as FormField['type'] })} className="w-full px-3 py-1.5 border border-sand-200 rounded-xl text-xs bg-white focus:outline-none">
                    {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {field.type === 'select' && (
                    <input value={field.options?.join(', ') ?? ''} onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()) })} placeholder="אפשרויות מופרדות בפסיק" className="w-full px-3 py-1.5 border border-sand-200 rounded-xl text-xs focus:outline-none" />
                  )}
                  {/* Required toggle */}
                  <button
                    type="button"
                    onClick={() => updateField(field.id, { required: !field.required })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all w-fit ${field.required ? 'bg-red-100 text-red-600' : 'bg-sand-100 text-sand-400'}`}
                  >
                    <span>{field.required ? '★' : '☆'}</span>
                    {field.required ? 'חובה' : 'לא חובה'}
                  </button>
                </div>
                <button onClick={() => removeField(field.id)} className="p-1.5 text-sand-300 hover:text-red-400 mt-1"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={addField} className="w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold text-mustard-600 bg-mustard-50 hover:bg-mustard-100">
              <Plus className="w-3.5 h-3.5" /> הוסף שדה
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={saveForm} disabled={saving || !title.trim() || fields.length === 0} className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#C49438' }}>
              {saving ? 'שומר...' : 'צור טופס'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {forms.map(form => (
        <div key={form.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!form.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-bold text-sand-800 text-sm">{form.title}</p>
              <p className="text-xs text-sand-400 mt-0.5">
                {form.fields_json.length} שדות
                {form.trigger_rule && ` · ${form.trigger_rule.type === 'after_video_views' ? `אחרי ${form.trigger_rule.count} צפיות` : ''}`}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <button onClick={() => setAssignForm(form)} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">שייך</button>
              <button onClick={() => loadSubmissions(form)} className="text-xs px-2 py-1 bg-sand-50 text-sand-600 rounded-lg hover:bg-sand-100">תשובות</button>
              <button
                onClick={() => togglePublicLink(form)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${form.public_link_enabled ? 'bg-green-100 text-green-700' : 'bg-sand-50 text-sand-500 hover:bg-sand-100'}`}
              >
                {form.public_link_enabled ? '🔗 פעיל' : '🔗 לינק'}
              </button>
              {form.public_link_enabled && (
                <button
                  onClick={() => copyFormLink(form.id)}
                  className="text-xs px-2 py-1 bg-mustard-50 text-mustard-700 rounded-lg hover:bg-mustard-100"
                >
                  {copiedId === form.id ? '✓ הועתק' : 'העתק'}
                </button>
              )}
              <button onClick={() => toggleForm(form)} className="text-sand-400 hover:text-mustard-500">
                {form.is_active ? <ToggleRight className="w-5 h-5 text-mustard-500" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button onClick={() => deleteForm(form.id)} className="p-1.5 text-sand-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}
      {forms.length === 0 && <p className="text-center text-sand-400 text-sm py-8">אין טפסים עדיין</p>}

      {assignForm && <AssignFormModal form={assignForm} onClose={() => setAssignForm(null)} />}
    </div>
  )
}

// ─── Plan Features Tab (inside Settings) ─────────────────────────────────────
const PLAN_FEATURES = [
  { key: 'feature_daily_insights',   label: 'תובנות יומיות' },
  { key: 'feature_expert_chat',      label: "צ'אט עם מומחות" },
  { key: 'feature_advanced_stats',   label: 'סטטיסטיקות מתקדמות' },
  { key: 'feature_videos',           label: 'סרטונים מקצועיים' },
  { key: 'feature_multiple_children',label: 'ריבוי ילדים' },
]

function PlanFeaturesSection() {
  const [features, setFeatures] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .eq('category', 'plan_features')
      .then(({ data }) => {
        const map: Record<string, string> = {}
        data?.forEach(d => { map[d.setting_key] = d.setting_value ?? 'pro' })
        setFeatures(map)
      })
  }, [])

  async function toggle(key: string) {
    const current = features[key] ?? 'pro'
    const next = current === 'pro' ? 'lite' : 'pro'
    setSaving(key)
    await supabase.from('global_settings').upsert({
      setting_key: key,
      setting_value: next,
      setting_type: 'text',
      category: 'plan_features',
      description: PLAN_FEATURES.find(f => f.key === key)?.label ?? key,
    }, { onConflict: 'setting_key' })
    setFeatures(f => ({ ...f, [key]: next }))
    setSaving(null)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-sand-100">
        <h3 className="font-bold text-sand-800 text-sm">פיצ'רים לפי תוכנית</h3>
        <p className="text-xs text-sand-400 mt-0.5">בחרי אילו פיצ'רים זמינים ל-Lite ואילו ל-Pro בלבד</p>
      </div>
      {PLAN_FEATURES.map(f => {
        const isPro = (features[f.key] ?? 'pro') === 'pro'
        return (
          <div key={f.key} className="flex items-center justify-between px-4 py-3 border-b border-sand-50 last:border-0">
            <div>
              <p className="text-sm font-semibold text-sand-700">{f.label}</p>
              <p className="text-xs text-sand-400">{isPro ? 'Pro בלבד' : 'כולל Lite'}</p>
            </div>
            <button
              onClick={() => toggle(f.key)}
              disabled={saving === f.key}
              className={`relative w-12 h-6 rounded-full transition-colors ${isPro ? 'bg-mustard-400' : 'bg-sand-200'} disabled:opacity-50`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isPro ? 'right-0.5' : 'left-0.5'}`}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState<GlobalSetting[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<GlobalSetting | null>(null)
  const [form, setForm] = useState({ setting_key: '', setting_value: '', setting_type: 'text' as GlobalSetting['setting_type'], category: '', description: '' })
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    supabase.from('global_settings').select('*').order('category').order('setting_key')
      .then(({ data }) => setSettings(data ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function saveNew() {
    if (!form.setting_key.trim()) return
    if (editing) {
      await supabase.from('global_settings').update({ setting_value: form.setting_value, description: form.description || null }).eq('id', editing.id)
    } else {
      await supabase.from('global_settings').insert({ ...form, description: form.description || null, category: form.category || null })
    }
    setForm({ setting_key: '', setting_value: '', setting_type: 'text', category: '', description: '' })
    setEditing(null); setShowForm(false); load()
  }

  async function saveInline(setting: GlobalSetting) {
    setSaving(setting.id)
    const value = editValues[setting.id] ?? setting.setting_value ?? ''
    await supabase.from('global_settings').update({ setting_value: value }).eq('id', setting.id)
    setSaving(null)
    load()
  }

  async function del(id: string) {
    await supabase.from('global_settings').delete().eq('id', id); load()
  }

  const grouped = settings.reduce((acc, s) => {
    const cat = s.category ?? 'כללי'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {} as Record<string, GlobalSetting[]>)

  return (
    <div className="space-y-3">
      {/* Plan Features */}
      <PlanFeaturesSection />

      <button
        onClick={() => { setShowForm(true); setEditing(null) }}
        className="w-full flex items-center justify-center gap-2 bg-mustard-500 text-white font-semibold py-3 rounded-2xl hover:bg-mustard-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        הגדרה חדשה
      </button>

      {(showForm || editing) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {!editing && <input value={form.setting_key} onChange={e => setForm(f => ({ ...f, setting_key: e.target.value }))} placeholder="מפתח (key)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" dir="ltr" />}
          <input value={form.setting_value} onChange={e => setForm(f => ({ ...f, setting_value: e.target.value }))} placeholder="ערך" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור (אופציונלי)" className="w-full px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
          {!editing && (
            <div className="flex gap-2">
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="קטגוריה" className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm" />
              <select value={form.setting_type} onChange={e => setForm(f => ({ ...f, setting_type: e.target.value as GlobalSetting['setting_type'] }))} className="flex-1 px-3 py-2 border-2 border-sand-200 rounded-xl focus:outline-none focus:border-mustard-500 text-sm bg-white">
                <option value="text">טקסט</option>
                <option value="number">מספר</option>
                <option value="boolean">כן/לא</option>
                <option value="url">קישור</option>
                <option value="json">JSON</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={saveNew} className="flex-1 bg-mustard-500 text-white py-2 rounded-xl text-sm font-semibold">שמירה</button>
            <button onClick={() => { setShowForm(false); setEditing(null) }} className="px-4 py-2 bg-sand-100 rounded-xl text-sm"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-sand-400 mb-2 px-1">{cat}</p>
          {items.map(s => (
            <div key={s.id} className="bg-white rounded-2xl p-3 shadow-sm mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-sand-400">{s.setting_key}</p>
                  {s.description && <p className="text-xs text-sand-500">{s.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      value={editValues[s.id] ?? s.setting_value ?? ''}
                      onChange={e => setEditValues(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="flex-1 px-2 py-1 border border-sand-200 rounded-lg text-xs focus:outline-none focus:border-mustard-400"
                    />
                    <button onClick={() => saveInline(s)} className={`p-1 rounded-lg transition-colors ${saving === s.id ? 'text-mustard-300' : 'text-mustard-500 hover:bg-mustard-50'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => del(s.id)} className="p-1.5 text-sand-300 hover:text-red-400 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
