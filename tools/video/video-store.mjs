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
await d.card('מוצרים', 'סדנאות, מחזורים ומוצרים משלימים', 3000)
await page.getByText('רישום מהיר ביומן').waitFor({ timeout: 30000 })
await d.dropCurtain()
await d.uncard()

await d.tap(page.locator('button').filter({ hasText: 'מוצרים' }).last(), { settle: 2200 })
await d.hideCursor()
await d.say('החנות של מימו, בתוך האפליקציה', 2400)
await d.hush()
await d.say('כל מוצר עם תיאור מלא, מחיר, וכפתור וואטסאפ לשאלה לפני שקונים', 3800)
await d.hush()
await d.say('הכל מסודר לפי קטגוריה: הריון, תינוקות, אימהות', 3000)
await d.hush()

await beat('cohorts', async () => {
  await d.say('לסדנאות יש מחזורים: תאריך, שעה, וכמה מקומות נשארו במחזור', 3800)
  await d.hush()
  await d.tap(btn('לבחירת מחזור והרשמה'), { settle: 2000 })
  await d.hideCursor()
  await d.say('בוחרות את המחזור שנוח, ומשם להרשמה ותשלום', 3200)
  await d.hush()
  await d.tap(btn('מחזור ספטמבר'), { settle: 2400 })
  await d.hideCursor()
  step('cohort chosen')
  // The sheet must be gone before the clip moves on, or every caption
  // after this one plays over a modal instead of the store.
  // Choosing a cohort hands off to the payment tab, which the recording
  // cannot follow, and the sheet stays up behind it. Escape does not always
  // take it down, so the clip goes back to a clean store the sure way.
  await page.goto((process.env.APP_URL || 'http://127.0.0.1:5199/'), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2600)
  await d.boot()
  await d.dropCurtain()
  await d.tap(page.locator('button').filter({ hasText: 'מוצרים' }).last(), { settle: 2000 })
  await d.hideCursor()
})

await beat('last seat', async () => {
  await d.glide(420, 1500)
  await d.say('מחזור שנגמר מסומן: מקום אחרון', 2800)
  await d.hush()
  step('last seat')
})

await beat('simple products', async () => {
  await d.glide(520, 1600)
  await d.say('ומוצרים משלימים: שמן העיסוי מהסדנה, ערכת מתנה ליולדת', 3400)
  await d.hush()
  await d.say('אלה נקנים ישירות, בלי מחזור ובלי תאריך', 2800)
  await d.hush()
  step('simple products')
})

await beat('purchases', async () => {
  await d.top()
  await d.tap(btn('הרכישות שלי'), { settle: 2200 })
  if (!(await page.getByText('פתוח עד', { exact: false }).count())) {
    await d.tap(btn('הרכישות שלי'), { settle: 2000 })
  }
  await d.hideCursor()
  await d.say('והרכישות שלך, עם תוקף הגישה לתכנים', 3000)
  await d.hush()
  step('purchases')
})

await d.card('מימו', 'הכל בלשונית מוצרים, למטה במסך', 3200)

if (RECORD) {
  await page.close(); await ctx.close(); await browser.close()
  await rename(await page.video().path(), OUT + '/store-raw.webm')
  console.log('RAW ok')
} else { await browser.close() }
