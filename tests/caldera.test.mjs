// Cinder Caldera: level integrity, objectives, and a proof that every leg of
// the main route and every shard can be reached with real controller input
// through the actual movement core. Timing searches stop at the first success.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadCore} from '../web/engine.js';
import {createCaldera,LAVA,HANGABLE} from '../web/caldera.js';
import {LevelSession,bodyCenter,formatTime} from '../web/level.js';

const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const names=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
const world=createCaldera();
const core=await loadCore(bytes);core.loadWorld(world.triangles);
const air=s=>!!(s.action&0x800);
const range=(a,b,step=1)=>Array.from({length:Math.floor((b-a)/step)+1},(_,i)=>a+i*step);
const polar=(r,deg)=>[r*Math.cos(deg*Math.PI/180),-r*Math.sin(deg*Math.PI/180)];
const diagonal=rho=>[rho*Math.SQRT1_2,-rho*Math.SQRT1_2];
const toward=(from,to)=>Math.atan2(to[0]-from[0],to[1]-from[1]);
const coreYaw=r=>((Math.round(r*32768/Math.PI)%65536)+65536)%65536;

// Push the stick toward world yaw `dir` (radians, 0 = +Z) with the camera behind.
function run(start,face,plan,done,ticks) {
  core.reset(start,coreYaw(face));const memory={};let s=core.state();
  for(let i=0;i<ticks;i++) {
    const {dir=face,mag=80,buttons=0}=plan(s,names[s.action],i,memory)||{};
    s=core.tick(dir===null?{x:0,y:0,buttons,yaw:0}:{x:0,y:mag,buttons,yaw:coreYaw(dir+Math.PI)});
    const name=names[s.action];
    if(name.includes('LAVA'))return false;
    if(done(s,name))return true;
  }
  return false;
}
const landedOn=(top,[x,z],radius)=>(s,n)=>!air(s)&&!n.includes('LEDGE')&&s.floor===top&&Math.hypot(s.position[0]-x,s.position[2]-z)<radius;
const touches=pickup=>(s,n)=>Math.hypot(...pickup.position.map((v,i)=>v-bodyCenter(s,n)[i]))<115;
// Plans. After a ledge grab they wait a beat and press A to climb quickly.
const climb=(dir,n,m)=>{if(n==='ACT_LEDGE_GRAB'){m.g=(m.g||0)+1;return {dir,buttons:m.g===3?1:0};}if(n.includes('LEDGE_CLIMB'))return {dir:null};};
const jump=(dir,t,h)=>(s,n,i,m)=>climb(dir,n,m)||{dir,buttons:i>=t&&i<t+h?1:0};
const longJump=(dir,t,h)=>(s,n,i)=>({dir,buttons:i===t?4:i>t&&i<t+h?5:0});
const double=(dir,t,h,h2)=>(s,n,i,m)=>{
  const c=climb(dir,n,m);if(c)return c;
  if(n.includes('LAND')&&m.l===undefined&&i>t)m.l=i;
  return {dir,buttons:(i>=t&&i<t+h)||(m.l!==undefined&&i>=m.l&&i<m.l+h2)?1:0};
};
const standingDouble=(dir,t,h,move)=>(s,n,i,m)=>{
  const c=climb(dir,n,m);if(c)return c;
  if(n.includes('LAND')&&m.l===undefined&&i>t)m.l=i;
  return {dir:i>=move?dir:null,buttons:(i>=t&&i<t+3)||(m.l!==undefined&&i>=m.l&&i<m.l+h)?1:0};
};
const backflip=t=>(s,n,i)=>({dir:null,buttons:i<t?4:i<t+14?5:0});
// Alternate kicks between two walls (`a`/`b` directions), finishing toward `exit`.
const kicks=(a,b,exit,topOut,t,first)=>(s,n,i,m)=>{
  const c=climb(exit,n,m);if(c)return c;
  if(m.d===undefined)m.d=first;
  let buttons=i===t?1:0;if(n==='ACT_AIR_HIT_WALL'){buttons=1;m.d*=-1;}
  const high=s.position[1]>topOut;
  return {dir:high?exit:m.d>0?a:b,mag:high?60:80,buttons};
};
// Hang: jump holding A, travel toward `goal` (through `via`), let go near it.
const hang=(dir0,t,goal,release,via)=>(s,n,i,m)=>{
  if(i<t)return {dir:dir0};
  const p=[s.position[0],s.position[2]];
  if(via&&!m.via&&Math.hypot(p[0]-via[0],p[1]-via[1])<60)m.via=1;
  const aim=via&&!m.via?via:goal,near=release>0&&Math.hypot(p[0]-goal[0],p[1]-goal[1])<release;
  return {dir:near?null:Math.atan2(aim[0]-p[0],aim[1]-p[1]),buttons:near?0:1};
};
const families={
  jump:dir=>range(0,40,2).flatMap(t=>[4,8,14].map(h=>jump(dir,t,h))),
  long:dir=>range(2,40,2).flatMap(t=>[6,10,14].map(h=>longJump(dir,t,h))),
  double:dir=>range(0,30,2).flatMap(t=>[[3,14],[4,8],[8,14],[14,14]].map(([h,h2])=>double(dir,t,h,h2))),
};
function reachable(start,face,plans,done,ticks=180) {
  return plans.some(plan=>run(start,face,plan,done,ticks));
}
// From `back` units behind `from`, run at `to` (both [x,z]) with a move family.
function hop(from,to,fromTop,toTop,{back=150,radius=200,move='jump'}={}) {
  const dir=toward(from,to),start=[from[0]-Math.sin(dir)*back,fromTop,from[1]-Math.cos(dir)*back];
  return reachable(start,dir,families[move](dir),landedOn(toTop,to,radius));
}
const pickup=id=>world.pickups.find(p=>p.id===id);

test('the caldera is valid static geometry for the core',()=>{
  let end=0;
  for(const shape of world.shapes){assert.equal(shape.start,end);assert.ok(shape.end>shape.start);end=shape.end;}
  assert.equal(end,world.triangles.length);
  for(const t of world.triangles) {
    for(const v of t.vertices)for(const n of v)assert.ok(Number.isInteger(n));
    const [a,b,c]=t.vertices,u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
    assert.ok(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])>0,'no degenerate triangles');
  }
  // Lava is only ever a floor; grates are only ever ceilings.
  for(const t of world.triangles.filter(t=>t.type===LAVA))assert.ok(t.vertices.every(v=>v[1]===0));
  const hang=world.triangles.filter(t=>t.type===HANGABLE);assert.ok(hang.length>=6);
  for(const t of hang)assert.ok(t.vertices.every(v=>v[1]===2600));
  const kinds=world.pickups.reduce((a,p)=>(a[p.kind]=(a[p.kind]||0)+1,a),{});
  assert.deepEqual({shard:kinds.shard,star:kinds.star,bonus:kinds.bonus,checkpoint:kinds.checkpoint},{shard:8,star:1,bonus:1,checkpoint:5});
  assert.ok(kinds.coin>=40);
  assert.equal(new Set(world.pickups.map(p=>p.id)).size,world.pickups.length,'unique pickup ids');
});

test('every checkpoint spawns onto its own floor, clear of the lava',()=>{
  for(const c of world.checkpoints) {
    core.reset(c.position,c.yaw);let s;
    for(let i=0;i<8;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
    assert.equal(s.position[1],c.position[1],c.name);assert.equal(s.floor,c.position[1],c.name);
    assert.equal(names[s.action],'ACT_IDLE',c.name);
  }
});

test('lava burns three wedges and launches; a coin heals one',()=>{
  core.reset([0,300,4500],0);
  let s;for(let i=0;i<20;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  core.reset([2000,0,1500],0);s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(names[s.action],'ACT_LAVA_BOOST');
  for(let i=0;i<14;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(s.health,0x880-0x300);assert.ok(s.position[1]>300,'the boost launches upward');
  core.heal(4);for(let i=0;i<6;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(s.health,0x880-0x200);
});

test('main route, part 1: landing, basalt steps, and the long jump to the Forge',()=>{
  const legs=[[[-750,4610],[-1560,4560],300,340,{back:400}],[[-1560,4560],[-2200,4250],340,420,{back:180}],
    [[-2200,4250],[-2800,3820],420,380],[[-2800,3820],[-3230,3230],380,470,{back:130}],
    [[-3230,3230],[-3560,2560],470,430,{back:120}],[[-3560,2560],[-3700,1700],430,480,{back:110,radius:420}],
    [[-3700,1950],[-3900,0],480,420,{back:0,radius:900,move:'long'}]];
  for(const [from,to,a,b,options] of legs)assert.ok(hop(from,to,a,b,options),`${from} -> ${to}`);
});

test('main route, part 2: rampart, backflip step, and the chimney wall kicks',()=>{
  assert.ok(hop([-3900,-300],[-3900,-1000],420,760,{back:300,radius:700}),'ledge-grab step');
  assert.ok(reachable([-3900,760,-900],0,range(1,10).map(backflip),landedOn(1190,[-3900,-1200],700)),'backflip step');
  const north=Math.PI;
  assert.ok(reachable([-3900,1190,-1150],north,range(0,8).flatMap(t=>[1,-1].map(first=>
    (s,n,i,m)=>i<6?{dir:north,mag:40}:kicks(Math.PI/2,-Math.PI/2,north,2150,t+6,first)(s,n,i,m))),
    landedOn(2350,[-3900,-1900],1000),260),'1,160 units of wall kicks to the crown');
});

test('main route, part 3: chain bridge hang traverses and Obsidian Ridge',()=>{
  assert.ok(reachable([-3850,2350,-2050],Math.PI,range(0,12,2).map(t=>hang(Math.PI,t,[-3850,-3250],120)),
    landedOn(2300,[-3850,-3250],230),400),'grate A to post 1');
  assert.ok(hop([-3850,-3250],[-3250,-3650],2300,2300,{radius:170}),'post 1 to post 2');
  assert.ok(reachable([-3350,2300,-3650],Math.PI/2,range(0,12,2).map(t=>hang(Math.PI/2,t,[-2450,-3650],90)),
    landedOn(2250,[-2200,-3700],600),400),'grate B to the bell tower');
  assert.ok(reachable([-2000,2250,-3700],Math.PI/2,range(0,50,2).map(t=>(s,n,i)=>({dir:Math.PI/2,buttons:i>=t&&i<t+6?1:0})),
    landedOn(2150,[-650,-3700],190),200),'the narrow beam');
  assert.ok(hop([-650,-3700],[-150,-3470],2150,2050,{radius:90}),'post to blade');
  assert.ok(hop([180,-3580],[560,-3330],2050,1950,{back:120,radius:90}),'blade to blade');
  assert.ok(hop([720,-3300],[1380,-3380],1950,1850,{back:180,radius:170}),'blade to post');
  assert.ok(hop([1380,-3380],diagonal(3625),1850,1500,{radius:560,move:'long'}),'long jump to the shelf');
  const shelf=diagonal(3450);
  assert.ok(reachable([shelf[0],1500,shelf[1]],-Math.PI/4,[(s,n)=>({dir:-Math.PI/4})],landedOn(900,diagonal(1250),700),300),'the chute');
});

test('main route, part 4: the Spire spiral to the Ember Star',()=>{
  const axis=[Math.cos(220*Math.PI/180),-Math.sin(220*Math.PI/180)],tangent=[axis[1],-axis[0]];
  const local=(r,t)=>[axis[0]*r+tangent[0]*t,axis[1]*r+tangent[1]*t],inward=Math.atan2(-axis[0],-axis[1]);
  assert.ok(hop([450,-900],polar(845,91),900,1080,{back:120,radius:150}),'gate to L1');
  assert.ok(hop(polar(845,91),polar(845,135),1080,1300,{back:100,radius:150}),'L1 to L2');
  assert.ok(hop(polar(845,135),polar(845,180),1300,1520,{back:100,radius:170}),'L2 to L3');
  const floor=local(1165,100);
  assert.ok(reachable([floor[0],1520,floor[1]],inward,range(0,8).flatMap(t=>[1,-1].map(first=>kicks(inward,inward+Math.PI,inward,2150,t,first))),
    landedOn(2320,local(810,100),260),300),'kick corridor');
  assert.ok(hop(local(810,300),polar(795,272),2320,2420,{back:120,radius:120}),'annex to L6');
  const at=polar(795,281),away=toward(at,polar(795,270));
  assert.ok(reachable([at[0],2420,at[1]],away,range(1,8).map(backflip),landedOn(2840,polar(825,306),200)),'backflip step');
  const from=polar(795,268),dir=toward(from,polar(825,306));
  assert.ok(reachable([from[0],2420,from[1]],dir,range(0,6).flatMap(t=>[8,14].flatMap(h=>[0,3,6].map(mv=>standingDouble(dir,t,h,mv)))),
    landedOn(2840,polar(825,306),200)),'or a standing double jump');
  assert.ok(hop(polar(825,306),polar(900,377),2840,2780,{back:120,radius:230}),'L7 to L8');
  assert.ok(hop(polar(1060,377),[0,0],2780,3200,{back:0,radius:760,move:'double'}),'the summit rim');
  // The star sits within reach of the summit.
  const star=pickup('ember-star');core.reset([0,3200,0],0);
  const s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.ok(Math.hypot(...star.position.map((v,i)=>v-bodyCenter(s,'ACT_IDLE')[i]))<150);
});

test('every Ember Shard is reachable, and the hard ones need their intended move',()=>{
  const reach=(id,start,face,plans,ticks=300)=>assert.ok(reachable(start,face,plans,touches(pickup(id)),ticks),id);
  // Gate pillars: wall kicks between them.
  reach('shard-gate',[-910,300,4610],-Math.PI/2,range(0,8).flatMap(t=>[1,-1].map(first=>kicks(0,Math.PI,0,1120,t,first))));
  // Lone column, and back.
  assert.ok(hop([-2800,3820],[-2210,3380],380,330,{back:140,radius:120}),'to the lone column');
  assert.ok(hop([-2210,3380],[-2800,3820],330,380,{back:110,radius:150}),'back from the lone column');
  // Anvil roof: a running double jump reaches it; a single jump cannot.
  assert.ok(hop([-3300,-200],[-4400,-200],420,960,{back:0,radius:220,move:'double'}),'anvil roof');
  assert.ok(!hop([-3300,-200],[-4400,-200],420,960,{back:0,radius:220}),'anvil roof needs a double jump');
  // Flue: a double jump and grab onto a thin stack.
  assert.ok(hop([-3650,-2150],[-3300,-2150],2350,2830,{back:0,radius:110,move:'double'}),'flue');
  // Spur: hang out to the end of the dead-end grate.
  reach('shard-spur',[-3350,2300,-3650],Math.PI/2,range(0,8,2).map(t=>hang(Math.PI/2,t,[-2900,-3040],0,[-2900,-3650])),500);
  // Belfry roof: double jump from outside the roof; a single jump cannot.
  assert.ok(hop([-2700,-3700],[-2000,-3700],2250,2740,{back:0,radius:200,move:'double'}),'belfry roof');
  assert.ok(!hop([-2700,-3700],[-2000,-3700],2250,2740,{back:0,radius:200}),'belfry needs a double jump');
  // Chute: jump mid-slide.
  const shelf=diagonal(3450);
  reach('shard-chute',[shelf[0],1500,shelf[1]],-Math.PI/4,range(0,40).map(t=>(s,n,i)=>({dir:-Math.PI/4,buttons:i>=t&&i<t+10?1:0})),200);
  // Perch beyond the corridor, and back.
  assert.ok(hop(polar(860,262),polar(1420,256),2420,2350,{back:120,radius:90}),'to the perch');
  assert.ok(hop(polar(1420,256),polar(830,264),2350,2420,{back:80,radius:130}),'back from the perch');
  // The Crimson Star's altar takes a long jump from the landing; a plain jump falls short.
  assert.ok(hop([0,4150],[0,2500],300,200,{back:0,radius:240,move:'long'}),'altar long jump');
  assert.ok(!hop([0,4150],[0,2500],300,200,{back:0,radius:240}),'altar needs a long jump');
});

test('level session: coins, shards, checkpoints, the star, and the bonus reveal',()=>{
  const session=new LevelSession(world);
  const standAt=p=>({position:[p[0],p[1]-80,p[2]],yaw:0,velocity:[0,0,0],speed:0,action:0x0C400201,animation:197,frame:0,tick:0});
  const coin=world.pickups.find(p=>p.kind==='coin');
  assert.deepEqual(session.collect(standAt(coin.position),'ACT_IDLE').map(e=>e.type),['coin']);
  assert.equal(session.collect(standAt(coin.position),'ACT_IDLE').length,0,'collected once');
  // The bonus star is not collectable until all eight shards are found.
  const bonus=pickup('crimson-star');
  assert.equal(session.collect(standAt(bonus.position),'ACT_IDLE').length,0);
  const shards=world.pickups.filter(p=>p.kind==='shard');
  const types=shards.flatMap(s=>session.collect(standAt(s.position),'ACT_IDLE').map(e=>e.type));
  assert.equal(types.filter(t=>t==='shard').length,8);assert.equal(types.at(-1),'reveal');
  assert.ok(session.revealed.has('crimson-star'));
  // Checkpoints light on foot and become the respawn point.
  const forge=world.checkpoints[1];
  const events=session.collect({...standAt(forge.position),position:forge.position},'ACT_IDLE');
  assert.deepEqual(events.map(e=>[e.type,e.first]),[['checkpoint',true]]);
  assert.equal(session.respawn().id,'forge');assert.equal(session.deaths,1);
  // The clock starts on input and stops at the Ember Star.
  session.tick({x:0,y:0,buttons:0});assert.equal(session.ticks,0);
  for(let i=0;i<45;i++)session.tick({x:0,y:80,buttons:0});
  assert.deepEqual(session.collect(standAt(pickup('ember-star').position),'ACT_IDLE').map(e=>e.type),['star']);
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  assert.equal(session.time,1.5);assert.equal(formatTime(session.time),'0:01.5');assert.equal(session.stars,1);
  assert.deepEqual(session.collect(standAt(bonus.position),'ACT_IDLE').map(e=>e.type),['bonus']);assert.equal(session.stars,2);
});

test('native GCC and WASM agree on every byte in the caldera, including coin heals',()=>{
  for(const [index,c] of world.checkpoints.entries()) {
    let seed=0x5a00+index;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const inputs=Array.from({length:300},(_,i)=>({
      x:i<60?0:(random()%161)-80,y:i<60?80:(random()%161)-80,
      buttons:(i%50<10?1:0)|(i%71===30?2:0)|(i%97>93?4:0),yaw:Math.round(c.camera*32768/Math.PI),
      ...(i%40===20?{heal:4}:{}),
    }));
    const native=spawnSync('python3',['tests/trace_native.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:4*1024*1024,
      input:JSON.stringify({triangles:world.triangles,position:c.position,yaw:c.yaw,inputs})});
    assert.equal(native.status,0,native.stderr);
    const expected=JSON.parse(native.stdout);
    core.reset(c.position,c.yaw);
    inputs.forEach((input,i)=>{
      if(input.heal)core.heal(input.heal);core.tick(input);
      assert.equal(Buffer.from(core.stateBytes()).toString('hex'),expected[i],`${c.name}, tick ${i}`);
    });
  }
});
