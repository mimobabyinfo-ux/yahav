# tools/video — explainer clips of the app, recorded from the app itself

Four short clips, one per bottom-nav page (בית / יומן / קהילה / מוצרים), for
sending in the WhatsApp community group. They are screen recordings of this
very code: real components, real layout, real interactions, driven by
Playwright with a caption layer drawn inside the page (so Hebrew stays RTL).

## Why the data is fake

The recordings run against a small in-memory PostgREST written in
`harness.mjs`: every Supabase call is intercepted and answered from
`data.mjs`. Nothing touches production, and no real mother appears in a
frame. Inserts land in the in-memory store, so saving a feed inside the clip
really does make it show up in the journal a second later.

`data.mjs` is the whole cast: one mother (נועה), one baby (יעל), a day of
journal entries, five community events, five products with cohorts, six
other mothers in the directory. Edit that file to change what the clips
show.

## Running

```bash
npm run dev -- --port 5199          # the app, in one terminal
cd tools/video
node video-journal.mjs              # writes out/journal-raw.webm
```

Then encode for WhatsApp (720x1280, H.264, silent audio track so iOS and
WhatsApp accept it):

```bash
ffmpeg -i out/journal-raw.webm -f lavfi -i anullsrc=r=44100:cl=stereo \
  -vf "scale=720:1280:flags=lanczos,fps=30" \
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -movflags +faststart \
  -shortest -c:a aac -b:a 64k out/yoman.mp4
```

`DRY=1 node video-journal.mjs` walks the whole script without recording —
use it after any UI change to see which beat lost its selector.

Env: `APP_URL` (default http://127.0.0.1:5199/), `OUT_DIR`, `CHROME_PATH`.

## When the app changes

A clip is a list of `beat()` blocks, each one tap plus a caption. A beat
whose selector no longer matches prints `!!` and is skipped, so the take
survives; the fix is a selector, not a re-shoot. Captions live next to the
taps they explain — keep them one short line, no em dashes.

## deck.mjs — the clips built from Yahav's own screenshots

The Playwright scripts above drive the app; `deck.mjs` does not touch the app
at all. It takes a JSON deck (`deck-bait.json`, `deck-yoman.json`,
`deck-kehila.json`, `deck-mutzarim.json`) listing real phone screenshots in
order, each with one caption, and renders them as a 1080x1920 clip: title
card, one screenshot per beat with the caption under it, end card.

```bash
node deck.mjs deck-yoman.json      # writes out/yoman-raw.webm
```

The screenshots themselves are not in the repo. Point each deck's `img`
paths at wherever the current set lives, keeping the same folder-per-page
layout (`bait/01.jpg`, `yoman/01.jpg`, ...).

`hold` sets how long every slide stays up. When a narration recording exists,
give each slide its own hold so the picture changes exactly where the voice
does, then mux the audio in:

```bash
ffmpeg -i out/yoman.mp4 -i voice.m4a -c:v copy -c:a aac -shortest out/yoman-final.mp4
```

## The brand on the cards

`brand/` holds what the clips need from Mimo's branding kit: the logo lifted
out of the branding PDF (white keyed to transparency) and the two typefaces
from its typography page that are actually distributable, Gveret Levin for
Hebrew and Coustard for Latin. FB Gorme Narrow is licensed and not here, so
body text falls back to the system sans.

The opening and closing cards use all of it: logo, title in Gveret Levin in
ROJO TIERRA #A35C3D, a rule in AMARILLO PATITO #E7C78A, subtitle in VERDE
MUSGO #818267, on a cream ground. A deck can point elsewhere with
`"brand": { "logo": ..., "hebrew": ..., "latin": ... }`; missing files just
drop back to plain type.

Palette, from the kit: ROJO TIERRA A35C3D, ARENA C6BDA0, VERDE MUSGO 818267,
CELESTE C3CDD2, ROSA POLVO EADEDD, AMARILLO PATITO E7C78A, BEIGE DCD4C8.

## assemble.mjs — why the clips are built from stills

Filming the page with Playwright came out about 14% longer than the show it
recorded, and the stretch was not even, so the narration walked off its
slides. `assemble.mjs` screenshots every state instead and hands the stills
to ffmpeg with exact durations, cross-dissolves, and a slow drift per slide.
The timeline is then arithmetic, and it writes `<slug>-timings.json` saying
where each slide lands.

```bash
node assemble.mjs deck-yoman.json                                   # out/yoman.mp4 + timings
node narrate.mjs deck-yoman.json narration/yoman out/yoman.mp4 out/yoman-final.mp4
node verify.mjs out/yoman-final.mp4 out/yoman-timings.json          # proves the sync
```

`verify.mjs` prints, per slide, when the picture lands and when the voice
starts. Positive numbers only: the voice must never arrive before its slide.
`deck.mjs` (the screen-recording path) is kept for reference but is not what
produces the clips.
