# Quiet trails

Four original pieces for wandering through Smooth64. The palette recalls a late-1990s console: soft, rounded mallets, breathy flute, electric keys, a low music-box bell, warm sustained chords, and a little plucked bass. Melodies leave room for the world. Percussion is occasional and subdued; there are no vocals or insistent drum loops.

| Track | Length | Character |
|---|---|---|
| Mosslight Path | 2:00 | Wooden mallets and small, falling phrases |
| Clouds Beyond the Ridge | 2:00 | Long flute breaths over open chords |
| Embers at Rest | 2:00 | Low electric keys and a gentle minor-key turn |
| Paper Lantern Sky | 2:00 | A soft music-box figure with distant flute answers |

Music starts when you begin playing, at 30% volume. **Menu → Settings** has a background music switch and an independent music volume slider. Effects retain their own volume. Settings survive reloads, including silence.

The playlist shuffles all four pieces without replacement; consecutive tracks never repeat, even between shuffle rounds. Each transition overlaps the last and first four bars for twelve seconds. The music keeps its place across checkpoints, retries, and world changes, becomes softer in menus, and fades out while the game window is inactive. Returning or unmuting resumes playback. The soundtrack is included in the offline HTML.

## Score and instruments

`web/soundtrack.js` contains the authored notes, phrasing, harmony, and arrangement for each piece. All four use 80 BPM and the D major / B minor pitch collection, with compatible Dadd9 introductions and endings. Forty-bar arrangements have a four-bar introduction, eight four-bar phrases with variations and rests, and a four-bar ending. The bookends carry only pad and bass, leaving space for an equal-power crossfade.

`web/music-synth.js` creates the original instrument samples at 22,050 Hz, a stereo reverb at the output device's sample rate, and smooth note envelopes. No sampled commercial music, Nintendo audio, external soundfonts, or downloaded instruments are used. Scores, synthesis, and rendered music are original Smooth64 material under the repository's MIT license. Sound effects have their own CC0 provenance in `THIRD_PARTY.md`.

`web/music.js` schedules notes against the audio clock with a short lookahead, independently of physics and rendering. Finished voices and track buses are disconnected. Music allocates no audio resources before play or when a saved mute is active. Muting or losing focus fades the music and suspends its context without suspending sound effects. A late scheduler skips stale notes; a long interruption restarts gently rather than replaying a backlog. A missing or blocked audio device never prevents play.

## Check or export the pieces

Using the optional Playwright/Chromium setup described in the README:

```sh
npm run test:music
# Also export all four pieces as stereo PCM WAVs:
node tools/test_music_browser.mjs --render
```

WAV files and measured levels go to `build/music-checks/`. The exporter uses the same scores, samples, filters, and reverb as the game. WAVs use the full music setting, with three extra seconds for the reverb tail; in-game playback defaults to 30%. The check renders every complete piece and all twelve ordered transitions, and exercises real audio startup, volume, menu ducking, suspension, resumption, and rapid toggles.
