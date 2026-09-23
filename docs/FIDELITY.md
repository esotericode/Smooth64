# What “faithful” means in this build

The target is the **US version at 30 simulation ticks per second**. Smooth64 uses decompiled C through a pinned libsm64 revision, rather than fitting a new controller to a few remembered constants. It does not claim complete equivalence to an N64 execution.

## Preserved

- Upstream action dispatch, transitions, landing windows, jump chains, air control, speed-dependent jumps, turning, braking, crouching, sliding, wall kicks, ledges, and related ground/air actions.
- The original 16-bit angle convention and sine/atan lookup tables, float32 state, and four quarter-step collision movements per simulation tick.
- Original raw-stick per-axis deadzone (−7…7), ±6 adjustment, 64-unit circular clamp, and nonlinear intended magnitude.
- Original animation start/loop flags, frame counts, and root XYZ values consumed by physics. Skeletal rotation tracks are omitted; nothing renders the original character.
- Which animation the action code selected, and the frame it is on, decide the drawn pose. Cycle timing therefore inherits the original's speed-scaled animation acceleration instead of a display-time cycle of the frontend's own.
- Simulation-owned animation progression: it happens once per tick, in the same post-action position as the upstream rendering animation update.
- No generic capsule-controller replacement, physics-engine gravity, jump buffering beyond the input edge latch, or manually retuned acceleration.

The capsule is a visual placeholder. It does **not** replace SM64's action-dependent collision probes with a capsule sweep.

## Differences and limits

| Area | Current behavior / limit |
|---|---|
| Collision traversal | libsm64 tests its loaded triangle groups instead of the N64 spatial-cell linked lists. Floor/ceiling selection order, overlapping surfaces, seams, and tie cases can differ. |
| Coordinate boundaries | libsm64 removes the original level-boundary/cell checks and uses wider collision coordinates. Parallel universes, out-of-bounds tricks, and other overflow-dependent behavior are not promised. |
| Port behavior | libsm64 already contains host adaptations and `AVOID_UB` changes. The pinned C is byte-for-byte preserved here, not represented as an untouched n64decomp checkout. |
| Animation dependency | Timing and root translation tables are extracted from public decomp C source. Rendering has no skeletal data. These numerical tables are still a dependency of some moves. |
| Input | Keyboard and modern analog sticks map to raw N64 axis values; physical gate shape/calibration is not identical to an original N64 controller. Gamepad sticks first pass a scaled radial dead zone (15% by default) for worn or drifting hardware; travel past it begins at the core's own ±8 raw-axis edge, so the original per-axis dead zone and nonlinear magnitude still shape everything after it. Short keyboard/touch button taps are latched for one tick. |
| Sound | *When* a sound plays comes from the original actions: every `play_sound` request is reported by `s64_sounds` on the tick it is made, including footsteps on each gait's step frames, flip spins on their animation frames, terrain-dependent IDs, and continuous slide/lava requests. *What* plays is not original: Kenney's CC0 samples, with the voice clips rendered as short pitched chirps. `gAudioRandom` stays 0, so the frontend varies pitch instead of picking the original's voice variants. Distance attenuation, the speed-dependent pitch of slides (`adjust_sound_for_speed` is stubbed upstream in libsm64), and the original mixer are not reproduced. Wall-touch, wall-kick and ledge-grab thumps are frontend additions read from action changes, like the particle effects. |
| Camera | Original orbit/follow camera, not Lakitu. It changes intended direction through the usual camera-yaw input. |
| Character presentation | The explorer's orb hands and feet are original art posed by `web/pose.js` and `web/poses.js` from the animation identity and frame the core reports. Changes of action crossfade over 0.12 s of display time; that is presentation only and never delays the core. They are not the original skeletal tracks, and no pose is claimed to match a frame of the original model. Of the model-space angles the original applies on top of `faceAngle`, only the side somersault's half turn is reproduced (and unwound through its landing, as the original's landing animation does); walking pitch on slopes, dive and slide-kick pitch, twirl and steep-jump yaw are approximated or omitted, because the public state does not carry them. |
| Ledge grab drawing | During `ACT_LEDGE_GRAB` the core parks the position on the ledge's own floor, as upstream does. The frontend draws the body hanging below that lip; the offset is presentation, and collision still uses the core's position. |
| Host/world | One character and static triangle surfaces only. Surface types still act as they do upstream: Cinder Caldera uses `SURFACE_BURNING` (lava boost and damage), `SURFACE_HANGABLE`, and `SURFACE_VERY_SLIPPERY`. No moving platforms, poles, object grabbing, enemies, water volumes, cap pickups, wind setup, or level scripts are exposed by this host. Coins are frontend pickups: `s64_heal` adds to the heal counter the way `interact_coin` does, and the upstream health update applies it. |
| Demo recovery | In the playground, falling below −1500 units, an invalid floor, or death resets to the chosen destination. In Cinder Caldera, death (health below one wedge) respawns at the last lit checkpoint with full health, and R does the same. These are frontend conveniences outside the movement rules. |
| Verification | Native and WASM are compared with each other. There is no emulator, ROM, console capture, or independent reference replay oracle in the test suite. |

Backward long-jump source behavior has not been capped or deliberately “fixed,” but a verified BLJ demonstration and N64-equivalent seam/overflow exploits remain unvalidated. Do not use the present test suite as proof that every quirk is 1:1.

## Path to a defensible 1:1 claim

1. Add external reference traces with exact version, initial state, triangle order, raw controller input, camera yaw, and per-tick expected state. The user can supply independently recorded traces; the project itself should stay ROM-free.
2. Compare every tick's position, velocity, face/intended yaw, action/substate/timers, animation clocks, floor/wall/ceiling identity and surface normals against that oracle.
3. Replace/adapt the collision backend to original cell insertion and traversal order, coordinate wrapping, bounds, and surface selection where traces demonstrate divergence.
4. Exercise slope thresholds, staircase BLJs, wall seams, edge/ledge transitions, ceiling corners, long-jump landing windows, and representative object/platform actions separately.
5. Expand the host API only after those behaviors have reproducible fixtures. Keep frontend convenience features outside the core.

The reusable C boundary and deterministic tick inputs are in place for that work. A smooth-looking demo is not itself a fidelity measurement.
