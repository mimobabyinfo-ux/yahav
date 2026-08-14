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

// The bottom nav is position:fixed, so a full-page screenshot bakes it into the
// middle of the image and hides the content behind it. Hide it for the body
// shots and capture it once on its own; the video pins it back to the frame.
const HIDE_NAV = 'nav.fixed,[class*="fixed"][class*="bottom-0"]{visibility:hidden !important}';
async function hideNav() { await page.addStyleTag({ content: HIDE_NAV }); }
async function showNav() {
  await page.evaluate(() => {
    document.querySelectorAll('style').forEach(s => {
      if (s.textContent.includes('visibility:hidden')) s.remove();
    });
  });
}
const noSpinner = () =>
  page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 20000 }).catch(() => {});
async function shot(name, { full = true, nav = true } = {}) {
  await noSpinner();
  await settle(2200);
  if (full && nav) await hideNav();
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
  if (full && nav) await showNav();
  console.log('shot', name);
}

// The nav strip on its own, from the viewport bottom.
async function shotNav(name) {
  await settle(600);
  const box = await page.evaluate(() => {
    const el = document.querySelector('nav') || document.querySelector('[class*="bottom-0"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) { console.log('no nav found for', name); return; }
  await page.screenshot({ path: path.join(OUT, name), clip: box });
  console.log('shot', name);
}

await page.goto('https://mimo-baby.co.il', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="email"]', { timeout: 30000 });
await settle(1500);
await shot('login.png', { full: false, nav: false });

await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('text=רישום מהיר ביומן', { timeout: 30000 });
await settle(3500);
await shot('home-full.png');
await shotNav('nav-home.png');

// expand the extra quick actions
try {
  await page.click('text=עוד שש פעולות', { timeout: 5000 });
  await shot('home-actions.png');
} catch (e) { console.log('skip home-actions:', e.message); }

// journal
await page.click('nav >> text=יומן');
await shot('journal-full.png');
await shotNav('nav-journal.png');

// community (events tab; do NOT expand cards — attendee names stay private)
await page.click('nav >> text=קהילה');
await shot('community-full.png');
await shotNav('nav-community.png');

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
await shotNav('nav-store.png');
try {
  await page.click('text=ליווי התפתחותי - סדנת עטופים', { timeout: 8000 });
  await shot('store-modal.png', { full: false, nav: false });
} catch (e) { console.log('skip store-modal:', e.message); }

await browser.close();
console.log('done');
