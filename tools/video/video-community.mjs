import { openApp } from './harness.mjs'
import { makeDirector } from './overlay.mjs'
import { rename } from 'node:fs/promises'

const OUT = process.env.OUT_DIR || new URL('./out/', import.meta.url).pathname
const RECORD = process.env.DRY !== '1'
const { browser, ctx, page } = await openApp(RECORD ? { record: OUT } : {})
const d = makeDirector(page)
const step = m => console.log('  ·', m)
const btn = t => page.locator('button').filter({ hasText: t }).first()
const btnN = (t, n) => page.locator('button').filter({ hasText: t }).nth(n)
// One beat of the clip. A selector that moved must not cost the whole take.
const beat = async (name, fn) => {
  try { await fn() } catch (e) { console.log('  !!', name, String(e).split('\n')[0].slice(0, 80)) }
}
const closeX = async () => {
  const x = page.locator('[aria-label="סגירה"]')
  if (await x.count()) { await d.tap(x.first(), { settle: 900 }) }
}

await d.boot()
await d.card('הקהילה', 'אירועים, מפגשים ואמהות לידך', 3000)
await page.getByText('רישום מהיר ביומן').waitFor({ timeout: 30000 })
await d.dropCurtain()
await d.uncard()

await d.tap(page.getByText('קהילה', { exact: true }).last(), { settle: 2200 })
step('community open')
await d.hideCursor()
await d.say('לוח האירועים של הקהילה, חודש אחרי חודש', 2800)
await d.hush()
await d.say('לכל אירוע: תאריך, שעה, מיקום, מחיר וכמה מקומות נשארו', 3400)
await d.hush()

// month chips
await d.tap(btn('ספטמבר 2026'), { settle: 1400 })
await d.say('אפשר לסנן לפי חודש', 2200)
await d.hush()
await d.tap(btn('הכל'), { settle: 1400 })

// bringing someone with you
await d.tap(btn('מגיעה עם עוד מישהו/י'), { settle: 1200 })
const guest = page.locator('input[type=text]').first()
if (await guest.count()) { await guest.click(); await guest.type('רותם', { delay: 150 }); await d.wait(900) }
await d.hideCursor()
await d.say('באה עם חברה או בת זוג? מוסיפות שם, והמקום נשמר גם לה', 3400)
await d.hush()
step('guest added')

// credit as payment
await d.say('יש לך זיכוי בקהילה? אפשר לשלם איתו', 2600)
await d.hush()

// free event, one tap
await d.glide(700, 1500)
const comingBtns = page.locator('button').filter({ hasText: 'אני מגיעה!' })
const lastComing = comingBtns.last()
if (await lastComing.count()) {
  await d.tap(lastComing, { settle: 2600 })
  await d.hideCursor()
  await d.say('אירוע חינם נסגר בנגיעה אחת', 2600)
  await d.hush()
  step('registered free event')
}

// waiting list on a full event
const wait = btn('שמרי לי מקום בהמתנה')
if (await wait.count()) {
  await d.tap(wait, { settle: 2200 })
  await d.hideCursor()
  await d.say('אירוע מלא? נכנסות לרשימת המתנה ומקבלות עדכון אם מתפנה מקום', 3600)
  await d.hush()
  step('waitlist')
}

// the ticket for an event she is registered to
await d.top()
const ticket = btn('הכרטיס שלי')
if (await ticket.count()) {
  await d.tap(ticket, { settle: 1800 })
  await d.hideCursor()
  await d.say('לאירוע שנרשמת אליו יש כרטיס כניסה דיגיטלי', 3000)
  await d.hush()
  await closeX()
  step('ticket')
}

// cancelling, and sending someone in your place
const cancel = btn('לביטול הרשמה')
if (await cancel.count()) {
  await d.tap(cancel, { settle: 1600 })
  await d.hideCursor()
  await d.say('ביטול? אין החזר כספי, אבל הכסף נשמר כזיכוי לחודש', 3200)
  await d.hush()
  await d.say('ואפשר גם לשלוח מישהי במקומך, בלי לבטל בכלל', 3000)
  await d.hush()
  await closeX()
  step('cancel sheet')
}

// membership card
const card = btn('כרטיס קהילה')
if (await card.count()) {
  await d.tap(card, { settle: 1800 })
  await d.hideCursor()
  await d.say('כרטיס הקהילה שלך, מציגות אותו בעסקים שנותנים הטבה', 3200)
  await d.hush()
  await closeX()
  step('membership card')
}

// my bookings + credit
await d.tap(btn('ההזמנות שלי'), { settle: 2000 })
await d.hideCursor()
await d.say('ההזמנות שלי: כל מה שנרשמת אליו, והזיכוי שפתוח לך', 3400)
await d.hush()
await d.glide(320, 1300)
await d.say('ותזכורת לטלפון יום לפני המפגש', 2600)
await d.hush()
step('bookings')

// month calendar view
await beat('calendar view', async () => {
  await d.top()
  await d.tap(btn('אירועים'), { settle: 1600 })
  const icons = page.locator('button').filter({ hasNotText: /./ })
  await d.tap(icons.nth(1), { settle: 1800 })
  await d.hideCursor()
  await d.say('אותם אירועים על לוח חודשי, אם ככה נוח לך יותר', 3200)
  await d.hush()
  await d.say('ואפשר לדפדף קדימה ואחורה בין החודשים', 2800)
  await d.hush()
  step('calendar')
  await d.tap(icons.nth(0), { settle: 1600 })
})

// the members directory
await d.top()
await d.tap(btn('חברות'), { settle: 2200 })
await d.hideCursor()
await d.say('והאמהות עצמן', 2000)
await d.hush()
await d.say('סינון לפי גיל דומה, לפי אזור, ולפי מה שמחפשות: קפה, פארק, אימון', 3800)
await d.hush()
await d.tap(btn('אותו אזור'), { settle: 1600 })
await d.tap(btn('כולן'), { settle: 1600 })
await d.glide(400, 1400)
await beat('member sheet', async () => {
  const momCard = page.getByText('שירה', { exact: true }).first()
  await d.tap(momCard, { settle: 1800 })
  await d.hideCursor()
  await d.say('נכנסות לפרופיל, ואם היא אישרה, כותבות לה ישירות בוואטסאפ', 3400)
  await d.hush()
  await closeX()
  step('member sheet')
})

// her own community profile
await beat('edit profile', async () => {
  await d.top()
  await d.tap(btn('ערוך פרופיל'), { settle: 1800 })
  await d.hideCursor()
  await d.say('והפרופיל שלך: אזור, שכונה, תגיות, ואם להציג את הטלפון לאמהות אחרות', 3800)
  await d.hush()
  step('profile editor')
})

await d.card('מימו', 'הקהילה נמצאת בלשונית קהילה, למטה במסך', 3200)

if (RECORD) {
  await page.close(); await ctx.close(); await browser.close()
  await rename(await page.video().path(), OUT + '/community-raw.webm')
  console.log('RAW ok')
} else { await browser.close() }
