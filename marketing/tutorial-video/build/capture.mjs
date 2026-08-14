import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FPS = 30;
const LEAD = 0.5;   // silence before narration in each scene
const TAIL = 0.7;   // breathing room after narration

// --- timeline from measured durations + narration text ---
const durations = {};
for (const line of fs.readFileSync(path.join(HERE, 'durations.csv'), 'utf8').trim().split('\n')) {
  const [id, t] = line.split(',');
  const [h, m, s] = t.split(':').map(Number);
  durations[id] = h * 3600 + m * 60 + s;
}
const narration = JSON.parse(fs.readFileSync('/home/user/yahav/marketing/tutorial-video/narration.json', 'utf8'));

let cursor = 0;
const TL = narration.lines.map((line, i) => {
  const audio = durations[line.id];
  const dur = LEAD + audio + TAIL;
  const scene = { id: 's' + (i + 1), start: cursor, dur, audioAt: cursor + LEAD, cap: line.text, file: line.id + '.mp3' };
  cursor += dur;
  return scene;
});
const TOTAL = cursor;
fs.writeFileSync(path.join(HERE, 'timeline.json'), JSON.stringify({ total: TOTAL, fps: FPS, scenes: TL }, null, 2));
console.log(`total ${TOTAL.toFixed(2)}s, ${Math.ceil(TOTAL * FPS)} frames`);

// --- render frames ---
const framesDir = path.join(HERE, 'frames');
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(HERE, 'render.html'));
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all(Array.from(document.images).map(i => i.decode().catch(() => {}))));
await page.evaluate((tl) => window.INIT(tl), TL);

const only = process.env.ONLY_TIMES ? process.env.ONLY_TIMES.split(',').map(Number) : null;
if (only) {
  for (const t of only) {
    await page.evaluate((ms) => window.SEEK(ms), t * 1000);
    await page.screenshot({ path: path.join(framesDir, `probe_${t.toFixed(1)}.png`) });
    console.log('probe', t);
  }
} else {
  const nFrames = Math.ceil(TOTAL * FPS);
  const t0 = Date.now();
  for (let f = 0; f < nFrames; f++) {
    await page.evaluate((ms) => window.SEEK(ms), (f / FPS) * 1000);
    await page.screenshot({ path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 85 });
    if (f % 300 === 0) console.log(`frame ${f}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`done ${nFrames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
