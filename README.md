# Smooth64

<!-- easy-browser-download -->
## Play now — no setup

[**Download Smooth64 for your browser**](https://github.com/esotericode/Smooth64/releases/latest/download/Smooth64-Browser.zip)

1. Download and extract the ZIP.
2. Double-click **Smooth64-Play.html**.
3. Click **Enter playground**.

Works offline in Edge, Chrome, or Firefox. No installation, Python, terminal, compiler, or ROM required. **WASD** moves, **Space** jumps, **Shift** crouches, **J** attacks.

The original recovery ZIP is kept in this repository. The folders below contain the editable project source.


A ROM-free movement playground built around the actual Super Mario 64 US action code, with an original capsule character and an original test level.

This is a working foundation for movement fidelity, **not yet a verified, bit-exact recreation of every N64 behavior**. The movement state machine comes from the decompilation through libsm64; the collision host, camera, and presentation are different. [Fidelity and remaining work](docs/FIDELITY.md) describes exactly where that boundary is.

## Play

Clone this branch, then run:

```sh
python3 tools/serve.py
```

Open **http://localhost:8000** and select **Enter playground**. On Windows, `py tools/serve.py` also works.

Python 3 and a current browser with WebGL 2/WebAssembly are all you need. The compiled movement core and renderer are included. No npm install, compiler, ROM, CDN, or account is needed to play. Opening `index.html` directly as a `file:` URL will not work; use the local server. The `web/` directory is also a complete static build suitable for a normal HTTP server.

The playground contains a runway, walkable ramps, a steep slippery slope, a wall-kick corridor, stairs, ledges, separated platforms, a low ceiling, and a hangable ceiling. Use the destination panel to move between experiments. Reset, pause, single-tick stepping, quarter speed, trajectory trails, collision wireframes, and live action/velocity/stick readouts are built in.

| Control | Keyboard | Standard gamepad |
|---|---|---|
| Move / run | WASD or arrows | Left stick |
| Walk gently | Alt + direction | Partial stick |
| Jump / A | Space | A / bottom face button |
| Attack / B | J or X | X or B |
| Crouch / Z | Shift or Z | Either trigger |
| Camera | Drag or Q/E; wheel to zoom | Right stick |
| Reset | R | On-screen button |
| Pause / resume | P or Escape | On-screen button |
| Advance one tick | N | On-screen button |
| Quarter speed | T | On-screen button |
| Collision mesh | V | On-screen button |
| Move guide | ? or H | Controls button |

Touch devices get an analog pad and A/B/Z buttons. Keyboard buttons retain very short taps until the next simulation tick. Gamepad input is sampled on simulation ticks. Losing window focus pauses the simulation and clears keyboard input.

## Moves

- Single, double, and triple jumps: press A again just after landing; maintain running speed for the third jump. Holding A gives a higher jump.
- Long jump: run, press Z, then A. Backflip: stand still, hold Z, then A.
- Side somersault: reverse direction while running and jump during the turnaround.
- Wall kick: jump into a wall and press A again during the contact window.
- Dive: B in the air at sufficient forward speed. At low speed, B gives a jump kick.
- Ground pound: Z in the air. Crawling, braking, sliding, ledge grabs/climbs, crouch sliding, and slide recovery use the upstream actions too.

The core's original timings apply; there is no added coyote time, automatic bunny hopping, or variable-delta acceleration.

## Engine layout

```text
core/               Small C host and public API; movement timing/root-motion tables
vendor/libsm64/     Pinned upstream C actions, math, collision adapter, and headers
web/                Original level, capsule rendering, input, camera, and debug UI
tests/              Behavioral checks and native ↔ WASM frame-by-frame comparisons
tools/              Build, serve, import, and provenance checks
docs/               Fidelity, architecture, and verification notes
```

The renderer uses Three.js only to draw. It does not provide character physics. Collision and visible geometry are generated from the same integer-coordinate triangle list. The C core advances at exactly **30 Hz**; the display interpolates positions independently. Animation clocks also advance at simulation rate even though no original character model is drawn.

`core/smooth64.h` is the engine integration boundary. The same C code can be linked into a raylib/SDL/custom native host; WebAssembly is just the first frontend. This initial API is deliberately **single-world, single-character, static geometry**.

## Build and verify

Native reference library, on Linux with Python 3 and GCC/Clang:

```sh
python3 tools/build.py native
python3 -m unittest discover -s tests -v
```

Cross-compiler, level, and display-rate checks also need Node 22+:

```sh
node --test tests/*.test.mjs
# Or run the full suite (no npm packages are installed):
npm test
```

Rebuild the checked-in browser core with [WASI SDK 25](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25):

```sh
export WASI_SDK_PATH=/absolute/path/to/wasi-sdk-25.0-x86_64-linux
python3 tools/build.py wasm
```

The build uses `-fno-fast-math`, `-ffp-contract=off`, `-fwrapv`, and `-fno-strict-aliasing`. Native `.so` building has been tested on Linux; the **ready-built browser demo runs on other desktop operating systems** without compiling C.

[Architecture and embedding](docs/ARCHITECTURE.md) · [Verification](docs/VERIFICATION.md) · [Sources and licenses](THIRD_PARTY.md)

No ROM loading or asset extraction is implemented. No Nintendo model, texture, sound, level, or skeletal pose data is bundled. Small source-derived animation timing and root XYZ movement tables are included because the movement logic reads them; see the source notes rather than treating the simulation as independent of all animation data.
