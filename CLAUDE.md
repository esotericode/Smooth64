# Smooth64: notes for Claude

A ROM-free browser platformer on the original SM64 movement code (C core compiled to `web/smooth64.wasm`; Three.js only draws). Three worlds: Cinder Caldera (`web/caldera.js`), Hoarfrost Heights (`web/hoarfrost.js`), and the movement playground (`web/world.js`).

## Commands

- Play: `python3 tools/serve.py`, then open http://localhost:8000.
- Everything: `npm test` (native build + Python + Node tests; needs gcc and Node 22).
- Node tests only: `node --test tests/*.test.mjs` (build `build/libsmooth64.so` first with `python3 tools/build.py native`; the parity tests use it).
- Browser check (optional): `python3 tools/package_browser.py && npm run test:browser`. It needs Playwright; a global install works with `NODE_PATH=$(npm root -g)`.
- Level map: `node tools/level_map.mjs hoarfrost docs/hoarfrost-map.svg`. Screenshots: `node tools/level_shots.mjs hoarfrost '[["name",[x,y,z],[lookX,lookY,lookZ]]]'`.
- After changing C: `python3 tools/build.py native`, and `WASI_SDK_PATH=... python3 tools/build.py wasm` with wasi-sdk-25 (the pinned tarball and checksum are in `.github/workflows/verify.yml`). The WASM build is reproducible, so commit the rebuilt `web/smooth64.wasm`.

## Conventions

- The goal is movement that is true to Super Mario 64: its jumps, momentum and action code. That is the only thing the core must protect. The C (`core/` and the vendored `vendor/libsm64/`) is not frozen: fix bugs, lift arbitrary limits, and expose SM64 features the vendored code already has.
- Prove a core change leaves movement alone: run the old and new WASM side by side on the same inputs (every tick's state bytes should match wherever the change is not meant to apply), keep the native/WASM parity tests passing, and add tests for what the change enables.
- Keep the original game's own quirks that are part of how it moves (backward long jumps, wall seams, the ground-pound check that can never match). Fix the port's bugs and the engine's limits instead.
- Record each deliberate change to a vendored file with `python3 tools/check_vendor.py --record PATH "why"`; the check fails on any change that is not recorded.
- Collision and rendering share the same integer triangles; render-only dressing (`*-scene.js`) must never look walkable where it is not.
- Every leg of a level's main route and every shard is proven reachable by driving the real core with controller plans (`tests/caldera.test.mjs`, `tests/hoarfrost.test.mjs` with `tests/routes.mjs`). Negative checks prove the intended move is needed.
- Before adding level geometry, read `docs/HOARFROST.md`: the measured physics, the building rules (traps, cut-in paths, ledge grabs, far-away dressing), and how to change a level.
- The code style is dense: short names, one-line helpers, few comments that explain why. Match it.
- No Nintendo assets; sounds are Kenney CC0 and the music is original (`THIRD_PARTY.md`).
