// A tiny original sample bank: rounded, bandwidth-limited instruments reminiscent
// of a late-90s console. Generate once, then transpose short samples, not oscillators
// on the render thread. Short samples keep the soundtrack small and self-contained.
import {BEAT,CROSSFADE} from './soundtrack.js';
const RATE=22050,ROOT=220,TAU=Math.PI*2;
const patches={
  pad:{seconds:1,loop:true,attack:.85,release:1.4,level:.075},
  flute:{seconds:1,loop:true,attack:.12,release:.3,level:.14},
  keys:{seconds:5,attack:.012,release:.65,level:.2},
  marimba:{seconds:4,attack:.009,release:.3,level:.2},
  bell:{seconds:5,attack:.018,release:.8,level:.14},
  bass:{seconds:4,attack:.02,release:.3,level:.23},
  brush:{seconds:.22,attack:.015,release:.1,level:.11},
  wood:{seconds:.18,attack:.006,release:.07,level:.12},
};
function noise(seed=731) {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
}
function sample(context,name,patch) {
  const buffer=context.createBuffer(1,Math.ceil(RATE*patch.seconds),RATE),data=buffer.getChannelData(0),random=noise();
  let air=0;
  for(let i=0;i<data.length;i++) {
    const t=i/RATE,p=TAU*ROOT*t,s=Math.sin(p);air=air*.78+random()*.22;
    if(name==='pad')data[i]=(.64*s+.12*Math.sin(2*p)+.045*Math.sin(3*p)+.08*Math.sin(TAU*219*t)+.08*Math.sin(TAU*221*t))*.85;
    if(name==='flute')data[i]=.8*Math.sin(p+.035*Math.sin(TAU*4*t))+.12*Math.sin(2*p)+.035*Math.sin(3*p)+air*.025*Math.sin(Math.PI*t)**2;
    if(name==='keys')data[i]=(.72*s*Math.exp(-t*1.3)+.23*Math.sin(2*p+.65*Math.exp(-t*5)*Math.sin(p))*Math.exp(-t*2.5)+.06*Math.sin(3*p)*Math.exp(-t*4));
    if(name==='marimba')data[i]=.85*s*Math.exp(-t*3.2)+.14*Math.sin(4*p)*Math.exp(-t*11)+.035*Math.sin(9*p)*Math.exp(-t*22);
    if(name==='bell')data[i]=.7*s*Math.exp(-t*1.7)+.18*Math.sin(2*p)*Math.exp(-t*2.5)+.06*Math.sin(3*p)*Math.exp(-t*4.5);
    if(name==='bass')data[i]=(.85*s+.12*Math.sin(2*p))*Math.exp(-t*2.4);
    if(name==='brush')data[i]=air*.75*Math.exp(-t*23)*Math.sin(Math.PI*Math.min(1,t/.22));
    if(name==='wood')data[i]=(.6*Math.sin(TAU*310*t)+.25*Math.sin(TAU*470*t))*Math.exp(-t*48);
    if(!patch.loop)data[i]*=Math.min(1,(data.length-1-i)/128);
  }
  return buffer;
}
function impulse(context) {
  // Unlike ordinary samples, convolution impulses must match the device rate.
  const rate=context.sampleRate,buffer=context.createBuffer(2,rate*2,rate),random=noise(164);
  for(let channel=0;channel<2;channel++) {
    const data=buffer.getChannelData(channel);let smooth=0;
    for(let i=0;i<data.length;i++) {
      smooth=smooth*.65+random()*.35;
      data[i]=smooth*Math.exp(-i/rate*3.6)*Math.min(1,i/(rate*.01));
    }
  }
  return buffer;
}
export function fadeCurve(incoming) {
  return Float32Array.from({length:65},(_,i)=>incoming?Math.sin(i/64*Math.PI/2):Math.cos(i/64*Math.PI/2));
}
export class MusicSynth {
  constructor(context) {
    this.context=context;this.voices=new Set();
    this.samples=Object.fromEntries(Object.entries(patches).map(([name,patch])=>[name,sample(context,name,patch)]));
    this.input=context.createGain();this.master=context.createGain();this.master.gain.value=0;
    const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=3400;low.Q.value=.55;
    const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=35;high.Q.value=.5;
    const reverb=context.createConvolver();reverb.buffer=impulse(context);
    const wet=context.createGain();wet.gain.value=.17;
    this.input.connect(low);this.input.connect(reverb);reverb.connect(wet);wet.connect(low);
    low.connect(high);high.connect(this.master);this.master.connect(context.destination);
  }
  track(score,start,first=false) {
    const bus=this.context.createGain(),end=start+score.duration;
    bus.connect(this.input);bus.gain.setValueAtTime(0,start);
    bus.gain.setValueCurveAtTime(fadeCurve(true),start,first?3:CROSSFADE);
    bus.gain.setValueAtTime(1,end-CROSSFADE);
    bus.gain.setValueCurveAtTime(fadeCurve(false),end-CROSSFADE,CROSSFADE);
    return {score,start,end,bus,index:0};
  }
  note(track,note) {
    const {context}=this,patch=patches[note.voice],start=track.start+note.beat*BEAT;
    const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
    source.buffer=this.samples[note.voice];source.loop=!!patch.loop;
    const percussion=note.voice==='wood'||note.voice==='brush';
    source.playbackRate.value=percussion?1:440*Math.pow(2,(note.pitch-69)/12)/ROOT;
    const duration=Math.max(patch.attack+.02,note.length*BEAT),level=patch.level*note.velocity;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+patch.attack);
    gain.gain.setValueAtTime(level,start+duration);
    gain.gain.linearRampToValueAtTime(0,start+duration+patch.release);
    pan.pan.value=note.pan;source.connect(gain);gain.connect(pan);pan.connect(track.bus);
    this.voices.add(source);
    source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();this.voices.delete(source);};
    source.start(start);source.stop(start+duration+patch.release+.01);
  }
  volume(value,seconds=.3) {
    const param=this.master.gain,now=this.context.currentTime;
    if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
    else {const current=param.value;param.cancelScheduledValues(now);param.setValueAtTime(current,now);}
    param.linearRampToValueAtTime(value,now+seconds);
  }
  dispose() {
    for(const source of this.voices){source.onended=null;source.stop();source.disconnect();}
    this.voices.clear();this.input.disconnect();this.master.disconnect();
  }
}
