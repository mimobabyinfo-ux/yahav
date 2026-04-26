import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

const DEFAULTS = {
  subtitle: 'בית עוטף ומלטף',
  title: 'ברוכה הבאה למימו 🐣',
  whatsappCommunity: '',
  instagram: '',
}

export default function ThankYouPage() {
  const [subtitle, setSubtitle] = useState(DEFAULTS.subtitle)
  const [title, setTitle] = useState(DEFAULTS.title)
  const [body, setBody] = useState('')
  const [waLink, setWaLink] = useState(DEFAULTS.whatsappCommunity)
  const [igLink, setIgLink] = useState(DEFAULTS.instagram)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'תודה — Mimo'
  }, [])

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['app_subtitle', 'thank_you_title', 'thank_you_body', 'whatsapp_community_link', 'instagram_link', 'owner_name'])
      .then(({ data }) => {
        const get = (k: string) => data?.find(r => r.setting_key === k)?.setting_value ?? null
        const sub = get('app_subtitle');               if (sub) setSubtitle(sub)
        const ttl = get('thank_you_title');            if (ttl) setTitle(ttl)
        const ownerName = get('owner_name') ?? ''
        const bdy = get('thank_you_body') ?? (ownerName
          ? `מחכה לפגוש אותך ואת הבייבי שלך.\nפרטים נוספים יישלחו בקבוצת ווטסאפ ייעודית לקראת מועד המפגש.\nאני כאן בשבילך לכל שאלה, התייעצות או כל דבר קטן 🤍\nבאהבה, ${ownerName}`
          : `מחכה לפגוש אותך ואת הבייבי שלך.\nפרטים נוספים יישלחו בקבוצת ווטסאפ ייעודית לקראת מועד המפגש.\nאני כאן בשבילך לכל שאלה, התייעצות או כל דבר קטן 🤍`)
        setBody(bdy)
        const wa  = get('whatsapp_community_link');    if (wa)  setWaLink(wa)
        const ig  = get('instagram_link');             if (ig)  setIgLink(ig)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
        <div className="animate-pulse"><MimoLogo size={120} /></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10" dir="rtl" style={{ background: '#FFFFFF' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2"><MimoLogo size={120} /></div>
          <p className="text-sand-500 text-sm">{subtitle}</p>
        </div>

        <div className="bg-[#DCD4C8] rounded-3xl shadow-sm p-6 space-y-5 text-center">
          <h1 className="text-2xl font-bold text-sand-800 leading-tight">{title}</h1>

          <p className="text-sm text-sand-700 leading-relaxed whitespace-pre-line">{body}</p>

          <div className="space-y-2 pt-2">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
              >
                💬 הצטרפי לקהילת מימו בוואטסאפ
              </a>
            )}
            {igLink && (
              <a
                href={igLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' }}
              >
                📸 עקבי אחרינו באינסטגרם
              </a>
            )}
          </div>
        </div>

        <a
          href="/"
          className="block text-center mt-6 text-xs text-sand-400 hover:text-sand-600 underline-offset-4 hover:underline"
        >
          פתחי את אפליקציית מימו
        </a>
      </div>
    </div>
  )
}
