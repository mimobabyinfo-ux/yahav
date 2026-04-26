import { useEffect, useState, useMemo } from 'react'
import { supabase, Workshop } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, '')
}

export default function PublicRegisterPage() {
  const params = new URLSearchParams(window.location.search)
  const preselect = params.get('register') || ''
  const source = params.get('source') || ''

  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [loading, setLoading] = useState(true)
  const [subtitle, setSubtitle] = useState('בית עוטף ומלטף')
  const [hero, setHero] = useState('ברוכה הבאה לסדנאות מימו')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  useEffect(() => {
    document.title = 'הרשמה לסדנאות מימו'
  }, [])

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['app_subtitle', 'landing_hero_text'])
      .then(({ data }) => {
        const sub = data?.find(r => r.setting_key === 'app_subtitle')?.setting_value
        const h = data?.find(r => r.setting_key === 'landing_hero_text')?.setting_value
        if (sub) setSubtitle(sub)
        if (h) setHero(h)
      })

    supabase
      .from('workshops')
      .select('*')
      .eq('public_registration', true)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        const list = data ?? []
        setWorkshops(list)
        // pre-select via URL if it matches
        if (preselect && list.some(w => w.id === preselect)) {
          setSelected(preselect)
        } else if (list.length === 1) {
          setSelected(list[0].id)
        }
        setLoading(false)
      })
  }, [preselect])

  const orderedWorkshops = useMemo(() => {
    if (!selected) return workshops
    const sel = workshops.find(w => w.id === selected)
    if (!sel) return workshops
    return [sel, ...workshops.filter(w => w.id !== selected)]
  }, [workshops, selected])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'שם מלא נדרש'
    const cleanPhone = normalizePhone(phone)
    if (!cleanPhone) e.phone = 'מספר טלפון נדרש'
    else if (!/^05\d{8}$/.test(cleanPhone)) e.phone = 'מספר טלפון ישראלי לא תקין (05X-XXXXXXX)'
    if (!email.trim()) e.email = 'אימייל נדרש'
    else if (!isValidEmail(email.trim())) e.email = 'כתובת אימייל לא תקינה'
    if (!selected) e.workshop = 'יש לבחור סדנה'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    const workshop = workshops.find(w => w.id === selected)
    const { error } = await supabase.from('registration_leads').insert({
      name: name.trim(),
      phone: normalizePhone(phone),
      email: email.trim().toLowerCase(),
      selected_workshop_id: selected,
      ...(source ? { source } : {}),
    })
    if (error) {
      setSubmitting(false)
      setErrors({ submit: 'שגיאה בשמירה — נסי שוב או צרי קשר ישירות' })
      return
    }
    if (workshop?.payment_link) {
      window.location.href = workshop.payment_link
    } else {
      setSubmitting(false)
      setErrors({ submit: 'ההרשמה התקבלה. ניצור איתך קשר בהקדם.' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-8" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <p className="text-sand-500 text-sm">{subtitle}</p>
        </div>

        <h1 className="text-center text-xl font-bold text-sand-800 mb-6">{hero}</h1>

        <form onSubmit={submit} className="bg-[#F5F5F5] rounded-3xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">שם מלא</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">מספר טלפון</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              dir="ltr"
              placeholder="050-1234567"
              autoComplete="tel"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1.5">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              dir="ltr"
              autoComplete="email"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-0.5">בחירת מוצר</label>
            <p className="text-xs text-sand-400 mb-2">את כל המוצרים ניתן לקנות גם כמתנת לידה</p>
            {orderedWorkshops.length === 0 && (
              <div className="text-center text-sand-400 text-sm py-6">אין סדנאות זמינות כרגע</div>
            )}
            <div className="space-y-2">
              {orderedWorkshops.map(w => {
                const active = selected === w.id
                const isExpanded = expanded.has(w.id)
                return (
                  <div
                    key={w.id}
                    onClick={() => setSelected(w.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(w.id) } }}
                    className={`w-full text-right p-3 rounded-2xl border-2 transition-all cursor-pointer ${active ? 'border-mustard-400 bg-mustard-50' : 'border-sand-200 bg-white hover:border-mustard-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-mustard-500 bg-mustard-500' : 'border-sand-300'}`}>
                        {active && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      {w.image_url && <img src={w.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sand-800 text-sm">{w.title}</p>
                        {w.price != null && <p className="text-xs font-bold text-mustard-600 mt-0.5">₪{w.price}</p>}
                      </div>
                      {w.description && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleExpand(w.id) }}
                          className="flex-shrink-0 text-[11px] text-mustard-600 hover:text-mustard-700 px-2 py-1 rounded-lg hover:bg-mustard-50 transition-colors"
                        >
                          {isExpanded ? 'פחות ↑' : 'פרטים ↓'}
                        </button>
                      )}
                    </div>
                    {isExpanded && w.description && (
                      <p className="mt-2 pt-2 border-t border-sand-100 text-xs text-sand-500 leading-relaxed whitespace-pre-line">{w.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
            {errors.workshop && <p className="text-xs text-red-500 mt-1">{errors.workshop}</p>}
          </div>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">{errors.submit}</div>
          )}

          <button
            type="submit"
            disabled={submitting || workshops.length === 0}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: '#E7C78A' }}
          >
            {submitting ? 'שולח...' : 'המשך לתשלום'}
          </button>
        </form>

        <p className="text-center text-[11px] text-sand-400 mt-4">
          לאחר שליחת הטופס תועברי לעמוד התשלום
        </p>
      </div>
    </div>
  )
}
