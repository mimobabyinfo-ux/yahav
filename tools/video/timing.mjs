// Read the narration clips, one per slide, and write the deck back with a
// hold per slide: exactly as long as Yahav speaks, plus a breath. The
// picture then changes on the sentence, not on a stopwatch.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const BREATH = Number(process.env.BREATH_MS || 420)   // pause after each sentence

const deckPath = process.argv[2]
const audioDir = process.argv[3]
if (!deckPath || !audioDir) {
  console.error('usage: node timing.mjs deck-yoman.json ../audio/yoman')
  process.exit(1)
}

export function durationMs(file) {
  let out = ''
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }) }
  catch (e) { out = e.stderr?.toString() ?? '' }
  const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  if (!m) throw new Error('no duration for ' + file)
  return Math.round((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000)
}

const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
const clips = readdirSync(audioDir).filter(f => /\.(m4a|mp3|wav|aac)$/i.test(f)).sort()
if (clips.length !== deck.slides.length) {
  console.error(`deck has ${deck.slides.length} slides but ${clips.length} recordings`)
  process.exit(1)
}

let total = 0
deck.slides.forEach((s, i) => {
  const ms = durationMs(resolve(audioDir, clips[i]))
  s.audio = clips[i]
  s.hold = ms + BREATH
  total += s.hold
  console.log(`${String(i + 1).padStart(2)}. ${(ms / 1000).toFixed(2)}s  ${s.cap.slice(0, 46)}`)
})
writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n')
console.log(`\n${deck.slug}: ${(total / 1000).toFixed(1)}s of slides, plus the two cards`)
