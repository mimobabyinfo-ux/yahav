// Stills for Instagram stories: the app's pages side by side, the way an app
// store shows a gallery. Same palette, fonts and phone frames as the videos,
// so a story and a clip read as the same brand.
//
//   CHROME_PATH=... node story.mjs [out-dir]
//
// Four files come out of one run — three pages or all four, each with and
// without the question:
//   -ask    asks a question and leaves the bottom third empty, because that is
//           where the questions sticker goes and anything drawn there would
//           end up underneath it.
//   -plain  just names the app. Nothing is going to cover the lower half, so
//           the whole block sits lower and the frame reads balanced on its own.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { writeFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] || dir
const has = f => { try { return statSync(resolve(dir, f)).isFile() } catch { return false } }

// The opening screen of each video. Each one shows its page with its own tab
// lit in the bottom bar, which is what makes them read as one app.
const PAGE = {
  bait:     { img: 'shots/bait/08.jpg',     name: 'בית',    line: 'הכל במקום אחד' },
  yoman:    { img: 'shots/yoman/15.jpg',    name: 'יומן',   line: 'האכלות, שינה וחיתולים' },
  kehila:   { img: 'shots/kehila/13.jpg',   name: 'קהילה',  line: 'מפגשים והרשמה' },
  mutzarim: { img: 'shots/mutzarim/03.jpg', name: 'מוצרים', line: 'סדנאות ומוצרים' },
}

// How a row is built: each phone's width, how far down it sits, and who
// overlaps whom. `lap` is how much each neighbouring pair overlaps, split
// evenly across the boundary — the labels reuse the very same boxes, so every
// label is centred on its phone by construction rather than by eye.
const ROWS = {
  // Three pages: home in the middle, forward and a little higher, so it is the
  // screen the eye lands on.
  three: {
    order: ['yoman', 'bait', 'kehila'],
    w: [322, 396, 322], rise: [96, 0, 96], z: [1, 2, 1], lap: 52,
    name: 58, line: 27,
    geo: { header: 100, gallery: 425, labels: 1305, ask: 1450 },
  },
  // Four pages: there is no true middle, so the row is symmetric and follows
  // the app's own tab order. The inner two stand forward to keep some depth.
  four: {
    order: ['bait', 'yoman', 'kehila', 'mutzarim'],
    w: [256, 312, 312, 256], rise: [70, 0, 0, 70], z: [1, 2, 2, 1], lap: 44,
    name: 50, line: 23,
    geo: { header: 200, gallery: 521, labels: 1266, ask: 1420 },
  },
}

const VARIANTS = [
  { slug: '3-ask',   row: 'three', h1: 'מה יש באפליקציה?', ask: 'יש לך שאלה על האפליקציה?', drop: 0 },
  { slug: '3-plain', row: 'three', h1: 'אפליקציית מימו',   ask: null,                        drop: 90 },
  { slug: '4-ask',   row: 'four',  h1: 'מה יש באפליקציה?', ask: 'יש לך שאלה על האפליקציה?', drop: 0 },
  { slug: '4-plain', row: 'four',  h1: 'אפליקציית מימו',   ask: null,                        drop: 200 },
]

// Half the overlap on each side of every boundary, so the outer edges of the
// row stay flush and only the seams pull in.
const box = (r, i) => {
  const n = r.w.length
  const ml = i < n - 1 ? -r.lap / 2 : 0
  const mr = i > 0 ? -r.lap / 2 : 0
  return `width:${r.w[i]}px;margin-left:${ml}px;margin-right:${mr}px`
}

const buildHtml = v => {
  const r = ROWS[v.row]
  const g = r.geo
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face { font-family: "Mimo He"; src: url("brand/gveret-levin.woff2") format("woff2"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px; overflow: hidden; position: relative;
    background: radial-gradient(120% 90% at 50% 10%, #EFE7DA 0%, #DCD4C8 60%, #CFC5B5 100%);
    font-family: "Nunito", "Arial Hebrew", "DejaVu Sans", sans-serif;
    color: #3B2E22;
  }

  /* Top: the mark, then what the story is about. Clear of the status bar. */
  header { position: absolute; top: ${g.header + v.drop}px; left: 0; right: 0; text-align: center; }
  header img { width: 320px; }
  h1 {
    font-family: "Mimo He", "Nunito", sans-serif; font-weight: 400;
    font-size: 96px; line-height: 1; color: #A35C3D; margin-top: 38px;
  }
  .rule { width: 132px; height: 7px; border-radius: 7px; background: #E7C78A; margin: 26px auto 0; }

  #gallery {
    position: absolute; top: ${g.gallery + v.drop}px; left: 0; right: 0;
    display: flex; justify-content: center; align-items: flex-start;
  }
  .phone { position: relative; }
  .phone .frame {
    border-radius: 34px; overflow: hidden; background: #fff;
    box-shadow: 0 26px 64px rgba(74,58,40,.34);
    border: 5px solid #fff;
  }
  .phone.fwd .frame { box-shadow: 0 34px 78px rgba(74,58,40,.42); }
  .phone img { display: block; width: 100%; height: auto; }

  #labels {
    position: absolute; top: ${g.labels + v.drop}px; left: 0; right: 0;
    display: flex; justify-content: center;
  }
  #labels .l { text-align: center; }
  #labels .n {
    font-family: "Mimo He", "Nunito", sans-serif; font-size: ${r.name}px;
    line-height: 1; color: #A35C3D;
  }
  #labels .d { margin-top: 14px; font-size: ${r.line}px; font-weight: 700; color: #6B5847; }

  /* The invitation. One line only — everything below it stays empty so the
     sticker never lands on top of type. */
  #ask {
    position: absolute; top: ${g.ask + v.drop}px; left: 0; right: 0; text-align: center;
    font-size: 42px; font-weight: 800; color: #4A3A28;
  }
</style></head><body>

<header>
  ${has('brand/logo.png') ? '<img src="brand/logo.png" alt="">' : ''}
  <h1>${v.h1}</h1>
  <div class="rule"></div>
</header>

<div id="gallery">
  ${r.order.map((k, i) => `<div class="phone${r.z[i] > 1 ? ' fwd' : ''}" style="${box(r, i)};margin-top:${r.rise[i]}px;z-index:${r.z[i]}"><div class="frame"><img src="${PAGE[k].img}"></div></div>`).join('\n  ')}
</div>

<div id="labels">
  ${r.order.map((k, i) => `<div class="l" style="${box(r, i)}"><div class="n">${PAGE[k].name}</div><div class="d">${PAGE[k].line}</div></div>`).join('\n  ')}
</div>

${v.ask ? `<div id="ask">${v.ask}</div>` : ''}

</body></html>`
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage()

for (const v of VARIANTS) {
  const htmlPath = resolve(dir, `_story-${v.slug}.html`)
  writeFileSync(htmlPath, buildHtml(v))
  await page.goto('file://' + htmlPath)
  await page.evaluate(() => document.fonts.ready)
  const file = resolve(outDir, `story-${v.slug}.png`)
  await page.screenshot({ path: file })
  console.log('wrote', file)
}
await browser.close()
