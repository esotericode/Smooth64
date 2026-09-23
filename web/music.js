import {TRACKS} from './tracks.js';

// Original background music, synthesized live with Web Audio from the note
// data in tracks.js. The instruments imitate soundfont-era staples: an FM
// electric piano, string and "aah" pads, marimba, vibes, music box, bells, an
// ocarina, fretless and sub bass, and brushes, all in a shared hall reverb.
// A lookahead scheduler plays one track at a time from a shuffle bag. Each
// track ends on a ringing chord, and the next one starts in whichever nearby
// key shares the most notes with it, so the music drifts rather than cuts.
const LOOKAHEAD=.4,RING_OUT=3.5;
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const mtof=midi=>440*2**((midi-69)/12);

export function pitch(name) {
  const m=/^([A-G])([#b]?)(-?\d)$/.exec(name);
  if(!m)throw new Error(`Unknown note ${name}`);
  return 12*(Number(m[3])+1)+NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);
}
const QUALITIES={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],maj9:[0,4,7,11,14],
  m9:[0,3,7,10,14],'9':[0,4,7,10,14],'13':[0,4,7,10,14,21],'6':[0,4,7,9],m6:[0,3,7,9],'69':[0,4,7,9,14],
  '7sus4':[0,5,7,10],'9sus4':[0,5,7,10,14],sus2:[0,2,7],sus4:[0,5,7]};
export function parseChord(symbol) {
  const m=/^([A-G][#b]?)(.*)$/.exec(symbol),intervals=QUALITIES[m?.[2]];
  if(!intervals)throw new Error(`Unknown chord ${symbol}`);
  return {symbol,root:pitch(`${m[1]}0`)%12,intervals};
}
export const chordClasses=(chord,transpose=0)=>new Set(chord.intervals.map(i=>(chord.root+i+transpose+120)%12));
// "E5:1.5 r:.5 | C5:2" -> [{pitch, beats}], pitch null for a rest.
export function parseLine(text) {
  return text.split(/[\s|]+/).filter(Boolean).map(token=>{
    const [name,beats]=token.split(':'),length=Number(beats);
    if(!(length>0))throw new Error(`Bad duration in ${token}`);
    return {pitch:name==='r'?null:pitch(name),beats:length};
  });
}
// Chord-relative degree -> semitones above the root: 1 3 5 7 9 11 13, 8 for
// the octave, ' up and , down an octave. A sus chord's "3" is its 4th or 2nd,
// and a sixth chord's "7" is its 6th.
export function degree(chord,token) {
  const has=i=>chord.intervals.includes(i),base=token.replace(/[',]/g,'');
  const value={1:0,3:has(4)?4:has(3)?3:has(5)?5:2,5:7,7:has(11)?11:has(10)?10:has(9)?9:12,8:12,9:14,11:17,13:21}[base];
  if(value===undefined)throw new Error(`Unknown degree ${token}`);
  return value+12*((token.split("'").length-1)-(token.split(',').length-1));
}
// Close pad voicing: colour tones first (3rd, 7th/6th, 9th, 13th, 5th, root),
// each placed nearest the previous voicing so the voices move smoothly.
export function voicing(chord,previous,[low,high],count=4) {
  const intervals=[[4,3,5,2],[11,10,9],[14],[21],[7],[0]].flatMap(group=>group.filter(i=>chord.intervals.includes(i)).slice(0,1));
  const center=previous?.length?previous.reduce((a,b)=>a+b)/previous.length:(low+high)/2;
  return intervals.slice(0,count).map(i=>{
    const pc=(chord.root+i)%12;let note=pc+12*Math.round((center-pc)/12);
    while(note<low)note+=12;while(note>high)note-=12;return note;
  }).sort((a,b)=>a-b);
}

function parseTrack(track) {
  let beat=0;
  const chords=track.chords.split(/\s+/).map(token=>{
    const [symbol,beats]=token.split(':'),chord={...parseChord(symbol),start:beat,beats:Number(beats)};
    beat+=chord.beats;return chord;
  });
  const parts=Object.fromEntries(Object.entries(track.parts).map(([name,part])=>[name,{...part,
    pattern:part.pattern?.split(/\s+/),lines:part.lines&&Object.fromEntries(Object.entries(part.lines).map(([k,v])=>[k,parseLine(v)]))}]));
  return {...track,chords,parts,length:beat,swing:track.swing||.5,level:track.level??1};
}
export const SCORES=TRACKS.map(parseTrack);

// One pass through a track: note events in beats, before swing and humanizing.
export function compilePass(score,spec,{transpose=0,voices=[],ringOut=0}={}) {
  const events=[],add=(part,e)=>events.push({velocity:part.velocity??.5,...e,midi:e.midi===undefined?undefined:e.midi+transpose});
  for(const token of spec.split(/\s+/)) {
    const [,name,line,instrument,shift]=/^(\w+)(?::(\w+))?(?:@(\w+))?([+-]\d+)?$/.exec(token)||[];
    const part=score.parts[name];if(!part)throw new Error(`${score.id}: unknown part ${token}`);
    const last=score.chords.at(-1);
    if(part.drums) {
      for(let bar=0;bar<score.length;bar+=score.meter)for(const [drum,pattern] of Object.entries(part.drums))
        [...pattern].forEach((hit,i)=>{const beat=bar+i*part.step;if(hit!=='.'&&beat<score.length)add(part,{beat,hold:part.step,instrument:drum,velocity:hit==='x'?.6:.32});});
    } else if(name==='pad') {
      for(const chord of score.chords) {
        voices=voicing(chord,voices,part.range);
        for(const midi of voices)add(part,{beat:chord.start,hold:chord.beats+(chord===last?ringOut:0),midi,instrument:part.instrument});
      }
    } else if(part.pattern&&part.step) {
      for(const chord of score.chords) {
        const root=chord.root+12*Math.round((part.center-chord.root)/12);
        for(let i=0,beat=chord.start;beat<chord.start+chord.beats-1e-9;i++,beat+=part.step) {
          const step=part.pattern[i%part.pattern.length];if(step==='r')continue;
          // Pedal: tones ring on until the chord changes.
          add(part,{beat,hold:chord.start+chord.beats-beat,midi:root+degree(chord,step),instrument:part.instrument,
            velocity:part.velocity*(beat%score.meter===0?1.15:1)});
        }
      }
    } else if(part.pattern) {
      for(const chord of score.chords) {
        const root=part.low+((chord.root-part.low)%12+12)%12;
        for(let i=0,beat=chord.start;beat<chord.start+chord.beats-1e-9;i++) {
          const [step,beats]=part.pattern[i%part.pattern.length].split(':'),length=Math.min(Number(beats),chord.start+chord.beats-beat);
          add(part,{beat,hold:length+(chord===last&&beat+length>=score.length-1e-9?ringOut/2:0),midi:root+degree(chord,step),instrument:part.instrument});
          beat+=length;
        }
      }
    } else if(part.lines) {
      let beat=0;
      for(const note of part.lines[line||'A']) {
        if(note.pitch!==null)add(part,{beat,hold:note.beats,midi:note.pitch+Number(shift||0),instrument:instrument||part.instrument});
        beat+=note.beats;
      }
    }
  }
  return {events:events.sort((a,b)=>a.beat-b.beat),voices};
}

// Instruments. Each voice schedules its own nodes and stops them itself.
function envelope(ctx,t,peak,{attack=.005,decay=1,sustain=1,release=.3},hold) {
  const gain=ctx.createGain(),g=gain.gain;hold=Math.max(hold,attack);
  g.setValueAtTime(0,t);g.linearRampToValueAtTime(peak,t+attack);
  if(sustain<1)g.setTargetAtTime(peak*sustain,t+attack,decay/4);
  g.setTargetAtTime(0,t+hold,release/4);
  return {gain,end:t+hold+release*1.5};
}
function oscillator(ctx,t,end,frequency,{wave,type='sine',detune=0}={}) {
  const o=ctx.createOscillator();if(wave)o.setPeriodicWave(wave);else o.type=type;
  o.frequency.value=frequency;o.detune.value=detune;o.start(t);o.stop(end);return o;
}
// Two-operator FM: bright as it strikes, mellowing as the index falls.
function fm(m,t,midi,hold,peak,{index,brightness,shape,ratio=1}) {
  const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,peak,shape,hold),depth=ctx.createGain(),carrier=oscillator(ctx,t,end,f);
  depth.gain.setValueAtTime(f*index,t);depth.gain.setTargetAtTime(f*index*.22,t,brightness);
  oscillator(ctx,t,end,f*ratio).connect(depth).connect(carrier.frequency);carrier.connect(gain);
  return gain;
}
function partials(m,t,midi,peak,list,release=.3) {
  const ctx=m.ctx,f=mtof(midi),out=ctx.createGain();
  for(const [ratio,level,decay] of list) {
    if(f*ratio>ctx.sampleRate*.45)continue;
    const {gain,end}=envelope(ctx,t,peak*level,{attack:.002,decay,sustain:0,release},decay);
    oscillator(ctx,t,end,f*ratio).connect(gain);gain.connect(out);
  }
  return out;
}
function noise(m,t,peak,{type,frequency,q=.7,attack,decay}) {
  const ctx=m.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter();
  const {gain,end}=envelope(ctx,t,peak,{attack,decay,sustain:0,release:.05},decay);
  source.buffer=m.noise;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
  source.connect(filter).connect(gain);source.start(t,m.rng()*1.5);source.stop(end);return gain;
}
export const VOICES={
  epiano:(m,t,midi,hold,v)=>fm(m,t,midi,Math.min(hold,2.6),.3*v,{index:.9+1.3*v,brightness:.25,shape:{attack:.004,decay:4.5,sustain:0,release:.4}}),
  harp:(m,t,midi,hold,v)=>fm(m,t,midi,Math.min(hold,1.8),.3*v,{index:.8+v,brightness:.07,shape:{attack:.003,decay:3,sustain:0,release:.5}}),
  marimba:(m,t,midi,hold,v)=>partials(m,t,midi,.42*v,[[1,1,.9],[3.93,.1,.25],[9.8,.025,.08]],.05),
  vibes:(m,t,midi,hold,v)=>{
    const out=partials(m,t,midi,.3*v,[[1,1,3.2],[4,.12,.5],[10,.02,.12]]),damp=m.ctx.createGain();
    damp.gain.setValueAtTime(1,t);damp.gain.setTargetAtTime(0,t+Math.max(hold,.2),.15);out.connect(damp);return damp;
  },
  musicbox:(m,t,midi,hold,v)=>partials(m,t,midi,.26*v,[[1,1,1.6],[3.9,.16,.35],[8.2,.05,.1]]),
  bells:(m,t,midi,hold,v)=>partials(m,t,midi,.22*v,[[1,1,2.8],[2.76,.3,.9],[5.4,.12,.3],[8.9,.05,.12]]),
  ocarina:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,.22*v,{attack:.06,sustain:1,release:.18},hold),out=ctx.createGain();
    const tone=oscillator(ctx,t,end,f,{wave:m.wave('ocarina')}),lfo=oscillator(ctx,t,end,5.2),depth=ctx.createGain();
    // Vibrato blooms after the attack, like a held breath.
    depth.gain.setValueAtTime(0,t);depth.gain.linearRampToValueAtTime(0,t+.18);depth.gain.linearRampToValueAtTime(11,t+.6);
    lfo.connect(depth).connect(tone.detune);tone.connect(gain).connect(out);
    noise(m,t,.045*v,{type:'bandpass',frequency:f*2.2,q:1.2,attack:.02,decay:.16}).connect(out);
    return out;
  },
  strings:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,.065*v,{attack:1.3,sustain:1,release:2.6},hold);
    for(const detune of [-7,6])oscillator(ctx,t,end,f,{wave:m.wave('softsaw'),detune}).connect(gain);
    return gain;
  },
  choir:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,.09*v,{attack:1.6,sustain:1,release:3},hold);
    for(const detune of [-5,5]) {
      // The shared vibrato must let go of each voice, or it would keep it alive.
      const o=oscillator(ctx,t,end,f,{wave:m.wave('softsaw'),detune});m.vibrato.connect(o.detune);o.connect(gain);
      o.onended=()=>m.vibrato.disconnect(o.detune);
    }
    return gain;
  },
  fretless:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,.34*v,{attack:.012,decay:1.2,sustain:.55,release:.16},hold);
    const tone=oscillator(ctx,t,end,f,{wave:m.wave('bass')}),filter=ctx.createBiquadFilter();
    tone.detune.setValueAtTime(-30,t);tone.detune.setTargetAtTime(0,t,.03); // a fretless slide into the note
    filter.frequency.setValueAtTime(f*6,t);filter.frequency.setTargetAtTime(f*2.2,t,.12);
    tone.connect(filter).connect(gain);return gain;
  },
  upright:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,f=mtof(midi),{gain,end}=envelope(ctx,t,.36*v,{attack:.006,decay:2.2,sustain:0,release:.2},Math.min(hold,1.6));
    const filter=ctx.createBiquadFilter();filter.frequency.setValueAtTime(f*4,t);filter.frequency.setTargetAtTime(f*1.6,t,.1);
    oscillator(ctx,t,end,f,{wave:m.wave('bass')}).connect(filter).connect(gain);return gain;
  },
  sub:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,{gain,end}=envelope(ctx,t,.36*v,{attack:.35,sustain:1,release:1.2},hold);
    oscillator(ctx,t,end,mtof(midi),{wave:m.wave('sub')}).connect(gain);return gain;
  },
  kick:(m,t,midi,hold,v)=>{
    const ctx=m.ctx,{gain,end}=envelope(ctx,t,.5*v,{attack:.002,decay:.5,sustain:0,release:.05},.5),o=oscillator(ctx,t,end,95);
    o.frequency.setTargetAtTime(46,t,.035);o.connect(gain);return gain;
  },
  brush:(m,t,midi,hold,v)=>noise(m,t,.18*v,{type:'bandpass',frequency:2400,attack:.01,decay:.25}),
  shaker:(m,t,midi,hold,v)=>noise(m,t,.5*v,{type:'bandpass',frequency:5000,q:.6,attack:.004,decay:.12}),
};
// Mixer channels: level, stereo position, reverb send and a colour effect.
const CHANNELS={
  epiano:{level:.45,pan:-.2,reverb:.3,chorus:true},harp:{level:.9,pan:.15,reverb:.4},
  marimba:{level:1.1,pan:-.22,reverb:.25},vibes:{level:1.55,pan:.2,reverb:.42,tremolo:4.3},
  musicbox:{level:2.1,pan:.25,reverb:.5},bells:{level:2.2,pan:.28,reverb:.55},ocarina:{level:1.1,pan:.06,reverb:.38},
  strings:{level:.6,pan:0,reverb:.5,chorus:true,sweep:true},choir:{level:1.25,pan:0,reverb:.62,formant:true},
  fretless:{level:.85,pan:0,reverb:.1},upright:{level:1.45,pan:0,reverb:.14},sub:{level:.36,pan:0,reverb:.04},
  kick:{level:.9,pan:0,reverb:.08},brush:{level:.7,pan:.12,reverb:.25},shaker:{level:1,pan:.3,reverb:.18},
};
const WAVES={softsaw:Array.from({length:24},(_,n)=>n?1/n**1.25:0),ocarina:[0,1,.08,.03,.01],
  bass:[0,1,.45,.2,.08,.04],sub:[0,1,.12]};

function seeded(random) {
  let seed=Math.floor(random()*2**32)>>>0;
  return ()=>{seed=seed+0x6D2B79F5>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/2**32;};
}

export class Music {
  constructor(ctx,output,{random=Math.random,scores=SCORES}={}) {
    // Separate streams: `choose` decides structure (order, repeats, gaps), `rng`
    // colours the performance, so a seed replays the same running order.
    this.ctx=ctx;this.output=output;this.scores=scores;this.choose=seeded(random);this.rng=seeded(random);
    this.playing=false;this.bag=[];this.channels={};this.inputs={};this.waves={};this.events=[];this.cursor=0;
  }
  build() {
    if(this.mix)return;
    const ctx=this.ctx;
    this.mix=ctx.createGain();this.tone=ctx.createBiquadFilter();this.pause=ctx.createGain();this.jingle=ctx.createGain();this.level=ctx.createGain();
    // The era's warm top end: nothing above ~9 kHz. A pause muffles it further.
    this.tone.frequency.value=9000;this.tone.Q.value=.5;
    this.mix.connect(this.tone).connect(this.pause).connect(this.jingle).connect(this.level).connect(this.output);
    this.reverb=ctx.createConvolver();this.reverb.buffer=this.impulse(3,2.6);this.reverb.connect(this.mix);
    this.noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=this.rng()*2-1;
    // One shared vibrato for the choir voices.
    const lfo=ctx.createOscillator();lfo.frequency.value=4.6;this.vibrato=ctx.createGain();this.vibrato.gain.value=9;
    lfo.connect(this.vibrato);lfo.start();
  }
  // A hall: darkening, exponentially decaying noise after a few early reflections.
  impulse(seconds,decay) {
    const ctx=this.ctx,rate=ctx.sampleRate,length=Math.round(rate*seconds),buffer=ctx.createBuffer(2,length,rate);
    for(let ch=0;ch<2;ch++) {
      const data=buffer.getChannelData(ch);let low=0;
      for(let i=0;i<length;i++) {
        const t=i/rate;low+=(this.rng()*2-1-low)*(.6-.52*t/seconds);
        data[i]=low*Math.exp(-6.9*t/decay)*Math.min(1,t/.025);
      }
      for(const [at,gain] of [[.011,.5],[.019,-.35],[.029,.28],[.041,-.2]])data[Math.round((at+ch*.003)*rate)]+=gain;
    }
    return buffer;
  }
  wave(name) {
    return this.waves[name]??=this.ctx.createPeriodicWave(new Float32Array(WAVES[name].length),Float32Array.from(WAVES[name]));
  }
  channel(name) {
    if(this.channels[name])return this.channels[name];
    const ctx=this.ctx,spec=CHANNELS[name],input=ctx.createGain(),pan=ctx.createStereoPanner(),send=ctx.createGain();
    input.gain.value=spec.level;pan.pan.value=spec.pan;send.gain.value=spec.reverb;
    let node=input;
    if(spec.sweep) {
      // A slow filter sweep keeps sustained pads breathing.
      const filter=ctx.createBiquadFilter(),lfo=ctx.createOscillator(),depth=ctx.createGain();
      filter.frequency.value=1600;filter.Q.value=.4;lfo.frequency.value=.06;depth.gain.value=550;
      lfo.connect(depth).connect(filter.frequency);lfo.start();node=node.connect(filter);
    }
    if(spec.formant) {
      // An "aah": fixed vowel formants over the pad's harmonics.
      const out=ctx.createGain();
      for(const [type,frequency,q,gain] of [['bandpass',720,2.5,1],['bandpass',1150,3.5,.7],['lowpass',380,.5,.55]]) {
        const filter=ctx.createBiquadFilter(),level=ctx.createGain();
        filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;level.gain.value=gain;
        node.connect(filter).connect(level).connect(out);
      }
      node=out;
    }
    if(spec.tremolo) {
      const tremolo=ctx.createGain(),lfo=ctx.createOscillator(),depth=ctx.createGain();
      tremolo.gain.value=.82;lfo.frequency.value=spec.tremolo;depth.gain.value=.18;
      lfo.connect(depth).connect(tremolo.gain);lfo.start();node=node.connect(tremolo);
    }
    if(spec.chorus) {
      // Two slowly wandering delays, one per side, under the dry signal.
      const merger=ctx.createChannelMerger(2),out=ctx.createGain();
      [0,1].forEach(side=>{
        const delay=ctx.createDelay(.05),lfo=ctx.createOscillator(),depth=ctx.createGain();
        delay.delayTime.value=.016+side*.005;lfo.frequency.value=.5+side*.17;depth.gain.value=.003;
        lfo.connect(depth).connect(delay.delayTime);lfo.start();node.connect(delay).connect(merger,0,side);
      });
      node.connect(out);merger.connect(out);node=out;
    }
    node.connect(pan);pan.connect(this.mix);pan.connect(send).connect(this.reverb);
    return this.channels[name]=input;
  }
  get now() {return this.ctx.currentTime;}
  start(when=this.now+.25) {
    if(this.playing)return;
    this.build();this.playing=true;this.lastChord=null;
    const g=this.level.gain;g.cancelScheduledValues(this.now);g.setValueAtTime(g.value,this.now);g.setTargetAtTime(1,this.now,.3);
    this.begin(this.pick(),when);
  }
  stop() {
    if(!this.playing)return;
    this.playing=false;this.events=[];this.cursor=0;
    // Silence the notes still ringing too, so that a restart begins clean.
    for(const input of [...Object.values(this.inputs),...Object.values(this.previousInputs||{})])input.gain.setTargetAtTime(0,this.now,.3);
    this.level.gain.cancelScheduledValues(this.now);this.level.gain.setTargetAtTime(0,this.now,.4);
  }
  // Muffle and lower the music while a menu is open.
  setPaused(paused) {
    if(!this.mix||paused===this.paused)return;
    this.paused=paused;
    this.tone.frequency.setTargetAtTime(paused?1300:9000,this.now,.15);this.pause.gain.setTargetAtTime(paused?.5:1,this.now,.15);
  }
  // Step aside for a jingle that starts `delay` seconds from now.
  duck(seconds,delay=0) {
    if(!this.mix)return;
    const g=this.jingle.gain,t=this.now+delay;g.cancelScheduledValues(this.now);g.setValueAtTime(g.value,this.now);
    g.setTargetAtTime(.3,t,.05);g.setTargetAtTime(1,t+seconds,.6);
  }
  // A shuffle bag: every track plays before any repeats, never twice in a row.
  pick() {
    if(!this.bag.length) {
      this.bag=this.scores.map((_,i)=>i);
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.choose()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
      if(this.bag.length>1&&this.bag.at(-1)===this.last)this.bag.unshift(this.bag.pop());
    }
    return this.bag.pop();
  }
  begin(index,when) {
    const score=this.scores[index],first=score.chords[0];
    // Move to the nearby key that keeps the most notes of the last chord.
    let transpose=0;
    if(this.lastChord) {
      let best=-Infinity;
      for(let t=-3;t<=3;t++) {
        const common=[...chordClasses(first,t)].filter(pc=>this.lastChord.has(pc)).length,score=common-.4*Math.abs(t);
        if(score>best){best=score;transpose=t;}
      }
    }
    const passes=[...score.passes],middle=passes.slice(1,-1),seconds=passes.length*score.length*60/score.bpm;
    if(seconds<200&&this.choose()<.5)passes.splice(-1,0,...middle);
    Object.assign(this,{track:index,last:index,score,transpose,passes,pass:-1,voices:[],passEnd:when,inputs:{},previousInputs:this.inputs,
      lastChord:chordClasses(score.chords.at(-1),transpose)});
    this.next();
  }
  next() {
    const start=this.passEnd;
    if(++this.pass>=this.passes.length){this.begin(this.pick(),start+1+this.choose()*1.5);return;}
    const score=this.score,beat=60/score.bpm,final=this.pass===this.passes.length-1;
    const {events,voices}=compilePass(score,this.passes[this.pass],{transpose:this.transpose,voices:this.voices,ringOut:final?RING_OUT/beat:0});
    this.voices=voices;this.passEnd=start+score.length*beat;
    const swing=b=>{const whole=Math.floor(b),part=b-whole;return whole+(Math.abs(part-.5)<1e-9?score.swing:part);};
    this.events=events.map(e=>({...e,time:start+swing(e.beat)*beat+(this.rng()-.5)*.012,hold:e.hold*beat,
      velocity:Math.min(1,e.velocity*(.9+this.rng()*.2))})).sort((a,b)=>a.time-b.time);
    this.cursor=0;
  }
  // Schedule every note that starts before now + ahead. Notes a stall made
  // late are skipped rather than played in a burst.
  update(ahead=LOOKAHEAD) {
    if(!this.playing)return;
    const horizon=this.now+ahead,late=this.now-.05;
    for(let guard=0;guard<10000;guard++) {
      if(this.cursor<this.events.length) {
        const e=this.events[this.cursor];if(e.time>=horizon)break;
        this.cursor++;if(e.time>=late)this.play(e);continue;
      }
      if(this.passEnd>=horizon)break;
      this.next();
    }
  }
  // Each visit feeds the mixer through its own inputs, so a track's level never
  // touches the notes still ringing from the one before.
  input(name) {
    const gain=this.ctx.createGain();gain.gain.value=this.score?.level??1;gain.connect(this.channel(name));return gain;
  }
  play(e) {
    const input=this.inputs[e.instrument]??=this.input(e.instrument);
    VOICES[e.instrument](this,Math.max(e.time,this.now),e.midi,e.hold,e.velocity).connect(input);
  }
}
