import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// A deck is a page name, a subtitle, and an ordered list of {img, cap}.
// Nothing here knows about the app: it takes Yahav's own screenshots and
// puts one caption under each, with a fade between them.
const deckPath = process.argv[2]
const deck = JSON.parse(await import('node:fs').then(fs => fs.promises.readFile(deckPath, 'utf8')))
const dir = resolve(dirname(deckPath))
const OUT = resolve(dir, 'out')
mkdirSync(OUT, { recursive: true })

const HOLD = deck.hold ?? 3200      // ms a slide stays up
const FADE = 240                    // ms cross-fade, short on purpose

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px; overflow: hidden; background: #F5F1EB;
    font-family: "Nunito", "Arial Hebrew", "DejaVu Sans", sans-serif;
  }
  #head {
    position: absolute; top: 0; left: 0; right: 0; height: 118px; z-index: 4;
    display: flex; align-items: center; justify-content: center;
    gap: 18px; opacity: 0; transition: opacity .4s;
    background: linear-gradient(#F5F1EBEE, #F5F1EB00);
  }
  #head.on { opacity: 1; }
  #head .name { font-size: 38px; font-weight: 900; color: #4A3A28; }
  #head .dot { width: 10px; height: 10px; border-radius: 50%; background: #E7C78A; }
  #head .page { font-size: 32px; font-weight: 800; color: #A98B62; }
  #stage { position: absolute; inset: 0; }
  .shot {
    position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center;
    padding-top: 34px; opacity: 0; transform: translateX(-54px);
    transition: opacity ${FADE}ms cubic-bezier(.4,0,.2,1), transform ${FADE}ms cubic-bezier(.4,0,.2,1);
  }
  .shot.on { opacity: 1; transform: translateX(0); }
  .shot.out { opacity: 0; transform: translateX(46px); }
  .shot .bg {
    position: absolute; inset: -60px; background-size: cover; background-position: center;
    filter: blur(46px) brightness(.72) saturate(.9);
  }
  .frame {
    position: relative; height: 1596px; border-radius: 30px; overflow: hidden;
    box-shadow: 0 20px 70px rgba(0,0,0,.35); background: #fff;
  }
  .frame img { display: block; height: 100%; width: auto; }
  #capwrap {
    position: absolute; left: 0; right: 0; bottom: 56px; z-index: 5;
    display: flex; justify-content: center; padding: 0 44px;
  }
  #cap {
    background: rgba(28,21,15,.93); color: #fff; border-radius: 28px; padding: 24px 38px;
    font-size: 42px; line-height: 1.32; font-weight: 800; text-align: center;
    box-shadow: 0 16px 44px rgba(0,0,0,.4); opacity: 0; transform: translateY(16px);
    transition: opacity .26s ease, transform .26s ease; max-width: 992px;
  }
  #cap.on { opacity: 1; transform: translateY(0); }
  #card {
    position: fixed; inset: 0; background: #F6ECD8; z-index: 9;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px;
    opacity: 1; transition: opacity .5s ease;
  }
  #card.off { opacity: 0; }
  #card .t { font-size: 108px; font-weight: 900; color: #4A3A28; }
  #card .rule { width: 120px; height: 7px; border-radius: 7px; background: #E7C78A; }
  #card .s { font-size: 44px; font-weight: 700; color: #7B604C; text-align: center; max-width: 840px; line-height: 1.4; }
</style></head><body>
<div id="head"><span class="name">מימו</span><span class="dot"></span><span class="page"></span></div>
<div id="stage"></div>
<div id="capwrap"><div id="cap"></div></div>
<div id="card"><div class="t"></div><div class="rule"></div><div class="s"></div></div>
</body></html>`

writeFileSync(resolve(dir, '_deck.html'), html)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } },
})
const page = await ctx.newPage()
await page.goto('file://' + resolve(dir, '_deck.html'))
await page.waitForTimeout(500)

const wait = ms => page.waitForTimeout(ms)

// Preload every shot so a fade never reveals a half-decoded image.
await page.evaluate(async ([slides, pageName]) => {
  document.querySelector('#head .page').textContent = pageName
  const stage = document.getElementById('stage')
  await Promise.all(slides.map(s => new Promise(res => {
    const wrap = document.createElement('div')
    wrap.className = 'shot'
    const bg = document.createElement('div')
    bg.className = 'bg'
    bg.style.backgroundImage = `url("${s.img}")`
    const frame = document.createElement('div')
    frame.className = 'frame'
    const im = new Image()
    im.onload = res; im.onerror = res
    im.src = s.img
    frame.appendChild(im)
    wrap.appendChild(bg)
    wrap.appendChild(frame)
    stage.appendChild(wrap)
  })))
}, [deck.slides, deck.page])

// ── opening card ─────────────────────────────────────────────────────────────
await page.evaluate(([t, s]) => {
  document.querySelector('#card .t').textContent = t
  document.querySelector('#card .s').textContent = s
}, [deck.title, deck.subtitle])
await wait(2600)
await page.evaluate(() => {
  document.getElementById('card').classList.add('off')
  document.getElementById('head').classList.add('on')
})
await wait(600)

// ── the shots ────────────────────────────────────────────────────────────────
for (let i = 0; i < deck.slides.length; i++) {
  // A slide can carry its own hold (set by timing.mjs from the narration),
  // otherwise the deck's default applies.
  const hold = deck.slides[i].hold ?? HOLD
  await page.evaluate(([i, cap, hold]) => {
    const shots = document.querySelectorAll('.shot')
    shots.forEach((el, k) => {
      if (k === i) { el.classList.remove('out'); el.classList.add('on') }
      else if (el.classList.contains('on')) { el.classList.remove('on'); el.classList.add('out') }
    })
    // A still frame reads as a stuck video, so a shot keeps drifting for as
    // long as it is up. The direction alternates, so the motion never pulses.
    const frame = shots[i].querySelector('.frame')
    const inward = i % 2 === 0
    frame.getAnimations().forEach(a => a.cancel())
    frame.animate(
      [{ transform: `scale(${inward ? 1 : 1.035})` }, { transform: `scale(${inward ? 1.035 : 1})` }],
      { duration: hold + 500, easing: 'linear', fill: 'forwards' },
    )
    const c = document.getElementById('cap')
    c.classList.remove('on')
    setTimeout(() => { c.textContent = cap; c.classList.add('on') }, 150)
  }, [i, deck.slides[i].cap, hold])
  await wait(hold)
}

// ── closing card ─────────────────────────────────────────────────────────────
await page.evaluate(([t, s]) => {
  document.querySelector('#card .t').textContent = t
  document.querySelector('#card .s').textContent = s
  document.getElementById('card').classList.remove('off')
}, [deck.endTitle ?? 'מימו', deck.endSubtitle ?? ''])
await wait(2800)

await page.close(); await ctx.close(); await browser.close()
const raw = resolve(OUT, deck.slug + '-raw.webm')
const produced = await page.video().path()
renameSync(produced, raw)
console.log('RAW', raw)
