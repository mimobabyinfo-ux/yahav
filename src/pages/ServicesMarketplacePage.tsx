import { useEffect, useState } from 'react'
import { MessageCircle, Phone, X, Check } from 'lucide-react'
import { supabase, ServicePartner } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Category = 'pregnancy' | 'motherhood'

const SUBCATEGORY_LABELS: Record<string, string> = {
  doula:        'דולה',
  pelvic_floor: 'רצפת האגן',
  studio:       'סטודיו לתנועה',
  lactation:    'יועצת הנקה',
  osteopath:    'אוסטאופתיה',
  physio:       'פיזיותרפיה',
  psychologist: 'פסיכולוגיה',
  nutrition:    'תזונה',
  other:        'כללי',
}

const SUBCATEGORY_EMOJI: Record<string, string> = {
  doula:        '🤝',
  pelvic_floor: '🧘',
  studio:       '🌸',
  lactation:    '🤱',
  osteopath:    '🙌',
  physio:       '💪',
  psychologist: '💛',
  nutrition:    '🥗',
  other:        '⭐',
}

export default function ServicesMarketplacePage() {
  const { user, profile } = useAuth()
  const [partners, setPartners] = useState<ServicePartner[]>([])
  const [category, setCategory] = useState<Category>('pregnancy')
  const [callbackFor, setCallbackFor] = useState<string | null>(null)
  const [callbackName, setCallbackName] = useState('')
  const [callbackPhone, setCallbackPhone] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('service_partners').select('*').eq('is_active', true).order('display_order')
      .then(({ data }) => { setPartners((data ?? []) as ServicePartner[]); setLoading(false) })
  }, [])

  useEffect(() => {
    setCategory(profile?.user_mode === 'pregnant' ? 'pregnancy' : 'motherhood')
  }, [profile?.user_mode])

  async function logLead(partnerId: string, type: 'whatsapp' | 'callback', name?: string, phone?: string) {
    if (!user) return
    await supabase.from('partner_leads').insert({
      user_id: user.id,
      partner_id: partnerId,
      action_type: type,
      contact_name: name ?? profile?.mother_name ?? null,
      contact_phone: phone ?? profile?.phone_number ?? null,
    })
  }

  async function handleWhatsApp(p: ServicePartner) {
    await logLead(p.id, 'whatsapp')
    const msg = encodeURIComponent(`היי! הגעתי אלייך דרך Mimo 🌿 רוצה לשמוע עוד על ${p.title}`)
    window.open(`https://wa.me/${(p.whatsapp_number ?? '').replace(/\D/g, '')}?text=${msg}`, '_blank')
  }

  async function submitCallback(partnerId: string) {
    if (!callbackName.trim() || !callbackPhone.trim()) return
    await logLead(partnerId, 'callback', callbackName, callbackPhone)
    setSent(partnerId)
    setTimeout(() => { setCallbackFor(null); setSent(null) }, 3000)
  }

  function openCallback(p: ServicePartner) {
    setCallbackFor(p.id)
    setCallbackName(profile?.mother_name ?? '')
    setCallbackPhone(profile?.phone_number ?? '')
    setSent(null)
  }

  const filtered = partners.filter(p => p.category === category)

  // Group by subcategory
  const grouped: Record<string, ServicePartner[]> = {}
  filtered.forEach(p => {
    const key = p.subcategory ?? 'other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(p)
  })

  return (
    <div className="min-h-screen p-4 pb-28 relative" dir="rtl">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        <span className="text-[250px] opacity-5">🌿</span>
      </div>

      <div className="relative z-10 max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-sand-800">שירותים מומלצים</h1>
          <p className="text-sand-400 text-sm">מקצוענים שאנחנו סומכים עליהם</p>
        </div>

        {/* Category tabs */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm gap-1">
          {([['pregnancy', '🤰 הריון'], ['motherhood', '🌸 אמהות']] as [Category, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setCategory(v)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${category === v ? 'text-white' : 'text-sand-500'}`}
              style={category === v ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center shadow-sm">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold text-sand-700">בקרוב כאן יהיו שירותים מומלצים</p>
          </div>
        ) : (
          Object.entries(grouped).map(([sub, items]) => (
            <div key={sub} className="space-y-3">
              <div className="flex items-center gap-2 mr-1">
                <span className="text-lg">{SUBCATEGORY_EMOJI[sub] ?? '⭐'}</span>
                <p className="text-sm font-bold text-sand-700">{SUBCATEGORY_LABELS[sub] ?? sub}</p>
              </div>

              {items.map(partner => (
                <div key={partner.id} className="bg-white rounded-3xl p-4 shadow-sm space-y-3"
                  style={{ border: '1px solid #F0EAE0' }}>
                  {/* Partner info */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #F7F3EC, #F2EBE0)' }}>
                      {partner.logo_url
                        ? <img src={partner.logo_url} alt={partner.title} className="w-10 h-10 rounded-xl object-contain" />
                        : <span className="text-2xl">{SUBCATEGORY_EMOJI[partner.subcategory ?? ''] ?? '🌿'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sand-800">{partner.title}</p>
                      {partner.description && (
                        <p className="text-xs text-sand-500 mt-0.5 leading-relaxed">{partner.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Callback form or buttons */}
                  {callbackFor === partner.id ? (
                    sent === partner.id ? (
                      <div className="flex items-center gap-2 py-3 px-4 rounded-2xl bg-green-50">
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-sm font-semibold text-green-700">נשלח! ניצור איתך קשר בקרוב 💛</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-sand-700">בקשת התקשרות</p>
                          <button onClick={() => setCallbackFor(null)} className="text-sand-300 hover:text-sand-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          value={callbackName}
                          onChange={e => setCallbackName(e.target.value)}
                          placeholder="שם מלא"
                          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                        />
                        <input
                          value={callbackPhone}
                          onChange={e => setCallbackPhone(e.target.value)}
                          placeholder="מספר טלפון"
                          type="tel"
                          dir="ltr"
                          className="w-full px-4 py-2.5 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                        />
                        <button
                          onClick={() => submitCallback(partner.id)}
                          disabled={!callbackName.trim() || !callbackPhone.trim()}
                          className="w-full py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-40 transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                        >
                          שלחי בקשה ✓
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="flex gap-2">
                      {partner.whatsapp_number && (
                        <button
                          onClick={() => handleWhatsApp(partner)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold bg-green-50 text-green-700 active:bg-green-100 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </button>
                      )}
                      <button
                        onClick={() => openCallback(partner)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold transition-colors active:opacity-80"
                        style={{ background: 'linear-gradient(135deg, #F7F3EC, #EDE5D8)', color: '#7C6045' }}
                      >
                        <Phone className="w-4 h-4" />
                        בקשי התקשרות
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {/* CTA for joining as partner */}
        <div className="bg-mustard-50 border border-mustard-200 rounded-3xl p-5 text-center space-y-2 mt-2">
          <p className="text-sm font-bold text-sand-800">את מקצוענית? הצטרפי לרשימה 🌟</p>
          <a
            href="https://wa.me/972559904274?text=%D7%94%D7%99%D7%99%21+%D7%90%D7%A0%D7%99+%D7%A8%D7%95%D7%A6%D7%94+%D7%9C%D7%94%D7%A6%D7%98%D7%A8%D7%A3+%D7%9C%D7%A8%D7%A9%D7%99%D7%9E%D7%AA+%D7%94%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D+%D7%A9%D7%9C+Mimo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-white text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
          >
            <MessageCircle className="w-4 h-4" />
            צרי קשר
          </a>
        </div>
      </div>
    </div>
  )
}
