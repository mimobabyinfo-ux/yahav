// Rename the baby in the screenshots.
//
//   CHROME_PATH=... node rename-baby.mjs [--check]
//
// The screenshots came off Yahav's phone, so the only way to change a name in
// them is to paint over it. Two things make that survivable: the app draws
// these labels on a flat background, so a filled rectangle is invisible; and
// the replacement is measured against the original rather than eyeballed —
// the script renders the new word, reads back where its ink actually landed,
// and nudges until the right edge and the letter tops line up with what it
// replaced. Rubik is the closest match on hand to the phone's Hebrew.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const FONTS = process.env.RUBIK_DIR ||
  '/tmp/claude-0/-home-user-yahav/d13d82ac-3cda-5fdb-be99-da08f5f67f77/scratchpad/node_modules/@fontsource/rubik/files'
const WEIGHTS = [300, 400, 500, 600, 700]

// `roi` is where to look for the old text, `align` how to place the new one in
// the space the old one occupied.
const PATCHES = [
  { file: 'shots/bait/08.jpg',  text: 'ריו אדמון', roi: [560, 214, 930, 284], align: 'right',  pad: 6 },
  { file: 'shots/bait/08.jpg',  text: 'מתאים בדיוק לגיל של ריו', roi: [380, 1078, 730, 1120], align: 'right', pad: 5 },
  // The chip has a tick to its left and an emoji to its right, so the window
  // used to read the ink back has to stay clear of both.
  { file: 'shots/yoman/15.jpg', text: 'ריו אדמון', roi: [693, 328, 838, 370], align: 'centre', pad: 4, probe: [6, 8] },
]

const uri = f => 'data:image/jpeg;base64,' + readFileSync(resolve(dir, f)).toString('base64')
const fontUri = w => 'data:font/woff2;base64,' +
  readFileSync(`${FONTS}/rubik-hebrew-${w}-normal.woff2`).toString('base64')
const faces = WEIGHTS.map(w => `@font-face{font-family:"R${w}";src:url("${fontUri(w)}")}`).join('')

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 946, height: 2048 } })
const page = await ctx.newPage()

// Ink bounding box and the two colours in a region: the darkest pixel is the
// letters, the most common one is the background behind them.
const inspect = async (src, roi) => page.evaluate(async ([src, roi]) => {
  const im = new Image(); im.src = src; await im.decode()
  const c = document.createElement('canvas')
  c.width = im.naturalWidth; c.height = im.naturalHeight
  const g = c.getContext('2d'); g.drawImage(im, 0, 0)
  const [x0, y0, x1, y1] = roi
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data
  const lum = i => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  let lo = 255, tally = new Map()
  for (let i = 0; i < d.length; i += 4) {
    lo = Math.min(lo, lum(i))
    const k = `${d[i]},${d[i + 1]},${d[i + 2]}`
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  // Anything within a third of the way from darkest to lightest counts as ink.
  const cut = lo + 70
  let L = 1e9, R = -1, T = 1e9, B = -1, ink = [0, 0, 0]
  for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < x1 - x0; x++) {
    const i = (y * (x1 - x0) + x) * 4
    if (lum(i) < cut) {
      if (x < L) L = x; if (x > R) R = x
      if (y < T) T = y; if (y > B) B = y
      if (lum(i) === lo) ink = [d[i], d[i + 1], d[i + 2]]
    }
  }
  // How much of the box the strokes actually fill. This is what tells a
  // regular weight from a bold one, without anybody squinting at it.
  let dark = 0
  for (let y = T; y <= B; y++) for (let x = L; x <= R; x++) {
    if (lum((y * (x1 - x0) + x) * 4) < cut) dark++
  }
  const bg = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  const hex = c2 => '#' + c2.map(v => v.toString(16).padStart(2, '0')).join('')
  return { l: x0 + L, r: x0 + R, t: y0 + T, b: y0 + B, w: R - L + 1, h: B - T + 1,
           density: dark / ((R - L + 1) * (B - T + 1)), ink: hex(ink), bg: hex(bg) }
}, [src, roi])

const shot = async (src, patches) => {
  await page.setContent(`<html dir="rtl"><head><style>
    ${faces}
    * { margin: 0; padding: 0 }
    body { width: 946px; height: 2048px; overflow: hidden; position: relative; }
    img { position: absolute; inset: 0; width: 946px; height: 2048px; }
    .fill { position: absolute; }
    .txt { position: absolute; white-space: nowrap; line-height: 1; }
  </style></head><body>
    <img src="${src}">
    ${patches.map(p => `<div class="fill" style="left:${p.fill.x}px;top:${p.fill.y}px;width:${p.fill.w}px;height:${p.fill.h}px;background:${p.bg}"></div>`).join('')}
    ${patches.map((p, i) => `<div class="txt" id="t${i}" style="left:${p.tx}px;top:${p.ty}px;font-size:${p.size}px;color:${p.ink};font-family:R${p.weight}">${p.text}</div>`).join('')}
  </body></html>`)
  await page.evaluate(() => document.fonts.ready)
  return page.screenshot({ type: 'jpeg', quality: 96 })
}

const byFile = new Map()
for (const p of PATCHES) (byFile.get(p.file) ?? byFile.set(p.file, []).get(p.file)).push(p)

for (const [file, patches] of byFile) {
  const original = resolve(dir, file + '.orig')
  if (!existsSync(original)) copyFileSync(resolve(dir, file), original)
  let src = uri(file + '.orig')

  for (const p of patches) {
    p.target = await inspect(src, p.roi)
    p.ink = p.target.ink
    p.bg = p.target.bg
    p.fill = { x: p.target.l - p.pad, y: p.target.t - p.pad, w: p.target.w + p.pad * 2, h: p.target.h + p.pad * 2 }
    p.size = Math.round(p.target.h * 1.15)   // a starting guess; corrected below
    p.tx = p.target.l; p.ty = p.target.t
    p.weight = 400
  }

  // Pick each weight by how much ink the original strokes lay down. Rendering
  // one patch on its own keeps the reading clean.
  const probeOf = p => {
    const [mx, my] = p.probe ?? [30, 14]
    return [p.fill.x - mx, p.fill.y - my, p.fill.x + p.fill.w + mx, p.fill.y + p.fill.h + my]
  }
  for (const p of patches) {
    const tried = []
    for (const w of WEIGHTS) {
      const probe = { ...p, weight: w, size: p.size, tx: p.tx, ty: p.ty }
      for (let i = 0; i < 2; i++) {
        const b = await shot(src, [probe])
        const got = await inspect('data:image/jpeg;base64,' + b.toString('base64'), probeOf(probe))
        probe.size = Math.max(6, Math.round(probe.size * (p.target.h / got.h)))
      }
      const b = await shot(src, [probe])
      const got = await inspect('data:image/jpeg;base64,' + b.toString('base64'), probeOf(probe))
      tried.push({ w, d: got.density })
    }
    const best = tried.reduce((a, b) =>
      Math.abs(b.d - p.target.density) < Math.abs(a.d - p.target.density) ? b : a)
    p.weight = best.w
    console.log(`   "${p.text.slice(0, 18)}" ink density ${p.target.density.toFixed(3)} -> Rubik ${best.w}` +
      `  (${tried.map(t => t.w + ':' + t.d.toFixed(3)).join(' ')})`)
  }

  // Render, read back where the ink actually landed, correct. Two passes: one
  // for size, one for position.
  for (let pass = 0; pass < 4; pass++) {
    const buf = await shot(src, patches)
    const png = 'data:image/jpeg;base64,' + buf.toString('base64')
    for (const p of patches) {
      const [mx, my] = p.probe ?? [30, 14]
      const wide = [p.fill.x - mx, p.fill.y - my, p.fill.x + p.fill.w + mx, p.fill.y + p.fill.h + my]
      const got = await inspect(png, wide)
      if (pass < 2) {
        p.size = Math.max(6, Math.round(p.size * (p.target.h / got.h)))
      } else {
        p.ty += p.target.t - got.t
        p.tx += p.align === 'right'
          ? p.target.r - got.r
          : Math.round((p.target.l + p.target.r) / 2 - (got.l + got.r) / 2)
      }
    }
  }

  const buf = await shot(src, patches)
  writeFileSync(resolve(dir, file), buf)
  for (const p of patches) {
    console.log(`${file}  "${p.text}"  size ${p.size}px  ink ${p.ink}  on ${p.bg}`)
  }

  // Prove it: the new ink must sit where the old ink sat.
  const after = uri(file)
  for (const p of patches) {
    const [mx, my] = p.probe ?? [30, 14]
    const got = await inspect(after, [p.fill.x - mx, p.fill.y - my, p.fill.x + p.fill.w + mx, p.fill.y + p.fill.h + my])
    const dr = p.align === 'right' ? got.r - p.target.r : Math.round((got.l + got.r) / 2 - (p.target.l + p.target.r) / 2)
    console.log(`   top off by ${got.t - p.target.t}px, ${p.align} edge off by ${dr}px, height ${got.h} vs ${p.target.h}`)
  }
}

await browser.close()
