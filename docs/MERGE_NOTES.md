# Integration decisions

This release combines `codex/readable-actions-v2` with `claude/sharp-dijkstra-lcfgf9` after inspecting both implementations. Both branch histories are retained by the merge.

- Kept the original six areas and the compact ledge garden, wall-kick tower, and skyline circuit. The first 240 collision triangles remain identical to the first edition.
- Adapted the other branch's tested rafters into **Canopy walk**, a separate connected southern terrace, with a start platform, overhead traverse, landing shelf, and three sparks. There are ten destinations and fifteen sparks overall.
- Used the other branch's generated animation names/loop ranges, export validation, secondary pose vocabulary, render grouping, and player-following shadows. Kept the core animation readout and destination sections.
- Kept the explicitly anchored ledge hands, camera-relative climb cue, planted landing feet, visible-body camera target, and simulation-sampled pose interpolation. The poses freeze on pause and never alter C movement state.
- Retained and adapted the useful traversal and animation tests. The enlarged expanse, repeated block grids, extra enclosing walls, and scatter geometry are preserved in the other branch's history, but are not part of this release's map.
- The old recovery workflow is now manual-only so updating the packager cannot overwrite the original release. The new release workflow verifies and publishes a separate v0.2.0 download.

Neither branch changes the C movement core. Ledge regressions at four camera orientations reproduce original toward/away/quick-climb behavior; the reported every-direction-drop issue did not reproduce. The visual anchor mismatch is addressed in the rig.
