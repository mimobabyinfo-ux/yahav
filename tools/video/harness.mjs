import { chromium } from 'playwright'
import { db, SESSION, USER_ID, RPCS } from './data.mjs'

const CHROME = process.env.CHROME_PATH || undefined   // undefined = Playwright's own Chromium
const APP = process.env.APP_URL || 'http://127.0.0.1:5199/'
const SUPA_HOST = 'pkekucngirkjqigpmlrt.supabase.co'
const STORAGE_KEY = 'sb-pkekucngirkjqigpmlrt-auth-token'

// ── A very small PostgREST, in memory ────────────────────────────────────────
// Enough to make the real UI behave: filters the app actually sends, ordering,
// inserts that show up in the next read. Anything unknown returns [] and is
// logged, so a missing screen is loud instead of a white page.
const OPS = {
  eq: (a, b) => String(a) === b,
  neq: (a, b) => String(a) !== b,
  gt: (a, b) => a > b, gte: (a, b) => a >= b,
  lt: (a, b) => a < b, lte: (a, b) => a <= b,
  is: (a, b) => (b === 'null' ? a === null || a === undefined : String(a) === b),
  in: (a, b) => b.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(a)),
  like: (a, b) => String(a ?? '').includes(b.replace(/[*%]/g, '')),
  ilike: (a, b) => String(a ?? '').toLowerCase().includes(b.replace(/[*%]/g, '').toLowerCase()),
}

function applyQuery(rows, params) {
  let out = [...rows]
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue
    const m = raw.match(/^([a-z]+)\.(.*)$/s)
    if (!m) continue
    const [, op, val] = m
    const fn = OPS[op]
    if (!fn) continue
    out = out.filter(r => fn(r[key], val))
  }
  const order = params.get('order')
  if (order) {
    for (const clause of order.split(',').reverse()) {
      const [col, dir] = clause.split('.')
      out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1))
    }
  }
  const limit = params.get('limit')
  if (limit) out = out.slice(0, Number(limit))
  return out
}

const uid = () => 'demo-' + Math.random().toString(36).slice(2, 10)

export async function openApp({ record } = {}) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 854 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    ...(record ? { recordVideo: { dir: record, size: { width: 480, height: 854 } } } : {}),
  })

  await ctx.route(`**${SUPA_HOST}/**`, async route => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'access-control-allow-origin': '*' } })

    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })

    if (url.pathname.startsWith('/auth/v1')) {
      if (url.pathname.endsWith('/user')) return json(SESSION.user)
      if (url.pathname.endsWith('/logout')) return json({}, 204)
      return json(SESSION)
    }

    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop()
      if (!(fn in RPCS)) { console.log('  [mock] rpc?', fn); return json([]) }
      return json(RPCS[fn](req.postDataJSON?.() ?? {}))
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('?')[0]
      if (!db[table]) { console.log('  [mock] table?', table, method); db[table] = [] }
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const params = url.searchParams

      if (method === 'GET') {
        const rows = applyQuery(db[table], params)
        return json(single ? (rows[0] ?? null) : rows, single && !rows[0] ? 406 : 200)
      }
      if (method === 'POST') {
        const body = req.postDataJSON()
        const incoming = (Array.isArray(body) ? body : [body]).map(r => ({
          id: uid(), user_id: USER_ID, created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          feeding_details: [], sleep_details: [], diaper_details: [], ...r,
        }))
        db[table].push(...incoming)
        return json(single ? incoming[0] : incoming, 201)
      }
      if (method === 'PATCH') {
        const body = req.postDataJSON()
        const hit = applyQuery(db[table], params)
        hit.forEach(r => Object.assign(r, body))
        return json(single ? (hit[0] ?? null) : hit)
      }
      if (method === 'DELETE') {
        const hit = new Set(applyQuery(db[table], params).map(r => r.id))
        db[table] = db[table].filter(r => !hit.has(r.id))
        return json([], 204)
      }
    }

    if (url.pathname.startsWith('/storage/')) return json({ signedURL: '', publicUrl: '' })
    console.log('  [mock] unhandled', method, url.pathname)
    return json([])
  })

  // Everything else off-box (fonts, analytics) would hang on the blocked
  // egress; fail it fast so no frame waits on a spinner that cannot resolve.
  await ctx.route('**', route => {
    const u = route.request().url()
    if (u.includes(SUPA_HOST)) return route.fallback()   // hand back to the mock above
    if (u.startsWith('http://127.0.0.1')) return route.continue()
    return route.abort()
  })

  await ctx.addInitScript(([key, session]) => {
    localStorage.setItem(key, JSON.stringify({ currentSession: session, expiresAt: session.expires_at }))
    localStorage.setItem(key, JSON.stringify(session))
  }, [STORAGE_KEY, SESSION])

  // A curtain in the app's own sand colour, painted before the first byte
  // renders. The clip opens on the title card, never on a loading spinner.
  await ctx.addInitScript(() => {
    const paint = () => {
      let c = document.getElementById('film-curtain')
      if (!c) {
        c = document.createElement('div')
        c.id = 'film-curtain'
        c.style.cssText = 'position:fixed;inset:0;background:#F6ECD8;z-index:2147483050;pointer-events:none'
      }
      // Re-home it into <body> once that exists: a node parked on <html>
      // during parsing does not reliably paint.
      const host = document.body || document.documentElement
      if (c.parentElement !== host) host.appendChild(c)
    }
    paint()
    document.addEventListener('readystatechange', paint)
    document.addEventListener('DOMContentLoaded', paint)
    const iv = setInterval(() => {
      if (!document.getElementById('film-curtain')) return clearInterval(iv)
      paint()
    }, 100)
  })

  const page = await ctx.newPage()
  page.on('console', m => m.type() === 'error' && console.log('  [page]', m.text().slice(0, 140)))
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(600)   // just enough for <body>; the curtain hides the rest
  return { browser, ctx, page }
}
