import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from '../web/world.js';
import {createCaldera} from '../web/caldera.js';
import {LevelSession,bodyCenter,formatTime} from '../web/level.js';
import {loadCore,FixedClock} from '../web/engine.js';
import {SURFACE,COIN_HEAL,healthWedges,respawnReason} from '../web/rules.js';
import {DEFAULT_SETTINGS,loadSettings,saveSettings} from '../web/settings.js';

const playground=createWorld(),caldera=createCaldera();
const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const actions=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
const standAt=position=>({position:[position[0],position[1]-80,position[2]],yaw:0,velocity:[0,0,0],
  speed:0,health:0x880,action:0x0C400201,animation:197,frame:0,tick:0});

for(const world of [playground,caldera])test(`${world.name}: shared coins, checkpoint recovery and restart`,()=>{
  const session=new LevelSession(world),coin=world.pickups.find(p=>p.kind==='coin');
  assert.equal(world.pickups.some(p=>p.kind==='spark'),false);
  const events=session.collect(standAt(coin.position),'ACT_IDLE');
  assert.equal(events.find(e=>e.type==='coin').heal,COIN_HEAL);
  assert.equal(session.collect(standAt(coin.position),'ACT_IDLE').length,0);
  const checkpoint=world.checkpoints[1];
  session.collect({...standAt(checkpoint.position),position:checkpoint.position},'ACT_IDLE');
  assert.equal(session.checkpoint,1);
  assert.equal(session.respawn(),checkpoint);assert.equal(session.deaths,1);
  assert.ok(session.found.has(coin.id),'a retry keeps coins');
  assert.ok(session.lit.has(`checkpoint-${checkpoint.id}`),'a retry keeps checkpoint unlocks');
  session.reset();assert.equal(session.found.size,0);assert.equal(session.checkpoint,0);assert.equal(session.deaths,0);
});

test('world sessions keep independent progress and only reached adventure checkpoints allow travel',()=>{
  const practice=new LevelSession(playground),adventure=new LevelSession(caldera);
  assert.equal(adventure.visit(4),null);assert.equal(adventure.checkpoint,0);
  assert.equal(practice.visit(10),playground.zones[10]);assert.ok(practice.lit.has('checkpoint-practice-11'));
  assert.equal(practice.visit(-1),null);assert.equal(practice.visit(99),null);
  const coin=caldera.pickups.find(p=>p.kind==='coin');adventure.collect(standAt(coin.position),'ACT_IDLE');
  practice.reset();assert.ok(adventure.found.has(coin.id));
  assert.equal(practice.count('coin').found,0);assert.equal(practice.revealed.size,0);
});

test('a knockout cannot pick up healing, finish the level, or change its checkpoint',()=>{
  const session=new LevelSession(caldera);
  for(const p of caldera.pickups.filter(p=>['coin','star','checkpoint'].includes(p.kind))) {
    const state={...standAt(p.position),health:0xff};if(p.kind==='checkpoint')state.position=p.position;
    assert.deepEqual(session.collect(state,'ACT_STANDING_DEATH'),[]);
  }
  assert.equal(session.found.size,0);assert.equal(session.checkpoint,0);assert.equal(session.finishTicks,null);
});

test('both worlds use the same power meter, fall detection, lava damage and coin healing',async()=>{
  const core=await loadCore(bytes);
  for(const [world,position] of [[playground,[-2400,-160,4700]],[caldera,[2000,0,1500]]]) {
    core.loadWorld(world.triangles);core.reset(position,0);
    let state=core.tick({x:0,y:0,buttons:0,yaw:0});assert.equal(actions[state.action],'ACT_LAVA_BOOST');
    for(let i=0;i<14;i++)state=core.tick({x:0,y:0,buttons:0,yaw:0});
    assert.equal(state.health,0x580);assert.equal(healthWedges(state.health),5);
    core.heal(COIN_HEAL);for(let i=0;i<6;i++)state=core.tick({x:0,y:0,buttons:0,yaw:0});
    assert.equal(state.health,0x680);assert.equal(healthWedges(state.health),6);assert.equal(respawnReason(state),null);
    assert.ok(respawnReason({...state,health:0xff}));assert.ok(respawnReason({...state,position:[0,-1501,0]}));
    assert.ok(respawnReason({...state,floor:-11000}));
  }
  assert.equal(healthWedges(0x880),8);assert.equal(healthWedges(-1),0);
  assert.ok(playground.triangles.filter(t=>t.type===SURFACE.LAVA).every(t=>t.vertices.every(v=>v[1]===-160)));
});

test('the connected lava practice route and its healing coins are reachable without touching lava',async()=>{
  const core=await loadCore(bytes);core.loadWorld(playground.triangles);
  const coins=playground.pickups.filter(p=>p.route==='Lava crossing');
  const stops=[[-2800,0,3500],[-2800,160,4200],[-1850,180,4480],[-900,220,5000],[-900,0,5700]];
  for(let i=0;i<stops.length-1;i++) {
    const from=stops[i],to=stops[i+1],yaw=Math.round(Math.atan2(to[0]-from[0],to[2]-from[2])*32768/Math.PI)&65535;
    let success=false;
    for(const move of ['jump','long'])for(let jumpAt=0;jumpAt<16&&!success;jumpAt++) {
      core.reset(from,yaw);let collected=false;
      for(let t=0;t<100;t++) {
        const s=core.state(),near=Math.hypot(s.position[0]-to[0],s.position[2]-to[2])<80;
        const buttons=move==='jump'?(t>=jumpAt&&t<jumpAt+12?1:0):(t===jumpAt?4:t>jumpAt&&t<jumpAt+10?5:0);
        const next=core.tick({x:0,y:near?0:80,buttons,yaw:(yaw+32768)&65535}),name=actions[next.action];
        if(name.includes('LAVA')||next.health<0x880)break;
        collected ||= Math.hypot(...coins[i].position.map((v,j)=>v-bodyCenter(next,name)[j]))<95;
        if(collected&&!(next.action&0x800)&&next.floor===to[1]&&Math.hypot(next.position[0]-to[0],next.position[2]-to[2])<240){success=true;break;}
      }
    }
    assert.ok(success,`${from} -> ${to}`);
  }
});

test('a modal opened during catch-up stops further simulation ticks',()=>{
  const clock=new FixedClock();let ticks=0;
  clock.advance(.2,()=>{ticks++;return false;});assert.equal(ticks,1);
  clock.advance(.02,()=>ticks++);assert.equal(ticks,1);
  clock.advance(.02,()=>ticks++);assert.equal(ticks,2);
});

test('settings default to clean play, validate saved values, and survive unavailable storage',()=>{
  let value=null;const storage={getItem:()=>value,setItem:(_key,next)=>value=next};
  assert.deepEqual(loadSettings(storage),DEFAULT_SETTINGS);
  saveSettings({...DEFAULT_SETTINGS,developer:true,timer:true,volume:.35,deadzone:.2},storage);
  assert.equal(loadSettings(storage).developer,true);assert.equal(loadSettings(storage).timer,true);
  assert.equal(loadSettings(storage).volume,.35);assert.equal(loadSettings(storage).deadzone,.2);
  value='{"developer":"true","hints":false,"timer":7,"volume":"loud","deadzone":0.9,"obsolete":true}';
  assert.deepEqual(loadSettings(storage),{...DEFAULT_SETTINGS,hints:false,deadzone:.35});
  value='{"volume":-2,"deadzone":null}';
  assert.deepEqual(loadSettings(storage),{...DEFAULT_SETTINGS,volume:0});
  value='not json';assert.deepEqual(loadSettings(storage),DEFAULT_SETTINGS);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.deepEqual(loadSettings(blocked),DEFAULT_SETTINGS);assert.doesNotThrow(()=>saveSettings(DEFAULT_SETTINGS,blocked));
});

test('run times round cleanly across the minute boundary',()=>{
  assert.equal(formatTime(59.96),'1:00.0');assert.equal(formatTime(119.96),'2:00.0');assert.equal(formatTime(0),'0:00.0');
});
