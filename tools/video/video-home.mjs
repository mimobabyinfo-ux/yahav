import { openApp } from './harness.mjs'
import { makeDirector } from './overlay.mjs'
import { rename } from 'node:fs/promises'

const OUT = process.env.OUT_DIR || new URL('./out/', import.meta.url).pathname
const RECORD = process.env.DRY !== '1'
const { browser, ctx, page } = await openApp(RECORD ? { record: OUT } : {})
const d = makeDirector(page)
const step = m => console.log('  ·', m)
const beat = async (n, fn) => { try { await fn() } catch (e) { console.log('  !!', n, String(e).split('\n')[0].slice(0, 80)) } }
const btn = t => page.locator('button').filter({ hasText: t }).first()
const closeX = async () => { const x = page.locator('[aria-label="סגירה"]'); if (await x.count()) await d.tap(x.first(), { settle: 900 }) }

await d.boot()
await d.card('מסך הבית', 'הכל מתחיל מכאן', 3000)
await page.getByText('רישום מהיר ביומן').waitFor({ timeout: 30000 })
await d.dropCurtain()
await d.uncard()

await d.say('ברכה, שם התינוקת והגיל שלה, כל פעם שנכנסות', 3000)
await d.hush()
await d.say('רישום מהיר: מתי הייתה ההנקה האחרונה, השינה האחרונה והחיתול האחרון', 3800)
await d.hush()

await beat('more actions', async () => {
  await d.tap(btn('עוד שש פעולות'), { settle: 1200 })
  await d.hideCursor()
  await d.say('ובלחיצה אחת, כל תשע הפעולות', 2600)
  await d.hush()
  step('more actions')
})

await beat('my content', async () => {
  await d.glide(320, 1300)
  await d.say('התכנים שלך: הסדנאות שרכשת, עם תאריך התוקף', 3000)
  await d.hush()
  step('my content')
})

await beat('events teaser', async () => {
  await d.glide(340, 1400)
  await d.say('שלושת המפגשים הקרובים של הקהילה, ישר מהבית', 3200)
  await d.hush()
  await d.say('רואות מה מתי, כמה מקומות נשארו, ולאיזה כבר נרשמת', 3200)
  await d.hush()
  step('events teaser')
})

await beat('perks', async () => {
  await d.glide(380, 1400)
  await d.say('הטבות מומלצות מהעסקים שעובדים איתנו', 2800)
  await d.hush()
  await d.tap(page.getByText('בייבי לאב', { exact: false }).first(), { settle: 1800 })
  await d.hideCursor()
  await d.say('קוד ההנחה מועתק בנגיעה, ומשם ישר לאתר', 3000)
  await d.hush()
  await closeX()
  step('perk modal')
})

await beat('whatsapp', async () => {
  await d.top()
  await d.glide(1100, 1800)
  await d.say('ושאלה לברנדה? כפתור אחד לוואטסאפ', 2800)
  await d.hush()
  step('whatsapp')
})

// Settings is a real navigation (?settings), so the page reloads and the
// overlay layer has to be rebuilt on the other side.
await beat('settings', async () => {
  await d.top()
  await page.goto((process.env.APP_URL || 'http://127.0.0.1:5199/') + '?settings', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  await d.boot()
  await d.dropCurtain()
  await d.say('בהגדרות: הפרטים שלך, הילדים, ומצב לילה למסך כהה בשלוש לפנות בוקר', 4000)
  await d.hush()
  await d.glide(420, 1500)
  await d.say('וניהול השיתופים, מי רואה את היומן חוץ ממך', 3000)
  await d.hush()
  step('settings')
})

// night mode, seen on the real screen and not only described
await beat('night mode', async () => {
  await d.tap(btn('תמיד'), { settle: 1600 })
  await page.goto((process.env.APP_URL || 'http://127.0.0.1:5199/') + '', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2800)
  await d.boot()
  await d.dropCurtain()
  await d.say('ככה נראה מסך הבית בלילה, כדי שלא יסנוור בהאכלה של שלוש', 4000)
  await d.hush()
  step('night mode')
})

await d.card('מימו', 'מחר: היומן, כל היום של התינוקת', 3200)

if (RECORD) {
  await page.close(); await ctx.close(); await browser.close()
  await rename(await page.video().path(), OUT + '/home-raw.webm')
  console.log('RAW ok')
} else { await browser.close() }
