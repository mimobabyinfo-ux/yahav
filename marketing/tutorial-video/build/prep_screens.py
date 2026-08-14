# Copies the real-app screenshots into the video asset dir.
# The shoot hides the fixed bottom nav for body shots and captures it
# separately (nav-*.png), so nothing has to be cut here.
from pathlib import Path
import shutil

SRC = Path('/home/user/yahav/marketing/tutorial-video/screens')
DST = Path(__file__).parent / 'assets' / 'screens'
DST.mkdir(parents=True, exist_ok=True)

for p in SRC.glob('*.png'):
    shutil.copy(p, DST / p.name)
    print(p.name)
