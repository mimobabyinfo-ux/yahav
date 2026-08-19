import { openApp } from './harness.mjs'
import { makeDirector } from './overlay.mjs'
import { rename } from 'node:fs/promises'

const OUT = process.env.OUT_DIR || new URL('./out/', import.meta.url).pathname
const RECORD = process.env.DRY !== '1'
const { browser, ctx, page } = await openApp(RECORD ? { record: OUT } : {})
const d = makeDirector(page)
const step = m => console.log('  ·', m)

const journalTab = () => page.getByText('יומן', { exact: true }).last()
const quick = label => page.getByText(label, { exact: true }).first()
const btn = text => page.locator('button').filter({ hasText: text }).first()
const beat = async (n, fn) => { try { await fn() } catch (e) { console.log('  !!', n, String(e).split('\n')[0].slice(0, 80)) } }
const iconBtns = () => page.locator('button').filter({ hasNotText: /./ })
const dismiss = async () => {
  const x = page.locator('[aria-label="סגירה"]')
  if (await x.count()) { await d.tap(x.first(), { settle: 900 }); return }
  await page.keyboard.press('Escape'); await d.wait(800)
}
const saveBtn = () => btn('שמירה')

// After a save the app may land anywhere; put it back on the journal with
// the full action grid open before reaching for the next one.
async function goJournal() {
  if (!(await page.getByText('עוד פעולות', { exact: true }).count()) &&
      !(await page.getByText('פחות', { exact: true }).count())) {
    await d.tap(journalTab(), { settle: 1400 })
  }
}
async function openMore() {
  await goJournal()
  const more = page.getByText('עוד פעולות', { exact: true }).first()
  if (await more.count()) await d.tap(more, { settle: 800 })
}

await d.boot()
await d.card('היומן', 'כל היום של התינוקת שלך במקום אחד', 3000)
await page.getByText('רישום מהיר ביומן').waitFor({ timeout: 30000 })
await d.dropCurtain()
await d.uncard()

// ── from the home screen into the journal ────────────────────────────────────
await d.say('מהמסך הראשי, רישום מהיר בלי לחפש', 2400)
await d.hush()
await d.tap(journalTab())
step('journal open')

await d.hideCursor()
await d.say('היומן נפתח תמיד על היום של היום', 2400)
await d.hush()

// ── the nine kinds of entry ──────────────────────────────────────────────────
await openMore()
await d.hideCursor()
await d.say('תשע סוגי רישום: הנקה, בקבוק, אוכל, שינה, חיתול, זמן בטן, רופא, אבן דרך והערה', 4200)
await d.hush()

// ── breastfeeding timer, both sides ──────────────────────────────────────────
await d.tap(quick('הנקה'), { settle: 1600 })
step('breastfeeding page')
await d.say('טיימר הנקה, צד ימין וצד שמאל בנפרד', 2600)
await d.hush()
await d.tap(btn('התחילי'), { settle: 3400 })
await d.say('מתחילות, והוא סופר לבד', 2400)
await d.hush()
const swap = btn('עברי לכאן')
if (await swap.count()) {
  await d.tap(swap, { settle: 2600 })
  await d.say('עוברת צד? נגיעה אחת, בלי לאפס', 2600)
  await d.hush()
}
const finish = btn('סיים ושמור')
if (await finish.count()) { await d.tap(finish, { settle: 2200 }); step('feeding saved') }
await d.hideCursor()
await d.say('נשמר, והרישום נכנס ליומן לבד', 2600)
await d.hush()

// ── a bottle, with the amount ────────────────────────────────────────────────
await openMore()
await d.tap(quick('בקבוק'), { settle: 1500 })
step('bottle page')
await d.say('בקבוק: כמות, וחלב אם שאוב או תמל', 2800)
await d.hush()
const ml = page.locator('input[type=number]').first()
if (await ml.count()) { await ml.click(); await ml.type('120', { delay: 130 }); await d.wait(700) }
const pumped = btn('חלב אם שאוב')
if (await pumped.count()) await d.tap(pumped, { settle: 800 })
if (await saveBtn().count()) await d.tap(saveBtn(), { settle: 2000 })
step('bottle saved')

// ── a diaper ─────────────────────────────────────────────────────────────────
await openMore()
await d.tap(quick('חיתול'), { settle: 1500 })
step('diaper page')
await d.say('חיתול: פיפי, קקי או יבש, ואפשר גם תמונה', 2800)
await d.hush()
const dirty = btn('קקי')
if (await dirty.count()) await d.tap(dirty, { settle: 900 })
if (await saveBtn().count()) await d.tap(saveBtn(), { settle: 2000 })
step('diaper saved')

// ── a milestone ──────────────────────────────────────────────────────────────
await openMore()
await d.tap(quick('אבן דרך'), { settle: 1600 })
step('milestone page')
await d.say('אבני דרך מוכנות מראש, עם תמונה או סרטון', 2800)
await d.hush()
const smile = btn('חיוך ראשון')
if (await smile.count()) await d.tap(smile, { settle: 1000 })
if (await saveBtn().count()) await d.tap(saveBtn(), { settle: 2200 })
step('milestone saved')

// ── a note, in free text ─────────────────────────────────────────────────────
await beat('note', async () => {
  await openMore()
  await d.tap(quick('הערה'), { settle: 1500 })
  await d.say('והערה חופשית, כל מה שרוצות לזכור מהיום', 2800)
  await d.hush()
  step('note page')
  await d.tap(iconBtns().first(), { settle: 1400 })
})

// ── the sleep timer ──────────────────────────────────────────────────────────
await beat('sleep timer', async () => {
  await openMore()
  await d.tap(quick('שינה'), { settle: 1600 })
  await d.say('לשינה יש טיימר משלה', 2200)
  await d.hush()
  await d.tap(btn('התחל שינה'), { settle: 3000 })
  await d.hideCursor()
  await d.say('התעוררה לרגע? משהות וממשיכות, בלי לאבד את הספירה', 3400)
  await d.hush()
  step('sleep timer')
  await d.tap(iconBtns().first(), { settle: 1600 })
})

// ── logging a day that already passed ────────────────────────────────────────
await beat('past day', async () => {
  await goJournal()
  await d.top()
  await d.tap(iconBtns().nth(1), { settle: 1600 })
  await d.hideCursor()
  await d.say('שכחת לרשום אתמול? חוזרות יום אחורה ורושמות ידנית', 3400)
  await d.hush()
  await d.tap(quick('חיתול'), { settle: 1800 })
  await d.say('הרישום נכנס לתאריך הנכון, לא להיום', 2800)
  await d.hush()
  await dismiss()
  // Back to today, or every screen after this one is dated yesterday.
  const today = btn('היום')
  if (await today.count()) await d.tap(today, { settle: 1500 })
  step('past day')
})

// ── sharing the journal ──────────────────────────────────────────────────────
await beat('share', async () => {
  await goJournal()
  await d.top()
  await d.tap(iconBtns().first(), { settle: 1800 })
  await d.hideCursor()
  await d.say('שיתוף היומן: אבא, סבתא או מטפלת רואים ומעדכנים איתך', 3600)
  await d.hush()
  await d.say('ויש גם עמוד תינוק לשליחה, בלי שהם צריכים חשבון', 3200)
  await d.hush()
  await dismiss()
  step('share')
})

// ── the day itself ───────────────────────────────────────────────────────────
await d.hideCursor()
await d.top()
await d.glide(430, 1500)
await d.say('ציר הזמן של היום, שינה והאכלות במבט אחד', 3000)
await d.hush()
await d.glide(480, 1500)
const filter = page.getByText('האכלה', { exact: true }).first()
if (await filter.count()) {
  await d.tap(filter, { settle: 1400 })
  await d.say('אפשר לסנן לפי סוג', 2200)
  await d.hush()
  const all = page.getByText('הכל', { exact: true }).first()
  if (await all.count()) await d.tap(all, { settle: 1200 })
}
await d.hideCursor()
await d.say('כל רישום עם השעה והפירוט המלא', 2600)
await d.hush()
await d.glide(560, 1600)
await d.say('ובסוף, סיכום יומי בלי לספור בראש', 3000)
await d.hush()

// ── the week ─────────────────────────────────────────────────────────────────
await d.top()
const header = page.getByText(/^יום (ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/).first()
if (await header.count()) {
  await d.tap(header, { settle: 1200 })
  const week = page.getByText('שבוע', { exact: false }).first()
  if (await week.count()) await d.tap(week, { settle: 2200 })
  await d.hideCursor()
  await d.say('ותצוגת שבוע, לראות את התמונה הגדולה', 3000)
  await d.hush()
  step('week view')
}

await d.card('מימו', 'מחר: הקהילה, אירועים ומפגשים של אמהות', 3200)

if (RECORD) {
  await page.close(); await ctx.close(); await browser.close()
  await rename(await page.video().path(), OUT + '/journal2-raw.webm')
  console.log('RAW ok')
} else {
  await page.screenshot({ path: 'dry-end.png' })
  await browser.close()
}
