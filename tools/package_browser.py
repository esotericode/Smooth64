#!/usr/bin/env python3
"""Produce a completely offline HTML game: double-click to play, no server.

Packaging requires Node/npm and pinned esbuild. Playing requires only a browser.
The same committed C/WASM core is embedded unchanged.
"""
import base64
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
BUILD = ROOT / "build"
DIST = ROOT / "dist"


def data_url(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def package():
    BUILD.mkdir(exist_ok=True)
    DIST.mkdir(exist_ok=True)
    source = (WEB / "main.js").read_text()
    # Only the exact startup asset requests change. Three.js and all game
    # modules are bundled by esbuild; there are no network requests at runtime.
    for name, mime in [("smooth64.wasm", "application/wasm"), ("actions.json", "application/json"),
                       ("sounds.mp3", "audio/mpeg")]:
        request = f"fetch('{name}')"
        if source.count(request) != 1:
            raise RuntimeError(f"Expected exactly one startup request for {name}")
        source = source.replace(request, f"fetch('{data_url(WEB / name, mime)}')")
    source = source.replace("from './", "from '../web/")
    entry = BUILD / "standalone-entry.js"
    bundle = BUILD / "standalone.js"
    entry.write_text(source)
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise SystemExit("Packaging needs Node.js/npm. Download the ready-built HTML to play without it.")
    subprocess.run([npx, "--yes", "--package=esbuild@0.25.10", "esbuild", str(entry),
                    "--bundle", "--format=esm", "--minify", "--target=es2022",
                    "--legal-comments=inline", f"--outfile={bundle}"], check=True, cwd=ROOT)
    html = (WEB / "index.html").read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">',
                        '<style>' + (WEB / "style.css").read_text() + '</style>')
    script = bundle.read_text().replace('</script', '<\\/script')
    html = html.replace('<script type="module" src="main.js"></script>',
                        '<script type="module">' + script + '</script>')
    html = html.replace('href="./"', 'href="#"')
    html = html.replace('<title>Smooth64 — Cinder Caldera</title>',
                        '<title>Smooth64 — Play offline</title>')
    # Keep license notices with the one-file deliverable as well as the ZIP.
    notices = (ROOT / "LICENSE").read_text() + '\n\n' + (ROOT / "THIRD_PARTY.md").read_text()
    notices += '\n\n' + (WEB / "vendor/THREE-LICENSE.txt").read_text()
    notices += '\n\n' + (ROOT / "vendor/libsm64/LICENSE.md").read_text()
    html += '\n<!-- Source and license notices\n' + notices.replace('--', '—') + '\n-->\n'
    output = DIST / "Smooth64-Play.html"
    output.write_text(html)
    guide = """SMOOTH64 — DOUBLE-CLICK TO PLAY

1. Extract this ZIP (right-click it, then Extract All on Windows).
2. Double-click Smooth64-Play.html.
3. Click Play Cinder Caldera, or Visit the playground.

If asked which app to use, choose Microsoft Edge, Chrome, or Firefox.
No installation, account, internet connection, Python, terminal, or ROM needed.

WASD / arrow keys: move    Space: jump    Shift: crouch    J: attack/dive
Drag the view: camera     R: checkpoint  Controls button: full move guide
Escape / P: pause menu    Gamepad Start: pause menu

SOUND: starts after your first click or key press. Menu > Settings > Sound
effects sets the volume, and Menu > Settings > Music sets the quiet background
music (0% turns it off). If a gamepad stick drifts, raise Menu > Settings >
Stick dead zone (15% by default).

Long jump: run, press Shift, then Space.
Backflip: stand still, hold Shift, then Space.
Double/triple jump: jump again just after landing; run for the third jump.
Wall kick: jump into a wall, press Space again the moment you touch it.
Ledge grab: catch a lip while falling; push toward it to climb, Space climbs quickly.
Pull away from the lip or press Shift to let go. The on-screen arrow follows the camera.
Ceiling hang: jump into a hangable ceiling holding Space, then steer to shuffle.

CINDER CALDERA: climb the volcanic Spire to the Ember Star. Lava burns three
wedges of health; coins heal one. Touch beacons to set your checkpoint (R returns
there). Eight red Ember Shards hide behind optional challenges; all eight light
the Crimson Star on the lava altar.

PLAYGROUND: eleven practice areas, including the new lava crossing. Find 34
healing coins across the original courses and trails. Menu > Practice destinations
opens every area. Power, coins, lava and checkpoint recovery work as in the level.

SETTINGS: the default view shows your power and collectibles. Open Menu for
destinations, objectives, sound and music volume, the stick dead zone, movement hints and
the optional timer. Enable Developer tools for action/velocity readouts, frame
stepping, slow motion, trails and mesh. Your settings are remembered. Each
world's progress survives switching worlds and checkpoint retries until you
choose Start this world over or reload.

The game pauses when you switch windows. Press P to resume.
Requires a browser with WebGL 2 and WebAssembly enabled.

Source and fidelity notes: https://github.com/esotericode/Smooth64
The original action code is used, but complete N64 1:1 equivalence remains unverified.
"""
    archive = DIST / "Smooth64-Browser.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(output, output.name)
        z.writestr("START-HERE.txt", guide)
        z.writestr("LICENSES.txt", notices)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
    print(f"Ready: {output.name} ({output.stat().st_size:,} bytes)")
    print(f"Ready: {archive.name} ({archive.stat().st_size:,} bytes)")


if __name__ == "__main__":
    package()
