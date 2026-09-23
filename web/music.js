import {TRACKS,BEAT,CROSSFADE,ShuffleBag} from './soundtrack.js';
import {MusicSynth} from './music-synth.js';

const LOOKAHEAD=.7;
export class MusicPlayer {
  constructor({enabled=true,volume=.3,createContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),random=Math.random}={}) {
    this.enabled=enabled;this.level=volume;this.createContext=createContext;
    this.playlist=new ShuffleBag(TRACKS,random);this.tracks=[];
    this.started=false;this.active=true;this.ducked=false;this.context=null;
    this.timer=null;this.sleep=null;this.disposed=false;
  }
  get audible(){return this.started&&this.enabled&&this.level>0&&this.active&&!this.disposed;}
  start(){this.started=true;this.unlock();}
  // Called inside real click/key/touch events, including a later gesture if the
  // initial start came from a gamepad and the browser kept audio suspended.
  unlock() {
    if(!this.audible)return;
    if(!this.context) {
      try {
        this.context=this.createContext();this.synth=new MusicSynth(this.context);
        this.context.onstatechange=()=>{
          if(this.context.state==='running'&&this.audible)this.run();else this.stopTimer();
        };
      } catch(error) {
        this.error=error;this.disposed=true;this.context?.close().catch(()=>{});return;
      } // Audio support is optional; play still works.
    }
    this.sync();
  }
  configure(enabled,volume) {
    this.enabled=!!enabled;this.level=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):.3;this.sync();
  }
  setDucked(value){if(this.ducked!==value){this.ducked=value;this.sync();}}
  setActive(value){if(this.active!==value){this.active=value;this.sync();}}
  sync() {
    if(!this.context||this.disposed)return;
    clearTimeout(this.sleep);this.sleep=null;
    if(this.audible) {
      this.synth.volume(this.level*(this.ducked?.6:1));
      if(this.context.state==='running')this.run();
      else this.context.resume().then(()=>{if(this.audible)this.run();}).catch(()=>{});
    } else {
      this.synth.volume(0,.24);this.stopTimer();
      this.sleep=setTimeout(()=>{if(!this.audible)this.context.suspend().catch(()=>{});},280);
    }
  }
  run() {
    if(this.timer!==null||!this.audible||this.context.state!=='running')return;
    this.pump();this.timer=setInterval(()=>this.pump(),100);
  }
  pump() {
    const now=this.context.currentTime,horizon=now+LOOKAHEAD;
    if(!this.tracks.length)this.tracks.push(this.synth.track(this.playlist.next(),now+.08,true));
    let last=this.tracks.at(-1);
    // Advance the musical clock, never dump overdue notes after a stalled frame.
    // A long OS interruption restarts gently instead of building missed tracks.
    if(now>last.end+2) {
      for(const track of this.tracks)track.bus.disconnect();
      this.tracks=[this.synth.track(this.playlist.next(),now+.08,true)];last=this.tracks[0];
    }
    if(last.end-CROSSFADE<horizon)this.tracks.push(this.synth.track(this.playlist.next(),last.end-CROSSFADE));
    for(const track of this.tracks) {
      const notes=track.score.notes;
      while(track.index<notes.length&&track.start+notes[track.index].beat*BEAT<horizon) {
        const note=notes[track.index++];
        if(track.start+note.beat*BEAT>=now)this.synth.note(track,note);
      }
    }
    this.tracks=this.tracks.filter(track=>{if(track.end+2>now)return true;track.bus.disconnect();return false;});
  }
  stopTimer(){clearInterval(this.timer);this.timer=null;}
  dispose() {
    this.disposed=true;this.stopTimer();clearTimeout(this.sleep);
    if(this.context){this.context.onstatechange=null;this.synth?.dispose();this.context.close().catch(()=>{});}
  }
}
