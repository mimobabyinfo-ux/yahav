// Everything the camera adds on top of the app: captions, a visible finger,
// and the opening / closing cards. All rendered inside the page, so Hebrew
// gets Chromium's own RTL shaping instead of ffmpeg's (which has none).

export const CSS = `
#film-layer, #film-layer * { box-sizing: border-box; font-family: inherit; }
#film-cursor {
  position: fixed; width: 46px; height: 46px; border-radius: 50%;
  background: rgba(74,58,40,.28); border: 2px solid rgba(255,255,255,.9);
  box-shadow: 0 4px 14px rgba(0,0,0,.25); z-index: 2147483000;
  transform: translate(-50%, -50%); pointer-events: none; opacity: 0;
  transition: left .55s cubic-bezier(.4,0,.2,1), top .55s cubic-bezier(.4,0,.2,1), opacity .3s;
}
#film-cursor.tap { animation: film-tap .45s ease-out; }
@keyframes film-tap {
  0% { transform: translate(-50%,-50%) scale(1); background: rgba(74,58,40,.28); }
  45% { transform: translate(-50%,-50%) scale(.7); background: rgba(231,199,138,.85); }
  100% { transform: translate(-50%,-50%) scale(1); background: rgba(74,58,40,.28); }
}
#film-cap {
  position: fixed; right: 16px; left: 16px; bottom: 104px; z-index: 2147482900;
  background: rgba(40,30,22,.9); color: #fff; border-radius: 20px;
  padding: 14px 18px; font-size: 19px; line-height: 1.4; font-weight: 800;
  text-align: center; direction: rtl; opacity: 0; transform: translateY(14px);
  pointer-events: none;   /* a caption must never eat a tap meant for the app */
  transition: opacity .35s ease, transform .35s ease;
  box-shadow: 0 10px 30px rgba(0,0,0,.28);
}
#film-cap.on { opacity: 1; transform: translateY(0); }
#film-card {
  position: fixed; inset: 0; z-index: 2147483100; background: #F6ECD8;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; direction: rtl; opacity: 0; transition: opacity .45s ease;
  pointer-events: none; padding: 40px;
}
#film-card.on { opacity: 1; }
#film-card .t { font-size: 44px; font-weight: 900; color: #4A3A28; text-align: center; line-height: 1.15; }
#film-card .s { font-size: 21px; font-weight: 700; color: #7B604C; text-align: center; line-height: 1.45; }
#film-card .rule { width: 64px; height: 4px; border-radius: 4px; background: #E7C78A; }
`

export const BOOT = `
const l = document.createElement('div'); l.id = 'film-layer';
l.innerHTML = '<div id="film-cursor"></div><div id="film-cap"></div>'
  + '<div id="film-card"><div class="t"></div><div class="rule"></div><div class="s"></div></div>';
const s = document.createElement('style'); s.textContent = ${JSON.stringify(CSS)};
document.head.appendChild(s); document.body.appendChild(l);
`

export function makeDirector(page) {
  const $ = sel => page.locator(sel)
  const wait = ms => page.waitForTimeout(ms)

  return {
    wait,

    async boot() { await page.evaluate(BOOT) },

    /** Caption in, hold, caption out. */
    async say(text, hold = 2600) {
      await page.evaluate(t => {
        const c = document.getElementById('film-cap')
        c.textContent = t; c.classList.add('on')
      }, text)
      await wait(hold)
    },
    async hush() {
      await page.evaluate(() => document.getElementById('film-cap')?.classList.remove('on'))
      await wait(400)
    },

    /** Full-bleed card — the open and the close. */
    async card(title, sub, hold = 2400) {
      await page.evaluate(([t, s]) => {
        const c = document.getElementById('film-card')
        c.querySelector('.t').textContent = t
        c.querySelector('.s').textContent = s
        c.classList.add('on')
      }, [title, sub])
      await wait(hold)
    },
    async dropCurtain() {
      await page.evaluate(() => document.getElementById('film-curtain')?.remove())
    },

    async uncard() {
      await page.evaluate(() => document.getElementById('film-card')?.classList.remove('on'))
      await wait(600)
    },

    /** Move the finger to an element, press, then really click it. */
    async tap(locator, { settle = 1200 } = {}) {
      const box = await locator.first().boundingBox()
      if (!box) throw new Error('tap target not visible')
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      await page.evaluate(([x, y]) => {
        const c = document.getElementById('film-cursor')
        c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.opacity = '1'
      }, [x, y])
      await wait(650)
      await page.evaluate(() => {
        const c = document.getElementById('film-cursor')
        c.classList.remove('tap'); void c.offsetWidth; c.classList.add('tap')
      })
      await wait(240)
      // A element that never settles (a toast animating somewhere on the
      // page keeps Playwright waiting) must not cost the take: fall back to
      // a forced click, then to a raw tap at the coordinates.
      try {
        await locator.first().click({ timeout: 8000 })
      } catch {
        try { await locator.first().click({ force: true, timeout: 5000 }) }
        catch { await page.mouse.click(x, y) }
      }
      await wait(settle)
    },

    async hideCursor() {
      await page.evaluate(() => { const c = document.getElementById('film-cursor'); if (c) c.style.opacity = '0' })
    },

    /** Slow, readable scroll — never a jump cut. */
    async glide(px, ms = 1400) {
      await page.evaluate(([px, ms]) => new Promise(res => {
        const start = window.scrollY, t0 = performance.now()
        const step = now => {
          const k = Math.min(1, (now - t0) / ms)
          const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
          window.scrollTo(0, start + px * e)
          k < 1 ? requestAnimationFrame(step) : res()
        }
        requestAnimationFrame(step)
      }), [px, ms])
      await wait(300)
    },

    async top() { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900) },
    $,
  }
}
