# Smooth64: notes for Claude

A ROM-free browser platformer on the original SM64 movement code (C core compiled to `web/smooth64.wasm`; Three.js only draws). Three worlds: Cinder Caldera (`web/caldera.js`), Hoarfrost Heights (`web/hoarfrost.js`), and the movement playground (`web/world.js`).

## Pending work: Hoarfrost Heights, part 2

Part 1 of Hoarfrost Heights, from the camp to the Icefall Star on the Shoulder, is built and proven reachable. **Part 2 (the upper Horn to the Aurora Star, three more Frost Shards, the Avalanche Run, and the Polar Star) is planned but not built.** When the user asks to finish or continue the ice level, read `docs/HOARFROST.md` first: it has the plan with coordinates and triangle budgets, the measured physics, the building rules learned in part 1, and a step-by-step checklist. `grep -rn "PART 2" web tests tools` finds every hook in the code.

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
- The code style is dense: short names, one-line helpers, few comments that explain why. Match it.
- No Nintendo assets; sounds are Kenney CC0 and the music is original (`THIRD_PARTY.md`).
