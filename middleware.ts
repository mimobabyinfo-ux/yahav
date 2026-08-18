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

function previewFor(url: URL): Preview {
  const q = url.searchParams

  if (q.has('join')) {
    return {
      title: 'היומן של התינוק/ת · מימו',
      description: 'שיתפו איתך יומן במימו. שינה, האכלות וחיתולים — בזמן אמת, במקום אחד.',
    }
  }
  if (q.has('register') || q.has('offer')) {
    return {
      title: 'הרשמה לסדנאות מימו',
      description: 'הצטרפי לסדנאות מימו — מלווה אותך בצעדים הראשונים של האימהות.',
    }
  }
  if (q.has('course')) {
    return {
      title: 'הקורס הדיגיטלי של מימו',
      description: 'כל מה שחשוב לדעת בחודשים הראשונים, בקצב שלך, מתי שנוח לך.',
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
      description: 'יועצות הנקה, דולות, פיזיותרפיה ורצפת אגן — הצטרפו למאגר של מימו.',
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
      description: 'מבט מהיר על היום — שינה, האכלות וחיתולים.',
    }
  }
  if (q.has('thanks')) {
    return {
      title: 'תודה! · מימו',
      description: 'קיבלנו את ההרשמה שלך.',
    }
  }
  return {
    title: 'מימו — האפליקציה לאמהות טריות',
    description: 'יומן יומי לתינוק/ת, מפגשים וקהילה של אמהות. הכול במקום אחד.',
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function middleware(request: Request): Response {
  const ua = request.headers.get('user-agent') ?? ''
  // Everyone who is not a preview crawler passes straight through to the
  // static app. next() is the documented no-op for non-Next projects.
  if (!isPreviewCrawler(ua)) return next()

  const url = new URL(request.url)
  const { title, description, image } = previewFor(url)
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
