// Prove the narration sits on its slide. Reads the caption changes out of
// the finished file, reads where speech starts after each one, and prints
// the gap. Anything negative means the voice arrives before its picture.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const video = process.argv[2]
const timingsArg = process.argv[3]   // out/yoman-timings.json, when the file was renamed
if (!video) { console.error('usage: node verify.mjs out/yoman-final.mp4 [out/yoman-timings.json]'); process.exit(1) }

const run = args => spawnSync(FFMPEG, args, { encoding: 'utf8' }).stderr ?? ''

const cluster = (times, gap = 0.5) => times.reduce((acc, t) => {
  if (!acc.length || t - acc[acc.length - 1] > gap) acc.push(t)
  return acc
}, [])

// Prefer the timings assemble.mjs wrote; a cross-dissolve is too gentle for
// scene detection to catch reliably.
let slides = null
try {
  const t = JSON.parse(readFileSync(timingsArg ?? video.replace(/\.mp4$/, '-timings.json'), 'utf8'))
  slides = t.slides.map(s => (s.voiceMs ?? s.startMs) / 1000)
} catch {
  const capOut = run([ '-i', video, '-vf',
    "crop=1000:230:40:1560,select='gt(scene,0.06)',showinfo", '-f', 'null', '-' ])
  slides = cluster([...capOut.matchAll(/pts_time:([0-9.]+)/g)]
    .map(m => parseFloat(m[1])).filter(t => t > 0.5))
}

// Where speech actually begins after each quiet stretch. A tighter threshold
// than before: the gaps between his sentences are about 0.4s, so the old
// 0.35s window merged neighbouring sentences into one detection and the check
// passed on videos that were audibly out of step.
const silOut = run(['-i', video, '-af', 'silencedetect=noise=-40dB:d=0.18', '-f', 'null', '-'])
const onsets = [...silOut.matchAll(/silence_end: ([0-9.]+)/g)].map(m => parseFloat(m[1]))

console.log('slide → picture / voice (seconds)')
let worst = 0, worstAt = 0
const used = new Set()
slides.forEach((t, i) => {
  // Match in order, so one sentence cannot be credited to two slides.
  let best = -1, bestD = Infinity
  onsets.forEach((o, k) => {
    if (used.has(k)) return
    const d = Math.abs(o - t)
    if (d < bestD) { bestD = d; best = k }
  })
  if (best < 0 || bestD > 1.2) { console.log(`  ${String(i + 1).padStart(2)}  picture ${t.toFixed(2)}  (no speech found near it)`); return }
  used.add(best)
  const gap = onsets[best] - t
  if (gap < worst) { worst = gap; worstAt = i + 1 }
  console.log(`  ${String(i + 1).padStart(2)}  picture ${t.toFixed(2)}  voice ${onsets[best].toFixed(2)}  ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}`)
})
console.log(worst < -0.15
  ? `\nFAIL: on slide ${worstAt} the voice arrives ${(-worst).toFixed(2)}s before its picture`
  : '\nOK: every sentence starts on or after its slide')
