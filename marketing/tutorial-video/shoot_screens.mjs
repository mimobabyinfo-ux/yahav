// Screenshots of the real production app for the tutorial video.
// Runs in GitHub Actions (network-free environment locally can't reach the site).
// Logs in as the dedicated demo user (seeded data only; password is rotated
// right after the shoot, so the committed value is not a live credential).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'screens');
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = 'demo.video@mimo-baby.co.il';
const PASSWORD = process.env.DEMO_PASSWORD || 'MimoShoot4471tmp';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 480, height: 1040 },
  deviceScaleFactor: 2,
  locale: 'he-IL',
  timezoneId: 'Asia/Jerusalem',
});
await page.addInitScript(() => {
  localStorage.setItem('mimo_night_mode', 'off');
  localStorage.setItem('reminder-dismissed', new Date().toDateString());
});

const settle = (ms = 2500) => page.waitForTimeout(ms);
const noSpinner = () =>
  page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 20000 }).catch(() => {});
async function shot(name, { full = true } = {}) {
  await noSpinner();
  await settle(2200);
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
  console.log('shot', name);
}

await page.goto('https://mimo-baby.co.il', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="email"]', { timeout: 30000 });
await settle(1500);
await shot('login.png', { full: false });

await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('text=רישום מהיר ביומן', { timeout: 30000 });
await settle(3500);
await shot('home-full.png');

// expand the extra quick actions
try {
  await page.click('text=עוד שש פעולות', { timeout: 5000 });
  await shot('home-actions.png');
} catch (e) { console.log('skip home-actions:', e.message); }

// journal
await page.click('nav >> text=יומן');
await shot('journal-full.png');

// community (events tab; do NOT expand cards — attendee names stay private)
await page.click('nav >> text=קהילה');
await shot('community-full.png');

// digital content: dashboard -> "התכנים שלך"
await page.click('nav >> text=בית');
await noSpinner(); await settle(2000);
try {
  await page.click('text=התכנים שלך', { timeout: 8000 });
  await shot('courses-list.png');
  await page.click(':text-is("סדנת עיסוי תינוקות")', { timeout: 8000 });
  await page.waitForSelector('text=סרטונים', { timeout: 15000 });
  await shot('course-content.png');
} catch (e) { console.log('skip courses:', e.message); }

// store
await page.click('nav >> text=מוצרים');
await shot('store-full.png');
try {
  await page.click('text=ליווי התפתחותי - סדנת עטופים', { timeout: 8000 });
  await shot('store-modal.png', { full: false });
} catch (e) { console.log('skip store-modal:', e.message); }

await browser.close();
console.log('done');
