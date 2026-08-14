# Generates Hebrew narration MP3s for the tutorial video from narration.json.
# Runs in GitHub Actions (see .github/workflows/tutorial-tts.yml) because the
# TTS service is not reachable from every dev environment.
import asyncio
import json
import pathlib

import edge_tts

HERE = pathlib.Path(__file__).parent
OUT = HERE / "audio"


async def main() -> None:
    spec = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    for line in spec["lines"]:
        dest = OUT / f"{line['id']}.mp3"
        tts = edge_tts.Communicate(line["text"], voice=spec["voice"], rate=spec["rate"])
        await tts.save(str(dest))
        print(f"{dest.name}: {dest.stat().st_size} bytes")


if __name__ == "__main__":
    asyncio.run(main())
