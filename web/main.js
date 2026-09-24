import {createWorld} from './world.js';
import {createCaldera} from './caldera.js';
import {createHoarfrost} from './hoarfrost.js';
import {createExpanse} from './expanse.js';
import {animationName} from './animations.js';
import {loadCore,FixedClock} from './engine.js';
import {Input} from './input.js';
import {PlaygroundRenderer} from './renderer.js';
import {LevelSession,formatTime} from './level.js';
import {HEALTH,healthWedges,respawnReason} from './rules.js';
import {loadSettings,saveSettings,SETTING_RANGES} from './settings.js';
import {actionCue} from './pose.js';
import {GameAudio} from './audio.js';
import {area,controls,nearest} from './menus.js';

const $=id=>document.getElementById(id);
const canvas=$('game'),menu=$('menu'),help=$('help'),victory=$('victory');
const clock=new FixedClock(),settings=loadSettings(),audio=new GameAudio({volume:settings.volume,music:settings.music});
// Sounds are optional: the game starts without them if the file is missing.
fetch('sounds.mp3').then(response=>response.ok?response.arrayBuffer():null).then(bytes=>bytes&&audio.load(bytes)).catch(()=>{});
// Browsers let a page start audio only after a click, tap or key press.
for(const type of ['pointerdown','keydown','touchend'])window.addEventListener(type,()=>audio.unlock(),{capture:true,passive:true});
let previewTimer=0;
let core,renderer,input,previous,current,actions,world,session,mode;
// Each world is built on its first visit (the Expanse alone is ~39,000 triangles).
const MAKERS={playground:createWorld,caldera:createCaldera,hoarfrost:createHoarfrost,expanse:createExpanse},worlds={},sessions={};
let started=false,debugPaused=false,slow=false,last=0,frames=0,frameTime=0,renderAlpha=1;
let lastInput={x:0,y:0,buttons:0,yaw:0},toastTimer,respawning=0,meterWedges=-1;
const modalOpen=()=>menu.open||help.open||victory.open;
const paused=()=>!started||modalOpen()||debugPaused;
const actionName=()=>actions?.[current.action]||`ACT_${current.action.toString(16)}`;
function write(id,value) {const text=String(value);if($(id).textContent!==text)$(id).textContent=text;}
function toast(message,duration=3200) {
  clearTimeout(toastTimer);write('toast',message);$('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,duration);
}
function bump(id) {const el=$(id);el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}
function syncInput() {
  input?.setEnabled(started&&!modalOpen()&&!respawning);
  document.body.classList.toggle('modal-open',modalOpen());
  $('freeze-button').setAttribute('aria-pressed',debugPaused);
  write('freeze-button',debugPaused?'Unfreeze':'Freeze');
}
function syncPause() {clock.reset();input?.clear();audio.hush();syncInput();}
function cancelRespawn() {respawning=0;$('fade').hidden=true;}
function place(zone,{keepFade=false}={}) {
  if(!keepFade)cancelRespawn();
  audio.hush();
  current=core.reset(zone.position,zone.yaw);previous=current;renderAlpha=1;
  clock.reset();input.clear();lastInput={x:0,y:0,buttons:0,yaw:0};
  renderer.reset(zone.position,zone.camera,zone.pitch);syncInput();renderHud();
}
function reset(index=session.checkpoint) {
  const zone=session.visit(index);if(!zone)return;
  place(zone);return zone;
}
function buildZoneList() {
  $('zone-list').replaceChildren();write('zones-title',world.text?.zones??(world.freeTravel?'Practice destinations':'Checkpoints'));
  world.zones.forEach((zone,index)=>{
    if(zone.section) {
      const label=document.createElement('span');label.className='zone-section';label.textContent=zone.section;$('zone-list').append(label);
    }
    const button=document.createElement('button');button.dataset.zone=index;
    const number=document.createElement('b'),name=document.createElement('span'),badge=document.createElement('small');
    number.textContent=String(index+1).padStart(2,'0');name.textContent=zone.name;button.append(number,name,badge);
    button.addEventListener('click',()=>{if(reset(index)){menu.close();toast(zone.note,5000);}});
    $('zone-list').append(button);
  });
}
function setMode(next) {
  cancelRespawn();clearTimeout(toastTimer);$('toast').hidden=true;
  if(!worlds[next]){worlds[next]=MAKERS[next]();sessions[next]=new LevelSession(worlds[next]);}
  mode=next;world=worlds[next];session=sessions[next];debugPaused=false;slow=false;
  core.loadWorld(world.triangles);renderer.load(world);audio.setTheme(world.theme?.audio);
  document.body.classList.toggle('caldera',mode==='caldera');document.body.dataset.world=mode;
  buildZoneList();reset(session.checkpoint);applySettings();
  for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',button.dataset.mode===mode);
}
function start(next='caldera') {
  if(!core||started)return;
  started=true;document.body.classList.add('playing');$('welcome').hidden=true;renderer.intro=false;audio.unlock();audio.playMusic();
  if(next!==mode)setMode(next);else reset();
  for(const id of ['menu-button','level-hud','location'])$(id).hidden=false;
  applySettings();
  if(world.intro)renderer.flyover(world.intro.from,world.intro.look);
  toast(world.text?.start??'Explore at your own pace. Every practice area is in the Menu.',5000);
  canvas.focus();
}
function openMenu() {
  if(!started||modalOpen())return;
  renderMenu();menu.showModal();syncPause();audio.cue('click');
}
function openHelp() {if(help.open||victory.open)return;help.showModal();syncPause();}
function restartWorld() {
  session.reset();debugPaused=false;reset(0);
  if(menu.open)menu.close();if(victory.open)victory.close();
  if(world.intro)renderer.flyover(world.intro.from,world.intro.look);
  toast('A fresh start. Every coin is back.');syncPause();
}
function applySettings() {
  document.body.classList.toggle('developer',settings.developer);
  for(const [key,value] of Object.entries(settings)) {
    if(!SETTING_RANGES[key]){$(`setting-${key}`).checked=value;continue;}
    const label=key==='music'&&value===0?'Off':`${Math.round(value*100)}%`;
    $(`setting-${key}`).value=Math.round(value*100);write(`${key}-value`,label);$(`setting-${key}`).setAttribute('aria-valuetext',label);
  }
  audio.setVolume(settings.volume);audio.setMusicVolume(settings.music);if(input)input.deadzone=settings.deadzone;
  for(const id of ['telemetry','toolbar','render-stats'])$(id).hidden=!started||!settings.developer;
  $('technical-guide').hidden=!settings.developer;$('timer-hud').hidden=!settings.timer;
  if(!settings.developer) {
    slow=false;debugPaused=false;
    if(renderer){renderer.wire.visible=false;renderer.trail.visible=false;}
  }
  $('slow-button').setAttribute('aria-pressed',slow);write('time-scale',slow?'¼× speed':'1× speed');
  $('wire-button').setAttribute('aria-pressed',!!renderer?.wire.visible);
  $('trail-button').setAttribute('aria-pressed',!!renderer?.trail.visible);
  syncInput();
  if(current)renderHud();
}
function respawn(message) {
  if(respawning)return;
  audio.hush();if(current.health<HEALTH.ALIVE)audio.cue('lose');
  respawning=18;write('fade-text',message);const fade=$('fade');fade.hidden=false;
  fade.style.animation='none';void fade.offsetWidth;fade.style.animation='';syncInput();
}
$('fade').addEventListener('animationend',()=>$('fade').hidden=true);
function collectEvents(events) {
  let won=null;
  // One sound per kind per tick, however many pickups it collected.
  for(const type of new Set(events.map(event=>event.type))) {
    if(type==='checkpoint')audio.cue(events.some(event=>event.first)?'checkpoint':'beacon');
    else if(type==='reveal')audio.cue('reveal',{delay:.75});
    else audio.cue(type==='bonus'?'star':type);
  }
  for(const event of events) {
    const p=event.pickup?.position;
    if(event.heal)current=core.heal(event.heal);
    if(event.type==='coin') {
      renderer.effects.burst(p,{count:10,speed:200,size:22,color:'#fff4b8',end:'#ffb020',life:.4});bump('coin-count');
      if(world.freeTravel) {
        const count=session.route(event.pickup.route);
        if(session.count('coin').found===session.count('coin').total)toast('Every coin found. Beautifully done!');
        else if(count.found===count.total)toast(`${event.pickup.route} complete!`);
      }
    } else if(event.type==='shard') {
      const [,deep,light]=renderer.theme.shard??[,'#ff2b1f','#ffd0c8'];
      renderer.effects.burst(p,{count:22,speed:280,size:30,color:light,end:deep,life:.6});bump('shard-count');
      const shards=session.count('shard');toast(`${world.text.shard} ${shards.found} of ${shards.total}`);
    } else if(event.type==='reveal')toast(world.text.reveal,5000);
    else if(event.type==='checkpoint') {
      renderer.effects.ring(p,{count:16,speed:260,rise:160,size:40,grow:60,color:'#ffe1a0',end:'#ff6a1f',glow:true,life:.7});
      toast(`${event.first?'Checkpoint lit':'Checkpoint'} · ${event.checkpoint.name}`);
    } else if(event.type==='star'||event.type==='bonus') {
      const end=renderer.theme.stars?.[event.type]?.[1]??(event.type==='star'?'#ffb000':'#ff2b3a');
      renderer.effects.burst(p,{count:48,speed:420,size:40,color:'#fff6d0',end,life:1,up:200});
      won=event;
    }
  }
  if(won)showVictory(won.type,won.pickup);
}
const starTotal=()=>session.count('star').total+session.count('bonus').total;
function showVictory(kind,pickup) {
  // The best time counts only the world's goal star (any star when it names none).
  const coins=session.count('coin'),shards=session.count('shard');
  const best=bestTime(kind==='star'&&(!world.goal||pickup.id===world.goal)?session.time:null);
  const {title,copy}=world.text.victory(kind,{session,shards,pickup,best:best&&formatTime(best)});
  write('victory-eyebrow',`STAR GET · ${session.stars} OF ${starTotal()}`);
  write('victory-title',title);write('victory-copy',copy);
  write('victory-time',formatTime(session.time));write('victory-coins',`${coins.found} / ${coins.total}`);
  write('victory-shards',`${shards.found} / ${shards.total}`);write('victory-deaths',session.deaths);
  victory.showModal();syncPause();
}
function bestTime(time) {
  try {
    const key=`smooth64-${world.kind}-best`,best=Number(localStorage.getItem(key))||null;
    if(time&&(!best||time<best))localStorage.setItem(key,time);
    return best&&time?Math.min(best,time):best||time;
  } catch {return time;}
}
function tick() {
  // Knockouts freeze the core until the shared checkpoint transition finishes.
  if(respawning) {
    session.tick({x:0,y:0,buttons:0});
    if(--respawning===0)place(session.respawn(),{keepFade:true});
    return !modalOpen();
  }
  lastInput=input.sample(renderer.yaw);previous=current;
  if(renderer.shot&&(lastInput.buttons||Math.hypot(lastInput.x,lastInput.y)>7))renderer.shot=null;
  current=core.tick(lastInput);renderer.record(current);renderer.tick(previous,current,actions[previous.action],actionName());
  audio.tick(core.sounds(),previous,current,actions[previous.action],actionName());
  session.tick(lastInput);
  const reason=respawnReason(current,world.fallLimit);
  if(reason)respawn(reason);else collectEvents(session.collect(current,actionName()));
  return !modalOpen();
}
function step() {debugPaused=true;tick();renderAlpha=1;renderer.character.snap();syncInput();renderHud();}
function command(key) {
  if(help.open||victory.open) {
    if(key==='Escape'){(help.open?help:victory).close();return true;}
    return false;
  }
  if(key==='Escape'||key==='KeyP') {
    if(!started){if(key==='Escape')start();}
    else if(menu.open)menu.close();else openMenu();
    return true;
  }
  if(key==='Slash'||key==='KeyH'){openHelp();return true;}
  if(menu.open)return false;
  if(!started){if(key==='Space'){start();return true;}return false;}
  if(key==='KeyR'){reset();toast('Back at your checkpoint.');return true;}
  if(settings.developer) {
    if(key==='KeyT'){slow=!slow;applySettings();return true;}
    if(key==='KeyV'){renderer.wire.visible=!renderer.wire.visible;applySettings();return true;}
    if(key==='KeyN'){step();return true;}
  }
  return false;
}
// Gamepad menus: the open dialog, or the welcome screen before play.
function menuRoots() {
  const dialog=[victory,help,menu].find(d=>d.open);
  return dialog?[dialog]:started?[]:[$('welcome'),document.querySelector('.header-actions')];
}
function navigate(action) {
  document.body.classList.add('pad-nav');
  const roots=menuRoots();if(!roots.length)return false;
  const items=controls(roots),here=items.includes(document.activeElement)?document.activeElement:null;
  // Start picks the focused world on the welcome screen; otherwise it opens or closes the menu.
  if(action==='start')return !started&&!!here&&(here.click(),true);
  if(action==='back')return roots[0].tagName==='DIALOG'&&command('Escape');
  // The first press shows where focus is: the dialog's own choice, or the first world.
  if(!here) {
    const first=items.find(el=>el.autofocus)??items.find(el=>el.classList.contains('primary'))??items[0];
    first?.focus();if(action==='accept')first?.click();return true;
  }
  if(action==='accept'){if(here.type!=='range')here.click();return true;}
  if(here.type==='range'&&(action==='left'||action==='right')) {
    if(action==='left')here.stepDown();else here.stepUp();
    here.dispatchEvent(new Event('input',{bubbles:true}));return true;
  }
  const target=items[nearest(area(here),items.map(area),action)];
  // In a long dialog, scroll toward the next control a step at a time, so
  // text between controls (the move guide) can be read on the way.
  const box=roots[0];
  if((action==='up'||action==='down')&&box.scrollHeight>box.clientHeight) {
    const view=box.getBoundingClientRect(),sign=action==='down'?1:-1,rect=target&&area(target);
    const hidden=rect?(sign>0?rect.bottom-view.bottom+16:view.top+16-rect.top):Infinity;
    const room=sign>0?box.scrollHeight-box.clientHeight-box.scrollTop:box.scrollTop;
    if(hidden>0&&room>0){const by=Math.min(hidden,view.height*.6,room);box.scrollBy(0,sign*by);if(by<hidden)return true;}
  }
  if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
  return true;
}
function drawPowerMeter(health) {
  const wedges=healthWedges(health);if(wedges===meterWedges)return;meterWedges=wedges;
  const meter=$('power-meter'),ctx=meter.getContext('2d');
  meter.setAttribute('aria-label',`Power: ${wedges} of 8`);meter.title=`Power: ${wedges} / 8`;
  ctx.clearRect(0,0,112,112);ctx.beginPath();ctx.arc(56,56,50,0,Math.PI*2);ctx.fillStyle='#151c21';ctx.fill();
  const color=wedges>4?'#69cbd5':wedges>2?'#ffd24a':'#ff7059';
  for(let i=0;i<8;i++) {
    const a=-Math.PI/2+i*Math.PI/4;
    ctx.beginPath();ctx.moveTo(56,56);ctx.arc(56,56,44,a+.04,a+Math.PI/4-.04);ctx.closePath();
    ctx.fillStyle=i<wedges?color:'#ffffff20';ctx.fill();
  }
  ctx.beginPath();ctx.arc(56,56,18,0,Math.PI*2);ctx.fillStyle='#151c21';ctx.fill();
  ctx.fillStyle='#fff3dc';ctx.font='700 22px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(wedges,56,57);
}
function renderMenu() {
  const coins=session.count('coin'),shards=session.count('shard');
  write('mission-title',world.name);write('menu-time',formatTime(session.time));
  write('objective-summary',world.text?.summary??(world.freeTravel?'Practice every move, follow the coins, and try the lava crossing. All destinations are open.':world.zones[session.checkpoint].note));
  $('objectives').hidden=world.freeTravel;
  write('menu-coins',`${coins.found} / ${coins.total} coins`);write('menu-deaths',`${session.deaths} retries`);
  renderObjectives(shards);
  document.querySelectorAll('[data-zone]').forEach((button,index)=>{
    const zone=world.zones[index],count=session.route(zone.name),available=session.canVisit(index);
    button.disabled=!available;button.classList.toggle('active',index===session.checkpoint);
    if(index===session.checkpoint)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
    button.querySelector('small').textContent=!available?'Not reached':count.total?`${count.found}/${count.total} coins`:index===session.checkpoint?'Current':'';
  });
}
// Each world lists its own objectives: a star, the shard count, a locked goal.
function renderObjectives(shards) {
  const list=$('objectives');list.replaceChildren();
  for(const goal of world.text?.objectives??[]) {
    const item=document.createElement('li'),icon=document.createElement('i'),copy=document.createElement('span'),name=document.createElement('b');
    icon.setAttribute('aria-hidden','true');icon.textContent=goal.icon;name.textContent=goal.title;
    if(goal.shards){const count=document.createElement('em');count.textContent=`${shards.found} / ${shards.total}`;name.append(count);item.classList.add('shard-goal');}
    copy.append(name,goal.note);item.append(icon,copy);
    item.classList.toggle('done',goal.shards?shards.total>0&&shards.found===shards.total:!!goal.star&&session.found.has(goal.star));
    item.classList.toggle('locked',!!goal.locked||(!!goal.needsShards&&shards.found<shards.total));
    list.append(item);
  }
}
function renderHud() {
  const coins=session.count('coin'),shards=session.count('shard'),stars=session.count('star').total+session.count('bonus').total;
  drawPowerMeter(current.health);write('coin-count',coins.found);write('coin-total',`/${coins.total}`);
  write('shard-count',shards.found);write('shard-max',`/${shards.total}`);$('shards-hud').hidden=!shards.total;
  write('star-count',session.stars);write('star-max',`/${stars}`);$('stars-hud').hidden=!stars;
  $('coins-hud').setAttribute('aria-label',`Coins: ${coins.found} of ${coins.total}`);
  $('shards-hud').setAttribute('aria-label',`${world.text?.shards??'Shards'}: ${shards.found} of ${shards.total}`);
  $('stars-hud').setAttribute('aria-label',`Stars: ${session.stars} of ${stars}`);
  write('level-time',formatTime(session.time));write('world-name',world.name);
  write('checkpoint-name',`Checkpoint · ${world.zones[session.checkpoint].name}`);
  const cue=settings.hints&&!paused()&&!respawning?actionCue(actionName(),current,renderer.yaw):'';
  write('move-cue',cue);$('move-cue').hidden=!cue;
  if(!settings.developer)return;
  const name=actionName().replace(/^ACT_/,'').toLowerCase().replaceAll('_',' ');
  write('action-name',name[0].toUpperCase()+name.slice(1));write('action-code',`0x${current.action.toString(16).toUpperCase().padStart(8,'0')}`);
  write('animation-name',`${animationName(current.animation).toLowerCase().replaceAll('_',' ')} · ${current.frame}`);
  write('speed',current.speed.toFixed(2));$('speed-bar').style.width=`${Math.min(100,Math.abs(current.speed)/64*100)}%`;
  write('height',Math.round(current.position[1]-current.floor));write('vertical',current.velocity[1].toFixed(2));write('tick',current.tick);
  const ctx=$('stick-display').getContext('2d');ctx.clearRect(0,0,100,100);ctx.strokeStyle='#243c3440';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(50,50,34,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(13,50);ctx.lineTo(87,50);ctx.moveTo(50,13);ctx.lineTo(50,87);ctx.stroke();
  ctx.fillStyle='#d37537';ctx.beginPath();ctx.arc(50+lastInput.x/80*30,50-lastInput.y/80*30,6,0,Math.PI*2);ctx.fill();
}
function frame(now) {
  const dt=Math.min((now-last)/1000||0,.1);last=now;input.pollCommands(!started||modalOpen(),now);
  if(paused()||respawning)audio.hush();
  audio.pauseMusic(modalOpen());
  if(started&&!modalOpen()) {
    const delta=input.cameraDelta(dt);renderer.yaw+=delta.yaw;
    renderer.pitch=Math.max(.12,Math.min(1.25,renderer.pitch+delta.pitch));
    renderer.distance=Math.max(350,Math.min(3200,renderer.distance+delta.zoom));
    if(!debugPaused) {
      renderAlpha=clock.advance(dt*(slow?.25:1),tick);
      if(modalOpen())renderAlpha=1;
    }
  }
  const view={found:session.found,lit:session.lit,revealed:session.revealed};
  renderer.draw(previous,current,renderAlpha,modalOpen()?0:dt,actionName(),actions[previous.action],view,paused()?0:dt*(slow?.25:1));
  if(started)renderHud();
  frames++;frameTime+=dt;
  if(frameTime>=1) {
    if(settings.developer)write('render-stats',`30 Hz physics / ${Math.round(frames/frameTime)} fps / ${input.gamepadName}${debugPaused?' / frozen':''}`);
    frames=0;frameTime=0;
  }
  requestAnimationFrame(frame);
}

$('start').addEventListener('click',()=>start('playground'));
$('start-level').addEventListener('click',()=>start('caldera'));
$('start-frost').addEventListener('click',()=>start('hoarfrost'));
$('start-expanse').addEventListener('click',()=>start('expanse'));
$('menu-button').addEventListener('click',openMenu);
$('close-menu').addEventListener('click',()=>menu.close());
$('resume-button').addEventListener('click',()=>{debugPaused=false;menu.close();});
$('help-button').addEventListener('click',openHelp);$('menu-help').addEventListener('click',openHelp);
$('close-help').addEventListener('click',()=>help.close());$('help-done').addEventListener('click',()=>help.close());
for(const dialog of [menu,help,victory])dialog.addEventListener('close',()=>{syncPause();if(!modalOpen()&&started){audio.cue('click');canvas.focus();}});
$('victory-continue').addEventListener('click',()=>victory.close());
$('victory-restart').addEventListener('click',restartWorld);$('restart-world').addEventListener('click',restartWorld);
$('reset-button').addEventListener('click',()=>{reset();menu.close();toast('Back at your checkpoint.');});
$('freeze-button').addEventListener('click',()=>{debugPaused=!debugPaused;clock.reset();syncInput();canvas.focus();});
$('step-button').addEventListener('click',()=>{step();canvas.focus();});
$('slow-button').addEventListener('click',()=>{slow=!slow;applySettings();canvas.focus();});
$('wire-button').addEventListener('click',()=>{renderer.wire.visible=!renderer.wire.visible;applySettings();canvas.focus();});
$('trail-button').addEventListener('click',()=>{renderer.trail.visible=!renderer.trail.visible;applySettings();canvas.focus();});
for(const key of Object.keys(settings))$(`setting-${key}`).addEventListener(SETTING_RANGES[key]?'input':'change',e=>{
  settings[key]=SETTING_RANGES[key]?Number(e.target.value)/100:e.target.checked;saveSettings(settings);applySettings();
  // Let the new volume be heard while dragging, without a burst of coins.
  if(key==='volume'&&performance.now()>previewTimer){previewTimer=performance.now()+180;audio.unlock();audio.cue('coin');}
});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{
  if(button.dataset.mode!==mode){setMode(button.dataset.mode);toast(`Welcome back to ${world.name}.`);}
  menu.close();
});
window.addEventListener('blur',()=>{if(started&&!modalOpen())openMenu();});
// The gamepad's focus ring gives way to the mouse, touch or keyboard.
for(const type of ['pointerdown','keydown','wheel'])window.addEventListener(type,()=>document.body.classList.remove('pad-nav'),{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{audio.setHidden(document.hidden);if(document.hidden&&started&&!modalOpen())openMenu();});

try {
  const [wasm,actionResponse]=await Promise.all([fetch('smooth64.wasm'),fetch('actions.json')]);
  if(!wasm.ok||!actionResponse.ok)throw new Error('Could not load the game files.');
  [core,actions]=await Promise.all([wasm.arrayBuffer().then(loadCore),actionResponse.json()]);
  renderer=new PlaygroundRenderer(canvas);input=new Input(canvas,command);input.onNavigate=navigate;setMode('caldera');
  renderer.camera.position.set(2700,4000,6200);renderer.camera.lookAt(0,1700,0);
  for(const id of ['start','start-level','start-frost','start-expanse','menu-button'])$(id).disabled=false;
  write('status','Ready when you are.');requestAnimationFrame(frame);
} catch(error) {
  console.error(error);write('status','Unable to start');
  $('welcome').querySelector('p').textContent=`${error.message} Try reloading in a browser with WebGL 2 and WebAssembly.`;
  write('start','Reload game');$('start').disabled=false;$('start').addEventListener('click',()=>location.reload());
}
