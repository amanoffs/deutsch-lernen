#!/usr/bin/env python3
"""Build one bilingual MP3 per vocabulary page: German -> Azerbaijani, original order.

This runs in GitHub Actions, uses synthetic voices and does not change the lesson text.
"""
import argparse
import asyncio
import json
from pathlib import Path
import random
import tempfile
import sys

import edge_tts
from pydub import AudioSegment

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "lessons.json"
OUTPUT = ROOT / "audio-lessons"

VOICES = {"de": "de-DE-KatjaNeural", "az": "az-AZ-BanuNeural"}
PAUSE_BETWEEN_LANGUAGES_MS = 480
PAUSE_BETWEEN_WORDS_MS = 900
MAX_PARALLEL_REQUESTS = 3
# Source update starts the page-one audio workflow once it is installed.


async def generate_mp3(text: str, locale: str, path: Path, lock: asyncio.Semaphore):
    async with lock:
        for attempt in range(4):
            try:
                communicator = edge_tts.Communicate(
                    text=text,
                    voice=VOICES[locale],
                    rate="-7%" if locale == "de" else "-3%",
                )
                await communicator.save(str(path))
                if path.stat().st_size < 200:
                    raise RuntimeError(f"Empty TTS clip: {locale} / {text!r}")
                return
            except Exception:
                if attempt == 3:
                    raise
                await asyncio.sleep((2 ** attempt) + random.random())


async def main(page_number: int):
    data = json.loads(DATA.read_text(encoding="utf-8"))
    books = sorted(
        (x for x in data if x.get("type") == "vocabulary"),
        key=lambda x: (int(x.get("chapter") or 999), int(x.get("page") or 999)),
    )
    if page_number < 1 or page_number > len(books):
        raise ValueError(f"Page {page_number} not found, 1..{len(books)}")
    book = books[page_number - 1]
    items = book.get("items", [])
    if not items or len(items) > 150:
        raise ValueError("Vocabulary page has no words or too many words")
    pairs = [(x.get("de", "").strip(), x.get("az", "").strip()) for x in items]
    if not all(de and az for de, az in pairs):
        raise ValueError("A vocabulary entry is missing German or Azerbaijani text")

    print(f"Preparing one MP3: {book['title']} ({len(pairs)} pairs)", flush=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / f"vocab-page-{page_number:02d}.mp3"
    with tempfile.TemporaryDirectory() as td:
        folder = Path(td)
        limiter = asyncio.Semaphore(MAX_PARALLEL_REQUESTS)
        requests = []
        for i, (de, az) in enumerate(pairs):
            requests.append(generate_mp3(de, "de", folder / f"{i:03d}-de.mp3", limiter))
            requests.append(generate_mp3(az, "az", folder / f"{i:03d}-az.mp3", limiter))
        await asyncio.gather(*requests)

        track = AudioSegment.silent(duration=200)
        between = AudioSegment.silent(duration=PAUSE_BETWEEN_LANGUAGES_MS)
        next_pair = AudioSegment.silent(duration=PAUSE_BETWEEN_WORDS_MS)
        for i in range(len(pairs)):
            german = AudioSegment.from_mp3(folder / f"{i:03d}-de.mp3")
            azerbaijani = AudioSegment.from_mp3(folder / f"{i:03d}-az.mp3")
            track += german + between + azerbaijani + next_pair
        track = track.set_frame_rate(24000).set_channels(1)
        track.export(target, format="mp3", bitrate="64k", tags={
            "title": f"Deutsch AZ - Lüğət səhifəsi {page_number:02d}",
            "artist": "Deutsch lernen AZ",
            "comment": f"{len(pairs)} German–Azerbaijani vocabulary pairs",
        })
    if target.stat().st_size < 10000:
        raise RuntimeError("MP3 export unexpectedly small")
    print(f"READY: {target} | words={len(pairs)} | seconds={len(track)/1000:.1f} | bytes={target.stat().st_size}", flush=True)


if __name__ == "__main__":
    arg = argparse.ArgumentParser()
    arg.add_argument("--page", type=int, default=1)
    args = arg.parse_args()
    asyncio.run(main(args.page))
