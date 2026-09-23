// Smooth64's original background music, written as data for web/music.js.
//
// Durations are in beats. Chords carry the harmony; arpeggio and bass patterns
// are chord-relative degrees (1 3 5 7 9 11 13, 8 = octave, ' = up an octave,
// , = down), so they follow every chord and transposition. Melodies are note
// names. Each pass through a track plays the whole chord cycle with the parts
// listed for it; 'lead:A@vibes-12' plays melody A on vibes an octave down.
// Tracks start and end sparse so that one can ring out into the next, and
// `level` evens out their loudness.
export const TRACKS=[
  {
    id:'basalt-tide',title:'Basalt Tide',bpm:72,meter:4,level:.86,
    // Planing major ninths, with a wistful flat-six in the second half.
    chords:'Fmaj9:8 Bbmaj9:8 Am9:4 Dm9:4 Gm9:4 C9sus4:4 Fmaj9:8 Dbmaj9:8 Bbmaj9:4 Am7:4 Gm9:4 C9sus4:4',
    parts:{
      pad:{instrument:'strings',range:[55,74],velocity:.55},
      arp:{instrument:'epiano',pattern:"1 5 9 3' 5' 3' 9 5",step:.5,center:53,velocity:.36},
      bass:{instrument:'fretless',pattern:'1:2.5 5:1.5',low:35,velocity:.62},
      shaker:{drums:{shaker:'o.x.o.x.'},step:.5},
      lead:{instrument:'vibes',velocity:.58,lines:{
        A:'E5:1.5 D5:.5 C5:2 | A4:1 G4:1 A4:2 | D5:1.5 C5:.5 A4:2 | F4:1 G4:1 A4:1 C5:1 |'+
          'B4:1.5 A4:.5 E5:2 | D5:1 C5:1 A4:2 | Bb4:1.5 A4:.5 F4:1 D4:1 | G4:4 |'+
          'C5:1 E5:1 G5:2 | F5:1 E5:1 C5:1 A4:1 | Ab4:1.5 C5:.5 Eb5:2 | F5:1.5 Eb5:.5 C5:2 |'+
          'D5:1.5 C5:.5 Bb4:1 A4:1 | G4:1 A4:1 C5:1 E5:1 | D5:1.5 C5:.5 Bb4:1 A4:1 | G4:2 r:2',
      }},
    },
    passes:['pad arp','pad arp bass lead:A','pad arp bass shaker lead:A@ocarina','pad arp bass'],
  },
  {
    id:'hush-of-the-spire',title:'Hush of the Spire',bpm:66,meter:3,level:1.06,
    // A music-box lullaby in A minor, rocking in three.
    chords:'Am9:3 Fmaj7:3 Cmaj7:3 G6:3 Am9:3 Dm9:3 Fmaj7:3 E7sus4:3 Fmaj9:3 Em7:3 Dm9:3 Cmaj9:3 Bbmaj7:3 Am9:3 Dm9:3 E7sus4:3',
    parts:{
      pad:{instrument:'strings',range:[55,72],velocity:.45},
      arp:{instrument:'harp',pattern:"1 5 9 3' 9 5",step:.5,center:57,velocity:.4},
      bass:{instrument:'upright',pattern:'1:3',low:36,velocity:.55},
      lead:{instrument:'musicbox',velocity:.5,lines:{
        A:'C6:2 B5:1 | A5:3 | G5:1 E5:1 G5:1 | B5:2 A5:1 | C6:2 B5:1 | A5:1 F5:1 E5:1 | C5:1 E5:1 A5:1 | B5:3 |'+
          'A5:1 G5:1 E5:1 | G5:2 B5:1 | A5:1 F5:1 E5:1 | D5:2 E5:1 | F5:1 D5:1 A5:1 | C6:3 | A5:1 G5:1 F5:1 | E5:3',
      }},
    },
    passes:['pad arp','pad arp bass lead:A','pad arp bass lead:A@vibes-12','pad arp'],
  },
  {
    id:'lantern-trail',title:'Lantern Trail',bpm:88,meter:4,swing:.6,level:.92,
    // An easy walk at dusk: marimba, round bass, brushes and an ocarina.
    chords:'Gmaj9:4 Em9:4 Cmaj9:4 D9sus4:4 Gmaj9:4 Bm7:4 Cmaj9:4 D9sus4:4 Am9:4 Bm7:4 Cmaj9:4 Cm6:4 Gmaj9:4 Em9:4 Am9:4 D9sus4:4',
    parts:{
      pad:{instrument:'strings',range:[57,74],velocity:.4},
      arp:{instrument:'marimba',pattern:"1 r 5 3' 9 r 3' 5",step:.5,center:55,velocity:.5},
      bass:{instrument:'fretless',pattern:'1:1.5 5:.5 8:1 5:1',low:36,velocity:.6},
      shaker:{drums:{shaker:'oxoxoxox'},step:.5},
      drums:{drums:{kick:'x....x..',brush:'..x...x.',shaker:'oxoxoxox'},step:.5},
      lead:{instrument:'ocarina',velocity:.55,lines:{
        A:'r:1 B4:.5 D5:.5 E5:1 D5:1 | B4:2 r:1 G4:.5 A4:.5 | B4:1.5 A4:.5 G4:1 E4:1 | A4:3 r:1 |'+
          'r:1 B4:.5 D5:.5 G5:1 F#5:1 | D5:2 r:1 B4:.5 D5:.5 | E5:1.5 D5:.5 B4:1 G4:1 | A4:2 G4:1 A4:1 |'+
          'C5:1.5 B4:.5 A4:1 E5:1 | D5:2 F#5:1 E5:1 | E5:1.5 D5:.5 G5:2 | Eb5:1.5 D5:.5 C5:2 |'+
          'B4:2 D5:1 B4:1 | G4:1 A4:1 B4:2 | C5:1 B4:1 A4:1 G4:1 | A4:3 r:1',
      }},
    },
    passes:['arp bass shaker','arp bass drums pad lead:A','arp bass drums pad','arp bass drums pad lead:A@vibes','arp pad'],
  },
  {
    id:'skyline-drift',title:'Skyline Drift',bpm:68,meter:4,level:1.2,
    // Clouds: a choir pad, a deep bass and a few bells, in D Dorian.
    chords:'Dm9:8 G13:8 Dm9:8 G13:8 Bbmaj9:8 C69:8 Dm9:8 A7sus4:8',
    parts:{
      pad:{instrument:'choir',range:[53,72],velocity:.6},
      bass:{instrument:'sub',pattern:'1:8',low:34,velocity:.6},
      arp:{instrument:'epiano',pattern:'1 5 9 5',step:1,center:50,velocity:.34},
      lead:{instrument:'bells',velocity:.42,lines:{
        A:'r:4 A5:1 E5:1 F5:2 | r:4 E5:1 D5:1 B4:2 | r:4 C6:1 A5:1 E5:2 | r:4 B5:1 A5:1 E5:2 |'+
          'r:4 D6:1 C6:1 A5:2 | r:4 E5:1 D5:1 G5:2 | r:4 F5:1 E5:1 A5:2 | r:4 G5:1 E5:1 D5:2',
      }},
    },
    passes:['pad bass','pad bass lead:A','pad bass arp lead:A','pad bass arp'],
  },
];
