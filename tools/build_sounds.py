#!/usr/bin/env python3
"""Build the game's sound sprite from pinned CC0 sources.

Writes web/sounds.mp3 (every sample in one file, so the game makes one request)
and web/sounds.js (where each sample sits in it). Every sample is Kenney's CC0
audio: four official Godot starter kits, plus the Kenney subset bundled in the
Python Arcade wheel. No Nintendo sound is used; the movement core only reports
*which* original sound it would play, and web/audio.js picks one of these.

Maintainers only: needs ffmpeg with libmp3lame, and network access or a --cache
directory holding the files. Playing the game needs neither.
Usage: python3 tools/build_sounds.py [--cache DIR] [--ffmpeg PATH]
"""
import argparse
import array
import hashlib
import io
import math
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
MARKER = 0.05   # a 1 kHz sync burst; lets the game measure any decoder delay
GAP = 0.08      # silence after each sample
KIT = "https://raw.githubusercontent.com/KenneyNL/{}/{}/{}"
FPS = ("Starter-Kit-FPS", "185fd2326d74a5cf858cffc616f87cf9696f9cc0")
PLATFORMER = ("Starter-Kit-3D-Platformer", "3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0")
RACING = ("Starter-Kit-Racing", "2f2e5f2646dda89cb21d4e8539bab60c6e955dc8")
CITY = ("Starter-Kit-City-Builder", "4535092b740b378b700efd9df9e27a631815b84a")
ARCADE = ("https://files.pythonhosted.org/packages/a9/c9/5888ddef3668caee10b6111dfb98a96addacef40b9b098213497a8ed614e/"
          "arcade-3.3.3-py3-none-any.whl", "25f4e0e5b8bcbe7a7d087c0a23b19e9f423b0c70ec00945c8712c9a3e541ebd2")
SOURCES = {
    "walking": (FPS, "sounds/walking.ogg", "51d44e4ce2e06607f7be1bb7fe60d7630c78fdbcd608e7c65d5a8910cc88680c"),
    "jump_a": (FPS, "sounds/jump_a.ogg", "8aba76c0bedcbb0eed297d1617500b48fefc674272b168b3f06418a2ab0a940b"),
    "jump_b": (FPS, "sounds/jump_b.ogg", "47e6e32edfebfb884b9dfd6116dccf0cda81af09bd36009022cf99464837e59c"),
    "jump_c": (FPS, "sounds/jump_c.ogg", "3e854bd28b41b4e8e21a1e3e84ac2325a893971969a2e3b63edf26b44d3b1e2f"),
    "weapon_change": (FPS, "sounds/weapon_change.ogg", "0b39e0f0d733cae3c44a838d67ab8c8510cf3b245016e398a7eb9ab13cda1449"),
    "jump": (PLATFORMER, "sounds/jump.ogg", "f090c16689e9ec04c4bef80bfcbf68bc4b63ab4ce29f7fbb5cee05a5641d5694"),
    "land": (PLATFORMER, "sounds/land.ogg", "145a1c17125dc4d344ac135bc5073e35ea12e19700ca30ee6e1e477010b4dca0"),
    "tiny_steps": (PLATFORMER, "sounds/walking.ogg", "e4043660b7bc15bd1ec208c4193838da5a2618bde6f35e3d76654557268aa221"),
    "impact": (RACING, "audio/impact.ogg", "964c5fcfb91e7710e2af25c2243c8b7160756b223b0984bacc9eb25bfeea057b"),
    "placement-a": (CITY, "sounds/placement-a.ogg", "55e3bad35a443c0a7cc3e0079ae2d2aaae89277495e5b7f8a9c29ca312c0585f"),
    "placement-b": (CITY, "sounds/placement-b.ogg", "5313810e1bb9705634da0a4f07524a7abbe65015cbad8dc630d32947cf3ecc87"),
    "placement-c": (CITY, "sounds/placement-c.ogg", "afff7bb2fdb634c91acb90b6848e752de7eccaaecb3e5dfc5720980ac8608c52"),
    "placement-d": (CITY, "sounds/placement-d.ogg", "1d51fb31658bed131ebc3df59e94f8ae6dfc4336a493f60ff052c9bf80de1302"),
    "removal-a": (CITY, "sounds/removal-a.ogg", "76301d3fccd52dca0344c63e4b56995eead7e6bc88b430d31497d58c82350f64"),
    "removal-b": (CITY, "sounds/removal-b.ogg", "3b83d3870d7c23442b59ec1afd2d19eab15fed8539665b00d8448cf9cd85b68b"),
    "toggle": (CITY, "sounds/toggle.ogg", "5acba303b9adfb15fc3445801ad2501dd2b7ba57917ec797184b98e4b1c6797f"),
}
for name in ["coin2", "coin3", "secret2", "secret4", "upgrade2", "hurt4", "hurt5", "fall3", "lose1"]:
    SOURCES[name] = (ARCADE, f"arcade/resources/assets/sounds/{name}.wav", None)

# Sample name, source, window in seconds. Each window is trimmed to its onset,
# faded, and peak-normalised; web/audio.js balances the levels.
STEPS = [0.005, 0.758, 1.197, 2.025, 2.429, 3.627]   # clean-tailed footfalls
TIPTOES = [0.013, 0.245, 0.441, 0.669]
SAMPLES = [(f"step{i + 1}", "walking", t - 0.004, t + 0.24) for i, t in enumerate(STEPS)]
SAMPLES += [(f"tiptoe{i + 1}", "tiny_steps", t - 0.004, t + 0.07) for i, t in enumerate(TIPTOES)]
SAMPLES += [
    ("push1", "jump_a", 0, None), ("push2", "jump_b", 0, None), ("push3", "jump_c", 0, None),
    ("bwip", "jump", 0, None), ("land", "land", 0, None),
    ("thump1", "placement-a", 0, None), ("thump2", "placement-b", 0, None),
    ("thump3", "placement-c", 0, None), ("thump4", "placement-d", 0, None),
    ("impact", "impact", 0, 0.45), ("poof1", "removal-a", 0, 0.36), ("poof2", "removal-b", 0, 0.3),
    ("clink", "weapon_change", 0.285, 0.345), ("click", "toggle", 0, None),
    ("coin", "coin2", 0, None), ("chime", "coin3", 0, None), ("shard", "secret4", 0, None),
    ("star", "upgrade2", 0, None), ("reveal", "secret2", 0, None), ("hurt", "hurt4", 0, None),
    ("scorch", "hurt5", 0, None), ("fall", "fall3", 0, None), ("lose", "lose1", 0, None),
]


def fetch(url, sha256, cache):
    path = cache / hashlib.sha256(url.encode()).hexdigest()[:16] / url.rsplit("/", 1)[1]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    if sha256 and hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f"Checksum mismatch: {url}")
    return data


def source_bytes(name, cache):
    origin, member, sha256 = SOURCES[name]
    if origin is ARCADE:
        with zipfile.ZipFile(io.BytesIO(fetch(*ARCADE, cache))) as wheel:
            licence = wheel.read("arcade/resources/assets/sounds/License.txt").decode()
            assert "licensed CC0" in licence, "Arcade's Kenney sounds must remain CC0"
            return wheel.read(member)
    repository, revision = origin
    return fetch(KIT.format(repository, revision, member), sha256, cache)


def decode(ffmpeg, data):
    result = subprocess.run([ffmpeg, "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(RATE),
                             "-f", "f32le", "pipe:1"], input=data, capture_output=True, check=True)
    return array.array("f", result.stdout)


def prepare(signal):
    """Trim to the onset (2 ms pre-roll) and the audible tail, fade, peak-normalise."""
    peak = max(map(abs, signal))
    start = next(i for i, v in enumerate(signal) if abs(v) > peak * 0.1)
    end = max(i for i, v in enumerate(signal) if abs(v) > peak * 0.001) + 1
    out = list(signal[max(0, start - int(RATE * 0.002)):end])
    fade_in, fade_out = int(RATE * 0.001), min(int(RATE * 0.04), len(out) // 4)
    for i in range(fade_in):
        out[i] *= i / fade_in
    for i in range(fade_out):
        out[-1 - i] *= i / fade_out
    gain = 0.891 / max(map(abs, out))   # -1 dBFS
    return [v * gain for v in out]


def level(signal):
    """Loudness estimate in dB: RMS of the active part above ~150 Hz."""
    k = math.exp(-2 * math.pi * 150 / RATE)
    y = previous = 0.0
    filtered = []
    for v in signal:
        y = k * (y + v - previous)
        previous = v
        filtered.append(y)
    peak = max(map(abs, filtered))
    active = [v for v in filtered if abs(v) > peak * 0.03] or filtered
    return 10 * math.log10(sum(v * v for v in active) / len(active) + 1e-12)


def build(cache, ffmpeg):
    decoded = {}
    sprite = [0.0] * int(RATE * MARKER)
    sprite += [0.9 * math.sin(2 * math.pi * 1000 * i / RATE) for i in range(int(RATE * 0.01))]
    sprite += [0.0] * int(RATE * 0.1)
    manifest = []
    for name, source, start, end in SAMPLES:
        if source not in decoded:
            decoded[source] = decode(ffmpeg, source_bytes(source, cache))
        signal = decoded[source]
        window = signal[int(start * RATE):len(signal) if end is None else int(end * RATE)]
        sample = prepare(window)
        manifest.append(f"  {name}:[{len(sprite) / RATE:.5f},{len(sample) / RATE:.5f},{level(sample):.1f}],")
        sprite += sample + [0.0] * int(RATE * GAP)
    pcm = array.array("f", sprite).tobytes()
    subprocess.run([ffmpeg, "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
                    "-c:a", "libmp3lame", "-q:a", "4", "-map_metadata", "-1", "-fflags", "+bitexact",
                    "-flags:a", "+bitexact", str(ROOT / "web/sounds.mp3")], input=pcm, check=True)
    (ROOT / "web/sounds.js").write_text(
        "// Generated by tools/build_sounds.py. DO NOT EDIT.\n"
        "// Kenney CC0 samples in sounds.mp3: [start s, duration s, loudness dB].\n"
        f"export const MARKER={MARKER};\n"
        "export const SAMPLES={\n" + "\n".join(manifest) + "\n};\n")
    size = (ROOT / "web/sounds.mp3").stat().st_size
    print(f"Built web/sounds.mp3 ({size:,} bytes, {len(sprite) / RATE:.1f} s, {len(SAMPLES)} samples)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, default=ROOT / "build/sound-sources")
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG") or shutil.which("ffmpeg"))
    args = parser.parse_args()
    if not args.ffmpeg:
        raise SystemExit("ffmpeg with libmp3lame is required (pass --ffmpeg or set FFMPEG)")
    build(args.cache, args.ffmpeg)
