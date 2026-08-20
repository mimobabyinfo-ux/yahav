// Lay the narration under a rendered clip. Each recording starts exactly
// when its slide appears, which is what timing.mjs already arranged, so the
// track here is silence for the title card, then clip, breath, clip, breath.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const LEAD_MS = Number(process.env.LEAD_MS || 3200)   // title card, see deck.mjs

const [deckPath, audioDir, videoIn, videoOut] = process.argv.slice(2)
if (!deckPath || !audioDir || !videoIn || !videoOut) {
  console.error('usage: node narrate.mjs deck-yoman.json ../audio/yoman out/yoman.mp4 out/yoman-final.mp4')
  process.exit(1)
}

const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
if (!deck.slides.every(s => s.audio && s.hold)) {
  console.error('run timing.mjs on this deck first')
  process.exit(1)
}

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

if (LEAD_MS > 0) parts.push(silence(LEAD_MS, 'lead.m4a'))
deck.slides.forEach((s, i) => {
  const clip = resolve(audioDir, s.audio)
  const norm = join(work, `v${i}.m4a`)
  ff(['-y', '-i', clip, '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', norm])
  parts.push(norm)
  // The breath is whatever timing.mjs added on top of the recording.
  const pad = s.hold - Math.round(durationOf(clip))
  if (pad > 20) parts.push(silence(pad, `p${i}.m4a`))
})

function durationOf(file) {
  let out = ''
  try { execFileSync(FFMPEG, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }) }
  catch (e) { out = e.stderr?.toString() ?? '' }
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
