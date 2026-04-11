import { useEffect, useState } from 'react'
import { MessageCircle, ShoppingBag, Users, Copy, Check } from 'lucide-react'
import { supabase, Workshop } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const WA_NUMBER = '972559904274'

type PurchasedRow = {
  id: string
  purchase_date: string
  amount_paid: number | null
  workshops: Workshop
}

// ── Family Sync Panel ─────────────────────────────────────────────────────────
function FamilyPanel() {
  const { family, familyMembers, createFamily, joinFamily, profile } = useAuth()
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')
  const [familyName, setFamilyName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!familyName.trim()) return
    setLoading(true)
    const code = await createFamily(familyName.trim())
    setLoading(false)
    if (code) setInviteCode(code)
    else setError('שגיאה ביצירת משפחה')
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setLoading(true)
    const ok = await joinFamily(joinCode.trim())
    setLoading(false)
    if (!ok) setError('קוד לא נמצא — בדוק שוב')
    else setMode('idle')
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (family) {
    return (
      <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="font-bold text-sand-800 text-sm">{family.family_name ?? 'המשפחה שלי'}</p>
            <p className="text-xs text-sand-400">{familyMembers.length} חברי משפחה מחוברים</p>
          </div>
        </div>

        {familyMembers.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-sand-50 rounded-2xl">
            <div className="w-7 h-7 rounded-full bg-mustard-100 flex items-center justify-center text-xs font-bold text-mustard-700">
              {(m.mother_name ?? m.email)[0].toUpperCase()}
            </div>
            <p className="text-sm text-sand-700">{m.mother_name ?? m.email}</p>
            {m.id === profile?.id && <span className="text-[10px] text-sand-400 mr-auto">את</span>}
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <p className="text-xs text-sand-400">קוד הזמנה: <span className="font-bold text-sand-700">{family.invite_code}</span></p>
          <button onClick={() => copyCode(family.invite_code)} className="text-xs text-mustard-600 flex items-center gap-1">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'הועתק' : 'העתק'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
          <Users className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <p className="font-bold text-sand-800 text-sm">סנכרון משפחתי</p>
          <p className="text-xs text-sand-400">חברי/י בן/בת זוג לאותו חשבון</p>
        </div>
      </div>

      {mode === 'idle' && (
        <div className="flex gap-2">
          <button onClick={() => setMode('create')} className="flex-1 py-3 rounded-2xl text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
            צרי משפחה
          </button>
          <button onClick={() => setMode('join')} className="flex-1 py-3 rounded-2xl bg-sand-100 text-sand-700 text-sm font-semibold">
            הצטרפי לקוד
          </button>
        </div>
      )}

      {mode === 'create' && !inviteCode && (
        <div className="space-y-3">
          <input
            value={familyName}
            onChange={e => setFamilyName(e.target.value)}
            placeholder="שם המשפחה (למשל: משפחת כהן)"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={loading} className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              {loading ? '...' : 'צרי'}
            </button>
            <button onClick={() => setMode('idle')} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
          </div>
        </div>
      )}

      {inviteCode && (
        <div className="bg-mustard-50 rounded-2xl p-4 text-center space-y-2">
          <p className="text-sm font-bold text-sand-800">המשפחה נוצרה! 🎉</p>
          <p className="text-xs text-sand-500">שלחי את הקוד הזה לבן/בת הזוג:</p>
          <p className="text-2xl font-black text-mustard-700 tracking-widest">{inviteCode}</p>
          <button onClick={() => copyCode(inviteCode)} className="flex items-center gap-1.5 mx-auto text-xs text-mustard-600 font-semibold">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'הועתק!' : 'העתק קוד'}
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="space-y-3">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="הכניסי קוד הזמנה..."
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 text-center tracking-widest font-bold"
            maxLength={8}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleJoin} disabled={loading} className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}>
              {loading ? '...' : 'הצטרפי'}
            </button>
            <button onClick={() => setMode('idle')} className="px-4 py-3 rounded-2xl bg-sand-100 text-sand-600 text-sm font-semibold">ביטול</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyServicesPage() {
  const { user } = useAuth()
  const [purchases, setPurchases] = useState<PurchasedRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('purchased_workshops')
      .select('*, workshops(*)')
      .eq('user_id', user.id)
      .order('purchase_date', { ascending: false })
      .then(({ data }) => {
        setPurchases((data ?? []) as PurchasedRow[])
        setLoading(false)
      })
  }, [user])

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🛍️</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">השירותים שלי</h1>
          <p className="text-sand-400 text-sm">רכישות וסנכרון משפחתי</p>
        </div>

        {/* Family sync */}
        <FamilyPanel />

        {/* Purchased workshops */}
        <div>
          <h2 className="text-base font-bold text-sand-800 mb-3">הרכישות שלי</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center shadow-sm space-y-3">
              <ShoppingBag className="w-10 h-10 text-sand-200 mx-auto" />
              <p className="text-sand-400 text-sm">עדיין אין רכישות</p>
              <p className="text-xs text-sand-300">רכישות שתבצעי יופיעו כאן</p>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map(p => (
                <div key={p.id} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                  {p.workshops.image_url && (
                    <img src={p.workshops.image_url} alt={p.workshops.title} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sand-800">{p.workshops.title}</p>
                        <p className="text-xs text-sand-400 mt-0.5">
                          {p.amount_paid != null ? `שולם: ₪${p.amount_paid}` : ''}
                          {' · '}
                          {new Date(p.purchase_date).toLocaleDateString('he-IL')}
                        </p>
                      </div>
                      {p.workshops.price != null && (
                        <span className="text-sm font-bold text-mustard-600">₪{p.workshops.price}</span>
                      )}
                    </div>
                    <a
                      href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`היי! יש לי שאלה לגבי: ${p.workshops.title}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all"
                    >
                      <MessageCircle className="w-4 h-4" />
                      צרי קשר על הסדנה
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
