import { ExternalLink } from 'lucide-react'
import { useDailyTip } from '../../hooks/useDailyTip'

// Dashboard card rendering the day's matched tip. Stateless — all logic
// lives in useDailyTip. Renders null when there's no matching tip (silent
// gap rather than an empty card), matches the existing mustard/beige
// gradient already used on the dashboard.

export default function DailyTipCard() {
  const { loading, tip, label } = useDailyTip()
  if (loading) return null
  if (!tip) return null

  return (
    <div className="bg-gradient-to-r from-mustard-50 to-beige-50 rounded-3xl p-5 border border-mustard-100" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">💡</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-xs font-semibold text-mustard-600">
            טיפ ליום{label ? ` · ${label}` : ''}
          </p>
          {tip.title && (
            <p className="text-sm font-bold text-sand-800 leading-snug">{tip.title}</p>
          )}
          <p className="text-sm text-sand-700 leading-relaxed">{tip.tip_text}</p>
          {tip.article_link && (
            <a
              href={tip.article_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-mustard-700 hover:text-mustard-800 pt-1"
            >
              קראי עוד
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
