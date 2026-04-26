type Props = {
  featureName: string
  onClose: () => void
}

export default function UpgradeModal({ featureName, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 mb-2"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ background: '#E7C78A' }}
          >
            <span className="text-4xl">⭐</span>
          </div>
          <h2 className="text-xl font-black text-sand-800">שדרגי ל-Pro</h2>
          <p className="text-sm text-sand-500 mt-1">
            <strong>{featureName}</strong> זמינה רק למנויות Pro
          </p>
        </div>

        {/* Features list */}
        <div className="space-y-2.5 bg-mustard-50 rounded-2xl p-4">
          {[
            'גישה לכל הסרטונים המקצועיים',
            'תובנות יומיות מתקדמות',
            'צ\'אט עם מומחות',
            'סטטיסטיקות מפורטות',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-sand-700">
              <span className="text-mustard-500 font-bold">✓</span>
              {f}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-2">
          <a
            href="https://wa.me/972500000000?text=אני רוצה לשדרג ל-Pro"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-white font-bold py-4 rounded-2xl transition-all shadow-lg"
            style={{ background: '#E7C78A' }}
          >
            שדרגי עכשיו 🚀
          </a>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-sand-500 font-medium text-sm bg-sand-50"
          >
            אולי מאוחר יותר
          </button>
        </div>
      </div>
    </div>
  )
}
