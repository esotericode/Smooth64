// Real Web Audio checks and an optional WAV export of the exact game scores.
// Requires the same optional Playwright installation as test_browser.mjs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),web=path.join(root,'web'),out=path.join(root,'build/music-checks');
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<button id="play">Play</button>');return;}
  const file=path.resolve(web,`.${name}`);
  if(!file.startsWith(web+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--no-zygote','--single-process','--autoplay-policy=user-gesture-required'],
    ...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Render complete pieces through the real filters, reverb and transition buses.
  const render=process.argv.includes('--render'),measurements=[];
  for(let index=0;index<4;index++) {
    const result=await page.evaluate(async({index,render})=>{
      const {TRACKS}=await import('/soundtrack.js'),{MusicSynth}=await import('/music-synth.js');
      const score=TRACKS[index],rate=22050,ctx=new OfflineAudioContext(2,Math.ceil((score.duration+3)*rate),rate);
      const synth=new MusicSynth(ctx),track=synth.track(score,0,true);synth.master.gain.value=1;
      for(const note of score.notes)synth.note(track,note);
      const audio=await ctx.startRendering(),channels=[audio.getChannelData(0),audio.getChannelData(1)];
      let peak=0,sum=0;
      for(const data of channels)for(const n of data){peak=Math.max(peak,Math.abs(n));sum+=n*n;}
      let wav;
      if(render) {
        const bytes=new Uint8Array(44+audio.length*4),view=new DataView(bytes.buffer);
        const text=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i);};
        text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
        view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,rate,true);
        view.setUint32(28,rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.length-44,true);
        for(let i=0;i<audio.length;i++)for(let c=0;c<2;c++)view.setInt16(44+(i*2+c)*2,Math.round(Math.max(-1,Math.min(1,channels[c][i]))*32767),true);
        let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));wav=btoa(binary);
      }
      return {id:score.id,title:score.title,seconds:score.duration,peak,rms:Math.sqrt(sum/(audio.length*2)),wav};
    },{index,render});
    if(render)writeFileSync(path.join(out,`${result.id}.wav`),Buffer.from(result.wav,'base64'));
    delete result.wav;assert.ok(result.peak<.7&&result.peak>.025,`${result.title}: safe, audible mix`);
    assert.ok(result.rms>.008&&result.rms<.15,`${result.title}: restrained dynamics`);
    measurements.push(result);console.log('PASS full-track render',JSON.stringify(result));
  }
  const transitions=await page.evaluate(async()=>{
    const {TRACKS,CROSSFADE,BEAT}=await import('/soundtrack.js'),{MusicSynth}=await import('/music-synth.js'),results=[];
    for(const from of TRACKS)for(const to of TRACKS)if(from!==to) {
      const ctx=new OfflineAudioContext(2,22050*32,22050),synth=new MusicSynth(ctx);synth.master.gain.value=1;
      // The last 20 seconds of the outgoing track, then the first 24 of the next.
      const tail={...from,duration:20},a=synth.track(tail,0,true),b=synth.track(to,20-CROSSFADE);
      for(const n of from.notes)if(n.beat*BEAT>=100)synth.note(a,{...n,beat:n.beat-100/BEAT});
      for(const n of to.notes)if(n.beat*BEAT<24)synth.note(b,n);
      const audio=await ctx.startRendering(),data=audio.getChannelData(0);let peak=0,minWindowRms=1;
      for(let i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));
      for(let s=8;s<23;s++) {
        let energy=0;for(let i=s*22050;i<(s+1)*22050;i++)energy+=data[i]*data[i];
        minWindowRms=Math.min(minWindowRms,Math.sqrt(energy/22050));
      }
      results.push({from:from.id,to:to.id,peak,minWindowRms});
    }
    return results;
  });
  for(const t of transitions){assert.ok(t.peak<.7,`no clipping ${t.from} -> ${t.to}`);assert.ok(t.minWindowRms>.003,`no hole ${t.from} -> ${t.to}`);}
  console.log('PASS all 12 ordered crossfades: no clipping or silent gaps');
  await page.evaluate(async()=>{
    const {MusicPlayer}=await import('/music.js');window.music=new MusicPlayer();
    document.getElementById('play').onclick=()=>window.music.start();
  });
  assert.equal(await page.evaluate(()=>window.music.context),null);
  await page.click('#play');
  assert.equal(await page.evaluate(()=>window.music.error?.message),undefined,'real-device sample rate supports the instrument bank and reverb');
  await page.waitForFunction(()=>window.music.context?.state==='running');
  await page.waitForTimeout(450);
  assert.ok(await page.evaluate(()=>window.music.synth.master.gain.value>.29));
  const initial=await page.evaluate(()=>window.music.tracks[0].score.id);
  await page.evaluate(()=>window.music.setDucked(true));await page.waitForTimeout(450);
  assert.ok(await page.evaluate(()=>Math.abs(window.music.synth.master.gain.value-.18)<.005));
  await page.evaluate(()=>window.music.configure(false,.3));await page.waitForFunction(()=>window.music.context.state==='suspended');
  assert.equal(await page.evaluate(()=>window.music.timer),null);
  const stopped=await page.evaluate(()=>window.music.context.currentTime);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.music.context.currentTime),stopped);
  await page.evaluate(()=>window.music.configure(true,.3));await page.waitForFunction(()=>window.music.context.state==='running');
  assert.equal(await page.evaluate(()=>window.music.tracks[0].score.id),initial,'unmute keeps the current track');
  await page.evaluate(()=>window.music.setActive(false));await page.waitForFunction(()=>window.music.context.state==='suspended');
  await page.evaluate(()=>window.music.setActive(true));await page.waitForFunction(()=>window.music.context.state==='running');
  await page.evaluate(()=>{for(let i=0;i<10;i++){window.music.configure(false,.3);window.music.configure(true,.3);}});
  await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>window.music.context.state),'running');
  assert.ok(await page.evaluate(()=>window.music.tracks.length===1&&window.music.synth.voices.size<20),'rapid toggles do not duplicate streams or voices');
  await page.evaluate(()=>window.music.dispose());assert.deepEqual(errors,[]);
  writeFileSync(path.join(out,'measurements.json'),JSON.stringify({tracks:measurements,transitions},null,2));
  console.log('PASS gesture start, quiet default, menu ducking, mute, focus suspension, resume and rapid toggles');
} finally {await browser?.close();server.close();}
