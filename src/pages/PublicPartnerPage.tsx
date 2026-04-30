import { useOwnerSettings } from '../hooks/useOwnerSettings'
import MimoLogo from '../components/MimoLogo'

const WHATSAPP_MSG = encodeURIComponent('היי! ראיתי את המצגת של Mimo ואשמח לשמוע עוד על שיתוף פעולה 🌸')

const STATS = [
  { value: '35+', label: 'משתמשות פעילות', emoji: '👩' },
  { value: '100%', label: 'אמהות ובהריון', emoji: '🤰' },
  { value: '3', label: 'לידים ב-7 ימים אחרונים', emoji: '📲' },
  { value: '0₪', label: 'עלות הצטרפות', emoji: '🎁' },
]

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'הצטרפי לרשימת השירותים המומלצים',
    desc: 'אנחנו מוסיפים את העסק שלך לקטגוריה המתאימה באפליקציה — עם תיאור, תמונה ואפשרות יצירת קשר.',
    emoji: '📋',
  },
  {
    step: '2',
    title: 'משתמשות מגלות אותך בדיוק ברגע הנכון',
    desc: 'אמהות ונשים בהריון שמחפשות את השירות שלך — מוצאות אותך בתוך האפליקציה שהן כבר משתמשות בה כל יום.',
    emoji: '🔍',
  },
  {
    step: '3',
    title: 'לידים חמים ישירות אליך',
    desc: 'כל פנייה — WhatsApp או בקשת התקשרות — מגיעה ישירות למספר שלך. בלי פילטרים, בלי אמצע.',
    emoji: '📲',
  },
]

const CATEGORIES = [
  { emoji: '🤱', label: 'יועצת הנקה' },
  { emoji: '🤝', label: 'דולה' },
  { emoji: '🙌', label: 'אוסטאופתיה' },
  { emoji: '💪', label: 'פיזיותרפיה' },
  { emoji: '🧘', label: 'רצפת אגן' },
  { emoji: '🌸', label: 'סטודיו לתנועה' },
  { emoji: '🍼', label: 'ייעוץ שינה' },
  { emoji: '🧠', label: 'פסיכולוגיה ורפואה' },
]

const TESTIMONIALS = [
  {
    name: 'ד״ר מיכל כהן',
    role: 'יועצת הנקה',
    text: 'קיבלתי כבר 2 פניות WhatsApp מהאפליקציה תוך יומיים מהרישום. הלקוחות מגיעות מוכנות ורציניות.',
    emoji: '🤱',
  },
  {
    name: 'שירה לוי',
    role: 'דולה',
    text: 'Mimo מגיעה לאמהות בדיוק ברגע שהן הכי זקוקות לתמיכה. זה הגיוני שנהיה שם יחד.',
    emoji: '🤝',
  },
]

export default function PublicPartnerPage() {
  const { ownerWhatsapp } = useOwnerSettings()
  const bg = 'linear-gradient(160deg, #FDF8F2 0%, #F5EDE0 100%)'

  return (
    <div className="min-h-screen" style={{ background: bg }} dir="rtl">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center opacity-5">
          <span className="text-[300px]">🐣</span>
        </div>
        <div className="relative z-10 max-w-lg mx-auto px-6 pt-12 pb-10 text-center space-y-5">
          <MimoLogo size={70} />
          <div>
            <h1 className="text-3xl font-black text-sand-800 leading-tight">
              הגיעי לאמהות<br />שמחפשות אותך
            </h1>
            <p className="text-sand-500 mt-3 text-base leading-relaxed">
              Mimo היא אפליקציית המשפחה המובילה לאמהות ונשים בהריון.<br />
              אנחנו מחברות עסקים מומלצים עם לקוחות חמות — ישירות.
            </p>
          </div>
          <a
            href={`https://wa.me/${ownerWhatsapp}?text=${WHATSAPP_MSG}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl text-white font-bold text-base shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
          >
            💬 דברי איתנו ב-WhatsApp
          </a>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="max-w-lg mx-auto px-6 pb-10">
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm text-center space-y-1">
              <div className="text-3xl">{s.emoji}</div>
              <div className="text-2xl font-black text-sand-800">{s.value}</div>
              <div className="text-xs text-sand-400 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Who is our user ── */}
      <div className="max-w-lg mx-auto px-6 pb-10">
        <div className="bg-[#F5F1EB] rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-sand-800 text-center">מי המשתמשות שלנו?</h2>
          <div className="space-y-3">
            {[
              { emoji: '👩‍🍼', title: 'אמהות טריות', desc: 'בחודשים הראשונים אחרי הלידה — מחפשות ייעוץ, שירותים ותמיכה.' },
              { emoji: '🤰', title: 'נשים בהריון', desc: 'מתכננות את הלידה ומה שאחרי — קונות, שואלות, מחפשות מקצוענים.' },
              { emoji: '📱', title: 'משתמשות יומיומיות', desc: 'נכנסות לאפליקציה מספר פעמים ביום לרישומי האכלה, שינה ועוד.' },
            ].map(u => (
              <div key={u.title} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sand-50 flex items-center justify-center text-xl flex-shrink-0">{u.emoji}</div>
                <div>
                  <p className="font-bold text-sand-800 text-sm">{u.title}</p>
                  <p className="text-xs text-sand-400 leading-relaxed mt-0.5">{u.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ── */}
      <div className="max-w-lg mx-auto px-6 pb-10 space-y-4">
        <h2 className="text-xl font-black text-sand-800 text-center">איך זה עובד?</h2>
        {HOW_IT_WORKS.map(step => (
          <div key={step.step} className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm flex gap-4 items-start">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #F7F0E4, #EFE3CA)' }}>
              {step.emoji}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-mustard-600 bg-mustard-50 px-2 py-0.5 rounded-full">שלב {step.step}</span>
              </div>
              <p className="font-bold text-sand-800 text-sm">{step.title}</p>
              <p className="text-xs text-sand-400 mt-1 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Lead screenshot mockup ── */}
      <div className="max-w-lg mx-auto px-6 pb-10">
        <div className="bg-[#F5F1EB] rounded-3xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-sand-800 text-center">כך נראית פנייה שמגיעה אליך</h2>
          <p className="text-xs text-sand-400 text-center">בכל פעם שמשתמשת לוחצת "WhatsApp" — הודעה נשלחת ישירות אליך</p>

          {/* WA mockup */}
          <div className="rounded-2xl overflow-hidden border border-gray-100">
            {/* WA header */}
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: '#075E54' }}>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">א</div>
              <div>
                <p className="text-white font-semibold text-sm">אמא מ-Mimo</p>
                <p className="text-green-200 text-[10px]">מקוונת</p>
              </div>
            </div>
            {/* WA bubble */}
            <div className="p-4" style={{ background: '#ECE5DD' }}>
              <div className="bg-[#F5F1EB] rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm max-w-[85%] mr-auto">
                <p className="text-gray-800 text-sm leading-relaxed">
                  היי! הגעתי אליך דרך Mimo 🐣<br />
                  רוצה לשמוע עוד על השירות שלך
                </p>
                <p className="text-[10px] text-gray-400 text-left mt-1">17:51 ✓✓</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Categories we serve ── */}
      <div className="max-w-lg mx-auto px-6 pb-10 space-y-4">
        <h2 className="text-xl font-black text-sand-800 text-center">תחומים שאנחנו מחפשים</h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map(c => (
            <div key={c.label} className="bg-[#F5F1EB] rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3">
              <span className="text-xl">{c.emoji}</span>
              <span className="text-sm font-semibold text-sand-700">{c.label}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-sand-400">ולא רשומה כאן? דברי איתנו — אנחנו פתוחות לכל תחום רלוונטי</p>
      </div>

      {/* ── Testimonials ── */}
      <div className="max-w-lg mx-auto px-6 pb-10 space-y-4">
        <h2 className="text-xl font-black text-sand-800 text-center">מה אומרות השותפות שלנו</h2>
        {TESTIMONIALS.map(t => (
          <div key={t.name} className="bg-[#F5F1EB] rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sand-100 flex items-center justify-center text-xl">{t.emoji}</div>
              <div>
                <p className="font-bold text-sand-800 text-sm">{t.name}</p>
                <p className="text-xs text-sand-400">{t.role}</p>
              </div>
            </div>
            <p className="text-sand-600 text-sm leading-relaxed border-r-2 border-mustard-300 pr-3">
              ״{t.text}״
            </p>
          </div>
        ))}
      </div>

      {/* ── What you get ── */}
      <div className="max-w-lg mx-auto px-6 pb-10">
        <div className="rounded-3xl p-6 space-y-4" style={{ background: 'linear-gradient(135deg, #2d1b69, #1a0f40)' }}>
          <h2 className="text-xl font-black text-white text-center">מה כלול בשיתוף הפעולה</h2>
          <div className="space-y-3">
            {[
              { emoji: '🌿', text: 'דף שירות מעוצב עם תיאור, תמונה וקישור יצירת קשר' },
              { emoji: '📲', text: 'לידים ישירים — WhatsApp ובקשות התקשרות' },
              { emoji: '🎁', text: 'אפשרות להצגת קוד הנחה בלעדי למשתמשות Mimo' },
              { emoji: '📊', text: 'עדכון שוטף על מספר הפניות שקיבלת' },
              { emoji: '💬', text: 'הופעה בוואטסאפ אוטומטי עם ההודעה שלך' },
              { emoji: '0₪', text: 'ללא עלות כניסה — אנחנו שותפות לצמיחה שלך' },
            ].map(item => (
              <div key={item.text} className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{item.emoji}</span>
                <p className="text-white/80 text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div className="max-w-lg mx-auto px-6 pb-16 text-center space-y-4">
        <h2 className="text-2xl font-black text-sand-800">מוכנה להתחיל?</h2>
        <p className="text-sand-500 text-sm leading-relaxed">
          שלחי לנו הודעה ונסגור פרטים תוך 24 שעות.<br />
          ההצטרפות פשוטה, מהירה ובלי התחייבות.
        </p>
        <a
          href={`https://wa.me/${ownerWhatsapp}?text=${WHATSAPP_MSG}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-10 py-4 rounded-2xl text-white font-bold text-base shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
        >
          💬 שלחי הודעה עכשיו
        </a>
        <div className="pt-4 flex items-center justify-center gap-2">
          <MimoLogo size={32} />
          <span className="text-xs text-sand-400 font-semibold">Mimo Baby · mimobaby.info@gmail.com</span>
        </div>
      </div>

    </div>
  )
}
