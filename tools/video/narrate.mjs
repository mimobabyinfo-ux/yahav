// Lay the narration under a rendered clip. Each recording starts exactly
// when its slide appears, which is what timing.mjs already arranged, so the
// track here is silence for the title card, then clip, breath, clip, breath.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'

// Where the first slide actually lands in the encoded file. The page's own
// timeline is exact, but recording starts a moment before the show does, so
// the offset is measured from the video rather than assumed: the caption bar
// changes completely on every slide, so a scene detect cropped to that strip
// gives a clean list of slide starts.
function firstSlideMs(video) {
  const out = spawnSync(FFMPEG, ['-i', video, '-vf',
    "crop=1000:230:40:1560,select='gt(scene,0.06)',showinfo", '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr ?? ''
  const times = [...out.matchAll(/pts_time:([0-9.]+)/g)].map(m => parseFloat(m[1]))
  // Drop the first frame and cluster what is left; the first cluster after
  // the opening card is slide one, and the caption lands 150ms after it.
  const events = times.filter(t => t > 0.5)
  if (!events.length) return null
  const first = events[0]
  return Math.max(0, Math.round(first * 1000) - 150)
}

const [deckPath, audioDir, videoIn, videoOut] = process.argv.slice(2)
if (!deckPath || !audioDir || !videoIn || !videoOut) {
  console.error('usage: node narrate.mjs deck-yoman.json ../audio/yoman out/yoman.mp4 out/yoman-final.mp4')
  process.exit(1)
}

const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
if (!deck.slides.every(s => s.hold) || !deck.slides.some(s => s.audio)) {
  console.error('run prep.mjs on this deck first')
  process.exit(1)
}

// assemble.mjs writes the exact moment each slide lands. Use it when it is
// there; only fall back to measuring the file when it is not.
let starts = null
const timingsPath = videoIn.replace(/\.mp4$/, '-timings.json')
try {
  const t = JSON.parse(readFileSync(timingsPath, 'utf8'))
  if (t.slides?.length === deck.slides.length) starts = t.slides.map(s => s.voiceMs ?? s.startMs)
} catch { /* no timings file, measure instead */ }

const work = mkdtempSync(join(tmpdir(), 'narrate-'))
const ff = args => execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] })

// One silence file per gap: the lead-in, then whatever is left of each slide
// after its sentence ends.
const parts = []
const silence = (ms, name) => {
  const p = join(work, name)
  ff(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', (ms / 1000).toFixed(3), '-c:a', 'aac', '-b:a', '128k', p])
  return p
}

if (!starts) {
  const lead = firstSlideMs(videoIn) ?? Number(process.env.LEAD_MS || 3200)
  starts = []
  let t = lead
  deck.slides.forEach(s => { starts.push(t); t += s.hold })
  console.log(`measured first slide at ${(lead / 1000).toFixed(2)}s`)
} else {
  console.log(`timings from ${timingsPath.split('/').pop()}`)
}

let cursor = 0
deck.slides.forEach((s, i) => {
  // A slide with no clip of its own is still being spoken over by the clip
  // that started before it, so it only moves the cursor along.
  if (!s.audio) return
  const gap = starts[i] - cursor
  if (gap > 20) { parts.push(silence(gap, `g${i}.m4a`)); cursor += gap }
  else if (gap < -40) console.warn(`slide ${i + 1}: the sentence before it runs ${-gap}ms long`)
  const clip = resolve(audioDir, s.audio)
  const norm = join(work, `v${i}.m4a`)
  ff(['-y', '-i', clip, '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', norm])
  parts.push(norm)
  cursor += Math.round(durationOf(clip))
})

function durationOf(file) {
  const out = spawnSync(FFMPEG, ['-i', file], { encoding: 'utf8' }).stderr ?? ''
  const m = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/)
  return m ? (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000 : 0
}

const listPath = join(work, 'list.txt')
writeFileSync(listPath, parts.map(p => `file '${p}'`).join('\n') + '\n')
const track = join(work, 'voice.m4a')
ff(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', track])

// The video already carries a silent track; replace it outright.
ff(['-y', '-i', videoIn, '-i', track,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', videoOut])
console.log('wrote', videoOut)
