import type { ReactNode } from 'react'

// Renders a community event's free-text description with light formatting,
// so a description Brenda types in the admin looks like a real page and not
// a wall of text (Brenda 17.9.26: "כשאני מוסיף תיאור זה לא נראה טוב ואין לי
// את היכולת לעצב את זה").
//
// The text is plain text in the DB; nothing here is HTML. What the admin
// types maps to:
//   - "- " or "• " at the start of a line   → a bullet with a hanging indent
//   - **text**                                → bold
//   - "label – rest" inside a bullet          → the label is bolded on its own
//     (works with –, - or : as the separator, label up to 40 chars)
//   - a short line that ends with ":" or " -"  → a bold lead-in line
//   - a blank line                            → paragraph spacing
// Everything else is left exactly as written. This is intentionally tiny and
// deterministic: it has to read the same in the card, on the public ?event=
// page and in the admin preview.

const LABEL_SEP = /^(.{2,40}?)\s([–-]|:)\s(.+)$/

function inline(text: string, keyPrefix: string): ReactNode[] {
  // **bold** only. No links, no nesting.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.filter(Boolean).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`} className="font-bold text-sand-800">{p.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${i}`}>{p}</span>
  )
}

function bulletContent(text: string, keyPrefix: string): ReactNode {
  if (text.includes('**')) return inline(text, keyPrefix)
  const m = text.match(LABEL_SEP)
  if (!m) return inline(text, keyPrefix)
  const [, label, sep, rest] = m
  return (
    <>
      <strong className="font-bold text-sand-800">{label}</strong>
      {sep === ':' ? ': ' : ' – '}
      {inline(rest, keyPrefix)}
    </>
  )
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }

function parse(text: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) { cur = null; continue }
    const bullet = line.match(/^(?:-|•|\*)\s+(.+)$/)
    if (bullet) {
      if (cur?.kind !== 'ul') { cur = { kind: 'ul', items: [] }; blocks.push(cur) }
      cur.items.push(bullet[1])
    } else {
      if (cur?.kind !== 'p') { cur = { kind: 'p', lines: [] }; blocks.push(cur) }
      cur.lines.push(line)
    }
  }
  return blocks
}

interface Props {
  text: string
  /** 'sm' for the compact card, 'md' for the public page / expanded card. */
  size?: 'sm' | 'md'
  className?: string
}

export default function EventDescription({ text, size = 'md', className = '' }: Props) {
  const blocks = parse(text)
  if (blocks.length === 0) return null
  const fs = size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  return (
    <div className={`${fs} text-sand-700 leading-relaxed space-y-2.5 ${className}`} dir="rtl">
      {blocks.map((b, bi) => {
        if (b.kind === 'ul') {
          return (
            <ul key={bi} className="space-y-1.5 pr-1">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className="text-mustard-500 flex-shrink-0 leading-relaxed select-none" aria-hidden>•</span>
                  <span className="min-w-0">{bulletContent(it, `${bi}-${ii}`)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={bi}>
            {b.lines.map((ln, li) => {
              const isLead = ln.length <= 60 && /(:|\s[-–])$/.test(ln) && !ln.includes('**')
              return (
                <span key={li} className={isLead ? 'font-bold text-sand-800' : undefined}>
                  {isLead ? ln : inline(ln, `${bi}-${li}`)}
                  {li < b.lines.length - 1 && <br />}
                </span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}
