export default function ContactPage() {
  return (
    <div className="min-h-screen p-5 pb-24" dir="rtl">
      <div className="max-w-sm mx-auto space-y-5 pt-4">
        <h1 className="text-2xl font-bold text-sand-800">יצירת קשר</h1>
        <p className="text-sand-500 text-sm">אנחנו כאן בשבילך! בחרי את הדרך הנוחה לך לפנות אלינו.</p>

        {/* WhatsApp */}
        <a
          href="https://wa.me/972500000000"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-[#F5F5F5] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
            💬
          </div>
          <div className="flex-1 text-right">
            <p className="font-bold text-sand-800">WhatsApp</p>
            <p className="text-xs text-sand-400 mt-0.5">זמינות: א׳–ה׳, 9:00–18:00</p>
          </div>
          <div className="w-8 h-8 bg-green-500 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm">←</span>
          </div>
        </a>

        {/* Email */}
        <a
          href="mailto:mimobaby.info@gmail.com"
          className="flex items-center gap-4 bg-[#F5F5F5] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 bg-mustard-50 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
            ✉️
          </div>
          <div className="flex-1 text-right">
            <p className="font-bold text-sand-800">אימייל</p>
            <p className="text-xs text-sand-400 mt-0.5">mimobaby.info@gmail.com</p>
          </div>
        </a>

        {/* Instagram */}
        <a
          href="https://instagram.com/mimobaby"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-[#F5F5F5] rounded-3xl p-5 shadow-sm hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 bg-pink-50 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
            📸
          </div>
          <div className="flex-1 text-right">
            <p className="font-bold text-sand-800">Instagram</p>
            <p className="text-xs text-sand-400 mt-0.5">@mimobaby</p>
          </div>
        </a>

        {/* FAQ */}
        <div className="bg-mustard-50 rounded-3xl p-5 border border-mustard-100">
          <p className="font-bold text-sand-800 mb-3">שאלות נפוצות</p>
          {[
            { q: 'איך מפעילים מנוי Pro?', a: 'פנו אלינו בוואטסאפ ונפעיל עבורכן.' },
            { q: 'האם האפליקציה בחינם?', a: 'כן! הפיצ׳רים הבסיסיים חינמיים לגמרי.' },
            { q: 'כיצד מוסיפים תינוק שני?', a: 'לחצי על "הוסף תינוק/ת" בראש מסך הבית.' },
          ].map((item, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="text-sm font-semibold text-sand-700">{item.q}</p>
              <p className="text-xs text-sand-500 mt-0.5">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
