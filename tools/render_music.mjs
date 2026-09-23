// Render the background music to WAV for listening and level checks, using the
// game's own music engine in headless Chromium (OfflineAudioContext).
// Optional, like tools/test_browser.mjs: install Playwright separately.
// Usage: node tools/render_music.mjs [track-id ...] [--transition]
// Writes build/music/<track-id>.wav (one full visit, from its first note to the
// end of its ring-out) and, with --transition, build/music/transition.wav.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {SCORES} from '../web/music.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),web=path.join(root,'web'),out=path.join(root,'build/music');
const args=process.argv.slice(2),ids=args.filter(a=>!a.startsWith('--')),transition=args.includes('--transition');
mkdirSync(out,{recursive:true});

// In the page: render one visit of `ids` (in order) at 44.1 kHz stereo; return 16-bit PCM.
const render=async({ids,rate})=>{
  const {Music,SCORES}=await import('./music.js');
  const scores=ids.map(id=>SCORES.find(s=>s.id===id));
  // Plan the visits first with a throwaway context, so the offline one has the right length.
  let seed=1;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const plan=new Music(new OfflineAudioContext(2,rate,rate),null,{scores,random});
  plan.build=()=>{};plan.playing=true;plan.bag=[...scores.keys()].reverse();plan.begin(plan.pick(),.2);
  const visits=[];let end=.2;
  for(let guard=0;guard<50&&visits.length<scores.length;guard++){
    const index=plan.track,start=plan.passEnd;
    while(plan.track===index&&plan.pass<plan.passes.length-1)plan.next();
    end=plan.passEnd;visits.push({id:plan.score.id,passes:plan.passes.length});
    if(visits.length<scores.length)plan.next();
  }
  const seconds=end+6,ctx=new OfflineAudioContext(2,Math.ceil(seconds*rate),rate);
  seed=1;const music=new Music(ctx,ctx.destination,{scores,random});
  // Schedule as the game does, a little ahead at a time (all at once would
  // build one enormous graph), but stop after the last planned visit.
  const step=1,ahead=t=>Math.min(step+.4,end-.1-t);
  for(let t=step;t<end;t+=step)ctx.suspend(t).then(()=>{if(ahead(t)>0)music.update(ahead(t));ctx.resume();});
  music.bag=[...scores.keys()].reverse();music.start(.2);music.update(ahead(0));
  const buffer=await ctx.startRendering(),frames=buffer.length,pcm=new Int16Array(frames*2);
  const [l,r]=[buffer.getChannelData(0),buffer.getChannelData(1)];
  for(let i=0;i<frames;i++){pcm[2*i]=Math.max(-1,Math.min(1,l[i]))*32767;pcm[2*i+1]=Math.max(-1,Math.min(1,r[i]))*32767;}
  await fetch('/__wav',{method:'POST',body:pcm.buffer,headers:{'x-rate':String(rate)}});
  return {seconds,visits};
};

let pending=null;
const server=createServer((req,res)=>{
  if(req.method==='POST'&&req.url==='/__wav') {
    const chunks=[];req.on('data',c=>chunks.push(c));
    req.on('end',()=>{pending?.(Buffer.concat(chunks),Number(req.headers['x-rate']));res.end('ok');});return;
  }
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.join(web,name==='/'?'/music-harness':name);
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>music</title>');return;}
  try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
function wav(pcm,rate) {
  const header=Buffer.alloc(44);
  header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);
  header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
  ...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
try {
  const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const jobs=(ids.length?ids:SCORES.map(s=>s.id)).map(id=>({name:id,ids:[id]}));
  if(transition) {
    // Two different tracks back to back, to hear the hand-over.
    const [a,b]=ids.length>=2?ids:[SCORES[0].id,SCORES[1].id];jobs.push({name:'transition',ids:[a,b]});
  }
  for(const job of jobs) {
    const saved=new Promise(resolve=>pending=(pcm,rate)=>{writeFileSync(path.join(out,`${job.name}.wav`),wav(pcm,rate));resolve();});
    const info=await page.evaluate(render,{ids:job.ids,rate:44100});await saved;
    console.log(`Rendered build/music/${job.name}.wav (${info.seconds.toFixed(1)} s: ${info.visits.map(v=>`${v.id} × ${v.passes} passes`).join(', ')})`);
  }
} finally {await browser.close();server.close();}
