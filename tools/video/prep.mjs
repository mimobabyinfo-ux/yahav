// Yahav records one file per sentence, but not always: sometimes he reads two
// or three sentences into one clip and names it "13+14". This turns whatever
// he sent into one trimmed, level-matched piece of audio per slide.
//
//   node prep.mjs deck-yoman.json <raw-dir> <out-dir>
//
// For every group of slides that share a clip it looks for the pauses he took
// between sentences and cuts there, so the picture changes on the pause and no
// word is ever cut in half. When a clip has fewer pauses than it has slides —
// he shortened what he read — the slides that are left share the audio and
// split their time by how long their caption is.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const BREATH = Number(process.env.BREATH_MS || 420)     // pause after a sentence
const MIN_HOLD = Number(process.env.MIN_HOLD_MS || 1900) // shortest a caption may live
const LEAD = 120        // silence kept before the first word
const TAIL = 220        // silence kept after the last word
const NOISE = '-38dB'
const GAP = 0.22        // a pause this long counts as a sentence break

// Which slides each clip covers. The key is the clip, the value is how many
// slides it speaks for; see README for how the yoman mapping was established.
const GROUPS = {
  bait:     [1, 1, 1, 1, 2, 1, 1],
  yoman:    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 1],
  kehila:   [3, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1],
  mutzarim: [1, 4, 1, 1, 1],
}

const ff = args => execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] })
const probe = args => spawnSync(FFMPEG, args, { encoding: 'utf8' }).stderr ?? ''

function durationMs(file) {
  const m = probe(['-i', file]).match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  if (!m) throw new Error('no duration for ' + file)
  return Math.round((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000)
}

// Every stretch of quiet in the clip, as [startMs, endMs].
function silences(file) {
  const out = probe(['-i', file, '-af', `silencedetect=noise=${NOISE}:d=${GAP}`, '-f', 'null', '-'])
  const marks = [...out.matchAll(/silence_(start|end): ([0-9.]+)/g)]
  const spans = []
  let open = null
  for (const [, kind, t] of marks) {
    if (kind === 'start') open = Math.round(parseFloat(t) * 1000)
    else if (open !== null) { spans.push([open, Math.round(parseFloat(t) * 1000)]); open = null }
  }
  if (open !== null) spans.push([open, durationMs(file)])
  return spans
}

const [deckPath, rawDir, outDir] = process.argv.slice(2)
if (!deckPath || !rawDir || !outDir) {
  console.error('usage: node prep.mjs deck-yoman.json ../raw/yoman narration/yoman')
  process.exit(1)
}

const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
const sizes = GROUPS[deck.slug]
if (!sizes) throw new Error('no group map for ' + deck.slug)
const covered = sizes.reduce((a, b) => a + b, 0)
if (covered !== deck.slides.length) {
  console.error(`${deck.slug}: clips cover ${covered} slides, deck has ${deck.slides.length}`)
  process.exit(1)
}

const clips = sizes.map((_, i) => resolve(rawDir, `${String(i + 1).padStart(2, '0')}.m4a`))
// The clips are named for the first sentence they speak, not their position,
// so read the directory instead of assuming the numbers run 1..n.
const { readdirSync } = await import('node:fs')
const present = readdirSync(rawDir).filter(f => /\.(m4a|mp3|wav|aac|mp4)$/i.test(f)).sort()
if (present.length !== sizes.length) {
  console.error(`${deck.slug}: ${present.length} clips on disk, group map expects ${sizes.length}`)
  process.exit(1)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

let slide = 0
let total = 0
present.forEach((name, gi) => {
  const src = resolve(rawDir, name)
  const n = sizes[gi]
  const group = deck.slides.slice(slide, slide + n)
  const quiet = silences(src)
  const len = durationMs(src)

  // Trim to what he actually said, keeping a breath either side.
  const leadEnd = quiet.length && quiet[0][0] <= 40 ? quiet[0][1] : 0
  const tailStart = quiet.length && quiet.at(-1)[1] >= len - 60 ? quiet.at(-1)[0] : len
  const from = Math.max(0, leadEnd - LEAD)
  const to = Math.min(len, tailStart + TAIL)

  // The pauses inside the speech, as candidate cut points.
  const inner = quiet
    .filter(([a, b]) => a > leadEnd + 200 && b < tailStart - 200)
    .map(([a, b]) => ({ at: Math.round((a + b) / 2) - from, width: b - a }))

  // Where each sentence should end if he read them at an even pace.
  const chars = group.map(s => s.cap.length)
  const sum = chars.reduce((a, b) => a + b, 0)
  const span = to - from
  const targets = []
  let acc = 0
  for (let i = 0; i < n - 1; i++) { acc += chars[i]; targets.push(Math.round(span * acc / sum)) }

  // Take the pause closest to each target, never out of order, never so close
  // to its neighbour that a slide would flash by.
  const cuts = []
  const used = new Set()
  targets.forEach(t => {
    let best = -1, bestD = Infinity
    inner.forEach((g, i) => {
      if (used.has(i)) return
      const lo = cuts.length ? Math.max(...cuts) : 0
      if (g.at <= lo + 700 || g.at >= span - 700) return
      const d = Math.abs(g.at - t)
      if (d < bestD) { bestD = d; best = i }
    })
    if (best >= 0) { used.add(best); cuts.push(inner[best].at) }
  })
  cuts.sort((a, b) => a - b)

  // One piece of audio per cut. Slides with no piece of their own sit under
  // the piece that started before them and split its time by caption length.
  const bounds = [0, ...cuts, span]
  const pieces = bounds.slice(0, -1).map((a, i) => [a, bounds[i + 1]])
  // Spread the slides over the pieces, in order, as evenly as their captions ask.
  const owner = []                       // piece index per slide
  {
    let p = 0
    const perPiece = n / pieces.length
    group.forEach((_, i) => { owner.push(Math.min(pieces.length - 1, Math.floor(i / perPiece))) })
    void p
  }

  pieces.forEach(([a, b], pi) => {
    const mine = group.map((s, i) => i).filter(i => owner[i] === pi)
    if (!mine.length) return
    const file = `${String(slide + mine[0] + 1).padStart(2, '0')}.m4a`
    ff(['-y', '-ss', ((from + a) / 1000).toFixed(3), '-t', ((b - a) / 1000).toFixed(3), '-i', src,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100',
        '-c:a', 'aac', '-b:a', '128k', join(outDir, file)])
    const cut = durationMs(join(outDir, file))

    // Split this piece's time between the slides that share it.
    const w = mine.map(i => group[i].cap.length)
    const wsum = w.reduce((x, y) => x + y, 0)
    let holds = w.map(x => Math.round((cut + BREATH) * x / wsum))
    holds = holds.map(h => Math.max(h, MIN_HOLD))
    mine.forEach((i, k) => {
      group[i].audio = k === 0 ? file : null
      group[i].hold = holds[k]
      total += holds[k]
    })
  })

  const said = group.map(s => (s.hold / 1000).toFixed(1)).join(' + ')
  console.log(`${name}  ${(span / 1000).toFixed(2)}s speech  ->  slides ${slide + 1}..${slide + n}  (${said}s)  ${cuts.length}/${n - 1} pauses found`)
  slide += n
})

deck.slides.forEach(s => { if (s.audio === null) delete s.audio })
writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n')
console.log(`\n${deck.slug}: ${(total / 1000).toFixed(1)}s of slides, plus the two cards`)
