import { ArrowRight } from 'lucide-react'
import { LEGAL_DOCS, LEGAL_TITLES, type LegalDocId } from '../constants/legal'

// The privacy policy, the terms and the accessibility statement.
//
// One component, three documents, reachable two ways: from the consent
// line on the signup screen (before she has an account, so this cannot
// live behind the app shell) and from the settings page. The public route
// is ?legal=privacy|terms|accessibility, which also makes each document a
// URL she can paste to anyone who asks for it.
//
// The text is plain markdown-ish: `## ` headings, `· ` bullets, `**bold**`.
// A markdown library for three static documents would be 40 kB for
// nothing, and this launches tomorrow.

type Props = {
  doc: LegalDocId
  onBack?: () => void
}

function renderInline(text: string, key: string) {
  // **bold** only. Split keeps the delimiters' contents at odd indices.
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={`${key}-${i}`} style={{ color: '#443327' }}>{part}</strong>
      : <span key={`${key}-${i}`}>{part}</span>,
  )
}

function LegalBody({ text }: { text: string }) {
  const blocks = text.split('\n')
  return (
    <div className="space-y-2.5">
      {blocks.map((line, i) => {
        const key = `l${i}`
        if (!line.trim()) return <div key={key} className="h-1" />
        if (line.startsWith('## ')) {
          return (
            <h2 key={key} className="font-bold pt-3" style={{ fontSize: 16, color: '#5E4938' }}>
              {line.slice(3)}
            </h2>
          )
        }
        if (line.startsWith('· ')) {
          return (
            <p key={key} className="flex gap-2 text-sm leading-relaxed" style={{ color: '#5A4B3C' }}>
              <span aria-hidden="true" style={{ color: '#C6A15B' }}>·</span>
              <span className="flex-1">{renderInline(line.slice(2), key)}</span>
            </p>
          )
        }
        return (
          <p key={key} className="text-sm leading-relaxed" style={{ color: '#5A4B3C' }}>
            {renderInline(line, key)}
          </p>
        )
      })}
    </div>
  )
}

export default function LegalPage({ doc, onBack }: Props) {
  return (
    <div className="min-h-screen" style={{ background: '#F8F4EC' }} dir="rtl">
      <div className="max-w-lg mx-auto px-5 py-6 pb-16">
        <div className="flex items-center gap-2 mb-4">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-2 -mr-2 rounded-xl text-sand-500 hover:bg-white transition-colors"
              aria-label="חזרה"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <a
              href="/"
              className="p-2 -mr-2 rounded-xl text-sand-500 hover:bg-white transition-colors"
              aria-label="חזרה לאפליקציה"
            >
              <ArrowRight className="w-5 h-5" />
            </a>
          )}
          <h1 className="font-display" style={{ fontSize: 24, color: '#5E4938' }}>
            {LEGAL_TITLES[doc]}
          </h1>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-[#F0EAE0] p-5">
          <LegalBody text={LEGAL_DOCS[doc]} />
        </div>

        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-5 text-xs" aria-label="מסמכים">
          {(Object.keys(LEGAL_TITLES) as LegalDocId[])
            .filter(d => d !== doc)
            .map(d => (
              <a key={d} href={`/?legal=${d}`} className="underline" style={{ color: '#8C7D6B' }}>
                {LEGAL_TITLES[d]}
              </a>
            ))}
        </nav>
      </div>
    </div>
  )
}
