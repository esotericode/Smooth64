import {MARKER,SAMPLES} from './sounds.js';
import {Music} from './music.js';

// Sound effects. Presentation only: the movement core reports which original
// sound each action requested on a tick (s64_sounds), and this voices it with
// Kenney's CC0 samples. Timing therefore comes from the core: footsteps on the
// original's step frames, one jump sound per takeoff, flips on their spin
// frames, slides and lava burns for exactly as long as the core keeps them.
const STEPS=['step1','step2','step3','step4','step5','step6'];
const TIPTOES=['tiptoe1','tiptoe2','tiptoe3','tiptoe4'];
const PUSHES=['push1','push2','push3'];
// A cue is one or more layers: [samples to pick from, loudness dB, rate range, options].
const CUES={
  step:[[STEPS,-23,[.9,1.08]]],
  tiptoe:[[TIPTOES,-24,[.95,1.12]]],
  push:[[PUSHES,-27,[1.05,1.25]]],
  land:[[['land'],-19,[.9,1.05]],[STEPS,-23,[.78,.88]]],
  body:[[['thump2','thump4'],-21,[.85,.95]],[['land'],-20,[.75,.85]]],
  pound:[[['impact'],-21,[.8,.88],{lowpass:1600}],[['thump2'],-22,[.7,.75]],[['poof1','poof2'],-23,[.7,.8]]],
  spin:[[PUSHES,-25,[1.35,1.6]]],
  throw:[[PUSHES,-22,[1.5,1.7]]],
  swing:[[PUSHES,-24,[1.65,1.85]]],
  drop:[[PUSHES,-23,[.85,.95]]],
  bonk:[[['impact'],-22,[1.25,1.4],{lowpass:2600}],[['thump1','thump3'],-19,[1,1.1]]],
  touch:[[['thump1','thump3'],-24,[1.25,1.4]]],
  kick:[[['thump1','thump3'],-17,[.9,1]],[PUSHES,-25,[1.3,1.45]]],
  grab:[[['thump1','thump3'],-19,[1.15,1.3]],[STEPS,-27,[1.2,1.3]]],
  hang:[[['clink'],-23,[.85,1.1]],[['thump3'],-26,[1.3,1.5]]],
  // The explorer's little voice: Kenney's platformer "bwip", bent up or down.
  hup:[[['bwip'],-22,[.95,1.18]]],
  hoohoo:[[['bwip'],-22,[1.15,1.2]],[['bwip'],-22,[1.34,1.4],{delay:.09}]],
  yahoo:[[['bwip'],-22,[1.04,1.1]],[['bwip'],-21,[1.5,1.56],{delay:.1}]],
  haha:[[['bwip'],-28,[1.6,1.7]],[['bwip'],-28,[1.6,1.7],{delay:.085}]],
  whoa:[[['bwip'],-24,[1,1.1],{reverse:true}]],
  effort:[[['bwip'],-29,[.72,.8]]],
  oof:[[['bwip'],-23,[.62,.7],{reverse:true}]],
  hurt:[[['hurt'],-20,[.95,1.05]]],
  scorch:[[['scorch'],-22,[1,1]],[['poof1'],-24,[.6,.66]]],
  falling:[[['fall'],-20,[1,1]]],
  // Gameplay cues from main.js.
  coin:[[['coin'],-19,[1,1]]],
  shard:[[['shard'],-17,[1,1]]],
  star:[[['star'],-16,[1,1]],[['coin'],-23,[1.5,1.5],{delay:.62}]],
  reveal:[[['reveal'],-17,[1,1]]],
  checkpoint:[[['poof1'],-22,[.55,.6]],[['chime'],-21,[.5,.5],{delay:.05}]],
  beacon:[[['chime'],-26,[.5,.5]]],
  lose:[[['lose'],-19,[1,1]]],
  click:[[['click'],-28,[1,1]]],
};
// Jingles the music steps aside for, in seconds.
const DUCK={shard:1,star:1.2,reveal:1};
// Music gain at full volume. At the default 50% the music averages about
// -34 LUFS, well under the footsteps and far under the jingles.
const MUSIC_TRIM=.63;
// Upstream IDs (vendor/libsm64/src/decomp/include/audio_defines.h), by bank.
// Terrain sounds occupy eight IDs each: base + the floor's terrain type.
const ACTION={0x2D:'hang',0x35:'throw',0x37:'spin',0x38:'spin',0x42:'bonk',0x44:'touch',0x45:'bonk',0x5A:'spin'};
const TERRAIN=[[0x00,'push'],[0x08,'land'],[0x10,'step'],[0x18,'body'],[0x20,'tiptoe'],[0x60,'pound']];
const VOICE={0x00:'hup',0x01:'hup',0x02:'hup',0x03:'hoohoo',0x04:'yahoo',0x05:'oof',0x08:'whoa',0x09:'effort',
  0x0A:'hurt',0x0B:'oof',0x10:'falling',0x11:'haha',0x13:'effort',0x14:'scorch',0x1E:'swing',0x1F:'swing',
  0x20:'oof',0x22:'drop',0x24:'swing',0x2B:'yahoo',0x2C:'yahoo',0x2D:'yahoo',0x2E:'yahoo',0x2F:'yahoo',0x30:'oof'};
// Grass/snow/sand floors muffle a step; stone and ice brighten it. [rate, dB]
const FLOOR=[[1,0],[.9,-3],[1,0],[1.08,1],[.95,0],[.85,-4],[1.12,0],[.88,-3]];

export function soundCue(bits) {
  const bank=bits>>>28,id=bits>>>16&255;
  if(bank===1)return id<8?{bed:'slide',terrain:id}:id===0x10?{bed:'burn'}:null;
  if(bank===2)return VOICE[id]?{cue:VOICE[id]}:null;
  if(bank!==0)return null;
  const terrain=TERRAIN.find(([base])=>id>=base&&id<base+8);
  return terrain?{cue:terrain[1],terrain:id-terrain[0]}:ACTION[id]?{cue:ACTION[id]}:null;
}

const contact=name=>name?.includes('LEDGE_GRAB');
// Transitions the core has no sound for, read like the particle effects are.
export function transitionCues(previousName,name) {
  const cues=[];
  if(name==='ACT_AIR_HIT_WALL'&&previousName!==name)cues.push('touch');
  if(previousName==='ACT_AIR_HIT_WALL'&&name==='ACT_WALL_KICK_AIR')cues.push('kick');
  if(contact(name)&&!contact(previousName))cues.push('grab');
  return cues;
}

function noise(ctx,seconds,fill) {
  const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*seconds),ctx.sampleRate),data=buffer.getChannelData(0);
  let seed=0x5eed;const random=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2147483648-1;
  fill(data,random,ctx.sampleRate);
  // Loop seamlessly: crossfade the last 20 ms into the start.
  const fade=Math.round(ctx.sampleRate*.02);
  for(let i=0;i<fade;i++){const k=i/fade;data[i]=data[i]*k+data[data.length-fade+i]*(1-k);}
  return buffer;
}

function browserContext() {
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
  return Context?new Context({latencyHint:'interactive'}):null;
}

const newMusic=(ctx,output,random)=>new Music(ctx,output,{random});

export class GameAudio {
  constructor({volume=.8,music=.5,createContext=browserContext,createMusic=newMusic,random=Math.random}={}) {
    this.volume=volume;this.musicVolume=music;this.createContext=createContext;this.createMusic=createMusic;this.random=random;
    this.ctx=null;this.bytes=null;this.samples=null;this.reversed={};this.beds={};this.voices=0;this.last={};
    this.music=null;this.wantMusic=false;this.hidden=false;this.timer=null;
  }
  // The sprite's bytes arrive with the other game files; decoding waits for a
  // user gesture, since browsers only let pages start audio after one.
  load(bytes) {this.bytes=bytes;if(this.ctx)this.decode();}
  unlock() {
    if(!this.ctx) {
      try {this.ctx=this.createContext();} catch {this.ctx=null;}
      if(!this.ctx)return;
      this.bus=this.ctx.createGain();this.bus.gain.value=this.volume*this.volume;
      // Safety for rare pile-ups (a pound, a coin and a jingle at once): exact
      // below -3 dBFS, then peaks up to +6 dB round off instead of clipping.
      const half=this.ctx.createGain(),limiter=this.ctx.createWaveShaper(),curve=new Float32Array(1025);
      for(let i=0;i<curve.length;i++) {
        const x=(i/512-1)*2,a=Math.abs(x);curve[i]=Math.sign(x)*(a<.7?a:.7+.3*Math.tanh((a-.7)/.3));
      }
      half.gain.value=.5;limiter.curve=curve;limiter.oversample='2x';
      this.bus.connect(half).connect(limiter).connect(this.ctx.destination);
      // The music has its own volume and shares the limiter.
      this.musicBus=this.ctx.createGain();this.musicBus.gain.value=this.musicVolume**2*MUSIC_TRIM;this.musicBus.connect(half);
      this.decode();
    }
    if(this.ctx.state==='suspended'&&!this.hidden)this.ctx.resume().catch(()=>{});
    this.syncMusic();
  }
  decode() {
    if(!this.bytes||this.samples||this.decoding)return;
    const bytes=this.bytes;this.bytes=null;this.decoding=true;
    Promise.resolve(this.ctx.decodeAudioData(bytes)).then(buffer=>{this.samples=this.slice(buffer);this.makeBeds();})
      .catch(error=>console.warn('Sound effects unavailable:',error?.message||error)).finally(()=>this.decoding=false);
  }
  slice(buffer) {
    const data=buffer.getChannelData(0),rate=buffer.sampleRate,expected=Math.round(MARKER*rate);
    // The sprite opens with a 1 kHz burst at MARKER seconds; a decoder delay
    // shifts it. Find its first peak, then walk back to where it starts rising.
    let at=expected;
    for(let i=0,end=Math.min(data.length,expected+Math.round(rate*.1));i<end;i++)if(Math.abs(data[i])>.3){at=i;break;}
    while(at>0&&Math.abs(data[at-1])>.02)at--;
    return Object.fromEntries(Object.entries(SAMPLES).map(([name,[start,duration,level]])=>{
      const from=Math.min(data.length-1,Math.max(0,Math.round(start*rate)+at-expected));
      const length=Math.max(1,Math.min(Math.round(duration*rate),data.length-from));
      const out=this.ctx.createBuffer(1,length,rate);out.getChannelData(0).set(data.subarray(from,from+length));
      return [name,{buffer:out,level}];
    }));
  }
  makeBeds() {
    // Continuous textures, generated rather than looped from a recording so
    // they never repeat audibly: a shoe/body scrape and a lava crackle.
    this.noise={
      slide:noise(this.ctx,1.6,(data,random)=>{
        let low=0,high=0,previous=0;
        for(let i=0;i<data.length;i++){const white=random();low+=(white-low)*.35;high=.97*(high+low-previous);previous=low;data[i]=high*.9;}
      }),
      burn:noise(this.ctx,2,(data,random,rate)=>{
        // Hiss plus ~60 random pops a second, each decaying over 2.5 ms.
        const decay=Math.exp(-1/(rate*.0025));let crackle=0,previous=0;
        for(let i=0;i<data.length;i++) {
          const white=random();if(random()>1-60/rate)crackle=(random()>0?1:-1)*(.35+.65*Math.abs(random()));
          crackle*=decay;data[i]=(white-previous)*.08+crackle;previous=white;
        }
      }),
    };
  }
  get ready() {return !!this.samples&&this.ctx?.state==='running'&&this.volume>0;}
  setVolume(value) {
    this.volume=Math.max(0,Math.min(1,value));
    if(this.bus)this.bus.gain.setTargetAtTime(this.volume*this.volume,this.ctx.currentTime,.02);
    if(!this.volume)this.hush();
  }
  pick(list,key) {
    // Random, but never the same variation twice in a row.
    let name=list[Math.floor(this.random()*list.length)];
    if(list.length>1&&name===this.last[key])name=list[(list.indexOf(name)+1)%list.length];
    this.last[key]=name;return name;
  }
  reverse(name) {
    if(!this.reversed[name]) {
      const source=this.samples[name].buffer,out=this.ctx.createBuffer(1,source.length,source.sampleRate);
      const from=source.getChannelData(0),to=out.getChannelData(0),fade=Math.min(to.length,Math.round(source.sampleRate*.012));
      for(let i=0;i<to.length;i++)to[i]=from[from.length-1-i];
      for(let i=0;i<fade;i++)to[to.length-1-i]*=i/fade;
      this.reversed[name]={buffer:out,level:this.samples[name].level};
    }
    return this.reversed[name];
  }
  // Play a named cue. `gain` scales it (e.g. by impact), `rate` bends its pitch.
  cue(name,{gain=1,rate=1,delay=0}={}) {
    if(!this.ready||!CUES[name])return;
    if(DUCK[name])this.music?.duck(DUCK[name],delay);
    for(const [list,loudness,[low,high],options={}] of CUES[name]) {
      if(this.voices>=32)return;
      const sampleName=this.pick(list,`${name}:${list[0]}`),sample=options.reverse?this.reverse(sampleName):this.samples[sampleName];
      if(!sample)continue;
      const ctx=this.ctx,source=ctx.createBufferSource(),amp=ctx.createGain();
      source.buffer=sample.buffer;source.playbackRate.value=(low+(high-low)*this.random())*rate;
      amp.gain.value=gain*10**((loudness-sample.level)/20);
      let node=source;
      if(options.lowpass){const filter=ctx.createBiquadFilter();filter.frequency.value=options.lowpass;node=node.connect(filter);}
      node.connect(amp).connect(this.bus);
      this.voices++;source.onended=()=>{this.voices--;amp.disconnect();};
      source.start(ctx.currentTime+(options.delay||0)+delay);
    }
  }
  // Keep a continuous sound going; it fades once a tick stops requesting it.
  sustain(kind,level,brightness=1) {
    if(!this.ready||!this.noise)return;
    const ctx=this.ctx,now=ctx.currentTime;let bed=this.beds[kind];
    if(!bed) {
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
      source.buffer=this.noise[kind];source.loop=true;
      filter.type=kind==='burn'?'highpass':'lowpass';filter.frequency.value=kind==='burn'?1400:1600;
      amp.gain.value=0;source.connect(filter).connect(amp).connect(this.bus);
      source.start(now,this.random()*source.buffer.duration);
      bed=this.beds[kind]={source,filter,amp};
    }
    bed.held=true;
    bed.amp.gain.setTargetAtTime((kind==='burn'?.5:.26)*level,now,.03);
    if(kind==='slide')bed.filter.frequency.setTargetAtTime(700+2600*brightness,now,.05);
  }
  release(kind) {
    const bed=this.beds[kind];if(!bed)return;
    delete this.beds[kind];
    const now=this.ctx.currentTime;bed.amp.gain.cancelScheduledValues(now);bed.amp.gain.setTargetAtTime(0,now,.04);
    bed.source.stop(now+.3);bed.source.onended=()=>bed.amp.disconnect();
  }
  // Stop continuous sounds: pauses, menus, knockouts and teleports.
  hush() {for(const kind of Object.keys(this.beds))this.release(kind);}
  // Background music: wanted once play begins, heard while its volume is up.
  playMusic() {this.wantMusic=true;this.syncMusic();}
  setMusicVolume(value) {
    this.musicVolume=Math.max(0,Math.min(1,value));
    if(this.musicBus)this.musicBus.gain.setTargetAtTime(this.musicVolume**2*MUSIC_TRIM,this.ctx.currentTime,.05);
    this.syncMusic();
  }
  syncMusic() {
    const on=this.wantMusic&&this.musicVolume>0&&!!this.ctx&&!this.musicFailed;
    try {
      if(on&&!this.music?.playing) {
        this.music??=this.createMusic(this.ctx,this.musicBus,this.random);this.music.start();
        // The scheduler looks 0.4 s ahead, so a tenth-second beat never runs dry.
        this.timer??=setInterval(()=>this.updateMusic(),100);this.timer.unref?.();
      } else if(!on&&this.music?.playing) {
        this.music.stop();clearInterval(this.timer);this.timer=null;
      }
    } catch(error) {this.failMusic(error);}
  }
  updateMusic() {try {this.music?.update();} catch(error) {this.failMusic(error);}}
  // Music is optional, like the sound file: a failure turns it off, not the game.
  failMusic(error) {
    console.warn('Music unavailable:',error?.message||error);
    this.musicFailed=true;clearInterval(this.timer);this.timer=null;
    try {this.music?.stop();} catch { /* already failed */ }
  }
  // Muffled under menus.
  pauseMusic(paused) {this.music?.setPaused(paused);}
  // A hidden tab falls silent and picks up where it left off.
  setHidden(hidden) {
    this.hidden=hidden;
    if(this.ctx)Promise.resolve(hidden?this.ctx.suspend?.():this.ctx.resume()).catch(()=>{});
  }
  // One simulation tick: the core's requests plus a few transitions.
  tick(sounds,previous,current,previousName,name) {
    if(!this.ready){this.hush();return;}
    const played=new Set();
    for(const bits of sounds) {
      const sound=soundCue(bits);if(!sound)continue;
      const [rate,db]=FLOOR[sound.terrain??0]||FLOOR[0];
      if(sound.bed) {
        const speed=Math.min(1,Math.abs(current.speed)/48);
        this.sustain(sound.bed,sound.bed==='burn'?1:Math.max(.2,speed)*10**(db/20),speed);continue;
      }
      if(played.has(sound.cue))continue;played.add(sound.cue);
      let gain=10**(db/20);
      if(sound.cue==='step')gain*=.55+.45*Math.min(1,Math.abs(current.speed)/32);
      if(sound.cue==='land'||sound.cue==='body')gain*=.7+.3*Math.min(1,Math.max(0,(-previous.velocity[1]-10)/50));
      this.cue(sound.cue,{gain,rate});
    }
    for(const cue of transitionCues(previousName,name))this.cue(cue);
    for(const [kind,bed] of Object.entries(this.beds))if(bed.held)bed.held=false;else this.release(kind);
  }
}
