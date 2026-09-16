import {createWorld,zones} from './world.js';
import {loadCore,FixedClock} from './engine.js';
import {Input} from './input.js';
import {PlaygroundRenderer} from './renderer.js';

const $=id=>document.getElementById(id);
const canvas=$('game'),help=$('help');
let core,renderer,input,previous,current,actions;
let started=false,paused=false,slow=false,zoneIndex=0,last=0,frames=0,frameTime=0;
let lastInput={x:0,y:0,buttons:0,yaw:0},helpWasPaused=false,toastTimer;
const clock=new FixedClock();
function toast(message) {
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,2600);
}
function reset(index=zoneIndex) {
  zoneIndex=index;
  const zone=zones[index];
  current=core.reset(zone.position,zone.yaw);previous=current;
  clock.reset();input.clear();lastInput={x:0,y:0,buttons:0,yaw:0};
  renderer.reset(zone.position,zone.camera);
  $('tip-text').textContent=zone.note;
  document.querySelectorAll('[data-zone]').forEach((button,i)=>button.classList.toggle('active',i===index));
  canvas.focus();renderHud();
}
function start() {
  if(!core||started)return;
  started=true;document.body.classList.add('playing');
  $('welcome').hidden=true;
  for(const id of ['zones','tip','telemetry','toolbar'])$(id).hidden=false;
  renderer.intro=false;reset();
  $('footer-left').textContent='DRAG TO ORBIT · SCROLL TO ZOOM';
}
function setPaused(value) {
  paused=value;clock.reset();$('paused').hidden=!paused;
  $('pause-button').querySelector('span').textContent=paused?'Resume':'Pause';
  $('status').innerHTML=`<i></i>${paused?'Paused':'Playground ready'}`;
}
function toggleSlow() {
  slow=!slow;$('slow-button').setAttribute('aria-pressed',slow);
  $('time-scale').textContent=slow?'¼× speed':'1× speed';
}
function toggleMesh() { renderer.wire.visible=!renderer.wire.visible;$('wire-button').setAttribute('aria-pressed',renderer.wire.visible); }
function tick() {
  lastInput=input.sample(renderer.yaw);previous=current;
  current=core.tick(lastInput);renderer.record(current);
  if(current.position[1]<-1500 || current.health<256 || current.floor<-10000) {
    reset();toast('Back on your feet.');
  }
}
function openHelp() {
  helpWasPaused=paused;if(started)setPaused(true);
  input?.clear();help.showModal();
}
function command(key) {
  if(help.open)return;
  if(key==='Slash'||key==='KeyH'){openHelp();return;}
  if(!started) {if(key==='Space')start();return;}
  if(key==='KeyR')reset();
  if(key==='KeyP'||key==='Escape')setPaused(!paused);
  if(key==='KeyT')toggleSlow();
  if(key==='KeyV')toggleMesh();
  if(key==='KeyN') {setPaused(true);tick();renderHud();}
}
function actionName() {return actions?.[current.action]||`ACT_${current.action.toString(16)}`;}
function renderHud() {
  const name=actionName().replace(/^ACT_/,'').toLowerCase().replaceAll('_',' ');
  $('action-name').textContent=name[0].toUpperCase()+name.slice(1);
  $('action-code').textContent=`0x${current.action.toString(16).toUpperCase().padStart(8,'0')}`;
  $('speed').textContent=current.speed.toFixed(2);
  $('speed-bar').style.width=`${Math.min(100,Math.abs(current.speed)/64*100)}%`;
  $('height').textContent=Math.round(current.position[1]-current.floor);
  $('vertical').textContent=current.velocity[1].toFixed(2);
  $('tick').textContent=current.tick;
  const ctx=$('stick-display').getContext('2d');
  ctx.clearRect(0,0,100,100);ctx.strokeStyle='#193b3040';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(50,50,34,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(13,50);ctx.lineTo(87,50);ctx.moveTo(50,13);ctx.lineTo(50,87);ctx.stroke();
  ctx.fillStyle='#ed723d';ctx.beginPath();ctx.arc(50+lastInput.x/80*30,50-lastInput.y/80*30,6,0,Math.PI*2);ctx.fill();
}
function frame(now) {
  const dt=Math.min((now-last)/1000||0,0.1);last=now;
  let alpha=1;
  if(started&&!help.open) {
    const delta=input.cameraDelta(dt);
    renderer.yaw+=delta.yaw;
    renderer.pitch=Math.max(.12,Math.min(1.25,renderer.pitch+delta.pitch));
    renderer.distance=Math.max(350,Math.min(2100,renderer.distance+delta.zoom));
    if(!paused)alpha=clock.advance(dt*(slow?.25:1),tick);
  }
  renderer.draw(previous,current,alpha,dt,actionName());
  if(started)renderHud();
  frames++;frameTime+=dt;
  if(frameTime>=1) {
    $('render-stats').textContent=`30 Hz physics / ${Math.round(frames/frameTime)} fps / ${input.gamepadName}`;
    frames=0;frameTime=0;
  }
  requestAnimationFrame(frame);
}

$('start').addEventListener('click',start);
$('help-button').addEventListener('click',openHelp);
$('close-help').addEventListener('click',()=>help.close());
$('help-done').addEventListener('click',()=>help.close());
help.addEventListener('close',()=>{if(started)setPaused(helpWasPaused);input?.clear();canvas.focus();});
$('reset-button').addEventListener('click',()=>reset());
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
window.addEventListener('blur',()=>{if(started&&!help.open)setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started)setPaused(true);});

try {
  const world=createWorld();
  const [wasm,actionResponse]=await Promise.all([fetch('smooth64.wasm'),fetch('actions.json')]);
  if(!wasm.ok||!actionResponse.ok)throw new Error('Could not load the movement files. Serve the web folder over HTTP.');
  [core,actions]=await Promise.all([wasm.arrayBuffer().then(loadCore),actionResponse.json()]);
  core.loadWorld(world.triangles);
  renderer=new PlaygroundRenderer(canvas,world);
  input=new Input(canvas,command);
  current=core.reset(zones[0].position,zones[0].yaw);previous=current;
  zones.forEach((zone,index)=>{
    const button=document.createElement('button');button.dataset.zone=index;
    button.innerHTML=`<b>${String(index+1).padStart(2,'0')}</b><span>${zone.name}</span>`;
    button.addEventListener('click',()=>reset(index));$('zone-list').append(button);
  });
  $('start').disabled=false;$('start').innerHTML='Enter playground <span>↗</span>';
  $('status').innerHTML='<i></i>Playground ready';
  requestAnimationFrame(frame);
} catch(error) {
  console.error(error);$('status').textContent='Unable to start';
  $('welcome').querySelector('p').textContent=`${error.message} Use a browser with WebGL 2 and WebAssembly enabled.`;
  $('start').textContent='Reload playground';$('start').disabled=false;
  $('start').addEventListener('click',()=>location.reload());
}
