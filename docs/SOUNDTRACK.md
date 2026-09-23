# Soundtrack

Four original pieces, composed for Smooth64 and performed live by the game. There are no recordings: `web/tracks.js` holds the scores, and `web/music.js` synthesizes every instrument with Web Audio.

| Track | Key and time | Instruments | Character |
|---|---|---|---|
| Basalt Tide | F major, 4/4, 72 BPM | Electric piano, strings, fretless bass, shaker; vibraphone melody, later ocarina | Drifting major ninths with a wistful turn to D♭ |
| Hush of the Spire | A minor, 3/4, 66 BPM | Harp, strings, upright bass; music-box melody, later vibraphone an octave down | A lullaby rocking in three |
| Lantern Trail | G major, swung 4/4, 88 BPM | Marimba, fretless bass, kick and brushes, strings; ocarina melody, later vibraphone | An easy walk at dusk |
| Skyline Drift | D Dorian, 4/4, 68 BPM | Choir pad, sub bass, electric piano; bells | Long chords and a few bells, like passing clouds |

## How it plays

A visit to a track plays its chord cycle several times (passes), about 3½–4½ minutes in all. The first and last passes leave the melody out, so every track opens and closes quietly. The last chord rings on for 3.5 seconds. The next track starts under it 1–2.5 seconds after the final bar, transposed by up to three semitones into whichever key shares the most notes with the ringing chord.

Tracks come from a shuffle bag: all four play before any repeats, and never the same one twice in a row, even across a restart. Timing and velocity are humanized slightly, so no two visits are identical. Each track has a loudness level that keeps the four within about 0.7 LU of each other.

In the game, **Menu → Settings → Music** sets the volume (50% by default, about −34 LUFS, well under the footsteps); 0% stops it. Menus muffle the music, the shard, star and reveal jingles duck it, and a hidden tab suspends the game's audio until you return.

## Editing the score

Each entry in `web/tracks.js` is data:

- `chords`: symbols with lengths in beats, such as `Fmaj9:8 Bbmaj9:8`. Qualities: major, `m`, `7`, `maj7`, `m7`, `6`, `m6`, `69`, `9`, `maj9`, `m9`, `13`, `sus2`, `sus4`, `7sus4`, `9sus4`.
- `parts`:
  - `pad` is voiced automatically: colour tones first, each voice moving as little as possible, within `range` (MIDI notes).
  - `arp` and `bass` patterns are chord degrees (`1 3 5 7 9 11 13`, `8` for the octave), with `'` or `,` for an octave up or down, and `r` for a rest. Arpeggios step every `step` beats around `center`. Bass steps carry their own lengths (`1:2.5 5:1.5`) and sit above `low`. Because they are relative to the chord, patterns follow every chord and transposition.
  - Drum parts give one string per drum, `step` beats per character: `x` accent, `o` soft, `.` rest.
  - `lead` lines are note names with lengths (`E5:1.5 D5:.5`), `r` for rests, and `|` between bars for readability.
- `passes`: the parts playing on each time through the cycle. `lead:A@vibes-12` plays melody A on vibraphone an octave down.
- `level`: a loudness trim for the whole track.

The unit tests check that every melody exactly fills the chord cycle, and that no melody note on a beat, or held for one, sits a half step above a chord tone. They also check that every note stays in its part's range, that the first and last passes have no melody, and that the tracks hand over without silence.

## Listening and levels

With the optional Playwright setup from the README:

```sh
node tools/render_music.mjs                  # every track: build/music/<id>.wav
node tools/render_music.mjs lantern-trail skyline-drift --transition
```

Each WAV is one full visit through the game's own engine, at full music volume and without the in-game trim. Keep new tracks near −18.5 LUFS integrated (adjust `level`), as the current four are.
