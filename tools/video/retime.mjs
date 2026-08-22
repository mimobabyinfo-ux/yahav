// Recompute how long each slide stays up, from the narration pieces that are
// already cut and vendored in the repo. prep.mjs does this too, but only right
// after it cuts the raw recordings — and those live on Yahav's phone, not here.
// This runs off narration/<slug>/, so the timing can be retuned any time.
//
//   node retime.mjs deck-yoman.json narration/yoman
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const BREATH = Number(process.env.BREATH_MS || 420)      // pause after a sentence
const MIN_HOLD = Number(process.env.MIN_HOLD_MS || 1900) // shortest a caption may live

const [deckPath, audioDir] = process.argv.slice(2)
if (!deckPath || !audioDir) {
  console.error('usage: node retime.mjs deck-yoman.json narration/yoman')
  process.exit(1)
}

function durationMs(file) {
  const out = spawnSync(FFMPEG, ['-i', file], { encoding: 'utf8' }).stderr ?? ''
  const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  if (!m) throw new Error('no duration for ' + file)
  return Math.round((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000)
}

const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
let total = 0

for (let i = 0; i < deck.slides.length; i++) {
  if (!deck.slides[i].audio) continue
  // This piece speaks for its own slide and for any slide after it that has
  // no piece of its own.
  let j = i + 1
  while (j < deck.slides.length && !deck.slides[j].audio) j++
  const share = deck.slides.slice(i, j)
  const spoken = durationMs(resolve(audioDir, deck.slides[i].audio))

  const w = share.map(s => s.cap.length)
  const wsum = w.reduce((a, b) => a + b, 0)
  share.forEach((s, k) => {
    s.hold = Math.max(Math.round((spoken + BREATH) * w[k] / wsum), MIN_HOLD)
    total += s.hold
  })
  const air = share.reduce((a, s) => a + s.hold, 0) - spoken
  console.log(`${String(i + 1).padStart(2)}. ${(spoken / 1000).toFixed(2)}s spoken over ${share.length} slide(s), ${(air / 1000).toFixed(2)}s of air`)
}

writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n')
console.log(`\n${deck.slug}: ${(total / 1000).toFixed(1)}s of slides, plus the two cards`)
