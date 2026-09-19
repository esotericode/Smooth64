# Host boundary

The host compiles only a subset of libsm64. Its ROM loaders, Mario model/geometry, renderer, audio engine, and texture loaders are not built or bundled. Movement/action files, collision queries, math, interaction dispatch, and required headers are vendored without modifications.

`core/host.c` replaces the library's asset-dependent bootstrap:

1. Load caller-provided static triangles through `s64_add_triangle` and `s64_commit_surfaces`.
2. Create zero-initialized C world, character, area, camera, and controller state. Run the upstream initialization functions.
3. Translate raw controller axes and A/B/Z into the upstream controller. Pass the camera yaw supplied by the host.
4. Run `bhv_mario_update`, which executes the original action groups and collision steps.
5. Advance the action's animation clock once, without rendering a model.
6. Publish an 80-byte, fixed-width snapshot. The browser copies the snapshot; it never mutates internal state.

`core/silent_host.c` supplies no-op sound callbacks. `core/kinematics.inc.h` supplies only animation flags/timing and the first three translation channels that physics reads. `tools/import_kinematics.py` regenerates this numerical data from the pinned public source. There is no ROM parser.

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
- `world.js`: authored integer triangle geometry, colored render surfaces, destination points.
- `input.js`: keyboard, touch, standard gamepad, camera input. Core A/B/Z edge detection remains inside C.
- `renderer.js`: Three.js, lighting, follow/orbit camera, camera obstruction ray, optional wireframe/trail, and spark display.
- `character.js` / `pose.js`: original capsule-and-orb rig and pure procedural pose sampling. Hands, feet, body, and eyes interpolate between simulation snapshots. The camera follows the visible body, including below a ledge. Poses use the action name, animation clock, velocity, and tick; they never write back to the core. They are custom readable illustrations of actions, not the original game's skeletal animations.
- `animations.js` / `tools/export_animations.py`: names and loop bounds generated from the vendored enum and `kinematics.inc.h`, checked in CI. `poses.js` supplies the parallel branch's secondary animation vocabulary; `pose.js` samples it at simulation time and supplies the ledge, locomotion, landing, and attack poses.
- `progress.js`: session-only spark collection, separate from physics. Uses the visible body center, so a ledge anchor alone cannot collect a spark above the platform.
- `main.js`: pause/reset/step and HUD, simulation scheduling, recovery.

Normal motion interpolates between the last two core positions. Pausing and stepping show the current state directly. Render interpolation, camera smoothing, squash/tilt, trail, and soft shadow never feed back into collision. Long frame stalls discard wall time rather than executing a backlog of stale controller input. The demo server serves only `web/` and binds localhost by default.
