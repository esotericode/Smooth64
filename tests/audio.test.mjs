import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameAudio,soundCue,transitionCues} from '../web/audio.js';
import {MARKER,SAMPLES} from '../web/sounds.js';
import {loadCore} from '../web/engine.js';

const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const names=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
const FLAT=[{type:0,vertices:[[-6000,0,-6000],[-6000,0,6000],[6000,0,6000]]},{type:0,vertices:[[-6000,0,-6000],[6000,0,6000],[6000,0,-6000]]}];

// A minimal Web Audio stand-in that records what would play.
class Param {constructor(value=0){this.value=value;}setTargetAtTime(value){this.value=value;}cancelScheduledValues(){}}
class Node {constructor(kind){this.kind=kind;}connect(node){return node;}disconnect(){}}
class FakeContext {
  constructor(delay=0){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination=new Node('out');this.started=[];this.delay=delay;}
  createGain(){return Object.assign(new Node('gain'),{gain:new Param(1)});}
  createWaveShaper(){return new Node("shaper");}
  createBiquadFilter(){return Object.assign(new Node('filter'),{frequency:new Param(350),type:'lowpass'});}
  createBufferSource(){
    const source=Object.assign(new Node('source'),{playbackRate:new Param(1)});
    source.start=when=>{source.when=when;this.started.push(source);};source.stop=when=>source.stopAt=when;return source;
  }
  createBuffer(_channels,length,sampleRate){const data=new Float32Array(length);return {length,sampleRate,duration:length/sampleRate,getChannelData:()=>data};}
  // The sprite as a decoder might return it: shifted by `delay`, each sample
  // region filled with its own index so slicing can be checked.
  decodeAudioData(){
    const rate=this.sampleRate,end=Math.max(...Object.values(SAMPLES).map(([s,d])=>s+d))+1;
    const buffer=this.createBuffer(1,Math.round(end*rate),rate),data=buffer.getChannelData(0),shift=Math.round(this.delay*rate);
    for(let i=0;i<rate*.01;i++)data[Math.round(MARKER*rate)+shift+i]=.9*Math.sin(2*Math.PI*1000*i/rate);
    Object.values(SAMPLES).forEach(([start,duration],index)=>data.fill((index+1)/100,Math.round(start*rate)+shift,Math.round((start+duration)*rate)+shift));
    return Promise.resolve(buffer);
  }
  resume(){this.state='running';return Promise.resolve();}
  suspend(){this.state='suspended';return Promise.resolve();}
}
// Records what GameAudio asks of the music.
class FakeMusic {
  constructor(ctx,output){this.ctx=ctx;this.output=output;this.playing=false;this.calls=[];}
  start(){this.playing=true;this.calls.push('start');}
  stop(){this.playing=false;this.calls.push('stop');}
  update(){}
  setPaused(paused){this.calls.push(paused?'muffle':'clear');}
  duck(seconds,delay){this.calls.push(`duck ${seconds} ${delay}`);}
}
async function ready(options={}) {
  const ctx=new FakeContext(options.delay),audio=new GameAudio({createContext:()=>ctx,...options});
  audio.load(new ArrayBuffer(8));audio.unlock();
  for(let i=0;i<5&&!audio.samples;i++)await new Promise(resolve=>setImmediate(resolve));
  return {ctx,audio};
}
const sampleOf=source=>{const data=source.buffer.getChannelData(0);return Object.keys(SAMPLES)[Math.round(data[data.length>>1]*100)-1];};
async function trace(frames,world=FLAT,position=[0,0,0]) {
  const core=await loadCore(bytes);core.loadWorld(world);let s=core.reset(position,0);const ticks=[];
  for(const [x,y,buttons] of frames){const previous=s;s=core.tick({x,y,buttons,yaw:0});ticks.push({previous,s,name:names[s.action],sounds:core.sounds()});}
  return ticks;
}
const cues=ticks=>ticks.flatMap(t=>t.sounds.map(soundCue).map(c=>c?.cue??c?.bed).filter(Boolean));

test('the core\'s own sound requests become footsteps, jumps, flips and landings',async()=>{
  const run=await trace(Array.from({length:60},()=>[0,80,0]));
  const steps=run.filter(t=>cues([t]).includes('step'));
  assert.ok(steps.length>=10,'running steps twice per stride');
  assert.ok(steps.every(t=>t.name==='ACT_WALKING'));
  const hops=[...Array(20).fill([0,80,0])];
  for(let k=0;k<3;k++)hops.push(...Array(6).fill([0,80,1]),...Array(k<2?18:40).fill([0,80,0]));
  const jumps=cues(await trace(hops));
  for(const cue of ['push','hup','land','hoohoo','yahoo','spin'])assert.ok(jumps.includes(cue),`${cue} in a triple jump`);
  assert.equal(jumps.filter(c=>c==='spin').length,3,'three spin whooshes in the triple jump flip');
  const pound=cues(await trace([...Array(8).fill([0,0,1]),...Array(3).fill([0,0,4]),...Array(40).fill([0,0,0])]));
  for(const cue of ['throw','spin','drop','pound'])assert.ok(pound.includes(cue),`${cue} in a ground pound`);
  const skid=cues(await trace([...Array(30).fill([0,80,0]),...Array(12).fill([0,-80,0])]));
  assert.ok(skid.includes('slide'),'a turnaround scrapes');
  const lava=await trace(Array(20).fill([0,0,0]),FLAT.map(t=>({...t,type:1})));
  assert.deepEqual(cues(lava.slice(0,1)),['scorch','burn']);assert.ok(lava.every(t=>cues([t]).includes('burn')));
});

test('sound IDs decode by bank, with terrain offsets, and unknown IDs stay silent',()=>{
  const id=(bank,sound,flags=0x04)=>(bank<<28|flags<<24|sound<<16|0x8081)>>>0;
  assert.deepEqual(soundCue(id(0,0x13,6)),{cue:'step',terrain:3});
  assert.deepEqual(soundCue(id(0,0x21,6)),{cue:'tiptoe',terrain:1});
  assert.deepEqual(soundCue(id(0,0x60)),{cue:'pound',terrain:0});
  assert.deepEqual(soundCue(id(1,0x01)),{bed:'slide',terrain:1});
  assert.deepEqual(soundCue(id(1,0x10)),{bed:'burn'});
  assert.deepEqual(soundCue(id(2,0x2B)),{cue:'yahoo'});
  for(const bits of [id(2,0x0E),id(3,0x00),id(5,0x10),id(0,0x46)])assert.equal(soundCue(bits),null);
  assert.deepEqual(transitionCues('ACT_JUMP','ACT_AIR_HIT_WALL'),['touch']);
  assert.deepEqual(transitionCues('ACT_AIR_HIT_WALL','ACT_WALL_KICK_AIR'),['kick']);
  assert.deepEqual(transitionCues('ACT_FREEFALL','ACT_LEDGE_GRAB'),['grab']);
  assert.deepEqual(transitionCues('ACT_LEDGE_GRAB','ACT_LEDGE_GRAB'),[]);
});

test('the sprite is sliced at the sync marker, even when a decoder adds delay',async()=>{
  for(const delay of [0,.026]) {
    const {audio}=await ready({delay});
    Object.keys(SAMPLES).forEach((name,index)=>{
      // Within a couple of samples (tens of microseconds) of each boundary.
      const data=audio.samples[name].buffer.getChannelData(0);
      assert.equal(Math.round(data[2]*100),index+1,`${name} starts on its own sample (delay ${delay})`);
      assert.equal(Math.round(data[data.length-3]*100),index+1,`${name} ends on its own sample (delay ${delay})`);
    });
  }
});

test('ticks play layered cues; beds last exactly as long as the core requests them',async()=>{
  const {ctx,audio}=await ready({random:()=>.5});
  const [jump]=await trace([[0,0,1]]);
  audio.tick(jump.sounds,jump.previous,jump.s,'ACT_IDLE',jump.name);
  assert.deepEqual(ctx.started.map(sampleOf).sort(),['bwip','push2']);
  assert.ok(ctx.started.every(s=>s.when===0&&s.playbackRate.value>1),'the push-off and "hup" play at once, pitched up');
  const slide=0x14000001,state={...jump.s,speed:30};
  audio.tick([slide],state,state,'ACT_BRAKING','ACT_BRAKING');audio.tick([slide],state,state,'ACT_BRAKING','ACT_BRAKING');
  const bed=audio.beds.slide;assert.ok(bed&&bed.source.loop&&bed.source.stopAt===undefined,'one looping bed while requested');
  assert.ok(bed.amp.gain.value>0);
  audio.tick([],state,state,'ACT_BRAKING','ACT_IDLE');
  assert.equal(audio.beds.slide,undefined);assert.ok(bed.source.stopAt>0,'released on the first tick without a request');
  audio.tick([slide],state,state,'ACT_BRAKING','ACT_BRAKING');audio.hush();assert.deepEqual(audio.beds,{},'pauses hush beds');
});

test('footsteps vary without repeats; volume, muting and locked audio are respected',async()=>{
  const {ctx,audio}=await ready();
  const step=0x06108081,s={velocity:[0,0,0],speed:32};
  for(let i=0;i<40;i++)audio.tick([step],s,s,'ACT_WALKING','ACT_WALKING');
  const played=ctx.started.map(sampleOf);
  assert.ok(new Set(played).size>=4,'several footstep variations');
  assert.ok(played.every((name,i)=>i===0||name!==played[i-1]),'never the same step twice in a row');
  audio.setVolume(.5);assert.equal(audio.bus.gain.value,.25);
  const before=ctx.started.length;audio.setVolume(0);audio.tick([step],s,s,'ACT_WALKING','ACT_WALKING');audio.cue('coin');
  assert.equal(ctx.started.length,before,'muted');
  const locked=new GameAudio({createContext:()=>new FakeContext()});locked.load(new ArrayBuffer(8));
  locked.tick([step],s,s,'ACT_WALKING','ACT_WALKING');assert.equal(locked.ctx,null,'nothing starts before a user gesture');
  const unsupported=new GameAudio({createContext:()=>null});unsupported.unlock();unsupported.cue('coin');assert.equal(unsupported.ctx,null);
});

test('every cue names real samples, and pickups have distinct voices',async()=>{
  const {ctx,audio}=await ready();
  for(const cue of ['coin','shard','star','reveal','checkpoint','beacon','lose','hurt','falling','scorch','click','grab','kick','touch','whoa','oof']) {
    const before=ctx.started.length;audio.cue(cue);assert.ok(ctx.started.length>before,`${cue} plays`);
  }
  const first=cue=>{const before=ctx.started.length;audio.cue(cue);return sampleOf(ctx.started[before]);};
  assert.equal(new Set(['coin','shard','star','reveal','lose'].map(first)).size,5);
});

test('music starts with play, follows its own volume, muffles, ducks under jingles and sleeps with the tab',async()=>{
  let music=null;
  const {ctx,audio}=await ready({music:.5,createMusic:(context,output)=>music=new FakeMusic(context,output)});
  assert.equal(music,null,'no music on the title screen');
  audio.playMusic();assert.deepEqual(music.calls,['start']);
  assert.equal(music.output,audio.musicBus);assert.ok(Math.abs(audio.musicBus.gain.value/.25-.63)<1e-12,'music volume squares into gain');
  audio.setMusicVolume(0);audio.setMusicVolume(0);audio.setMusicVolume(.6);
  assert.deepEqual(music.calls,['start','stop','start'],'0% stops the music; raising it starts a new track');
  assert.ok(Math.abs(audio.musicBus.gain.value/.36-.63)<1e-12);
  audio.pauseMusic(true);audio.pauseMusic(false);
  audio.cue('star');audio.cue('reveal',{delay:.75});audio.cue('coin');
  assert.deepEqual(music.calls.slice(3),['muffle','clear','duck 1.2 0','duck 1 0.75'],'coins do not duck');
  audio.setHidden(true);assert.equal(ctx.state,'suspended');audio.unlock();assert.equal(ctx.state,'suspended','stays asleep while hidden');
  audio.setHidden(false);assert.equal(ctx.state,'running');
  audio.setMusicVolume(0);clearInterval(audio.timer);
});

test('music waits for a gesture, and a music failure leaves the game and its sounds alone',async()=>{
  let made=0;const early=new GameAudio({createContext:()=>new FakeContext(),createMusic:()=>{made++;return new FakeMusic();}});
  early.playMusic();assert.equal(made,0,'nothing before the first gesture');
  early.unlock();assert.equal(made,1,'the gesture that unlocks audio starts the wanted music');early.setMusicVolume(0);
  const warn=console.warn;const warnings=[];console.warn=(...args)=>warnings.push(args.join(' '));
  try {
    const {ctx,audio}=await ready({createMusic:()=>{throw new Error('no oscillators');}});
    audio.playMusic();audio.playMusic();assert.equal(warnings.length,1);assert.equal(audio.timer,null);
    const before=ctx.started.length;audio.cue('coin');assert.ok(ctx.started.length>before,'effects still play');
    const broken=new FakeMusic();broken.update=()=>{throw new Error('lost');};
    const second=await ready({createMusic:()=>broken});second.audio.playMusic();second.audio.updateMusic();
    assert.equal(warnings.length,2);assert.equal(broken.playing,false);assert.equal(second.audio.timer,null);
  } finally {console.warn=warn;}
});
