import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Music,SCORES,VOICES,compilePass,chordClasses,degree,parseChord,parseLine,pitch,voicing} from '../web/music.js';

// A Web Audio stand-in: every node accepts connections, and every parameter
// remembers its automation so that fades can be checked.
class Param {
  constructor(value=0){this.value=value;this.events=[];}
  record(type,value,time,tau){this.events.push({type,value,time,tau});this.value=value;return this;}
  setValueAtTime(value,time){return this.record('set',value,time);}
  linearRampToValueAtTime(value,time){return this.record('ramp',value,time);}
  setTargetAtTime(value,time,tau){return this.record('target',value,time,tau);}
  cancelScheduledValues(time){this.events.push({type:'cancel',time});return this;}
  target(){return this.events.filter(e=>e.type==='target').at(-1);}
}
class Node {
  constructor(ctx,params={}){this.ctx=ctx;this.outputs=[];Object.assign(this,params);}
  connect(node){this.outputs.push(node);return node;}
  disconnect(){this.outputs=[];}
}
class FakeContext {
  constructor(){this.currentTime=0;this.sampleRate=8000;this.destination=new Node(this);this.started=[];}
  createGain(){return new Node(this,{gain:new Param(1)});}
  createBiquadFilter(){return new Node(this,{type:'lowpass',frequency:new Param(350),Q:new Param(1)});}
  createStereoPanner(){return new Node(this,{pan:new Param(0)});}
  createDelay(){return new Node(this,{delayTime:new Param(0)});}
  createChannelMerger(){return new Node(this);}
  createConvolver(){return new Node(this,{buffer:null});}
  createPeriodicWave(real,imag){return {real,imag};}
  createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate,getChannelData:c=>data[c]};}
  source(params){
    const node=new Node(this,params);
    node.start=when=>{node.when=when;this.started.push(node);};node.stop=when=>node.stopAt=when;return node;
  }
  createOscillator(){return this.source({type:'sine',frequency:new Param(440),detune:new Param(0),setPeriodicWave(wave){this.wave=wave;}});}
  createBufferSource(){return this.source({buffer:null});}
}
function seeded(seed) {return ()=>(seed=(seed*16807)%2147483647)/2147483647;}
// Run the scheduler the way the game does, every 0.1 s, recording each note
// with the time it was scheduled at and each track visit.
function perform(seconds,{seed=7,from=0,music}={}) {
  const ctx=music?.ctx??new FakeContext();music??=new Music(ctx,ctx.destination,{random:seeded(seed)});
  const notes=[],visits=[],play=music.play.bind(music),begin=music.begin.bind(music);
  music.play=e=>{notes.push({...e,at:ctx.currentTime});play(e);};
  music.begin=(index,when)=>{begin(index,when);visits.push({id:music.score.id,when,transpose:music.transpose,passes:music.passes.length});};
  if(!music.playing)music.start();
  for(let i=0;i<=seconds*10;i++){ctx.currentTime=from+i/10;music.update();}
  return {ctx,music,notes,visits};
}

test('note names, chords and chord-relative degrees parse',()=>{
  assert.equal(pitch('C4'),60);assert.equal(pitch('A4'),69);assert.equal(pitch('Bb3'),58);assert.equal(pitch('F#5'),78);
  assert.throws(()=>pitch('H2'));assert.throws(()=>parseChord('Cmaj13#11'));
  assert.deepEqual(parseChord('Dm9'),{symbol:'Dm9',root:2,intervals:[0,3,7,10,14]});
  assert.deepEqual([...chordClasses(parseChord('G13'),-7)].sort((a,b)=>a-b),[0,2,4,7,9,10]);
  assert.deepEqual(parseLine('E5:1.5 r:.5 | C5:2'),[{pitch:76,beats:1.5},{pitch:null,beats:.5},{pitch:72,beats:2}]);
  assert.throws(()=>parseLine('C5:0'));
  const sus=parseChord('C9sus4'),six=parseChord('Cm6'),minor=parseChord('Am7');
  assert.equal(degree(sus,'3'),5,'a sus chord\'s third is its fourth');assert.equal(degree(six,'7'),9,'a sixth chord\'s seventh is its sixth');
  assert.equal(degree(minor,"3'"),15);assert.equal(degree(minor,'5,'),-5);assert.equal(degree(minor,'8'),12);
  assert.throws(()=>degree(minor,'4'));
});

test('four original tracks: complete forms, in tune, in range, sparse at both ends',()=>{
  assert.ok(SCORES.length>=4);assert.equal(new Set(SCORES.map(s=>s.id)).size,SCORES.length);
  for(const score of SCORES) {
    assert.ok(score.bpm>=60&&score.bpm<=96,`${score.id} stays unhurried`);
    assert.equal(score.length%score.meter,0,`${score.id} is whole bars`);
    for(const [name,part] of Object.entries(score.parts))for(const [key,line] of Object.entries(part.lines||{}))
      assert.equal(line.reduce((sum,note)=>sum+note.beats,0),score.length,`${score.id} ${name}:${key} fills the chord cycle`);
    for(const edge of [score.passes[0],score.passes.at(-1)])assert.doesNotMatch(edge,/lead/,`${score.id} starts and ends without its melody`);
    // Melody notes on a beat or held a beat never rub a half step above the chord.
    let beat=0;
    for(const note of score.parts.lead.lines.A) {
      const chord=score.chords.find(c=>beat>=c.start&&beat<c.start+c.beats),classes=chordClasses(chord),pc=note.pitch%12;
      if(note.pitch!==null&&(note.beats>=1||beat%1===0)&&!classes.has(pc))
        assert.ok(![...classes].some(c=>(pc-c+12)%12===1),`${score.id}: ${note.pitch} clashes with ${chord.symbol} at beat ${beat}`);
      beat+=note.beats;
    }
    let voices=[];
    for(const spec of score.passes) {
      const pass=compilePass(score,spec,{voices});voices=pass.voices;
      assert.ok(pass.events.every((e,i)=>i===0||e.beat>=pass.events[i-1].beat),'events in order');
      for(const e of pass.events) {
        assert.ok(VOICES[e.instrument],`${e.instrument} is an instrument`);
        assert.ok(e.beat>=0&&e.beat<score.length&&e.hold>0&&e.velocity>0&&e.velocity<=1);
        if(e.midi===undefined)continue;
        const role=Object.entries(score.parts).find(([,part])=>part.instrument===e.instrument)?.[0]??'lead';
        const [low,high]={bass:[28,60],pad:score.parts.pad.range,arp:[40,84],lead:[55,96]}[role];
        assert.ok(e.midi>=low&&e.midi<=high,`${score.id} ${role} note ${e.midi} in range`);
      }
    }
  }
});

test('pad voicings keep colour tones and move smoothly',()=>{
  for(const score of SCORES) {
    let previous=[];
    for(const chord of [...score.chords,...score.chords]) {
      const next=voicing(chord,previous,score.parts.pad.range),classes=chordClasses(chord);
      assert.equal(next.length,4);assert.ok(next.every(n=>classes.has(n%12)));
      assert.ok(next.some(n=>[3,4,5,2].includes((n-chord.root+12)%12)),`${chord.symbol} keeps its third (or sus)`);
      if(previous.length)assert.ok(next.every((n,i)=>Math.abs(n-previous[i])<=5),`${score.id} ${chord.symbol} moves by step`);
      previous=next;
    }
  }
});

test('tracks play from a shuffle bag and ring into one another without silence',()=>{
  const {notes,visits}=perform(1800);
  assert.ok(visits.length>=SCORES.length*1.5,`${visits.length} visits in half an hour`);
  assert.equal(new Set(visits.slice(0,SCORES.length).map(v=>v.id)).size,SCORES.length,'every track before any repeat');
  assert.ok(visits.every((v,i)=>i===0||v.id!==visits[i-1].id),'never the same track twice in a row');
  assert.ok(visits.every(v=>Math.abs(v.transpose)<=3));assert.equal(visits[0].transpose,0,'the first track plays in its own key');
  // Each track starts 1-2.5 s after the last one's final bar, over its ringing chord.
  for(let i=1;i<visits.length;i++) {
    const score=SCORES.find(s=>s.id===visits[i-1].id),end=visits[i-1].when+visits[i-1].passes*score.length*60/score.bpm;
    const gap=visits[i].when-end;assert.ok(gap>=1&&gap<=2.5,`hand-over gap ${gap}`);
    const ringing=chordClasses(score.chords.at(-1),visits[i-1].transpose),next=SCORES.find(s=>s.id===visits[i].id);
    assert.ok([...chordClasses(next.chords[0],visits[i].transpose)].filter(pc=>ringing.has(pc)).length>=3,'the new key shares notes with the ringing chord');
  }
  // Something is always sounding, from the first note on.
  const spans=notes.map(n=>[n.time,n.time+n.hold]).sort((a,b)=>a[0]-b[0]);let reach=spans[0][1],silence=0;
  for(const [start,end] of spans){silence=Math.max(silence,start-reach);reach=Math.max(reach,end);}
  assert.ok(silence<.05,`longest silence ${silence.toFixed(3)} s`);
  // Notes are scheduled just ahead of time, never late or far in advance.
  assert.ok(notes.every(n=>n.time>=n.at-.05&&n.time<=n.at+.4+1e-9));
});

test('a seed replays the same running order; performances vary by seed',()=>{
  const order=seed=>perform(900,{seed}).visits.map(v=>`${v.id}${v.transpose}/${v.passes}`).join(' ');
  assert.equal(order(3),order(3));
  assert.notEqual(new Set([1,2,3,4,5,6].map(order)).size,1);
});

test('a stall skips late notes instead of playing them in a burst',()=>{
  const {music,notes}=perform(20);const count=notes.length;
  perform(10,{music,from:23});
  assert.ok(notes.slice(count).every(n=>n.time>=22.95),'nothing from the missed three seconds');
  assert.ok(notes.length>count,'and the music carries on');
});

test('pauses muffle, jingles duck, and a stop silences ringing notes before a clean restart',()=>{
  const {ctx,music,notes}=perform(30);
  music.setPaused(true);assert.equal(music.tone.frequency.target().value,1300);assert.equal(music.pause.gain.target().value,.5);
  music.setPaused(false);assert.equal(music.tone.frequency.target().value,9000);assert.equal(music.pause.gain.target().value,1);
  music.duck(1.2,.75);
  const duck=music.jingle.gain.events.filter(e=>e.type==='target');
  assert.deepEqual(duck.slice(-2).map(e=>[e.value,+e.time.toFixed(2)]),[[.3,30.75],[1,31.95]]);
  const inputs=Object.values(music.inputs),stopped=music.score.id;assert.ok(inputs.length);
  music.stop();assert.equal(music.playing,false);assert.equal(music.level.gain.target().value,0);
  assert.ok(inputs.every(input=>input.gain.target().value===0),'ringing notes fade too');
  const count=notes.length;ctx.currentTime=31;music.update();assert.equal(notes.length,count,'stopped music schedules nothing');
  const again=perform(10,{music,from:40});assert.ok(again.notes.length>0&&again.visits.length===1);
  assert.notEqual(again.visits[0].id,stopped,'a restart never repeats the track it cut off');
  assert.equal(music.level.gain.target().value,1);assert.ok(Object.values(music.inputs).every(input=>!inputs.includes(input)));
  assert.ok(Object.values(music.inputs).every(input=>input.gain.value===music.score.level),'each track plays at its own level');
});
