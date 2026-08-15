# Turns the raw phone recordings into scene narration tracks:
# trims the silence the speaker leaves at each end, sums to mono, normalises
# loudness, and joins the two halves of the split outro into one take.
# The video timeline is derived from these durations, so trimming here is what
# keeps the animation locked to the speech.
import json, pathlib, subprocess
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
RAW = pathlib.Path('/home/user/yahav/marketing/tutorial-video/voice-raw')
OUT = pathlib.Path(__file__).parent / 'audio'
OUT.mkdir(exist_ok=True)

# scene id -> raw take(s), in order
SCENES = [
    ('01-intro',       ['01.m4a']),
    ('02-iphone-open', ['02.m4a']),
    ('03-iphone-share',['03.m4a']),
    ('04-iphone-add',  ['04.m4a']),
    ('05-android',     ['05.m4a']),
    ('06-home',        ['06.m4a']),
    ('07-journal',     ['07.m4a']),
    ('08-community',   ['08.m4a']),
    ('10-products',    ['09.m4a']),
    ('11-outro',       ['10-a.m4a', '10-b.m4a']),
]

# leading/trailing silence trim, mono, then loudness normalise
TRIM = ("silenceremove=start_periods=1:start_duration=0.10:start_threshold=-45dB:detection=peak,"
        "areverse,"
        "silenceremove=start_periods=1:start_duration=0.10:start_threshold=-45dB:detection=peak,"
        "areverse")
POLISH = "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000"

def run(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode:
        raise SystemExit(r.stderr.decode()[-1500:])

def dur(p):
    r = subprocess.run([FF, '-i', str(p), '-f', 'null', '-'], capture_output=True)
    line = [l for l in r.stderr.decode().split('\n') if 'time=' in l][-1]
    t = line.split('time=')[1].split(' ')[0]
    h, m, s = t.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

rows = []
for sid, takes in SCENES:
    dest = OUT / f'{sid}.mp3'
    if len(takes) == 1:
        run([FF, '-y', '-i', str(RAW / takes[0]), '-ac', '1',
             '-af', f'{TRIM},{POLISH}', '-c:a', 'libmp3lame', '-b:a', '160k', str(dest)])
    else:
        # trim each half, then join with a natural 0.35s beat between them
        parts = []
        for i, t in enumerate(takes):
            tmp = OUT / f'.{sid}.part{i}.wav'
            run([FF, '-y', '-i', str(RAW / t), '-ac', '1', '-af', TRIM, str(tmp)])
            parts.append(tmp)
        run([FF, '-y', '-i', str(parts[0]), '-i', str(parts[1]),
             '-filter_complex',
             f'[0:a]apad=pad_dur=0.35[a0];[a0][1:a]concat=n=2:v=0:a=1,{POLISH}[out]',
             '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '160k', str(dest)])
        for p in parts:
            p.unlink()
    d = dur(dest)
    rows.append((sid, d))
    print(f'{sid:16s} {d:6.2f}s')

with open(pathlib.Path(__file__).parent / 'durations.csv', 'w') as f:
    for sid, d in rows:
        h = int(d // 3600); m = int((d % 3600) // 60); s = d % 60
        f.write(f'{sid},{h:02d}:{m:02d}:{s:05.2f}\n')
print('total speech %.1fs' % sum(d for _, d in rows))
