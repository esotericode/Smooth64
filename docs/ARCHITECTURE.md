# Host boundary

The host compiles only a subset of libsm64. Its ROM loaders, Mario model/geometry, renderer, audio engine, and texture loaders are not built or bundled. Movement/action files, collision queries, math, interaction dispatch, and required headers are vendored without modifications.

`core/host.c` replaces the library's asset-dependent bootstrap:

1. Load caller-provided static triangles through `s64_add_triangle` and `s64_commit_surfaces`.
2. Create zero-initialized C world, character, area, camera, and controller state. Run the upstream initialization functions.
3. Translate raw controller axes and A/B/Z into the upstream controller. Pass the camera yaw supplied by the host.
4. Run `bhv_mario_update`, which executes the original action groups and collision steps.
5. Advance the action's animation clock once, without rendering a model.
6. Publish an 80-byte, fixed-width snapshot. The browser copies the snapshot; it never mutates internal state.
7. `s64_heal(amount)` is the one gameplay hook. It adds to the character's heal counter, as n64decomp's `interact_coin` does (`4 * coinValue`; 4 units = one wedge). The upstream `update_mario_health` applies it over the following ticks. Objects are not hosted, so the frontend reports coin pickups.
8. `s64_sounds()` / `s64_sound_count()` report, in call order, the upstream 32-bit sound IDs the actions passed to `play_sound` during the last tick (at most 16; cleared by each tick and reset). Bank 0 holds one-shot action sounds (step, jump and landing IDs include the floor's terrain offset), bank 1 continuous sounds that repeat every tick they should keep playing (slides, lava burn), and bank 2 the character's voice cues. The host plays nothing; it only reports what the original code asked for and when.

`core/silent_host.c` supplies the audio callbacks: `play_sound` records the request for `s64_sounds`; music and stop calls are no-ops. `core/kinematics.inc.h` supplies only animation flags/timing and the first three translation channels that physics reads. `tools/import_kinematics.py` regenerates this numerical data from the pinned public source. There is no ROM parser.

## Native embedding

Include `core/smooth64.h` and compile/link the core plus the vendored C source list in `tools/build.py`. An SDL/raylib application can call this API without including any N64 types.

```c
#include "smooth64.h"

s64_clear_surfaces();
/* Upward-facing flat square, in original game units. Check return values. */
s64_add_triangle(0, -4000,0,-4000, -4000,0,4000, 4000,0,4000);
s64_add_triangle(0, -4000,0,-4000, 4000,0,4000, 4000,0,-4000);
s64_commit_surfaces();
int result = s64_reset(0,0,0,32768); /* face -Z; fails if there is no floor */
/* On each fixed 1/30 second update, after checking result == 0: */
s64_tick(0,80,S64_A,0); /* forward + held jump, camera on +Z */
const S64State *state = s64_state(); /* valid until next core operation */
```

Coordinates: Y up, yaw 0 faces +Z, 0x4000 faces +X, 0x8000 faces −Z. Raw X is right and raw Y is forward on the controller. `camera_yaw` describes the direction **toward** the camera, matching the upstream camera-yaw convention. Units are game units per tick, not meters or units per second.

Triangles are signed integer coordinates; their collidable side faces out by the right-hand rule. Accepted range is int16 coordinates; the finite world limit/PU behavior is still libsm64's adapter rather than the console's. Degenerate triangles and capacity overflow are rejected. The current limit is 4096 triangles. After changing geometry, commit and reset before ticking again; old floor pointers are invalidated.

This first API is global and not thread-safe. It supports one world and one character; do not share an instance across threads. A future multi-character API should bind distinct `GlobalState`s and own surface storage explicitly.

## Browser host

- `engine.js`: WASM ABI and fixed-step accumulator; also used directly in Node verification.
- `world.js`: the playground's authored integer triangle geometry, colored render surfaces, destination points.
- `builder.js`: the geometry kit for authored levels: convex slabs (with sloped tops and snow `lip` bands), columns, beams, peaks, and ring-built mountains. It groups faces into per-style render shapes (`snow`, `ice`, `rock`, `wood`, `pine`, `cloth`, `frost` water, `hidden`) and rejects non-convex outlines.
- `hoarfrost.js`: Hoarfrost Heights, built with `builder.js`. It defines the geometry, pickups, checkpoints, the main `route`, the `goal` star (where the clock stops), its player-facing `text` (objectives, toasts, victory copy), and its theme. The theme adds frost `hazard` effect colours, shard and star colours, and a longer view distance (`far`). Frostbite water is the core's `SURFACE_BURNING`. A hidden catch floor at y −2,600 keeps gaps from acting as walls. Part two is planned in `docs/HOARFROST.md`, and `world.reserved` marks the areas held for it. `hoarfrost-scene.js` adds render-only dressing: the twilight sky, aurora, snowfall, the cloud sea, distant peaks, the camp, lanterns, waterfalls, logs, icicles, and titles.
- `caldera.js`: Cinder Caldera's geometry, built from integer slabs, columns, blades, annular sectors, and ramps. It uses shared surface types from `rules.js` and defines pickups, checkpoints, and the theme. `caldera-scene.js` adds render-only dressing: sky, embers, lavafalls, grate bars, torches, and titles. `decor.js` holds the playground's floor markings.
- `rules.js`: shared surface IDs, coin healing amounts, collection radii, power wedges, and knockout/fall detection. Burning and damage stay in the unchanged C core.
- `level.js`: shared session bookkeeping for **every** world, with no Three.js or DOM. It handles coins, shards, stars, checkpoint lighting/travel, respawn, bonus reveal, and the tick-counted timer, which stops at the world's `goal` star (any star if it names none). Each world owns a session; travel policy allows all playground destinations while the adventure levels require reached checkpoints. Pickup events request healing; the host applies it through `s64_heal`. Dead snapshots cannot collect.
- `settings.js`: validated local settings, with clean defaults and a storage-unavailable fallback. Settings persist; run progress is in memory. A music mute saved by v0.5.0's on/off switch carries over as 0%.
- `effects.js`: pooled particles (dust, sparks, fire, pickup glitter) triggered by action transitions between consecutive snapshots.
- `input.js`: keyboard, touch, standard gamepad, camera input. Core A/B/Z edge detection remains inside C. Both gamepad sticks use a scaled radial dead zone (15% by default, 5–35% in Settings). Past it, movement starts at the core's own axis dead-zone edge (raw 8), so the first travel outside the zone is the slowest tiptoe and full tilt still reaches the 64-unit clamp.
- `audio.js`: sound effects. Each tick, `s64_sounds` IDs map by bank and ID to layered cues (footsteps, push-offs, the explorer's "hup", landings, flips, bonks, grate clinks, and voice cues rendered as pitched chirps), plus a few transitions the core has no sound for (wall touch, wall kick, ledge grab). Bank 1 requests sustain a generated slide or lava bed that fades on the first tick without a request, and on any pause, menu, or knockout. `main.js` adds the pickup and checkpoint cues. Audio starts on the first user gesture; muting or a missing sound file never affects play.
- `sounds.mp3` / `sounds.js`: one audio sprite of Kenney's CC0 samples and its index, built by `tools/build_sounds.py` from pinned sources. A 1 kHz marker at its start lets `audio.js` correct any decoder delay before slicing.
- `tracks.js` / `music.js`: the background music. `tracks.js` holds four original scores as data: chord cycles, chord-relative arpeggio and bass patterns, melodies, and the order of passes (which parts play on each time through the cycle). `music.js` parses them and performs them with Web Audio. It has an FM electric piano and harp, additive marimba, vibes, music box and bells, an ocarina, detuned string and formant-filtered choir pads, fretless, upright and sub basses, and brushes, in a generated stereo hall reverb. A lookahead scheduler, driven by `audio.js` every 0.1 s, schedules notes 0.4 s ahead. It skips notes a stall made late rather than bursting them, and humanizes timing, velocity and swing. Tracks come from a seeded shuffle bag. Each one ends on a ringing chord, and the next starts 1–2.5 s later in the transposition (within three semitones) that shares the most notes with it. Every visit feeds the mixer through its own inputs, which apply the track's loudness level and fade on stop without touching the previous track's tail. `audio.js` gives the music its own volume (squared, then trimmed so 50% averages about −34 LUFS) ahead of the shared limiter, muffles it under menus, ducks it under the shard, star and reveal jingles, and suspends the audio context while the tab is hidden. A music failure only turns the music off.
- `renderer.js`: Three.js, per-world themes and loading, animated hazard shaders (lava, or frostbite water when the shape style is `frost`), per-style material response, and a lava underglow baked into vertex colors. Hidden shapes still collide and appear in the collision wireframe, but are not drawn. Also the follow/orbit camera, whose obstruction rays rise over walls before pulling in; pickups; optional wireframe/trail; and a skippable intro shot.
- `character.js` / `pose.js`: original capsule-and-orb rig and pure procedural pose sampling. The walk, run, and tiptoe strides plant a heel on the frames where the original plays its footstep sounds. On a live render, a change of action or animation crossfades from the displayed pose over 0.12 s of display time. Direct sampling, which the tests use, stays exact. Hands, feet, body, and eyes interpolate between simulation snapshots. The camera follows the visible body, including below a ledge. Poses use the action name, animation clock, velocity, and tick; they never write back to the core. They are custom readable illustrations of actions, not the original game's skeletal animations.
- `animations.js` / `tools/export_animations.py`: names and loop bounds generated from the vendored enum and `kinematics.inc.h`, checked in CI. `poses.js` supplies the parallel branch's secondary animation vocabulary; `pose.js` samples it at simulation time and supplies the ledge, locomotion, landing, and attack poses.
- `progress.js`: compatibility adapter for older course tools; delegates to `LevelSession` rather than maintaining separate collection rules. The legacy `world.sparks` array describes the original fifteen coin locations.
- `main.js`: world/session switching (each world supplies its own objectives, shard names, reveal toast and victory copy through `world.text`; the best time is kept per world), pause dialogs, settings, the shared HUD, gated developer tools, scheduling, checkpoint transitions, and pickup effects/healing. All modes use one tick/collect/respawn path. Disabling developer tools also clears slow motion, freeze, trails, and mesh.

Normal motion interpolates between the last two core positions. Pausing retains the displayed interpolation/blend; single stepping shows the new snapshot. Contact poses bypass live crossfades so a prior airborne blend cannot pull gloves off a ledge or ceiling. Render interpolation, camera smoothing, squash/tilt, trail, and soft shadow never feed back into collision. Long frame stalls discard wall time rather than executing a backlog of stale controller input. A tick callback returning `false` stops catch-up immediately when a modal opens. Modal and focus changes clear keyboard, touch, and camera deltas; gamepad actions held through a menu must be released before activating again. The demo server serves only `web/` and binds localhost by default.
