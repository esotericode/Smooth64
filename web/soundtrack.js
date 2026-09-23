// Original Smooth64 compositions. All four share D major / B minor, 80 BPM,
// and quiet Dadd9 bookends so any pair can overlap for four bars without a clash.
// Times are in quarter-note beats; no recordings or game soundfonts are used.
export const TEMPO=80,BEAT=60/TEMPO,BARS=40,TRACK_SECONDS=BARS*4*BEAT,CROSSFADE=16*BEAT;

const harmony={
  D:{bass:38,notes:[57,62,64,66]}, Bm:{bass:35,notes:[57,61,62,66]},
  G:{bass:31,notes:[54,57,59,62]}, A:{bass:33,notes:[55,59,62,64]},
  Em:{bass:40,notes:[55,59,62,66]}, Fm:{bass:42,notes:[57,61,64,66]},
};
// Each phrase lasts four bars. [beat, MIDI pitch, duration]; rests are deliberate.
const phrases={
  // A rounded wooden-mallet tune: two small questions and a long, falling answer.
  moss:[
    [[0,66,1],[1.5,69,1.5],[4,71,2],[7,69,1],[9,66,1.5],[12,64,2]],
    [[.5,62,1.5],[3,66,1],[5,69,2],[9,66,1],[10.5,64,1],[12,62,2.5]],
    [[0,67,2],[3,71,1.5],[6,74,2],[10,71,1],[12,69,2]],
    [[1,66,2],[4,64,1.5],[7,62,2],[11,64,1],[13,66,2]],
  ],
  // Breath and space; phrases end before the next chord rather than filling it.
  clouds:[
    [[1,69,2.5],[5,66,2],[9,64,3]],
    [[0,66,3],[5,71,2],[8,69,1.5],[11,66,3]],
    [[1,74,2.5],[5,73,2],[9,71,3]],
    [[0,69,2],[4,66,2],[8,64,1.5],[11,62,3]],
  ],
  // Lower register, gently offset electric keys, with no bright repeating ostinato.
  embers:[
    [[.5,62,1.5],[3,66,2],[7,69,2],[11,66,2]],
    [[0,64,2],[4.5,62,1],[7,59,2.5],[12,61,2]],
    [[1,66,2],[5,69,1.5],[8,71,2.5],[12,69,2]],
    [[0,64,2.5],[4,66,1.5],[8.5,62,3]],
  ],
  // A bell-like music-box figure, voiced low and answered by a soft flute.
  lanterns:[
    [[0,69,1.5],[2.5,66,1],[5,64,2],[10,62,2]],
    [[1,66,1.5],[4,69,2],[8,71,2],[12,69,2]],
    [[.5,74,2],[4,71,1.5],[7,69,2],[12,66,2]],
    [[0,67,2],[4,66,1.5],[8,64,2],[12,62,2]],
  ],
};
const pieces=[
  {id:'mosslight',title:'Mosslight Path',lead:'marimba',phrase:'moss',pan:-.13,
    chords:['D','G','Bm','A','D','Em','G','A','Bm','Fm','G','Em','D','G','Em','D'],
    order:[0,1,0,3,2,1,2,3],answer:'keys'},
  {id:'clouds',title:'Clouds Beyond the Ridge',lead:'flute',phrase:'clouds',pan:.1,
    chords:['D','Bm','G','A','D','G','Em','A','Bm','Fm','G','D','Em','G','A','D'],
    order:[0,1,0,3,2,1,2,3],answer:'marimba'},
  {id:'embers',title:'Embers at Rest',lead:'keys',phrase:'embers',pan:-.08,
    chords:['Bm','G','D','A','Bm','Em','G','A','G','D','Bm','Fm','Em','G','A','D'],
    order:[0,1,0,1,2,3,2,3],answer:'flute'},
  {id:'lanterns',title:'Paper Lantern Sky',lead:'bell',phrase:'lanterns',pan:.13,
    chords:['G','D','Em','A','Bm','G','D','A','G','Em','Bm','Fm','G','D','A','D'],
    order:[0,1,0,3,2,1,2,3],answer:'flute'},
];

function arrange(piece) {
  const notes=[];
  const add=(voice,beat,pitch,length,velocity=.6,pan=0)=>notes.push({voice,beat,pitch,length,velocity,pan});
  // Four bars of open space at either end. Main harmony changes every two bars.
  const chords=['D','D',...piece.chords,'D','D'];
  chords.forEach((name,i)=>{
    const chord=harmony[name],at=i*8,bookend=i<2||i>=18;
    chord.notes.forEach((pitch,j)=>add('pad',at+j*.035,pitch,8.1,bookend?.46:.54,(j-1.5)*.18));
    add('bass',at+.06,chord.bass,3.4,bookend?.5:.64,-.04);
    if(!bookend) {
      add('bass',at+4.5,chord.bass+12,2.2,.38,-.04);
      // A little harmonic punctuation, not a constant arpeggio.
      const pluck=piece.lead==='marimba'?'keys':'marimba';
      add(pluck,at+2.5,chord.notes[1],1.8,.28,-piece.pan-.25);
      if(i%2===0)add(pluck,at+6,chord.notes[2],1.5,.24,.26);
      // Dusty hand percussion enters only in the middle. No kick or hi-hat loop.
      if(i>=6&&i<16&&piece.id!=='clouds') {
        add('brush',at+3.5,60,.22,.2,-.3);
        if(i%2===0)add('wood',at+6.5,60,.18,.17,.24);
      }
    }
  });
  piece.order.forEach((which,phrase)=>{
    const start=16+phrase*16;
    phrases[piece.phrase][which].forEach(([at,pitch,length],n)=>{
      // The return is a quieter recollection with a missing note and a new ending.
      if(phrase===6&&n===1)return;
      if(phrase===7&&n===phrases[piece.phrase][which].length-1)pitch=62;
      add(piece.lead,start+at+.025*(n%3),pitch,length,phrase>=6?.5:n%2?.55:.62,piece.pan);
    });
    // A single answer in the spaces between phrases; leave alternate phrases alone.
    if(phrase===1||phrase===4||phrase===6) {
      const pitches=which===2?[66,64]:[69,66];
      add(piece.answer,start+13.75,pitches[0],.65,.25,-piece.pan);
      add(piece.answer,start+14.75,pitches[1],.8,.22,-piece.pan);
    }
  });
  // The last twelve seconds deliberately carry only the shared pad and bass.
  notes.sort((a,b)=>a.beat-b.beat);
  return Object.freeze({...piece,duration:TRACK_SECONDS,notes:Object.freeze(notes.map(Object.freeze))});
}
export const TRACKS=Object.freeze(pieces.map(arrange));

// Every track is heard once per round; even the round boundary cannot repeat.
export class ShuffleBag {
  constructor(items=TRACKS,random=Math.random){this.items=[...items];this.random=random;this.bag=[];this.last=null;}
  next() {
    if(!this.bag.length) {
      this.bag=[...this.items];
      for(let i=this.bag.length-1;i>0;i--) {
        const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];
      }
      const end=this.bag.length-1;
      if(end>0&&this.bag[end]===this.last)[this.bag[0],this.bag[end]]=[this.bag[end],this.bag[0]];
    }
    return this.last=this.bag.pop();
  }
}
