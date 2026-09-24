# Smooth64: notes for Claude

A ROM-free browser platformer on the original SM64 movement code (C core compiled to `web/smooth64.wasm`; Three.js only draws). Three worlds: Cinder Caldera (`web/caldera.js`), Hoarfrost Heights (`web/hoarfrost.js`), and the movement playground (`web/world.js`).

## Commands

- Play: `python3 tools/serve.py`, then open http://localhost:8000.
- Everything: `npm test` (native build + Python + Node tests; needs gcc and Node 22).
- Node tests only: `node --test tests/*.test.mjs` (build `build/libsmooth64.so` first with `python3 tools/build.py native`; the parity tests use it).
- Browser check (optional): `python3 tools/package_browser.py && npm run test:browser`. It needs Playwright; a global install works with `NODE_PATH=$(npm root -g)`.
- Level map: `node tools/level_map.mjs hoarfrost docs/hoarfrost-map.svg`. Screenshots: `node tools/level_shots.mjs hoarfrost '[["name",[x,y,z],[lookX,lookY,lookZ]]]'`.

## Conventions

- Do not change the C core or `web/smooth64.wasm`; levels use the surface types it already supports (`web/rules.js`).
- Collision and rendering share the same integer triangles; render-only dressing (`*-scene.js`) must never look walkable where it is not.
- Every leg of a level's main route and every shard is proven reachable by driving the real core with controller plans (`tests/caldera.test.mjs`, `tests/hoarfrost.test.mjs` with `tests/routes.mjs`). Negative checks prove the intended move is needed.
- Before adding level geometry, read `docs/HOARFROST.md`: the measured physics, the building rules (traps, cut-in paths, ledge grabs, budgets), and how to change a level.
- The code style is dense: short names, one-line helpers, few comments that explain why. Match it.
- No Nintendo assets; sounds are Kenney CC0 and the music is original (`THIRD_PARTY.md`).
