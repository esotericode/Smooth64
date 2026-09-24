# Smooth64

<!-- easy-browser-download -->
## Play now — no setup

[**Download Smooth64 for your browser**](https://github.com/esotericode/Smooth64/releases/latest/download/Smooth64-Browser.zip)

1. Download and extract the ZIP.
2. Double-click **Smooth64-Play.html**.
3. Click **Cinder Caldera** or **Hoarfrost Heights** to play a level, or **Movement playground** for the test areas.

Works offline in Edge, Chrome, or Firefox. No installation, Python, terminal, compiler, or ROM required. **WASD** moves, **Space** jumps, **Shift** crouches, **J** attacks. A standard gamepad works too, menus included. Sound and music start after your first click or key press.

The original recovery ZIP is kept in this repository. The folders below contain the editable project source.


A ROM-free platformer built around the Super Mario 64 US movement code, with an original explorer, a volcanic adventure, a mountain of ice to climb, and a connected practice playground.

## Version 0.7.1 — menus for controllers, a softer coin

- **Every menu works from a gamepad.** On the welcome screen, in the pause menu, the move guide and the star screen, the D-pad or left stick moves between choices, **A** selects, **B** goes back, and left or right sets a slider. Long pages scroll as you go, and an orange ring shows where you are.
- **A gentler coin.** The bright arcade ding is replaced by two soft mallet notes, generated in code: it rings around 520 Hz instead of 3 kHz, and plays 5 dB quieter.
- **No more flicker on the far peaks.** In Hoarfrost Heights, the distant mountains' snow caps no longer shimmer against their rock at a distance, and a few overlays that could do the same (the frozen falls' glint, the hut's windows, painted titles) now stay steady.

[Controller and polish release notes](docs/releases/v0.7.1.md)

## Version 0.7.0 — Hoarfrost Heights

A second full level, much bigger than Cinder Caldera: about five times the footprint and three times the height. A high valley floats on a sea of cloud under the **Hoarfrost Horn**. You climb from Frostmere Camp to the summit, then ride the Avalanche Run home:

1. **Mirror Lake:** hop across floes over frostbite water. The water bites like lava, as in the original's snowy course. A tilted ice floe slides you straight into a jump, and an ice runway you cannot stop on ends in a long jump.
2. **Pinewood Drifts:** terraces of deep snow that slow your run, and a jump and grab out of each. A fallen, iced-over pine spans a ravine, snapped in two.
3. **The Glacier:** crevasses, a snow bridge, and an ice chute. You slide at over 90 units a tick and must jump before the lip to clear the Great Crevasse.
4. **The Icefall:** a serac step, a 950-unit wall-kick chimney, then a grippy rock rib beside an ice chute that cannot be climbed, up to the **Icefall Star** on the Shoulder, halfway up the Horn.
5. **The Frozen Falls:** ledges along the Horn's sheer face, wall kicks between a frozen waterfall and a serac, and a hang from the icicles across the curtain.
6. **Gale Ridge:** paths cut into the face, in a wind that always blows south. Stand still and it blows you off, so keep moving and jump each gap from its very edge.
7. **The Cornice and the Summit:** rock steps up the west ridge, a hang under a snow cornice above the slick crest, a wall-kick chimney between two towers, and the **Aurora Star** on the summit cairn, where the clock stops.
8. **The Avalanche Run:** the way home, an ice luge from the summit round the Horn and over the lake into camp. Jump from the slide at each of its two lips.

Blue ice will not hold you: you slide down any slope of it, a full run skids ~1,200 units, and landing a jump and letting go of the stick is how you stop dead. Deep snow caps your run; grey rock grips even at 45°. **Eight Frost Shards** hide behind optional challenges: the watchtower, the Lone Floe, the Great Pine, a crevasse ledge, a serac needle, an ice pillar under the icicles, the Weathervane across a windy gulf, and the Horn's Tip. Find all eight and the **Polar Star** shines on the Mirror Isle. Nine beacons are checkpoints, and 100 coins line the way. Footsteps crunch on snow and ring on ice, the wind gusts on Gale Ridge, and frostbite water splashes instead of sizzling. Twilight, snowfall and an aurora overhead are drawn in real time.

Every leg of the route, every shard and the Polar Star are proven reachable in `tests/hoarfrost.test.mjs` by driving the real core with controller inputs. Negative checks show where a specific move is required.

[Design notes](docs/HOARFROST.md) · [Hoarfrost Heights release notes](docs/releases/v0.7.0.md)

## Version 0.6.0 — original music

Four original tracks play quietly in the background, in the spirit of late-'90s console soundtracks: *Basalt Tide* (electric piano, strings and vibraphone), *Hush of the Spire* (a harp and music-box lullaby in three), *Lantern Trail* (marimba, brushes and ocarina), and *Skyline Drift* (a choir pad and bells). They are written as note data in `web/tracks.js` and performed live by a small Web Audio synthesizer in `web/music.js`, with no recordings, so the whole soundtrack adds about 20 KB.

Tracks come from a shuffle bag: all four play before any repeats, never the same one twice in a row. Each track opens and closes sparsely and ends on a ringing chord. The next one starts over that chord, in whichever nearby key shares the most notes with it, so the music drifts from one piece to the next without a gap. Menus muffle it, the shard and star jingles briefly duck it, and it pauses while the tab is hidden. **Menu → Settings → Music** sets its volume: 50% by default, well under the sound effects; 0% turns it off.

[Soundtrack notes](docs/SOUNDTRACK.md) · [Original music release notes](docs/releases/v0.6.0.md)

## Version 0.4.0 — sound, timed by the movement code

The explorer can be heard now: footsteps, jumps, flips, landings, slides, lava, and every pickup. The original action code already decides *when* a sound plays: a footstep on particular animation frames, one jump sound per takeoff, a whoosh on each flip's spin frames, a scrape for exactly as long as a slide lasts. The core now reports those requests every tick (`s64_sounds`), and the game voices them with CC0 samples, so nothing is guessed from the picture. The walking, running, and tiptoe strides plant a heel on those same frames, so each step sound lands on a footfall.

You'll hear soft footsteps at a walk, a push-off and a little "hup" on each jump (rising for double and triple jumps), spin whooshes, soft landings and heavy ground-pound impacts, braking and sliding scrapes, a wall tap to time wall kicks against, gloves catching ledges and clinking along grates, a yelp and crackle in lava, and a whistle on long falls. Coins chime, Ember Shards and stars get their own jingles, beacons whoosh alight, and a secret jingle announces the Crimson Star. **Menu → Settings → Sound effects** sets the volume; 0 mutes.

Every sample is **CC0** from [Kenney](https://kenney.nl) (his official starter kits and the Kenney set in Python Arcade); the slide and lava textures are generated in code. No Nintendo audio is used. See [Sources and licenses](THIRD_PARTY.md).

Gamepad sticks now have a **15% scaled radial dead zone** (the SM64 PC port's default), for movement and camera alike. A drifting stick no longer walks the explorer, turns the camera, starts the timer, or skips the intro shot, and the travel beyond the zone is rescaled so the first movement past it is still the gentlest tiptoe. **Menu → Settings → Stick dead zone** adjusts it between 5% and 35%.

[Sound release notes](docs/releases/v0.4.0.md)

## Version 0.3.1 — one set of rules, a quieter screen

The default view shows **power and collectibles**. Open **Menu** (Escape, P, or gamepad Start) for objectives, checkpoint travel, world selection, and settings. **Developer tools** is off by default: turn it on for action/animation readouts, input display, frame stepping, slow motion, trails, and collision mesh. Movement hints and the on-screen timer have separate settings. Settings are remembered when browser storage is available.

Both worlds now use the same coins, healing, power meter, checkpoint beacons, pickup effects, and recovery rules. The playground's fifteen former sparks are coins, with more coins in the original six courses and a new **Lava crossing** practice bay: **34 coins across eleven destinations**. The original ten courses retain their collision geometry. Lava costs three power wedges; each coin heals one.

Each world's collected items, timer, and checkpoints survive switching worlds and retries. Switching returns you to that world's checkpoint with full power. **Start this world over** resets only that world's progress; reloading resets both runs. Caldera checkpoints unlock as you reach them; all playground destinations are always available.

Movement polish keeps gloves anchored through live ledge transitions and plants the running stance foot while the torso leans and bobs. Menus clear held/queued input, pause simulation and animation, and stop multi-tick catch-up immediately when a star is collected. Gamepad Start and touch cancellation follow the same pause/input rules.

[Game polish release notes](docs/releases/v0.3.1.md)

## Third edition — Cinder Caldera

A complete, original level built for the movement core. You climb a volcanic crater to the **Ember Star** on top of the central Spire, and the route circles the crater:

1. **Ashfall Landing:** the start.
2. **Basalt Steps:** columns over lava; the gaps widen as the columns shrink.
3. **The Forge:** a ledge-grab rampart and a backflip step.
4. **The Chimney:** a 1,160-unit wall-kick shaft.
5. **Chain Bridge:** hang traverses.
6. **Obsidian Ridge:** narrow beams, blades, and a very slippery chute.
7. **The Spire:** a spiral with a wall-kick corridor, a backflip step, and a jump for the summit rim.

Lava is the core's own `SURFACE_BURNING`: three wedges of damage and a launch. Coins heal a wedge. **Eight Ember Shards** sit behind optional challenges: the broken gate, a lone column, the anvil roof, the flue, a grate spur, the belfry, the chute, and the Spire's perch. Collecting all eight lights the **Crimson Star** on a lava altar. Five checkpoint beacons, a power meter, a timer, and a star-get summary round it out.

Every leg of the main route and every shard is proven reachable in `tests/caldera.test.mjs` by driving the real core with controller inputs. The tests also check that the anvil, belfry, and altar challenges can't be skipped with a plain jump.

The character's animation also got a review pass:
- Actions crossfade instead of snapping.
- The side-somersault landing turns around smoothly.
- The slide kick, ground-pound landing, rollouts, knockbacks, and letting go of the stick at walking speed now match what the core is doing.
- Dust, sparks, and fire effects show takeoffs, landings, wall kicks, and lava boosts.
- The camera looks down narrow shafts instead of pressing into the explorer.

[Third-edition release notes](docs/releases/v0.3.0.md)

## Second edition — hands, feet, and a bigger playground

The explorer now has orb gloves and little shoes, with procedural running, punching, kicking, flipping, diving, sliding, landing, hanging, and climbing poses. Ledge hangs place the body below the platform and keep the gloves planted at the lip. A camera-relative arrow shows which way to push to climb.

The second edition added **Ledge garden**, **Wall-kick tower**, **Skyline circuit**, and **Canopy walk** to the original six areas. Its fifteen gold sparks are now healing coins; destinations are available in the pause menu. The movement core and its compiled WASM are unchanged from the first edition. This release integrates the parallel animation/rendering work into a compact, connected course; see [merge decisions](docs/MERGE_NOTES.md).

[Second-edition release notes](docs/releases/v0.2.0.md)

This is a working foundation for movement fidelity, **not yet a verified, bit-exact recreation of every N64 behavior**. The movement state machine comes from the decompilation through libsm64; the collision host, camera, and presentation are different. [Fidelity and remaining work](docs/FIDELITY.md) describes exactly where that boundary is.

## Play

Clone this branch, then run:

```sh
python3 tools/serve.py
```

Open **http://localhost:8000** and select **Cinder Caldera**, **Hoarfrost Heights**, or **Movement playground**. On Windows, `py tools/serve.py` also works.

Python 3 and a current browser with WebGL 2/WebAssembly are all you need. The compiled movement core and renderer are included. No npm install, compiler, ROM, CDN, or account is needed to play. Opening `index.html` directly as a `file:` URL will not work; use the local server. The `web/` directory is also a complete static build suitable for a normal HTTP server.

The playground contains a runway, walkable ramps, a steep slippery slope, a wall-kick corridor, stairs, ledges, separated platforms, a low ceiling, and a hangable ceiling. Use **Menu → Practice destinations** to move between experiments. Enable **Menu → Settings → Developer tools** for single-tick stepping, quarter speed, trajectory trails, collision wireframes, and live movement readouts.

| Control | Keyboard | Standard gamepad |
|---|---|---|
| Move / run | WASD or arrows | Left stick |
| Walk gently | Alt + direction | Partial stick |
| Jump / A | Space | A / bottom face button |
| Attack / B | J or X | X or B |
| Crouch / Z | Shift or Z | Either trigger |
| Camera | Drag or Q/E; wheel to zoom | Right stick |
| Reset (level: last checkpoint) | R | On-screen button |
| Pause / menu | P or Escape | Start |
| Advance one tick (developer tools) | N | On-screen button |
| Quarter speed (developer tools) | T | On-screen button |
| Collision mesh (developer tools) | V | On-screen button |
| Move guide | ? or H | Menu → Controls & moves |
| Menus: move / select / back | Tab / Space or Enter / Escape | D-pad or left stick / A / B |
| Sound and music volume, stick dead zone | Menu → Settings | Start → Settings |

Touch devices get an analog pad and A/B/Z buttons. Keyboard buttons retain very short taps until the next simulation tick. Gamepad input is sampled on simulation ticks, with a 15% radial dead zone on both sticks. Losing window focus pauses the simulation and clears keyboard input.

## Moves

- Single, double, and triple jumps: press A again just after landing; maintain running speed for the third jump. Holding A gives a higher jump.
- Long jump: run, press Z, then A. Backflip: stand still, hold Z, then A.
- Side somersault: reverse direction while running and jump during the turnaround.
- Wall kick: jump into a wall and press A again during the contact window.
- Ledge climb: while hanging, push **toward the platform** to climb after a brief settling pause. Press A for a quick climb. Pull away or press Z to drop. The direction is relative to the camera; the live cue points toward the platform.
- Dive: B in the air at sufficient forward speed. At low speed, B gives a jump kick.
- Ground pound: Z in the air. Crawling, braking, sliding, ledge grabs/climbs, crouch sliding, and slide recovery use the upstream actions too.

The core's original timings apply; there is no added coyote time, automatic bunny hopping, or variable-delta acceleration.

## Engine layout

```text
core/               Small C host and public API; movement timing/root-motion tables
vendor/libsm64/     Pinned upstream C actions, math, collision adapter, and headers
web/                Original levels (playground, Cinder Caldera, Hoarfrost Heights), geometry kit, procedural character rig, input, camera, and UI
tests/              Behavioral checks and native ↔ WASM frame-by-frame comparisons
tools/              Build, serve, import, and provenance checks
docs/               Fidelity, architecture, and verification notes
```

The renderer uses Three.js only to draw. It does not provide character physics. Collision and visible geometry are generated from the same integer-coordinate triangle list. The C core advances at exactly **30 Hz**; the display interpolates positions independently. Animation clocks also advance at simulation rate even though no original character model is drawn.

`core/smooth64.h` is the engine integration boundary. Besides world loading and ticking, it has one gameplay hook: `s64_heal`, which queues health the way the original coin interaction does. `s64_sounds` reports the original sound IDs the actions requested during the last tick; the core itself plays nothing, and each host voices the IDs with its own samples. The same C code can be linked into a raylib/SDL/custom native host; WebAssembly is just the first frontend. This initial API is deliberately **single-world, single-character, static geometry**.

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

Optional browser checks (desktop, touch layout, menus, world progress, settings, and the offline package):

```sh
npm install --no-save playwright
npx playwright install chromium
python3 tools/package_browser.py
npm run test:browser
```

The browser check writes review screenshots under `build/browser-checks/`. For level work, `node tools/level_map.mjs hoarfrost` draws a top-down SVG map of a level's floors, route and pickups, and `node tools/level_shots.mjs` renders screenshots from chosen camera positions (Playwright, like the browser check). Set `BROWSER_EXECUTABLE_PATH` to use an existing Chromium executable. Playwright is only needed for this optional check; playing the game and running the movement suite still need no npm packages.

Rebuild the checked-in browser core with [WASI SDK 25](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25):

```sh
export WASI_SDK_PATH=/absolute/path/to/wasi-sdk-25.0-x86_64-linux
python3 tools/build.py wasm
```

The build uses `-fno-fast-math`, `-ffp-contract=off`, `-fwrapv`, and `-fno-strict-aliasing`.

The sound sprite (`web/sounds.mp3` and its index `web/sounds.js`) is also checked in. Maintainers can rebuild it from the pinned CC0 sources with `python3 tools/build_sounds.py`; that needs ffmpeg with libmp3lame and network access. The music has no build step: `web/tracks.js` is the score. `node tools/render_music.mjs` (Playwright, like the browser check) renders each track to `build/music/` for listening and level checks. Native `.so` building has been tested on Linux; the **ready-built browser demo runs on other desktop operating systems** without compiling C.

[Architecture and embedding](docs/ARCHITECTURE.md) · [Verification](docs/VERIFICATION.md) · [Sources and licenses](THIRD_PARTY.md)

No ROM loading or asset extraction is implemented. No Nintendo model, texture, sound, music, level, or skeletal pose data is bundled; the sound effects are Kenney's CC0 samples and the music is original. Small source-derived animation timing and root XYZ movement tables are included because the movement logic reads them; see the source notes rather than treating the simulation as independent of all animation data.
