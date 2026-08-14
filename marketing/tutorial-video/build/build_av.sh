#!/bin/bash
# Mixes the narration track according to timeline.json, then muxes with frames.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
FF=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
cd "$HERE"

# Build the audio mix command from timeline.json
python3 - <<'EOF'
import json, subprocess, imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe()
tl = json.load(open('timeline.json'))
scenes = tl['scenes']
inputs, delays = [], []
for i, s in enumerate(scenes):
    inputs += ['-i', f"audio/{s['file']}"]
    ms = int(s['audioAt'] * 1000)
    delays.append(f"[{i}:a]adelay={ms}|{ms},apad=whole_dur={tl['total']:.3f}[a{i}]")
n = len(scenes)
fc = ';'.join(delays) + ';' + ''.join(f'[a{i}]' for i in range(n)) + f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]"
cmd = [ff, '-y', *inputs, '-filter_complex', fc, '-map', '[out]',
       '-t', f"{tl['total']:.3f}", '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', 'narration.m4a']
subprocess.run(cmd, check=True, capture_output=True)
print('audio mixed')
EOF

# Mux frames + audio
"$FF" -y -framerate 30 -i frames/f%05d.jpg -i narration.m4a \
  -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -movflags +faststart \
  -c:a copy -shortest mimo-tutorial.mp4 2> mux.log || { tail -5 mux.log; exit 1; }
ls -la mimo-tutorial.mp4
"$FF" -i mimo-tutorial.mp4 2>&1 | grep -E "Duration|Stream"
