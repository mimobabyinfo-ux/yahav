// One still for Instagram stories: the three pages side by side, the way an
// app store shows a gallery. Same palette, fonts and phone frames as the
// videos, so a story and a clip read as the same brand.
//
//   CHROME_PATH=... node story.mjs [out-dir]
//
// Two versions come out of one run:
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

// The opening screen of each video: each one shows its page with its own tab
// lit in the bottom bar, which is what makes the three read as one app.
// Right to left, as the page reads. Home sits in the middle, forward and a
// little higher, so it is the screen the eye lands on.
const PHONES = [
  { img: 'shots/yoman/15.jpg',  name: 'יומן',  line: 'האכלות, שינה וחיתולים' },
  { img: 'shots/bait/08.jpg',   name: 'בית',   line: 'הכל במקום אחד' },
  { img: 'shots/kehila/13.jpg', name: 'קהילה', line: 'מפגשים והרשמה' },
]

const VARIANTS = [
  { slug: 'ask',   h1: 'מה יש באפליקציה?', ask: 'יש לך שאלה על האפליקציה?', drop: 0 },
  { slug: 'plain', h1: 'אפליקציית מימו',   ask: null,                        drop: 90 },
]

const buildHtml = v => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
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
  header { position: absolute; top: ${100 + v.drop}px; left: 0; right: 0; text-align: center; }
  header img { width: 320px; }
  h1 {
    font-family: "Mimo He", "Nunito", sans-serif; font-weight: 400;
    font-size: 96px; line-height: 1; color: #A35C3D; margin-top: 38px;
  }
  .rule { width: 132px; height: 7px; border-radius: 7px; background: #E7C78A; margin: 26px auto 0; }

  /* The gallery. The middle phone stands forward and a little higher, so the
     eye lands on the journal — the screen a mother opens every day. */
  #gallery {
    position: absolute; top: ${425 + v.drop}px; left: 0; right: 0;
    display: flex; justify-content: center; align-items: flex-start;
  }
  .phone { position: relative; }
  .phone .frame {
    border-radius: 34px; overflow: hidden; background: #fff;
    box-shadow: 0 26px 64px rgba(74,58,40,.34);
    border: 5px solid #fff;
  }
  .phone img { display: block; width: 100%; height: auto; }

  /* Scoped to .phone: the labels below reuse these two class names, and an
     unscoped rule handed them the phones' 96px drop. */
  .phone.side { width: 322px; margin-top: 96px; z-index: 1; }
  .phone.mid  { width: 396px; margin: 0 -52px; z-index: 2; }
  .phone.mid .frame { box-shadow: 0 34px 78px rgba(74,58,40,.42); }

  /* Same widths and the same overlap as the gallery, so every label is dead
     centre under its own phone rather than merely near it. */
  #labels {
    position: absolute; top: ${1305 + v.drop}px; left: 0; right: 0;
    display: flex; justify-content: center;
  }
  #labels .l { text-align: center; }
  #labels .l.side { width: 322px; }
  #labels .l.mid  { width: 396px; margin: 0 -52px; }
  #labels .n {
    font-family: "Mimo He", "Nunito", sans-serif; font-size: 58px;
    line-height: 1; color: #A35C3D;
  }
  #labels .d { margin-top: 14px; font-size: 27px; font-weight: 700; color: #6B5847; }

  /* The invitation. One line only — everything below it stays empty so the
     sticker never lands on top of type. */
  #ask {
    position: absolute; top: ${1450 + v.drop}px; left: 0; right: 0; text-align: center;
    font-size: 42px; font-weight: 800; color: #4A3A28;
  }
</style></head><body>

<header>
  ${has('brand/logo.png') ? '<img src="brand/logo.png" alt="">' : ''}
  <h1>${v.h1}</h1>
  <div class="rule"></div>
</header>

<div id="gallery">
  <div class="phone side"><div class="frame"><img src="${PHONES[0].img}"></div></div>
  <div class="phone mid"><div class="frame"><img src="${PHONES[1].img}"></div></div>
  <div class="phone side"><div class="frame"><img src="${PHONES[2].img}"></div></div>
</div>

<div id="labels">
  ${PHONES.map((p, i) => `<div class="l ${i === 1 ? 'mid' : 'side'}"><div class="n">${p.name}</div><div class="d">${p.line}</div></div>`).join('')}
</div>

${v.ask ? `<div id="ask">${v.ask}</div>` : ''}

</body></html>`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage()

for (const v of VARIANTS) {
  const htmlPath = resolve(dir, `_story-${v.slug}.html`)
  writeFileSync(htmlPath, buildHtml(v))
  await page.goto('file://' + htmlPath)
  await page.evaluate(() => document.fonts.ready)
  const file = resolve(outDir, `story-3-pages-${v.slug}.png`)
  await page.screenshot({ path: file })
  console.log('wrote', file)
}
await browser.close()
