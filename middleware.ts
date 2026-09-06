// Link previews that match the link.
//
// Brenda 18.8.26: "every time I send a link it looks like the screenshot,
// with no relation to the specific link — whether it's a journal share, a
// registration link or just the app. I'd like the preview to match what
// was sent."
//
// The cause: this is a single-page app. index.html is one static file with
// one set of Open Graph tags, so WhatsApp — which never runs JavaScript,
// it fetches the HTML and reads the <meta> tags — showed the same card for
// every URL. Nothing React does at runtime can change that; the tags have
// to differ in the HTML that comes off the server.
//
// So: Vercel Edge Middleware sits in front of the site and, ONLY for the
// crawlers that generate link previews, answers with a tiny HTML document
// carrying the right title, description and image. Real visitors fall
// straight through to the app, untouched — no rewrite, no redirect, no
// change to routing. If this file ever fails to build, the deploy fails
// loudly rather than serving a broken site.
//
// The bot document deliberately does NOT redirect. An earlier draft put a
// meta refresh in it pointing at the same URL, which would have turned any
// false positive into an infinite reload — the middleware would answer the
// refresh with the same document, forever. It is a plain page with a link
// instead, so the worst a misdetected human sees is one tap.

import { next } from '@vercel/functions'

export const config = {
  // Every link the app hands out is the root plus a query string.
  matcher: '/',
}

// Preview crawlers only. Search engines are deliberately absent: they
// should render the real app, and serving them a stub would be cloaking.
//
// WhatsApp is handled separately and anchored. Its crawler sends a bare
// "WhatsApp/2.24.9 A" with no Mozilla prefix, but its Android in-app
// browser appends the same token to an ordinary WebView UA — an
// unanchored match there would hand a real mother the stub instead of
// the app, and WhatsApp is where most of this app's traffic starts.
const CRAWLER = /(facebookexternalhit|Twitterbot|Slackbot|TelegramBot|Discordbot|LinkedInBot|Applebot|SkypeUriPreview|Iframely|vkShare|redditbot|Pinterest)/i
const WHATSAPP_CRAWLER = /^WhatsApp\//i

function isPreviewCrawler(ua: string): boolean {
  if (WHATSAPP_CRAWLER.test(ua.trim())) return true
  // Anything carrying a browser engine token is a person, not a crawler.
  if (/Mozilla\/|Gecko\)/.test(ua) && !CRAWLER.test(ua)) return false
  return CRAWLER.test(ua)
}

type Preview = { title: string; description: string; image?: string }

const IMAGE_APP = '/mimo_logo.png'

// Brand rule (Brenda, 6.9.26): no em dashes anywhere a mother reads.
// Titles join with a middle dot or a plain comma instead.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Product name for a link that carries a workshop id (?register=, ?course=,
// ?gift=, ?giftcard=). One REST call against Supabase with the anon key,
// bounded to 1.5s so a slow database can never stall a preview; any
// failure (no env, RLS hides the row, timeout) just means the generic
// title. The anon policy exposes only active, publicly registrable
// products, which is exactly the set Brenda sends links to.
async function workshopTitle(id: string | null): Promise<string | null> {
  if (!id || !UUID.test(id)) return null
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) return null
  try {
    const r = await fetch(
      `${base}/rest/v1/workshops?id=eq.${id}&select=title`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1500) },
    )
    if (!r.ok) return null
    const rows = (await r.json()) as { title?: string }[]
    const t = rows[0]?.title?.trim()
    return t ? t : null
  } catch {
    return null
  }
}

async function previewFor(url: URL): Promise<Preview> {
  const q = url.searchParams

  if (q.has('join')) {
    return {
      title: 'היומן של התינוק/ת · מימו',
      description: 'שיתפו איתך יומן במימו. שינה, האכלות וחיתולים בזמן אמת, במקום אחד.',
    }
  }
  if (q.has('register')) {
    const t = await workshopTitle(q.get('register'))
    return {
      title: t ? `הרשמה ל${t} · מימו` : 'הרשמה לסדנאות מימו',
      description: t
        ? `הצטרפי ל${t}. כמה פרטים קצרים, ואנחנו איתך.`
        : 'הצטרפי לסדנאות מימו, מלווה אותך בצעדים הראשונים של האימהות.',
    }
  }
  if (q.has('offer')) {
    return {
      title: 'הצעה מיוחדת בשבילך · מימו',
      description: 'הצטרפי לסדנאות מימו, מלווה אותך בצעדים הראשונים של האימהות.',
    }
  }
  if (q.has('course')) {
    const t = await workshopTitle(q.get('course'))
    return {
      title: t ? `${t} · מימו` : 'הקורס הדיגיטלי של מימו',
      description: 'כל מה שחשוב לדעת בחודשים הראשונים, בקצב שלך, מתי שנוח לך.',
    }
  }
  if (q.has('gift') || q.has('giftcard')) {
    const t = await workshopTitle(q.get('gift') ?? q.get('giftcard'))
    return {
      title: t ? `גיפט קארד ל${t} · מימו` : 'גיפט קארד של מימו',
      description: 'מתנה לאמא, מהלב. בוחרים, ומימו כבר דואגת לשאר.',
    }
  }
  if (q.has('welcome')) {
    return {
      title: 'ברוכה הבאה למימו',
      description: 'התשלום התקבל. הקישור הזה מכניס אותך ישר לאפליקציה.',
    }
  }
  if (q.has('legal')) {
    return {
      title: 'המסמכים של מימו',
      description: 'תנאי שימוש, מדיניות פרטיות והסכמה, בשפה פשוטה.',
    }
  }
  if (q.has('form')) {
    return {
      title: 'שאלון מימו',
      description: 'כמה שאלות קצרות, כדי שנוכל להתאים לך את הליווי.',
    }
  }
  if (q.has('partner')) {
    return {
      title: 'מימו לאנשי מקצוע',
      description: 'יועצות הנקה, דולות, פיזיותרפיה ורצפת אגן: הצטרפו למאגר של מימו.',
    }
  }
  if (q.has('checkin')) {
    return {
      title: 'צ׳ק־אין למפגש מימו',
      description: 'רשימת המשתתפות של המפגש, לסימון בכניסה.',
    }
  }
  if (q.has('baby')) {
    return {
      title: 'היום של התינוק/ת · מימו',
      description: 'מבט מהיר על היום: שינה, האכלות וחיתולים.',
    }
  }
  if (q.has('thanks')) {
    return {
      title: 'תודה! · מימו',
      description: 'קיבלנו את ההרשמה שלך.',
    }
  }
  return {
    title: 'מימו · האפליקציה לאמהות טריות',
    description: 'יומן יומי לתינוק/ת, מפגשים וקהילה של אמהות. הכול במקום אחד.',
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default async function middleware(request: Request): Promise<Response> {
  const ua = request.headers.get('user-agent') ?? ''
  // Everyone who is not a preview crawler passes straight through to the
  // static app. next() is the documented no-op for non-Next projects.
  if (!isPreviewCrawler(ua)) return next()

  const url = new URL(request.url)
  const { title, description, image } = await previewFor(url)
  const absoluteImage = new URL(image ?? IMAGE_APP, url.origin).toString()
  const canonical = url.toString()

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="מימו">
<meta property="og:locale" content="he_IL">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(absoluteImage)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(absoluteImage)}">
<meta name="robots" content="noindex">
</head>
<body><p><a href="${esc(canonical)}">${esc(title)}</a></p></body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Previews are cached hard by WhatsApp anyway; keep our own short so
      // a copy fix shows up on the next share rather than next week.
      'cache-control': 'public, max-age=300',
    },
  })
}
