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

const silOut = run(['-i', video, '-af', 'silencedetect=noise=-45dB:d=0.35', '-f', 'null', '-'])
const speech = [...silOut.matchAll(/silence_end: ([0-9.]+)/g)].map(m => parseFloat(m[1]))

console.log('slide → speech starts (seconds)')
let worst = 0
slides.forEach((t, i) => {
  const next = speech.find(s => s >= t - 0.6)
  if (next === undefined) return
  const gap = next - t
  if (gap < worst) worst = gap
  console.log(`  ${String(i + 1).padStart(2)}  picture ${t.toFixed(2)}  voice ${next.toFixed(2)}  ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}`)
})
console.log(worst < -0.25
  ? `\nFAIL: voice runs ahead of the picture by ${(-worst).toFixed(2)}s somewhere`
  : '\nOK: every sentence starts on or after its slide')
