// Build the clip from stills instead of filming the page.
//
// Screen recording cost us the timeline: Playwright's capture came out about
// 14% longer than the show it recorded, so every sentence drifted off its
// slide. Here each state is a PNG and ffmpeg lays them end to end with exact
// durations, so the timeline is arithmetic, not a measurement.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve, join } from 'node:path'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const CHROME = process.env.CHROME_PATH || undefined
const FADE = 0.28          // seconds of cross-dissolve
const CARD_IN = 3.2        // opening card
const CARD_OUT = 3.0       // closing card
const FPS = 30

const deckPath = process.argv[2]
if (!deckPath) { console.error('usage: node assemble.mjs deck-yoman.json'); process.exit(1) }
const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
const dir = resolve(dirname(deckPath))
const OUT = process.env.OUT_DIR || resolve(dir, 'out')
const STILLS = join(OUT, deck.slug + '-stills')
mkdirSync(STILLS, { recursive: true })

const brand = {
  logo: deck.brand?.logo ?? 'brand/logo.png',
  hebrew: deck.brand?.hebrew ?? 'brand/gveret-levin.woff2',
  latin: deck.brand?.latin ?? 'brand/coustard.woff2',
}
const has = f => { try { return statSync(resolve(dir, f)).isFile() } catch { return false } }

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  ${has(brand.hebrew) ? `@font-face { font-family: "Mimo He"; src: url("${brand.hebrew}") format("woff2"); }` : ''}
  ${has(brand.latin) ? `@font-face { font-family: "Mimo La"; src: url("${brand.latin}") format("woff2"); }` : ''}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px; overflow: hidden;
    background: radial-gradient(120% 90% at 50% 12%, #EFE7DA 0%, #DCD4C8 62%, #CFC5B5 100%);
    font-family: "Nunito", "Arial Hebrew", "DejaVu Sans", sans-serif;
  }
  #head {
    position: absolute; top: 0; left: 0; right: 0; height: 118px; z-index: 4;
    display: flex; align-items: center; justify-content: center; gap: 16px;
  }
  #head img { height: 54px; }
  #head .page { font-size: 32px; font-weight: 800; color: #6E6C56; }
  #shot { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 34px; }
  #frame { position: relative; height: 1596px; border-radius: 30px; overflow: hidden; box-shadow: 0 20px 60px rgba(74,58,40,.32); background: #fff; }
  #frame img { display: block; height: 100%; width: auto; }
  /* Spotlight: the screen goes soft and dim, and the one thing being talked
     about stays sharp inside a lens cut out of the same picture. */
  #base.dim { filter: blur(9px) brightness(.55) saturate(.75); }
  #lens {
    display: none; position: absolute; overflow: hidden; border-radius: 18px;
    box-shadow: 0 0 0 5px #E7A33D, 0 0 0 12px rgba(231,163,61,.28), 0 18px 44px rgba(0,0,0,.4);
  }
  #lens.on { display: block; }
  #lens img { position: absolute; height: 1596px; width: auto; max-width: none; }
  #cap {
    position: absolute; left: 44px; right: 44px; bottom: 56px; margin: 0 auto; width: fit-content;
    max-width: 992px; background: rgba(28,21,15,.93); color: #fff; border-radius: 28px;
    padding: 24px 38px; font-size: 42px; line-height: 1.32; font-weight: 800; text-align: center;
    box-shadow: 0 16px 44px rgba(0,0,0,.4);
  }
  #card {
    position: fixed; inset: 0; background: #F4EFE6; z-index: 9;
    display: none; flex-direction: column; align-items: center; justify-content: center; gap: 30px;
  }
  #card.on { display: flex; }
  #card .logo { width: 560px; margin-bottom: 18px; }
  #card .t { font-family: "Mimo He", "Nunito", sans-serif; font-size: 126px; color: #A35C3D; line-height: 1; }
  #card .rule { width: 132px; height: 7px; border-radius: 7px; background: #E7C78A; }
  #card .s { font-size: 44px; font-weight: 700; color: #818267; text-align: center; max-width: 860px; line-height: 1.4; }
</style></head><body>
<div id="head">${has(brand.logo) ? `<img src="${brand.logo}" alt="">` : ''}<span class="page"></span></div>
<div id="shot"><div id="frame"><img id="base" alt=""><div id="lens"><img id="lenspic" alt=""></div></div></div>
<div id="cap"></div>
<div id="card">${has(brand.logo) ? `<img class="logo" src="${brand.logo}" alt="">` : ''}<div class="t"></div><div class="rule"></div><div class="s"></div></div>
</body></html>`

writeFileSync(resolve(dir, '_still.html'), html)

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage()
await page.goto('file://' + resolve(dir, '_still.html'))
await page.waitForTimeout(400)
await page.evaluate(p => { document.querySelector('#head .page').textContent = p }, deck.page)

const shot = (name) => page.screenshot({ path: join(STILLS, name) })

await page.evaluate(([t, s]) => {
  document.querySelector('#card .t').textContent = t
  document.querySelector('#card .s').textContent = s
  document.getElementById('card').classList.add('on')
}, [deck.title, deck.subtitle])
await page.waitForTimeout(250)
await shot('card-in.png')

await page.evaluate(() => document.getElementById('card').classList.remove('on'))

// A slide can be two pictures: an optional `pre` (where to tap) and then the
// screen it opens. Both carry the same sentence.
const frames = []
for (let i = 0; i < deck.slides.length; i++) {
  const s = deck.slides[i]
  const hold = s.hold ?? deck.hold ?? 3200
  const steps = []
  if (s.pre) steps.push({ img: s.pre.img, focus: s.pre.focus, dur: Math.min(s.pre.ms ?? 1600, hold - 800) })
  steps.push({ img: s.img, focus: s.focus, dur: hold - (steps[0]?.dur ?? 0) })
  for (let k = 0; k < steps.length; k++) {
    const st = steps[k]
    await page.evaluate(async ([img, cap, focus]) => {
      const base = document.getElementById('base')
      const lens = document.getElementById('lens')
      const lensPic = document.getElementById('lenspic')
      await new Promise(res => { base.onload = res; base.onerror = res; base.src = img })
      document.getElementById('cap').textContent = cap
      if (!focus) {
        base.classList.remove('dim')
        lens.classList.remove('on')
        return
      }
      // The lens holds a second copy of the picture, shifted so the chosen
      // region shows through at its natural size.
      const w = base.clientWidth, h = base.clientHeight
      lensPic.src = img
      lens.style.left = (focus.x * w) + 'px'
      lens.style.top = (focus.y * h) + 'px'
      lens.style.width = (focus.w * w) + 'px'
      lens.style.height = (focus.h * h) + 'px'
      lensPic.style.left = (-focus.x * w) + 'px'
      lensPic.style.top = (-focus.y * h) + 'px'
      base.classList.add('dim')
      lens.classList.add('on')
      await new Promise(res => { lensPic.complete ? res() : (lensPic.onload = res) })
    }, [st.img, s.cap, st.focus ?? null])
    await page.waitForTimeout(140)
    const name = `s${String(i + 1).padStart(2, '0')}${steps.length > 1 ? String.fromCharCode(97 + k) : ''}.png`
    await shot(name)
    frames.push({ file: name, dur: st.dur / 1000, slide: i, first: k === 0 })
  }
}

await page.evaluate(([t, s]) => {
  document.querySelector('#card .t').textContent = t
  document.querySelector('#card .s').textContent = s
  document.getElementById('card').classList.add('on')
}, [deck.endTitle ?? 'מימו', deck.endSubtitle ?? ''])
await page.waitForTimeout(250)
await shot('card-out.png')
await browser.close()

// ── ffmpeg: stills → clip ────────────────────────────────────────────────────
const segs = [
  { file: 'card-in.png', dur: CARD_IN, drift: false },
  ...frames.map(f => ({ ...f, drift: true })),
  { file: 'card-out.png', dur: CARD_OUT, drift: false },
]

const args = ['-y']
segs.forEach(s => args.push('-loop', '1', '-t', s.dur.toFixed(3), '-i', join(STILLS, s.file)))

const parts = []
segs.forEach((s, i) => {
  // A held still reads as a stuck video, so each slide creeps by 3.5%,
  // alternating direction. The cards stay put.
  const frames = Math.max(2, Math.round(s.dur * FPS))
  parts.push(s.drift
    ? `[${i}:v]scale=2160:-2,zoompan=z='${i % 2 ? 1.035 : 1}${i % 2 ? '-' : '+'}0.035*on/${frames}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS},setsar=1[v${i}]`
    : `[${i}:v]scale=1080:1920,fps=${FPS},setsar=1[v${i}]`)
})

// Cross-dissolve the whole chain, and note where each segment lands.
const starts = []
let acc = 0
let last = 'v0'
starts.push(0)
for (let i = 1; i < segs.length; i++) {
  acc += segs[i - 1].dur - FADE
  starts.push(acc)
  const out = i === segs.length - 1 ? 'vout' : `x${i}`
  parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${acc.toFixed(3)}[${out}]`)
  last = out
}

args.push('-filter_complex', parts.join(';'), '-map', '[vout]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', String(FPS), join(OUT, deck.slug + '.mp4'))

const r = spawnSync(FFMPEG, args, { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stderr.split('\n').slice(-14).join('\n'))
  process.exit(1)
}

// Slide n is fully on screen once its dissolve finishes; that is where its
// sentence belongs. Written out for narrate.mjs so nothing has to be guessed.
// A sentence starts when its slide's FIRST picture lands, which is the `pre`
// when there is one.
const timings = {
  slug: deck.slug,
  fade: FADE,
  slides: deck.slides.map((s, i) => {
    const segIdx = 1 + frames.findIndex(f => f.slide === i && f.first)
    return {
      cap: s.cap,
      startMs: Math.round((starts[segIdx] + FADE) * 1000),
      holdMs: s.hold ?? deck.hold ?? 3200,
    }
  }),
}
writeFileSync(join(OUT, deck.slug + '-timings.json'), JSON.stringify(timings, null, 2) + '\n')
console.log(`${deck.slug}.mp4  ${(starts[starts.length - 1] + segs[segs.length - 1].dur).toFixed(1)}s`)
