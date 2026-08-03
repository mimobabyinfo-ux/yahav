import { ExternalLink, Lightbulb } from 'lucide-react'
import { useDailyTip } from '../../hooks/useDailyTip'

// Daily tip — Tier-2 tinted card in rosa polvo. Flat fill (no gradient),
// Lucide Lightbulb instead of the emoji, readable type sizes.

export default function DailyTipCard() {
  const { loading, tip, label } = useDailyTip()
  if (loading) return null
  if (!tip) return null

  return (
    <div className="flex items-start" style={{ background: '#F5EEEF', border: '1px solid #EADBDD', borderRadius: 26, padding: 18, gap: 14 }} dir="rtl">
      <span className="rounded-full bg-white flex items-center justify-center flex-shrink-0" style={{ width: 38, height: 38 }}>
        <Lightbulb style={{ width: 20, height: 20, color: '#85555E' }} strokeWidth={2.2} />
      </span>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="font-bold" style={{ fontSize: 13, color: '#85555E' }}>
          טיפ ליום{label ? ` · ${label}` : ''}
        </p>
        {tip.title && (
          <p className="font-bold" style={{ fontSize: 16, lineHeight: 1.35, color: '#443327' }}>{tip.title}</p>
        )}
        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#7B604C' }}>{tip.tip_text}</p>
        {tip.article_link && (
          <a
            href={tip.article_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold pt-1"
            style={{ fontSize: 14, color: '#A35C3D' }}
          >
            קראי עוד
            <ExternalLink style={{ width: 14, height: 14 }} />
          </a>
        )}
      </div>
    </div>
  )
}
