# Hoarfrost Heights: design notes and the part 2 plan

> **Status: part 1 is built and tested. Part 2 is planned here and not built yet.**
> Asked to "finish Hoarfrost Heights" (or build part 2)? Read this whole file, then work
> through [Finishing the level](#finishing-the-level-the-part-2-checklist) from top to bottom.
> Every hook in the code is marked `PART 2`: `grep -rn "PART 2" web tests tools`.

![Top-down map of part 1](hoarfrost-map.svg)

*The map is generated: `node tools/level_map.mjs hoarfrost docs/hoarfrost-map.svg`. Regenerate it after changing the level. The dashed magenta areas are reserved for part 2.*

## At a glance

A high valley floats on a sea of cloud under the **Hoarfrost Horn**. You start at Frostmere Camp on the valley's southern lip. The route crosses frozen Mirror Lake, climbs the snowbound Pinewood, rides a glacier chute, and scales an icefall to the Shoulder, halfway up the Horn. Part 2 climbs the Horn itself to the summit and slides home.

| | Cinder Caldera | Hoarfrost Heights (part 1) | Hoarfrost Heights (with part 2) |
|---|---|---|---|
| Footprint | 12,800 × 12,800 | 23,000 × 34,800 (with the Horn's massing) | same |
| Height climbed | 3,200 | 4,560 (Shoulder cairn) | ~10,600 (summit) |
| Collision triangles | 1,260 | 1,910 | ≤ 4,000 (core limit 4,096) |
| Stars | 2 | 1 (Icefall Star) | 3 (+ Aurora Star, Polar Star) |
| Shards | 8 | 5 Frost Shards | 8 |
| Coins | 52 | 65 | 100 |
| Checkpoints | 5 | 6 | 9 |

Files: `web/hoarfrost.js` (geometry, pickups, checkpoints, copy, theme), `web/hoarfrost-scene.js` (render-only dressing), `web/builder.js` (the geometry kit), `tests/hoarfrost.test.mjs` (proofs), `tests/routes.mjs` (the route-proof kit), `tools/level_map.mjs` and `tools/level_shots.mjs` (map and screenshots).

## The route, as built (part 1)

Coordinates are `[x, y, z]` in SM64 units; +X is east, −Z is north. `route` in `web/hoarfrost.js` lists the waypoints in order.

| # | Section | What you do | Moves it needs | Where |
|---|---|---|---|---|
| 1 | **Frostmere Camp** (checkpoint `camp`) | Start. Tents, a campfire, a signpost, the watchtower. | — | plateau at y 500, around `[0, 500, 11500]` |
| 2 | **Mirror Lake** | Hop north-west across snow floes. The third floe is ice tilted 13° toward the runway: it slides you at once, and you jump from the slide. The runway is flat ice (you cannot stop); a 1,100-unit channel of frostbite water needs a **long jump** to the west shore. | running jumps, slide jump, long jump | floes y 100–180, runway y 90 at `[-4430, 90, 6080]` |
| 3 | **Pinewood Drifts** (checkpoint `shore`) | Two terraces of deep snow (runs top out at 24), each 350–400 up: a jump and **ledge grab** out of slow snow. | jump + grab | y 100 → 450 → 850 |
| 4 | **Pinewood Ravine** (checkpoint `ravine`) | A fallen pine spans a gorge into the clouds. It is 130 wide, iced (slick), and snapped in two: jump the break. Then a 400 step and a slippery 18° ramp to the glacier. | narrow beam, gap jump, grab | log y 850 → 1000, terrace 1400, margin 1800 |
| 5 | **The Glacier** (checkpoint `margin`) | Jump the first crevasse (450). A plate climbs east to a snow bridge. The **ice chute** drops 400 over 2,000 units: you slide at ~93 units a tick, and must **jump before the lip** to clear the 1,200-unit Great Crevasse. The far side stands higher than the lip, so sliding off without a jump hits its wall. Then a snowfield rises north. | slide jump (window ~100–600 units before the lip) | chute `x 250..2250`, y 2150 → 1750 |
| 6 | **The Icefall** (checkpoint `icefall`) | A 400 serac step (grab), a **950-unit wall-kick chimney** (walls 420 apart), then the **rock rib**: grippy rock at 45° beside an identical ice chute that cannot be climbed. A ~450-unit gap (the bergschrund) to the Shoulder. | grab, wall kicks, running jump | foot y 2300 → 2700 → 3650 → 4350 |
| 7 | **The Shoulder** (checkpoint `shoulder`) | The Halfway Hut, the "Trail snowed in" sign, and the **Icefall Star** on a cairn. The Horn's south face rises behind it as a near-vertical cliff of very slippery floor; the snowbank to the west is a 56° very slippery slope. Part 1 ends here. | a 260 step | y 4300, star at `[4200, 4700, -9700]` |

### Frost Shards (part 1)

| Id | Where | Challenge | Proven by |
|---|---|---|---|
| `shard-tower` | Watchtower lookout, camp | From the woodshed roof (400 up, a grab), **backflip** 480 onto the lookout (a double jump also works; a single jump cannot). | backflip plan; negative single-jump check |
| `shard-floe` | The Lone Floe, Mirror Lake | A ~650-unit hop onto a 200-radius ice floe. **Let go of the stick as you land** or you slide off. | land-and-stop plan |
| `shard-pine` | Crown of the Great Pine, Pinewood | Four boughs, each ~340 above the last: jump and grab, bough to bough. Boughs are walkable snowy cones 160 thick (so their lips can be grabbed). | per-bough plans |
| `shard-crevasse` | A ledge inside the first crevasse | Hang from the edge, drop 650 onto the ledge, then **wall-kick** out (walls 450 apart). | hang-drop, kick-out plans |
| `shard-needle` | Serac needle beside the chimney top | A **double jump** and grab from the chimney top (+580; a single jump cannot). | double-jump plan; negative check |

The lake also has a side loop (Lone Floe → Mirror Isle → floes → back to camp), proven hop by hop. The Mirror Isle is where part 2's Polar Star appears; a star outline marks the spot.

## How the surfaces behave (measured with the real core)

These numbers come from driving the unchanged core. Design gaps and slopes around them.

| Behaviour | Measured |
|---|---|
| Run speed | 32 (deep snow 23.6, ice 30.5) |
| Running jump | ~840 far, peak ~335 |
| Running long jump | ~1,520 far on the flat (deep snow ~1,440: air control recovers speed) |
| Double jump / triple jump peak | ~490 / ~630 |
| Backflip / side somersault peak | ~512 / ~512 |
| Reach with a ledge grab | single 450 (from deep snow ~330 is comfortable), double or triple 600, backflip 500 |
| Wall-kick shaft | walls ≤ 550 apart work indefinitely; 700 does not |
| Braking from a full run | default 105, slippery 330, **ice/very slippery 1,180** |
| Reversing on ice | ~1,080 of skid past the turn |
| Landing a jump and letting go | stops within ~80–100 on **any** surface (the landing action), so ice only bites when you run |
| Uphill running (200 ticks) | default: fine to ~40°, slides from 45°; slippery: to ~20°, slides from 25°; **ice/very slippery: stalls at ~12°, slides from ~20°**; **not slippery (rock): climbs even 65°**; deep snow: like default, slower |
| Very slippery slope ≥ 10° | you butt-slide down it, reaching ~90–100 a tick, with strong steering; A jumps out of the slide (jump speed ×0.8, vertical 42 + ¼ speed) |
| Fall damage | > 1,150 → 2 wedges; > 3,000 → 4 wedges (landing on a slope steep enough to slide avoids the smaller one) |
| Frostbite water (`SURFACE_BURNING`) | 3 wedges and a launch, exactly like lava |
| Hanging (`HANGABLE` ceiling) | ~4 units a tick: keep traverses ≤ ~1,100 long; the body hangs 160 below the ceiling |
| Wind (`SURFACE.WIND`, 0x2C) | **always pushes toward +Z (south)**: the host never sets a surface force. Standing: ~4.7 a tick; a jump drifts ~400 south; running north into it: about half speed; running east/west: unaffected. Acts only while the floor under you is a wind floor. The core requests `SOUND_ENV_WIND2` (bank 4, ID 0x10) every tick on it; `audio.js` ignores bank 4 today. |

## Building rules learned in part 1 (read before adding geometry)

- **Every gap needs a floor far below.** Where there is no floor at all, the core treats the space as an invisible wall. The hidden catch floor at y −2,600 (`ABYSS`, style `hidden`) covers x −16,000..16,000, z −24,000..16,000; keep new geometry inside it. Falling below y −1,500 returns you to your beacon (`rules.js`).
- **Never leave a floor under a gap that you cannot escape.** Before the Horn was pulled back, its lower slope ran under the bergschrund: a fall there would have wedged you between a slippery slope and a wall. Run the trap scan idea from the tests: drop the explorer over each gap and make sure every fall either lands somewhere climbable or drops below −1,500.
- **Where two walkable surfaces meet, their edges must meet at the same height.** If a slab overhangs a lower ramp, its wall pokes up above the ramp and stops you (walls block from 30 units above your feet). This bit the glacier margin once.
- **Slab outlines must be convex** (tops are fanned); `builder.slab` throws if one is not.
- **Ledge grabs need a wall under the lip.** Your feet must be 100–150 below the lip while you touch a wall, so anything you grab (boughs, ledges) must be ≥ ~120 thick. Grabbed floors must be flatter than 25°.
- **Colour tells the player what a surface does:** white snow is safe, blue is ice (you slide), bright white is deep snow, grey rock grips. Keep that language in part 2.
- **Checkpoints must stand on flat floors** (the spawn test compares heights exactly).
- **Coins belong to the checkpoint whose stretch they sit on** (`section` = the checkpoint's name): the menu counts coins per checkpoint. Coins over a gap (tracing a jump) need `{arc:true}` and a test that a real jump collects them.
- **Budget:** part 1 is capped by `PART1_BUDGET` (2,200) in `web/hoarfrost.js`. The core holds 4,096 triangles; collision is a linear scan, so ~4,000 is fine at 30 Hz, but test searches get slower with every triangle.
- **Walls and slabs get a snow `lip`** (a band of the top colour on each wall) so terraces read as snow over rock or ice.
- **The camera sees up to 44,000** (`theme.far`), and fog runs 8,000–38,000. The sky dome, aurora and stars follow the camera.

## Part 2 plan: the upper Horn

Part 2 continues from the Shoulder (y 4300) to the summit (~10,600), then slides home. The Horn is placeholder massing built by `builder.mountain` from rings (`horn` in `web/hoarfrost.js`): a near-vertical south face from the clouds to y 5,200 (roughly z −10,050 at the bottom to z −10,470 at the top, between x −800 and 6,200), 60° snow slopes to y 7,800, fluted ridges to 9,000, and an apex at `[-300, 10600, -14600]`. Every flank is `VERY_SLIPPERY`, so the route must be **added** as ledges, pillars, ridges and rock ribs attached to it, or by reshaping rings where needed. Keep new geometry inside the reserved areas (`world.reserved`, drawn dashed on the map) unless you update them.

Budget for part 2: **≤ 2,000 triangles** (1,910 used; 2,186 free). The estimates below total about 1,300, which leaves room for dressing and fixes.

### 7. The Frozen Falls (checkpoint `falls`, ~200 triangles, 8 coins)

- **Remove the snowbank** (`PART 2 HOOK: the trail west`) and the "TRAIL SNOWED IN" board in `hoarfrost-scene.js`.
- **Ledge trail**: narrow slabs (width ~250) at y 4300 hugging the Horn's south cliff from the Shoulder's west end (x 3,400) west to x ~1,600. The cliff is at z ≈ −10,410 at that height, so run the ledges' north edges into the face (hidden) and put their south edges around z −10,150. Break it with two gaps (350 and 450): running jumps on a narrow ledge over the void.
- **The falls**: a tall ice slab against the cliff, x −1,400..1,400, z −10,800..−10,250, top 6,400. Its south face is the frozen curtain (ice style). Its top is flat snow: the checkpoint.
- **Kick shaft**: free-standing ice pillars (r 160, from −1,400 up to 5,200) whose north faces stand ~380 from the curtain, e.g. centred at `[1000, *, -9710]`. Wall-kick up between pillar and curtain from 4,300 to a curtain ledge at 5,300 (x 600..1,200, protruding 300).
- **Icicle traverse**: an overhang whose underside is `HANGABLE` at y 5,600 (300 above the ledge; you hang 160 below it), running west from x 500 to about x −600 (≤ 1,100 long), z −10,250..−9,950.
- **West ledge** at 5,300 (x −1,400..−800), then a `NOT_SLIPPERY` rock rib (~50°) from 5,300 up to the falls' top at 6,400.
- **Shard 6 `shard-falls`, "Under the icicles"**: an ice pillar (r ~140, top ~5,250) directly under the traverse. Let go of the ceiling above it, land, take the shard, then hop to the west ledge. Test: hang, release above the pillar, land; negative check: it cannot be reached from the ledges with a plain jump.
- Checkpoint `falls`: `[-600, 6400, -10500]`, facing west.

### 8. Gale Ridge (checkpoint `ridge`, ~250 triangles, 8 coins)

- From the falls' top (x −1,400), a ridge of narrow **wind** slabs (`SURFACE.WIND`, width 240–280) climbs west along the Horn's south-west shoulder to about `[-6500, 7400, -12600]`, then turns north up the west side to about `[-6800, 8200, -15500]`.
- The wind always blows **south**. On the east–west stretch it pushes you off the ridge's south edge: standing still is dangerous, running along the ridge is safe, and jumps drift ~400 south, so aim north. On the north-bound stretch it is a headwind: half speed, and jumps north fall short. Measure every gap with the lab before fixing it; wind acts only while the floor under you is a wind floor, so the drift over a gap is partial.
- **Shelters**: two or three rock outcrops of ordinary floor (~500 × 500) where you can stop. The turn north is the checkpoint `ridge`.
- Gaps: three on the east–west stretch (300, 400, 500) and two on the headwind stretch.
- **Shard 7 `shard-vane`, "The Weathervane"**: a pinnacle ~800 south of the east–west stretch (downwind). Going out, the wind carries your jump long (aim short); coming back is a long jump into the wind. Test both directions; negative check: a plain jump back falls short.
- Audio: map bank 4 ID 0x10 (`SOUND_ENV_WIND2`) in `audio.js` `soundCue` to a new generated `wind` bed (gusty low-passed noise, like the `slide` bed), and test it in `tests/audio.test.mjs`.
- Dressing: blowing snow streaks over the ridge, whipping prayer flags at the shelters.

### 9. The Cornice and the Summit (checkpoint `summit`, ~300 triangles, 6 coins)

- From the top of the headwind climb, traverse east along the Horn's north face **hanging under a cornice**: a `HANGABLE` underside at y ~8,700, ≤ 1,100 long, over the void.
- **Summit spire**: two rock towers ~460 apart (a wall-kick shaft ~900 tall, 8,400 → 9,300), a ledge at 9,300, then a `NOT_SLIPPERY` rock ramp to the summit.
- **Flatten the apex**: end the rings at a small ring (radius ~500) at y ~10,200 and close it with a flat snow top instead of the apex. Add a `flatTop` option to `builder.mountain`, or close the last ring with `builder.slab`. Put a cairn on it.
- **The Aurora Star `aurora-star`** on the cairn, around `[-300, 10600, -14600]`. It becomes the world's `goal` (the clock stops here).
- **Shard 8 `shard-tip`, "The Horn's Tip"**: an ice needle (r ~110) rising ~1,100 above the summit's edge, 430 from a summit rock: wall-kick up between them. Negative check: a triple jump from the platform cannot reach it.
- Checkpoint `summit`: the flat ledge at the spire's foot, around y 8,400.

### 10. The Avalanche Run (~250 triangles, 10 coins)

- The long way home: a `VERY_SLIPPERY` luge from the summit's east edge down the Horn's east flank, then south as a raised ice track (on pillars, over the glacier's east side) to the valley. End on flat snow at the east side of Frostmere Camp (around `[2600, 500, 11000]`), which stops the slide.
- Segments ~1,200 long at 12–18°, 600–800 wide, with solid side walls ≥ 100 thick and 300 high on the curves (at ~100 units a tick, thin walls can be tunnelled). One or two lips to jump, friendlier than the chute.
- Test: from the summit, a steering plan reaches the camp's floor; the coins along it are collectable in one run.

### 11. The Polar Star (bonus, ~40 triangles, 3 coins)

- The Polar Star `polar-star` (kind `bonus`) appears when all 8 Frost Shards are found, on an ice spire on the **Mirror Isle** (`[1500, 250, 5700]`). Make the spire r ~170 and 520 tall (top 770), with the star at ~900, so a **double jump** and grab reaches it and a single jump cannot. Move the star outline in `hoarfrost-scene.js` to the spire top.
- `text.reveal`: "Every Frost Shard found! The Polar Star shines over the Mirror Isle."

## Finishing the level: the part 2 checklist

Work in this order. Keep the tests green after each step (`npm test`).

1. **Plan in the lab first.** Measure each new jump or kick with `tests/routes.mjs` from a scratch script before fixing coordinates: `routeKit(world)`, `hopper`, `reachable`, and the plan builders (`jump`, `jumpNear`, `longJump`, `double`, `backflip`, `kicks`, `climb`). Chained hops need position-triggered jumps (`jumpNear`), not tick counts.
2. **Geometry** in `web/hoarfrost.js`: remove the snowbank; add sections 7–11 inside the reserved areas; flatten the apex; add the checkpoints `falls`, `ridge` and `summit` to `checkpoints` (menu order); extend `route`; add shards `shard-falls`, `shard-vane` and `shard-tip`, the `aurora-star` and the `polar-star` bonus; add ~35 coins, each with the section of its checkpoint, to reach 100. Replace `PART1_BUDGET` with a whole-level budget (≤ 4,000), and remove or refresh `reserved`.
3. **Goal and copy**: set `goal:'aurora-star'`. Rewrite `text`: objectives Icefall Star, Aurora Star, Frost Shards (8), and Polar Star (`needsShards:true`); `reveal`; and `victory(kind,{session,shards,best,pickup})`, branching on `pickup.id` for each star. Update the welcome button subtitle in `web/index.html` (e.g. "3 stars to claim · 8 shards to discover"), the Hoarfrost paragraph in the help dialog, and the guide in `tools/package_browser.py`.
4. **Dressing** in `web/hoarfrost-scene.js`: ice curtain and icicles, wind streaks, summit cairn and flag, luge banners; remove the snowed-in board; move the Polar Star outline. Check the look with `tools/level_shots.mjs`.
5. **Audio**: the `wind` bed for `SOUND_ENV_WIND2`, plus a test. Two polish items left from part 1:
   - Frostbite water still voices the lava `scorch` cue and the crackling `burn` bed (only the particles are frost-coloured). Give the theme an audio hazard (a splash and an icy fizz) that `audio.js` can switch to.
   - Footsteps sound like grass, because the host fixes the area's terrain type. A presentation-only remap in `audio.js` (grass → snow, stone → ice in this world) would make them crunch.
6. **Tests** in `tests/hoarfrost.test.mjs`:
   - update the counts (8 shards, 2 stars, 1 bonus, 9 checkpoints, ≥ 95 coins, < 4,096 triangles);
   - replace "part 2 stays sealed" with route proofs for the falls, ridge (including the wind's drift) and summit, plus the Avalanche Run;
   - add shards 6–8 with negative checks and the Polar Star (double jump yes, single jump no);
   - in the session test: the Aurora Star stops the clock, the Icefall Star does not, and all 8 shards reveal the Polar Star;
   - the parity test picks up new checkpoints by itself.
   Keep `tests/hoarfrost.test.mjs` under ~30 s: coarse negative-search grids, and stop at the first success.
7. **Re-check** for traps (falls that land somewhere with no way out) and for junctions where a wall pokes above a walkable edge.
8. **Map and docs**: regenerate `docs/hoarfrost-map.svg`. Update this file (mark part 2 built; keep the measured tables), `README.md`, `docs/VERIFICATION.md` and `docs/ARCHITECTURE.md`, then add `docs/releases/v0.7.0.md` and bump `package.json`. Remove the pending-work note from `CLAUDE.md`. Point `.github/workflows/publish.yml` at the new release only when the user wants to publish.
9. **Browser check**: `python3 tools/package_browser.py` then `npm run test:browser`, and extend its Hoarfrost block if the UI changed.

## Tools

- `node tools/level_map.mjs hoarfrost [out.svg]`: top-down map of floors by height and surface type, walls, pickups, checkpoints, the route and the reserved areas.
- `node tools/level_shots.mjs hoarfrost '[["name",[camX,camY,camZ],[lookX,lookY,lookZ]]]'`: screenshots through the real renderer into `build/level-shots/` (needs Playwright, like the browser check).
- `tests/routes.mjs`: the route-proof kit used by `tests/hoarfrost.test.mjs`.
