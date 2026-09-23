// Hoarfrost Heights, part 1: level integrity, the surface behaviour the level
// is built on, and a proof that every leg of the main route and every Frost
// Shard can be reached with real controller input through the actual movement
// core. Negative checks prove the intended move is needed where it matters,
// and that the upper Horn (part 2) stays sealed. Timing searches stop at the
// first success. When part 2 is built, extend this file (docs/HOARFROST.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHoarfrost,FROSTBITE,ABYSS,PART1_BUDGET,ICE,VERY_SLIPPERY,NOT_SLIPPERY,DEEP_SNOW} from '../web/hoarfrost.js';
import {LevelSession,bodyCenter,formatTime} from '../web/level.js';
import {routeKit,hopper,landedOn,standingAbove,touches,range,toward,coreYaw,jump,double,climb,backflip,kicks,families,air,names} from './routes.mjs';

const world=createHoarfrost();
const kit=await routeKit(world),{core,reachable,pickup}=kit,hop=hopper(kit);
const N=Math.PI,E=Math.PI/2,W=-Math.PI/2,S=0;
const dist=(s,[x,z])=>Math.hypot(s.position[0]-x,s.position[2]-z);
// Hold the stick one way and never press anything.
const hold=dir=>()=>({dir});

// PART 2: raise the counts below (8 shards, 2 stars, 1 bonus, 9 checkpoints,
// >= 95 coins) and swap PART1_BUDGET for a whole-level budget.
test('the level is valid static geometry and leaves room for part 2',()=>{
  assert.ok(world.triangles.length<=PART1_BUDGET,`part 1 uses ${world.triangles.length} of ${PART1_BUDGET} triangles`);
  assert.ok(world.triangles.length<4096,'core capacity');
  let end=0;
  for(const shape of world.shapes){assert.equal(shape.start,end);assert.ok(shape.end>shape.start);end=shape.end;}
  assert.equal(end,world.triangles.length);
  for(const t of world.triangles) {
    for(const v of t.vertices)for(const n of v)assert.ok(Number.isInteger(n)&&Math.abs(n)<=32767);
    const [a,b,c]=t.vertices,u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
    assert.ok(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])>0,'no degenerate triangles');
  }
  // Frostbite water is only ever the lake's floor, at y=0.
  const water=world.triangles.filter(t=>t.type===FROSTBITE);assert.ok(water.length>=8);
  for(const t of water)assert.ok(t.vertices.every(v=>v[1]===0));
  // A hidden floor under everything, so gaps are gaps and not invisible walls.
  for(const [x,z] of [[-12000,-15000],[9000,13000],[0,0],[-11000,6000],[8000,-20000]])assert.equal(core.floor(x,ABYSS+100,z),ABYSS);
  const kinds=world.pickups.reduce((a,p)=>(a[p.kind]=(a[p.kind]||0)+1,a),{});
  assert.deepEqual({shard:kinds.shard,star:kinds.star,checkpoint:kinds.checkpoint},{shard:5,star:1,checkpoint:6});
  assert.ok(kinds.coin>=60);
  assert.equal(new Set(world.pickups.map(p=>p.id)).size,world.pickups.length,'unique pickup ids');
  // Every coin, shard and star hangs over solid ground, not the abyss, except
  // the coins that trace a jump over a gap (tested with that jump).
  for(const p of world.pickups.filter(p=>p.kind!=='checkpoint'&&!p.arc))
    assert.ok(core.floor(p.position[0],p.position[1],p.position[2])>p.position[1]-900,`${p.id} over ground`);
  // Every coin counts toward a checkpoint's row in the menu.
  const rows=new Set(world.checkpoints.map(c=>c.name));
  for(const p of world.pickups.filter(p=>p.kind==='coin'))assert.ok(rows.has(p.section),p.id);
});

test('every checkpoint spawns onto its own floor',()=>{
  for(const c of world.checkpoints) {
    core.reset(c.position,c.yaw);let s;
    for(let i=0;i<8;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
    assert.equal(s.position[1],c.position[1],c.name);assert.equal(s.floor,c.position[1],c.name);
    assert.equal(names[s.action],'ACT_IDLE',c.name);
  }
});

test('the surfaces behave as the level assumes',()=>{
  // Frostbite water: three wedges and a launch, like lava (and the original's snowy course).
  core.reset([0,0,4000],0);let s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(names[s.action],'ACT_LAVA_BOOST');
  for(let i=0;i<14;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(s.health,0x880-0x300);assert.ok(s.position[1]>200,'the water throws you up');
  // Ice: let go of the stick mid-run on the flat runway and you skid on...
  const runway=[-4430,6080],axis=Math.atan2(-1,-1);
  core.reset([runway[0]+Math.sin(axis)*-600,90,runway[1]+Math.cos(axis)*-600],coreYaw(axis));
  for(let i=0;i<25;i++)s=core.tick({x:0,y:80,buttons:0,yaw:coreYaw(axis+Math.PI)});
  const from=s.position.slice();
  for(let i=0;i<15;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(names[s.action],'ACT_BRAKING');assert.equal(s.floor,90);
  assert.ok(Math.hypot(s.position[0]-from[0],s.position[2]-from[2])>250,'ice skids on');
  // ...but land a jump and let go, and you stop dead even on ice.
  core.reset([runway[0]+Math.sin(axis)*-600,90,runway[1]+Math.cos(axis)*-600],coreYaw(axis));
  for(let i=0;i<14;i++)s=core.tick({x:0,y:80,buttons:i>=6&&i<12?1:0,yaw:coreYaw(axis+Math.PI)});
  for(let i=0;i<40&&air(s);i++)s=core.tick({x:0,y:80,buttons:0,yaw:coreYaw(axis+Math.PI)});
  const landed=s.position.slice();
  for(let i=0;i<20;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.ok(Math.hypot(s.position[0]-landed[0],s.position[2]-landed[2])<150,'a landing stops you');
  // ...and the grippy rock rib climbs where its icy twin cannot.
  assert.ok(world.triangles.some(t=>t.type===NOT_SLIPPERY)&&world.triangles.some(t=>t.type===VERY_SLIPPERY));
  assert.ok(reachable([4000,3650,-7100],N,[hold(N)],(s)=>!air(s)&&s.floor===4350,200),'rock rib');
  assert.ok(!reachable([4400,3650,-7100],N,[hold(N)],(s)=>!air(s)&&s.floor===4350,200),'ice twin');
  // Deep snow caps a run at 24 instead of 32.
  assert.ok(world.triangles.some(t=>t.type===DEEP_SNOW));
  core.reset([-7600,450,2250],coreYaw(W));
  for(let i=0;i<45;i++)s=core.tick({x:0,y:80,buttons:0,yaw:coreYaw(E)});
  assert.ok(s.speed<24.5&&s.speed>20,`deep snow speed ${s.speed}`);
});

test('main route, part 1: Frostmere Camp across Mirror Lake to the west shore',()=>{
  assert.ok(hop([-1500,10350],[-1600,9250],500,100,{back:300,radius:420}),'camp to the first floe');
  assert.ok(hop([-1600,9250],[-2650,8350],100,130,{back:250,radius:380}),'floe to floe');
  // The tilted floe slides you north-west at once; jump from the slide onto the runway.
  const F3=[-3350,7150],runwayEnd=[-3965,6535],d1=toward([-2650,8350],F3),d2=toward(F3,[-4430,6080]);
  const start=[-2650-Math.sin(d1)*350,130,8350-Math.cos(d1)*350];
  let slid=false;
  assert.ok(reachable(start,d1,range(500,700,50).flatMap(D1=>range(200,650,50).map(D2=>(s,n,i,m)=>{
    if(m.j1===undefined&&dist(s,F3)-520<D1)m.j1=i;
    if(m.j1!==undefined&&m.land===undefined&&i>m.j1+3&&!air(s))m.land=i;
    const on=m.land!==undefined;slid||=n==='ACT_BUTT_SLIDE';
    if(on&&m.j2===undefined&&dist(s,runwayEnd)<D2+300)m.j2=i;
    return {dir:on?d2:d1,buttons:(m.j1!==undefined&&i<m.j1+12)||(m.j2!==undefined&&i<m.j2+12)?1:0};
  })),(s)=>!air(s)&&s.floor===90,200),'slide off the tilted floe onto the runway');
  assert.ok(slid,'the tilted floe really slides you');
  // The channel needs a long jump; a running jump falls into the water.
  assert.ok(hop([-4430,6080],[-5900,4700],90,100,{back:500,radius:700,move:'long'}),'long jump to the shore');
  assert.ok(!hop([-4430,6080],[-5900,4700],90,100,{back:500,radius:700}),'a plain jump falls short');
});

test('main route, part 2: Pinewood Drifts, the fallen pine, and the ramp to the glacier',()=>{
  assert.ok(hop([-7000,3700],[-7000,3000],100,450,{back:300,radius:500}),'shore to the first terrace');
  assert.ok(hop([-7000,2500],[-7000,1800],450,850,{back:300,radius:500}),'a grab out of deep snow');
  // The fallen pine: iced over, narrow, and snapped in two. Jump the break.
  assert.ok(reachable([-7400,850,1300],N,range(100,700,25).map(d=>(s,n,i,m)=>{
    const p=[s.position[0],s.position[2]],aim=m.j!==undefined?[-7400,-800]:[-7250,120];
    if(m.j===undefined&&Math.hypot(p[0]+7250,p[1]-120)<d&&s.floor>880)m.j=i;
    return {dir:toward(p,aim),buttons:m.j!==undefined&&i<m.j+12?1:0};
  }),(s)=>!air(s)&&s.floor===1000,260),'across the fallen pine');
  assert.ok(hop([-7000,-1100],[-7000,-2000],1000,1400,{back:300,radius:500}),'the last terrace');
  assert.ok(reachable([-5300,1400,-2500],E,[hold(E)],(s)=>!air(s)&&s.floor===1800,300),'up the slippery ramp to the margin');
});

test('main route, part 3: the glacier, its crevasses and the ice chute',()=>{
  assert.ok(reachable([-3000,1800,-2100],E,families.jump(E),standingAbove(1800,[-1800,-2100],400)),'over the first crevasse');
  assert.ok(reachable([-1500,1900,-2775],E,[hold(E)],(s)=>!air(s)&&s.floor===2150&&s.position[0]>-350,200),'onto the snow bridge');
  // The chute: you slide at over 80 units a tick. Jump before the lip to clear the Great Crevasse...
  let fast=0;
  const lipJump=d=>(s,n,i,m)=>{
    if(n==='ACT_BUTT_SLIDE')fast=Math.max(fast,s.speed);
    if(m.j===undefined&&s.position[0]>2250-d&&!air(s))m.j=i;return {dir:E,buttons:m.j!==undefined&&i<m.j+12?1:0};
  };
  const landed=(s)=>!air(s)&&s.position[0]>3450&&s.floor>1700;
  const window=range(0,700,50).filter(d=>reachable([-200,2150,-2775],E,[lipJump(d)],landed,300));
  assert.ok(window.length>=8,`jump windows before the lip: ${window}`);assert.ok(fast>80,`chute speed ${fast}`);
  // The two coins over the crevasse trace a good jump.
  const arc=world.pickups.filter(p=>p.arc),caught=new Set();
  assert.ok(reachable([-200,2150,-2775],E,[lipJump(300)],(s,n)=>{for(const c of arc)if(touches(c,95)(s,n))caught.add(c.id);return landed(s);},300));
  assert.equal(caught.size,2,'a good jump collects both arc coins');
  // ...because sliding off without a jump slams into the far wall.
  assert.ok(!reachable([-200,2150,-2775],E,[hold(E)],(s)=>!air(s)&&s.position[0]>3450&&s.floor>1700,300),'the chute needs a jump');
  assert.ok(reachable([4600,1800,-2500],N,[hold(N)],(s)=>!air(s)&&s.floor===2300,300),'up the snowfield to the icefall');
});

test('main route, part 4: the icefall to the Shoulder and the Icefall Star',()=>{
  assert.ok(hop([4600,-5350],[4600,-5900],2300,2700,{back:200,radius:400}),'the first serac');
  assert.ok(reachable([4490,2700,-6200],N,range(0,8).flatMap(t=>[1,-1].map(first=>
    (s,n,i,m)=>i<8?{dir:N,mag:40}:kicks(E,W,N,3550,t+8,first)(s,n,i,m))),
    (s)=>!air(s)&&s.floor===3650&&s.position[2]<-6800,300),'950 units of wall kicks up the chimney');
  assert.ok(reachable([4000,3650,-7100],N,[hold(N)],(s)=>!air(s)&&s.floor===4350,200),'up the rock rib');
  assert.ok(hop([4200,-8650],[4200,-9300],4350,4300,{back:350,radius:400}),'over the bergschrund');
  // The star sits within reach on the cairn.
  const star=pickup('icefall-star'),cairn=[4200,4560,-9700];
  core.reset(cairn,0);const s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.ok(Math.hypot(...star.position.map((v,i)=>v-bodyCenter(s,'ACT_IDLE')[i]))<150);
  assert.ok(hop([4600,-9450],[4200,-9700],4300,4560,{back:250,radius:170}),'onto the cairn');
});

test('every Frost Shard is reachable, and the hard ones need their intended move',()=>{
  const reach=(id,start,face,plans,ticks=300)=>assert.ok(reachable(start,face,plans,touches(pickup(id)),ticks),id);
  // Watchtower: the woodshed roof, then a backflip (or double jump) to the lookout.
  assert.ok(hop([1300,12250],[2000,12250],500,900,{back:200,radius:250}),'woodshed roof');
  reach('shard-tower',[2000,900,12120],S,range(1,10).map(t=>backflip(t,N)));
  assert.ok(!reachable([2000,900,12400],N,range(0,24,2).flatMap(t=>[8,14].map(h=>jump(N,t,h))),standingAbove(1380,[2000,11775],400),110),'the lookout needs more than a jump');
  // The Lone Floe: a long hop onto a tiny ice floe. Let go of the stick as you land.
  assert.ok(hop([-2650,8350],[-1400,7250],130,110,{back:300,radius:330}),'to the side floe');
  const dir=toward([-1400,7250],[-450,6450]),start=[-1400-Math.sin(dir)*300,110,7250-Math.cos(dir)*300];
  const stopOnLanding=range(0,40,2).flatMap(t=>[6,10,14].map(h=>(s,n,i,m)=>{
    if(m.l===undefined&&i>t+3&&!air(s))m.l=i;return {dir:m.l!==undefined?null:dir,buttons:i>=t&&i<t+h?1:0};}));
  assert.ok(reachable(start,dir,stopOnLanding,(s,n)=>!air(s)&&n==='ACT_IDLE'&&s.floor===90,160),'land and stop on the lone floe');
  reach('shard-floe',start,dir,stopOnLanding,160);
  // The Great Pine: four boughs, each a jump and grab above the last.
  const pine=[-8600,1300];
  for(const [r0,r1,y0,y1] of [[null,900,850,1180],[900,640,1180,1520],[640,400,1520,1860]]) {
    const from=r0===null?[pine[0]+1300,pine[1]]:[pine[0]+r0*.9-30,pine[1]];
    assert.ok(reachable([from[0],y0+(r0===null?0:40),from[1]],W,range(0,20).flatMap(t=>[8,14].map(h=>jump(W,t,h))),standingAbove(y1-5,pine,r1+10),200),`bough ${y1}`);
  }
  assert.ok(range(0,90,22.5).some(deg=>{
    const a=deg*Math.PI/180,from=[pine[0]+Math.cos(a)*220,pine[1]-Math.sin(a)*220],face=toward(from,pine);
    return reachable([from[0],1900,from[1]],face,[0,6,12].flatMap(back=>range(0,16).flatMap(t=>[10,14].map(h=>(s,n,i,m)=>
      climb(face,n,m)||(i<back?{dir:face+Math.PI,mag:30}:{dir:face,buttons:i>=back+t&&i<back+t+h?1:0})))),standingAbove(2195,pine,200),120);
  }),'the crown bough');
  reach('shard-pine',[pine[0]+150,2290,pine[1]],W,range(0,20).map(t=>jump(W,t,10)),120);
  // The crevasse: hang from the edge, drop onto the ledge, then wall-kick out.
  assert.ok(reachable([-2800,1800,-2700],E,[(s,n,i,m)=>{if(n==='ACT_LEDGE_GRAB')m.h=(m.h||0)+1;return m.h>12?{dir:null,buttons:4}:{dir:E,mag:28};}],
    (s)=>!air(s)&&s.floor===1150,200),'drop onto the crevasse ledge');
  reach('shard-crevasse',[-2420,1150,-2700],W,[()=>({dir:null})],10);
  assert.ok(reachable([-2420,1150,-2700],E,range(0,8).flatMap(t=>[1,-1].map(first=>kicks(E,W,E,1750,t,first))),
    standingAbove(1790,[-1900,-2700],600),300),'kick back out of the crevasse');
  // The serac needle: a double jump from the chimney top; a single jump falls short.
  const needle=[5300,-7760],up=toward([5300,-7300],needle);
  assert.ok(reachable([5300,3650,-7000],up,families.double(up),standingAbove(4225,needle,130),200),'needle');
  assert.ok(!reachable([5300,3650,-7000],up,range(0,30,2).flatMap(t=>[8,14].map(h=>jump(up,t,h))),standingAbove(4225,needle,130),110),'the needle needs a double jump');
});

test('the lake side loop leads back to camp',()=>{
  const loop=[[[-450,6450],[350,6000],90,100,{back:120,radius:300}],[[350,6000],[1300,5800],100,250,{back:200,radius:500}],
    [[1600,6300],[1700,7300],250,110,{back:300,radius:320}],[[1700,7300],[1000,8450],110,120,{back:250,radius:350}],
    [[1000,8450],[200,9500],120,110,{back:250,radius:350}],[[200,9500],[200,10500],110,500,{back:300,radius:400}]];
  for(const [from,to,a,b,options] of loop)assert.ok(hop(from,to,a,b,options),`${from} -> ${to}`);
});

// PART 2: replace this test with route proofs for the Frozen Falls, Gale Ridge,
// the summit and the Avalanche Run (docs/HOARFROST.md, the part 2 checklist).
test('part 2 stays sealed: the upper Horn cannot be climbed from the Shoulder',()=>{
  // Run, jump and double jump north at the Horn's face and west up the snowbank.
  // (The hut's roof peaks at 4,870; the Horn and the snowbank rise past 5,200.)
  for(const [x,dir] of [[4600,N],[5200,N],[6300,N],[3700,W]]) {
    const plans=[hold(dir),...range(0,20,4).map(t=>jump(dir,t,14)),...range(0,20,4).map(t=>double(dir,t,14,14))];
    assert.ok(!reachable([x,4300,-9450],dir,plans,(s)=>!air(s)&&s.position[1]>5000,160),`sealed at x ${x}`);
  }
});

// PART 2: the Aurora Star becomes the goal; all 8 shards reveal the Polar Star.
test('level session: the Icefall Star is the goal and stops the clock',()=>{
  const session=new LevelSession(world);
  const standAt=p=>({position:[p[0],p[1]-80,p[2]],yaw:0,velocity:[0,0,0],speed:0,health:0x880,action:0x0C400201,animation:197,frame:0,tick:0});
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  assert.deepEqual(session.collect(standAt(pickup('icefall-star').position),'ACT_IDLE').map(e=>e.type),['star']);
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  assert.equal(formatTime(session.time),'0:01.0');assert.equal(session.stars,1);
  // No bonus star in part 1, so finding every shard reveals nothing yet.
  const events=world.pickups.filter(p=>p.kind==='shard').flatMap(p=>session.collect(standAt(p.position),'ACT_IDLE'));
  assert.equal(events.filter(e=>e.type==='shard').length,5);assert.ok(!events.some(e=>e.type==='reveal'));
  // The copy the menu and victory dialog show.
  assert.equal(world.goal,'icefall-star');
  for(const goal of world.text.objectives.filter(g=>g.star))assert.ok(pickup(goal.star),goal.star);
  const shards=session.count('shard');
  assert.match(world.text.victory('star',{session,shards,best:'1:00.0'}).copy,/every Frost Shard/);
  assert.match(world.text.victory('star',{session,shards:{found:3,total:5},best:'1:00.0'}).copy,/best 1:00.0\. 2 Frost Shards still hide/);
});

test('native GCC and WASM agree on every byte in Hoarfrost Heights',()=>{
  for(const [index,c] of world.checkpoints.entries()) {
    let seed=0x7100+index;
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
