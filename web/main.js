import {createWorld,zones as playgroundZones} from './world.js';
import {createCaldera} from './caldera.js';
import {animationName} from './animations.js';
import {loadCore,FixedClock} from './engine.js';
import {Input} from './input.js';
import {PlaygroundRenderer} from './renderer.js';
import {CourseProgress} from './progress.js';
import {LevelSession,formatTime} from './level.js';
import {actionCue} from './pose.js';

const $=id=>document.getElementById(id);
const canvas=$('game'),help=$('help'),victory=$('victory');
let core,renderer,input,previous,current,actions,progress,session,worlds;
let mode='playground',world,zones=playgroundZones;
let started=false,paused=false,slow=false,zoneIndex=0,last=0,frames=0,frameTime=0;
let lastInput={x:0,y:0,buttons:0,yaw:0},helpWasPaused=false,toastTimer,respawning=0;
const clock=new FixedClock();
function toast(message,duration=2600) {
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,duration);
}
function bump(id) {const el=$(id);el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
// Put the explorer at a destination (playground) or checkpoint (level).
function place(zone) {
  current=core.reset(zone.position,zone.yaw);previous=current;
  clock.reset();input.clear();lastInput={x:0,y:0,buttons:0,yaw:0};
  renderer.reset(zone.position,zone.camera,zone.pitch);
  $('tip-text').textContent=zone.note;
  canvas.focus();renderHud();
}
function reset(index=zoneIndex) {
  if(mode==='caldera') {
    // Only lit checkpoints can be chosen; R returns to the current one.
    const zone=zones[index];
    if(!session.lit.has(`checkpoint-${zone.id}`))return;
    session.checkpoint=index;
  }
  zoneIndex=index;place(zones[index]);
  document.querySelectorAll('[data-zone]').forEach((button,i)=>button.classList.toggle('active',i===index));
}
function buildZoneList() {
  $('zone-list').replaceChildren();
  $('zones-title').textContent=mode==='caldera'?'CHECKPOINTS':'EXPLORE THE PLAYGROUND';
  zones.forEach((zone,index)=>{
    if(zone.section) {
      const label=document.createElement('span');
      label.className='zone-section';label.textContent=zone.section;$('zone-list').append(label);
    }
    const button=document.createElement('button');button.dataset.zone=index;
    button.innerHTML=`<b>${String(index+1).padStart(2,'0')}</b><span>${zone.name}</span><small></small>`;
    button.addEventListener('click',()=>reset(index));$('zone-list').append(button);
  });
}
function setMode(next) {
  mode=next;world=worlds[next];zones=world.zones;
  core.loadWorld(world.triangles);renderer.load(world);renderer.pitch=.43;
  document.body.classList.toggle('caldera',mode==='caldera');
  for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-selected',tab.dataset.mode===mode);
  $('edition').innerHTML=mode==='caldera'?'CINDER CALDERA <i> / </i> LEVEL 01':'MOVEMENT PLAYGROUND <i> / </i> 003';
  if(mode==='caldera')session=new LevelSession(world);
  $('status').innerHTML=`<i></i>${mode==='caldera'?'Level in progress':'Playground ready'}`;
  buildZoneList();
  if(started)showPanels();
  reset(0);
}
function showPanels() {
  const level=mode==='caldera';
  for(const id of ['zones','tip','telemetry','toolbar'])$(id).hidden=false;
  $('challenge').hidden=level;$('objectives').hidden=!level;$('level-hud').hidden=!level;
}
function start(next='playground') {
  if(!core||started)return;
  started=true;document.body.classList.add('playing');
  $('welcome').hidden=true;renderer.intro=false;
  if(next!==mode)setMode(next);else reset(0);
  showPanels();
  if(mode==='caldera')renderer.flyover(world.intro.from,world.intro.look);
  $('footer-left').textContent='DRAG TO ORBIT · SCROLL TO ZOOM';
}
function setPaused(value) {
  paused=value;clock.reset();$('paused').hidden=!paused;
  $('pause-button').querySelector('span').textContent=paused?'Resume':'Pause';
  $('status').innerHTML=`<i></i>${paused?'Paused':mode==='caldera'?'Level in progress':'Playground ready'}`;
}
function toggleSlow() {
  slow=!slow;$('slow-button').setAttribute('aria-pressed',slow);
  $('time-scale').textContent=slow?'¼× speed':'1× speed';
}
function toggleMesh() { renderer.wire.visible=!renderer.wire.visible;$('wire-button').setAttribute('aria-pressed',renderer.wire.visible); }
// A level fall or knockout: a short fade, then the current checkpoint.
function respawn(message) {
  if(respawning)return;
  respawning=18;$('fade-text').textContent=message;$('fade').hidden=false;
  const el=$('fade');el.style.animation='none';void el.offsetWidth;el.style.animation='';
}
function levelEvents(events) {
  for(const event of events) {
    const p=event.pickup?.position;
    if(event.type==='coin') {
      current=core.heal(4);renderer.effects.burst(p,{count:10,speed:200,size:22,color:'#fff4b8',end:'#ffb020',life:.4});bump('coin-count');
    } else if(event.type==='shard') {
      renderer.effects.burst(p,{count:22,speed:280,size:30,color:'#ffd0c8',end:'#ff2b1f',life:.6});bump('shard-count');
      const shards=session.count('shard');toast(`Ember Shard ${shards.found} / ${shards.total}${event.pickup.hint?` · ${event.pickup.hint.split(':')[0]}`:''}`);
    } else if(event.type==='reveal') {
      toast('All eight shards! The Crimson Star burns on the lava altar below the landing.',5000);
    } else if(event.type==='checkpoint') {
      renderer.effects.ring([p[0],p[1],p[2]],{count:16,speed:260,rise:160,size:40,grow:60,color:'#ffe1a0',end:'#ff6a1f',glow:true,life:.7});
      toast(`${event.first?'Beacon lit':'Checkpoint'} · ${event.checkpoint.name}`);$('tip-text').textContent=event.checkpoint.note;
      zoneIndex=session.checkpoint;
      document.querySelectorAll('[data-zone]').forEach((button,i)=>button.classList.toggle('active',i===zoneIndex));
    } else if(event.type==='star'||event.type==='bonus') {
      renderer.effects.burst(p,{count:48,speed:420,size:40,color:'#fff6d0',end:event.type==='star'?'#ffb000':'#ff2b3a',life:1,up:200});
      showVictory(event.type);
    }
  }
}
function showVictory(kind) {
  const coins=session.count('coin'),shards=session.count('shard'),best=bestTime(kind==='star'?session.time:null);
  $('victory-eyebrow').textContent=kind==='star'?'STAR GET · 1 OF 2':'STAR GET · CRIMSON';
  $('victory-title').textContent=kind==='star'?'Ember Star claimed.':'Crimson Star claimed.';
  $('victory-copy').textContent=kind==='star'
    ?(shards.found===shards.total?'The summit is yours, and every shard with it. The Crimson Star waits on the altar.'
      :`The summit is yours${best?` · best ${formatTime(best)}`:''}. ${shards.total-shards.found} Ember Shards still hide in the caldera.`)
    :'Every challenge in the caldera, conquered.';
  $('victory-time').textContent=formatTime(session.time);$('victory-coins').textContent=`${coins.found} / ${coins.total}`;
  $('victory-shards').textContent=`${shards.found} / ${shards.total}`;$('victory-deaths').textContent=session.deaths;
  input.clear();setPaused(true);$('paused').hidden=true;victory.showModal();
}
function bestTime(time) {
  try {
    const previous=Number(localStorage.getItem('smooth64-caldera-best'))||null;
    if(time&&(!previous||time<previous))localStorage.setItem('smooth64-caldera-best',time);
    return previous&&time?Math.min(previous,time):previous||time;
  } catch {return time;}
}
function tick() {
  lastInput=input.sample(renderer.yaw);previous=current;
  if(renderer.shot&&(lastInput.buttons||Math.hypot(lastInput.x,lastInput.y)>7))renderer.shot=null;
  current=core.tick(lastInput);renderer.record(current);renderer.tick(previous,current,actions[previous.action],actionName());
  if(mode==='caldera') {
    session.tick(lastInput);
    if(respawning) {
      // Teleport while the fade is opaque; let it finish fading out on its own.
      if(--respawning===0){place(session.respawn());$('fade').addEventListener('animationend',()=>$('fade').hidden=true,{once:true});}
      return;
    }
    levelEvents(session.collect(current,actionName()));
    if(current.health<256)respawn('Too bad!');
    else if(current.position[1]<-1500||current.floor<-10000)respawn('Lost in the smoke');
    return;
  }
  const reached=progress.collect(current,actionName());
  if(reached.length) {
    const route=reached.at(-1).route,count=progress.route(route);
    toast(progress.found.size===progress.sparks.length?`All ${progress.sparks.length} sparks found. Beautifully done!`:
      `${route} · ${count.found} / ${count.total} sparks${count.found===count.total?' · route complete!':''}`);
  }
  if(current.position[1]<-1500 || current.health<256 || current.floor<-10000) {
    reset();toast('Back on your feet.');
  }
}
function openHelp() {
  helpWasPaused=paused;if(started)setPaused(true);
  input?.clear();help.showModal();
}
function command(key) {
  if(help.open||victory.open)return;
  if(key==='Slash'||key==='KeyH'){openHelp();return;}
  if(!started) {if(key==='Space')start('caldera');return;}
  if(key==='KeyR')reset();
  if(key==='KeyP'||key==='Escape')setPaused(!paused);
  if(key==='KeyT')toggleSlow();
  if(key==='KeyV')toggleMesh();
  if(key==='KeyN') {setPaused(true);tick();renderHud();}
}
function actionName() {return actions?.[current.action]||`ACT_${current.action.toString(16)}`;}
function drawPowerMeter(health) {
  const ctx=$('power-meter').getContext('2d'),wedges=Math.max(0,Math.min(8,Math.floor(health/256)));
  ctx.clearRect(0,0,112,112);
  ctx.beginPath();ctx.arc(56,56,50,0,Math.PI*2);ctx.fillStyle='#2a1418';ctx.fill();
  const color=wedges>4?'#46c2ff':wedges>2?'#ffd24a':'#ff4a3a';
  for(let i=0;i<8;i++) {
    const a=-Math.PI/2+i*Math.PI/4;
    ctx.beginPath();ctx.moveTo(56,56);ctx.arc(56,56,44,a+.04,a+Math.PI/4-.04);ctx.closePath();
    ctx.fillStyle=i<wedges?color:'#ffffff14';ctx.fill();
  }
  ctx.beginPath();ctx.arc(56,56,17,0,Math.PI*2);ctx.fillStyle='#1a0d10';ctx.fill();
  ctx.fillStyle='#fbead2';ctx.font='600 20px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(wedges,56,57);
}
function renderLevelHud() {
  const coins=session.count('coin'),shards=session.count('shard'),stars=session.stars;
  drawPowerMeter(current.health);
  $('coin-count').textContent=coins.found;$('shard-count').textContent=shards.found;$('star-count').textContent=stars;
  $('level-time').textContent=formatTime(session.time);
  $('shard-total').textContent=`${shards.found} / ${shards.total}`;
  $('goal-star').classList.toggle('done',session.found.has('ember-star'));
  $('goal-shards').classList.toggle('done',shards.found===shards.total);
  $('goal-bonus').classList.toggle('done',session.found.has('crimson-star'));
  $('goal-bonus').classList.toggle('locked',shards.found<shards.total);
  document.querySelectorAll('[data-zone]').forEach((button,i)=>{
    const lit=session.lit.has(`checkpoint-${zones[i].id}`);button.disabled=!lit;
    button.querySelector('small').textContent=lit?'':'🔒';
  });
}
function renderHud() {
  const name=actionName().replace(/^ACT_/,'').toLowerCase().replaceAll('_',' ');
  $('action-name').textContent=name[0].toUpperCase()+name.slice(1);
  $('action-code').textContent=`0x${current.action.toString(16).toUpperCase().padStart(8,'0')}`;
  $('animation-name').textContent=`${animationName(current.animation).toLowerCase().replaceAll('_',' ')} · ${current.frame}`;
  $('speed').textContent=current.speed.toFixed(2);
  $('speed-bar').style.width=`${Math.min(100,Math.abs(current.speed)/64*100)}%`;
  $('height').textContent=Math.round(current.position[1]-current.floor);
  $('vertical').textContent=current.velocity[1].toFixed(2);
  $('tick').textContent=current.tick;
  const cue=actionCue(actionName(),current,renderer.yaw);
  $('move-cue').textContent=cue;$('move-cue').hidden=!cue;
  if(mode==='caldera')renderLevelHud();
  else {
    $('spark-count').textContent=`${progress.found.size} / ${progress.sparks.length}`;
    document.querySelectorAll('[data-zone]').forEach((button,i)=>{
      const count=progress.route(zones[i].name),badge=button.querySelector('small');
      if(badge)badge.textContent=count.total?`${count.found}/${count.total}`:'';
    });
  }
  const ctx=$('stick-display').getContext('2d');
  ctx.clearRect(0,0,100,100);ctx.strokeStyle=mode==='caldera'?'#f3e3cf40':'#193b3040';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(50,50,34,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(13,50);ctx.lineTo(87,50);ctx.moveTo(50,13);ctx.lineTo(50,87);ctx.stroke();
  ctx.fillStyle='#ed723d';ctx.beginPath();ctx.arc(50+lastInput.x/80*30,50-lastInput.y/80*30,6,0,Math.PI*2);ctx.fill();
}
function frame(now) {
  const dt=Math.min((now-last)/1000||0,0.1);last=now;
  let alpha=1;
  const live=started&&!help.open&&!victory.open;
  if(live) {
    const delta=input.cameraDelta(dt);
    renderer.yaw+=delta.yaw;
    renderer.pitch=Math.max(.12,Math.min(1.25,renderer.pitch+delta.pitch));
    renderer.distance=Math.max(350,Math.min(3200,renderer.distance+delta.zoom));
    if(!paused)alpha=clock.advance(dt*(slow?.25:1),tick);
  }
  const view=mode==='caldera'?{found:session.found,lit:session.lit,revealed:session.revealed}:{found:progress.found};
  renderer.draw(previous,current,alpha,dt,actionName(),actions[previous.action],view,live&&!paused?dt*(slow?.25:1):0);
  if(started)renderHud();
  frames++;frameTime+=dt;
  if(frameTime>=1) {
    $('render-stats').textContent=`30 Hz physics / ${Math.round(frames/frameTime)} fps / ${input.gamepadName}`;
    frames=0;frameTime=0;
  }
  requestAnimationFrame(frame);
}

$('start').addEventListener('click',()=>start('playground'));
$('start-level').addEventListener('click',()=>start('caldera'));
$('help-button').addEventListener('click',openHelp);
$('close-help').addEventListener('click',()=>help.close());
$('help-done').addEventListener('click',()=>help.close());
help.addEventListener('close',()=>{if(started)setPaused(helpWasPaused);input?.clear();canvas.focus();});
victory.addEventListener('close',()=>{setPaused(false);input?.clear();canvas.focus();});
$('victory-continue').addEventListener('click',()=>victory.close());
$('victory-restart').addEventListener('click',()=>{victory.close();session.reset();reset(0);renderer.flyover(world.intro.from,world.intro.look);});
$('restart-level').addEventListener('click',()=>{session.reset();reset(0);toast('A fresh start at the landing.');});
$('reset-button').addEventListener('click',()=>reset());
$('reset-sparks').addEventListener('click',()=>{progress.reset();renderHud();toast('Sparks are back. Try a new route.');canvas.focus();});
$('pause-button').addEventListener('click',()=>{setPaused(!paused);canvas.focus();});
$('step-button').addEventListener('click',()=>{setPaused(true);tick();renderHud();canvas.focus();});
$('slow-button').addEventListener('click',()=>{toggleSlow();canvas.focus();});
$('wire-button').addEventListener('click',()=>{toggleMesh();canvas.focus();});
$('trail-button').addEventListener('click',()=>{
  renderer.trail.visible=!renderer.trail.visible;$('trail-button').setAttribute('aria-pressed',renderer.trail.visible);canvas.focus();
});
$('zones-toggle').addEventListener('click',()=>{
  $('zone-list').hidden=!$('zone-list').hidden;$('zones-toggle').textContent=$('zone-list').hidden?'+':'−';
});
for(const tab of document.querySelectorAll('[data-mode]'))tab.addEventListener('click',()=>{if(tab.dataset.mode!==mode)setMode(tab.dataset.mode);canvas.focus();});
window.addEventListener('blur',()=>{if(started&&!help.open&&!victory.open)setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)setPaused(true);});

try {
  worlds={playground:{...createWorld(),kind:'playground'},caldera:createCaldera()};
  worlds.playground.zones=playgroundZones;world=worlds.playground;
  progress=new CourseProgress(worlds.playground.sparks);
  const [wasm,actionResponse]=await Promise.all([fetch('smooth64.wasm'),fetch('actions.json')]);
  if(!wasm.ok||!actionResponse.ok)throw new Error('Could not load the movement files. Serve the web folder over HTTP.');
  [core,actions]=await Promise.all([wasm.arrayBuffer().then(loadCore),actionResponse.json()]);
  core.loadWorld(world.triangles);
  renderer=new PlaygroundRenderer(canvas,world);
  input=new Input(canvas,command);
  current=core.reset(zones[0].position,zones[0].yaw);previous=current;
  buildZoneList();
  for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-selected',tab.dataset.mode===mode);
  $('start').disabled=false;$('start').innerHTML='Movement playground <span>↗</span>';
  $('start-level').disabled=false;
  $('status').innerHTML='<i></i>Playground ready';
  requestAnimationFrame(frame);
} catch(error) {
  console.error(error);$('status').textContent='Unable to start';
  $('welcome').querySelector('p').textContent=`${error.message} Use a browser with WebGL 2 and WebAssembly enabled.`;
  $('start').textContent='Reload playground';$('start').disabled=false;
  $('start').addEventListener('click',()=>location.reload());
}
