import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,BEAT,CROSSFADE,ShuffleBag} from '../web/soundtrack.js';
import {MusicPlayer} from '../web/music.js';
import {DEFAULT_SETTINGS,loadSettings,saveSettings} from '../web/settings.js';

test('four complete original arrangements have spacious, compatible transition sections',()=>{
  assert.equal(new Set(TRACKS.map(t=>t.id)).size,4);
  assert.equal(new Set(TRACKS.map(t=>t.lead)).size,4);
  for(const track of TRACKS) {
    assert.ok(track.duration>=100);assert.ok(track.notes.length>150);
    let previous=-1;
    for(const n of track.notes) {
      assert.ok(n.beat>=previous&&n.beat*BEAT<track.duration);previous=n.beat;
      assert.ok(n.length>0&&n.velocity>0&&n.velocity<1&&Math.abs(n.pan)<=1);
      if(n.beat*BEAT<CROSSFADE||n.beat*BEAT>=track.duration-CROSSFADE)
        assert.ok(['pad','bass'].includes(n.voice),'transition bookends leave space for the other track');
    }
    const lead=track.notes.filter(n=>n.voice===track.lead&&n.velocity>=.5);
    assert.ok(lead.length>=24&&lead.length<50,'melodies include rests instead of an unbroken ostinato');
  }
});

test('shuffle plays every track each round and never repeats across round boundaries',()=>{
  for(const value of [0,.2,.51,.9999]) {
    const bag=new ShuffleBag(TRACKS,()=>value);let last;
    for(let round=0;round<50;round++) {
      const heard=new Set();
      for(let i=0;i<4;i++){const next=bag.next();assert.notEqual(next,last);heard.add(next);last=next;}
      assert.equal(heard.size,4);
    }
  }
});

test('music preferences migrate old saves, retain silence, and reject malformed volume',()=>{
  let value='{"hints":false,"developer":true}';
  const storage={getItem:()=>value,setItem:(_key,next)=>value=next};
  assert.deepEqual(loadSettings(storage),{...DEFAULT_SETTINGS,hints:false,developer:true});
  saveSettings({...DEFAULT_SETTINGS,music:false,musicVolume:0},storage);
  assert.equal(loadSettings(storage).music,false);assert.equal(loadSettings(storage).musicVolume,0);
  for(const invalid of ['0.9',null,true]) {
    value=JSON.stringify({musicVolume:invalid});assert.equal(loadSettings(storage).musicVolume,.3);
  }
  for(const [input,expected] of [[-1,0],[2,1]]){value=JSON.stringify({musicVolume:input});assert.equal(loadSettings(storage).musicVolume,expected);}
  value='{"musicVolume":0.65}';assert.equal(loadSettings(storage).musicVolume,.65);
});

test('no audio resources are created before play, while muted, or while hidden',()=>{
  let creations=0;const createContext=()=>{creations++;throw Error('no audio device');};
  const music=new MusicPlayer({enabled:false,createContext});
  music.configure(false,.3);music.start();music.unlock();assert.equal(creations,0);
  music.configure(true,0);music.unlock();assert.equal(creations,0);
  music.setActive(false);music.configure(true,.3);music.unlock();assert.equal(creations,0);
  music.setActive(true);music.unlock();assert.equal(creations,1);
  assert.doesNotThrow(()=>{music.unlock();music.dispose();});assert.equal(creations,1);
});

test('continuous playback keeps a bounded overlap and skips overdue notes after a long stall',()=>{
  const player=new MusicPlayer({random:()=>.4}),created=[],notes=[];
  let now=0,connected=0;
  player.context={get currentTime(){return now;}};
  player.synth={
    track(score,start){
      connected++;const track={score,start,end:start+score.duration,index:0,bus:{disconnect(){connected--;}}};
      created.push(track);return track;
    },
    note(track,note){const time=track.start+note.beat*BEAT;assert.ok(time>=now&&time<now+.7);notes.push(time);},
  };
  for(now=0;now<650;now+=.2){player.pump();assert.ok(connected<=2);}
  assert.ok(created.length>=6);assert.equal(new Set(created.slice(0,4).map(t=>t.score.id)).size,4);
  for(let i=1;i<created.length;i++)assert.ok(Math.abs(created[i].start-(created[i-1].end-CROSSFADE))<1e-8);
  const count=notes.length;now=5000;player.pump();
  assert.ok(notes.length-count<=5,'a wake-up starts quietly, without replaying hundreds of old notes');
  assert.equal(connected,1);
});
