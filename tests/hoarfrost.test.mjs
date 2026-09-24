// Hoarfrost Heights: level integrity, the surface behaviour the level is built
// on, and a proof that every leg of the main route, every Frost Shard and the
// Polar Star can be reached with real controller input through the actual
// movement core. Negative checks prove the intended move is needed where it
// matters. Timing searches stop at the first success.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHoarfrost,FROSTBITE,ABYSS,BUDGET,TOP,ICE,VERY_SLIPPERY,NOT_SLIPPERY,DEEP_SNOW,WIND,HANGABLE} from '../web/hoarfrost.js';
import {LevelSession,bodyCenter,formatTime} from '../web/level.js';
import {routeKit,hopper,landedOn,standingAbove,touches,range,toward,coreYaw,jump,longJump,double,climb,backflip,kicks,families,air,names} from './routes.mjs';

const world=createHoarfrost();
const kit=await routeKit(world),{core,run,reachable,pickup}=kit,hop=hopper(kit);
const N=Math.PI,E=Math.PI/2,W=-Math.PI/2,S=0;
const dist=(s,[x,z])=>Math.hypot(s.position[0]-x,s.position[2]-z);
// Hold the stick one way and never press anything.
const hold=dir=>()=>({dir});
// Stop pressing anything once hanging: plain jumps that must not use a ceiling.
const noHang=plan=>(s,n,i,m)=>{if(n.includes('HANG'))m.h=1;return m.h?{dir:null}:plan(s,n,i,m);};
// A failed attempt from a floor at `y` is over once it falls well below it, or
// stands on it again after `after` ticks, its jumps spent.
const settled=(y,after=90)=>(s,n,i)=>s.position[1]<y-100||i>after&&!air(s)&&!n.includes('LEDGE')&&s.floor===y;

test('the level is valid static geometry within its triangle budget',()=>{
  assert.ok(world.triangles.length<=BUDGET,`${world.triangles.length} of ${BUDGET} triangles`);
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
  assert.deepEqual(kinds,{shard:8,star:2,bonus:1,checkpoint:9,coin:100});
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
  // The gale: stand still on a Gale Ridge path and it blows you off its open
  // edge, south. The Weathervane's tower top is out of it.
  assert.ok(world.triangles.some(t=>t.type===WIND)&&world.triangles.some(t=>t.type===HANGABLE));
  const [a,c]=world.gale[0],middle=a.map((v,i)=>Math.round((v+c[i])/2));
  core.reset(middle,coreYaw(N));let blown=false;
  for(let i=0;i<60&&!blown;i++){s=core.tick({x:0,y:0,buttons:0,yaw:0});blown=s.position[1]<middle[1]-100&&s.position[2]>middle[2]+140;}
  assert.ok(blown,'the gale blows you off the path');
  core.reset(world.vane,coreYaw(N));
  for(let i=0;i<150;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(names[s.action],'ACT_IDLE');assert.equal(s.floor,world.vane[1]);
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
  const arc=world.pickups.filter(p=>p.arc&&p.section==='Glacier Margin'),caught=new Set();
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

test('the lower Frost Shards are reachable, and the hard ones need their intended move',()=>{
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

// The Frozen Falls' overhang: from the near ledge, jump up and hang, traverse
// west and let go over the far ledge.
const onFarLedge=(s,n)=>!air(s)&&!n.includes('HANG')&&s.position[1]===5300&&s.position[0]<-910;
const hangWest=(x,wait)=>(s,n,i,m)=>{
  if(i<wait)return {dir:null};if(m.let||(n.includes('HANG')&&s.position[0]<x))m.let=1;
  return m.let?{dir:null}:{dir:W,buttons:1};
};

test('main route, part 5: the ledges west, and up the Frozen Falls',()=>{
  // Along the foot of the face, broken twice: jump each break.
  assert.ok(reachable([3700,4300,-10320],W,[hold(W)],(s)=>!air(s)&&s.floor===4300&&s.position[0]<3000,120),'onto the ledge trail');
  assert.ok(hop([2800,-10335],[2250,-10355],4300,4300,{back:300,radius:200}),'the first break');
  assert.ok(hop([1900,-10100],[1250,-10100],4300,4300,{back:350,radius:250}),'the second break');
  assert.ok(!reachable([2100,4300,-10100],W,[hold(W)],(s)=>!air(s)&&s.floor===4300&&s.position[0]<1400,120),'walking off the break falls');
  // Wall-kick up between the frozen curtain and the serac: nothing less reaches its top.
  assert.ok(reachable([1050,4300,-10050],N,range(0,8).flatMap(t=>[1,-1].map(first=>kicks(N,S,S,5150,t,first))),
    (s)=>!air(s)&&s.floor===5100,300),'wall kicks up to the serac');
  assert.ok(!reachable([1050,4300,-10050],S,[...families.jump(S),...families.double(S),...range(1,10).map(t=>backflip(t,S))],
    (s)=>!air(s)&&s.floor===5100,120,{lost:settled(4300)}),'the serac needs wall kicks');
  const d=toward([800,-9700],[380,-10100]);
  assert.ok(reachable([800,5100,-9700],d,range(0,20,2).flatMap(t=>[8,14].map(h=>jump(d,t,h))),
    (s)=>!air(s)&&s.position[1]===5300&&s.position[0]<510,120),'from the serac to the near ledge');
  // Hang from the icicle overhang across the curtain, collecting the coin along
  // it. No plain or double jump reaches the far ledge (an expert's long jump
  // from the very edge can just grab its rim).
  const coin=world.pickups.find(p=>p.arc&&p.section==='The Shoulder');let caught;
  assert.ok(range(1,10).some(t=>{caught=false;
    return run([300,5300,-10100],W,hangWest(-960,t),(s,n)=>{caught||=touches(coin,95)(s,n);return onFarLedge(s,n);},600);}),'hang across the curtain');
  assert.ok(caught,'the hang collects the coin along it');
  assert.ok(!reachable([490,5300,-10100],W,[...families.jump(W),...families.double(W)].map(noHang),onFarLedge,150,{lost:settled(5300)}),
    'the far ledge needs the hang');
  assert.ok(reachable([-1200,5300,-10100],N,[hold(N)],(s)=>!air(s)&&s.floor===6400,200),'up the rock rib to the top of the falls');
});

// The point `look` ahead of the nearest point to p on a line of [x,z] points.
function ahead(points,p,look) {
  const length=k=>Math.hypot(points[k+1][0]-points[k][0],points[k+1][1]-points[k][1]);
  let best=null;
  for(let k=0;k<points.length-1;k++) {
    const a=points[k],L=length(k),u=[(points[k+1][0]-a[0])/L,(points[k+1][1]-a[1])/L];
    const t=Math.max(0,Math.min(L,(p[0]-a[0])*u[0]+(p[1]-a[1])*u[1])),d=Math.hypot(p[0]-a[0]-u[0]*t,p[1]-a[1]-u[1]*t);
    if(!best||d<best.d)best={d,k,t};
  }
  let {k,t}=best;t+=look;
  while(k<points.length-2&&t>length(k)){t-=length(k);k++;}
  const a=points[k],L=length(k);return [a[0]+(points[k+1][0]-a[0])/L*t,a[1]+(points[k+1][1]-a[1])/L*t];
}

test('main route, part 6: Gale Ridge, jumping each gap from its very edge',()=>{
  const G=world.gale.map(([a,c])=>[[a[0],a[2]],[c[0],c[2]]]);
  // Steer along the paths and jump once within `d` of `at`, holding A for `h`.
  const follow=(points,at,d,h)=>(s,n,i,m)=>{
    const p=[s.position[0],s.position[2]];
    if(at&&m.j===undefined&&!air(s)&&Math.hypot(p[0]-at[0],p[1]-at[1])<d)m.j=i;
    return {dir:toward(p,ahead(points,p,250)),buttons:m.j!==undefined&&i<m.j+h?1:0};
  };
  assert.ok(reachable([-1200,6400,-11350],W,[follow([[-1200,-11350],...G[0]])],
    (s)=>!air(s)&&Math.abs(s.floor-world.gale[0][1][1])<200&&dist(s,G[0][1])<150,200),'from the top of the falls onto the path');
  for(const k of range(0,4)) {
    const [a,c]=G[k],f=50/Math.hypot(c[0]-a[0],c[1]-a[1]),y=world.gale[k][0][1]+(world.gale[k][1][1]-world.gale[k][0][1])*f;
    const landed=(s,n)=>!air(s)&&!n.includes('LEDGE')&&dist(s,G[k+1][0])<400&&Math.abs(s.position[1]-world.gale[k+1][0][1])<60;
    assert.ok(range(0,160,20).some(d=>range(8,16,4).some(h=>run([a[0]+(c[0]-a[0])*f,y,a[1]+(c[1]-a[1])*f],toward(a,c),
      follow([...G[k],...G[k+1]],c,d,h),landed,300))),`path ${k+1} to path ${k+2}`);
  }
});

// The crest of the Horn's west ridge at x: the z where the Horn stands highest.
const crest=x=>range(-15500,-13500,10).reduce((best,z)=>world.horn(x,z)>world.horn(x,best)?z:best,-15500);

test('main route, part 7: the west ridge, the cornice and the chimney to the Aurora Star',()=>{
  const steps=world.steps,[g0,g1]=world.gale[5];
  // From the last gale path onto the first rock step, then up the steps.
  assert.ok(range(.5,.9,.1).some(f=>{
    const p=[g0[0]+(g1[0]-g0[0])*f,g0[2]+(g1[2]-g0[2])*f],d=toward(p,[steps[0][0],steps[0][2]]);
    return reachable([p[0],g0[1]+(g1[1]-g0[1])*f,p[1]],d,families.jump(d),(s,n)=>!air(s)&&!n.includes('LEDGE')&&Math.abs(s.floor-steps[0][1])<2,200);
  }),'onto the first rock step');
  for(let k=0;k<3;k++) {
    const [a,b]=[steps[k],steps[k+1]],d=toward([a[0],a[2]],[b[0],b[2]]);
    assert.ok(reachable([a[0]-Math.sin(d)*80,a[1],a[2]-Math.cos(d)*80],d,families.jump(d),
      (s,n)=>!air(s)&&!n.includes('LEDGE')&&Math.abs(s.floor-b[1])<2,200),`rock step ${k+2}`);
  }
  // The cornice: hang from its underside all the way along; the slick crest
  // beneath it cannot be climbed.
  const [c0,c1]=world.cornice,along=x=>c0[2]+(c1[2]-c0[2])*(x-c0[0])/(c1[0]-c0[0]),top=steps[3];
  const hangEast=wait=>(s,n,i,m)=>{
    if(i<wait)return {dir:E};const p=[s.position[0],s.position[2]];
    if(m.let||(n.includes('HANG')&&p[0]>c1[0]-25))m.let=1;
    return m.let?{dir:null}:{dir:toward(p,[p[0]+300,along(p[0])]),buttons:1};
  };
  const onLedge=(s,n)=>!air(s)&&!n.includes('HANG')&&s.position[1]===8500;
  assert.ok(range(0,12,2).some(t=>run([top[0]-60,top[1],top[2]],E,hangEast(t),onLedge,700)),'along the cornice to the summit ledge');
  assert.ok(!reachable([top[0]-60,top[1],top[2]],E,[...families.jump(E),...families.double(E),...families.long(E),hold(E)].map(noHang),
    (s)=>!air(s)&&s.position[1]>=8490,300,{lost:settled(top[1])}),'the summit ledge needs the cornice');
  // The chimney: wall-kick up between the two towers; nothing less reaches a top.
  const z=crest(-3520);
  assert.ok(reachable([-3700,8500,z],E,range(0,10).flatMap(t=>[1,-1].map(first=>(s,n,i,m)=>i<12?{dir:E,mag:40}:kicks(N,S,S,9450,t+12,first)(s,n,i,m))),
    (s,n)=>!air(s)&&!n.includes('LEDGE')&&s.position[1]===9400,400),'wall kicks up the chimney');
  assert.ok(!reachable([-3700,8500,z],E,[...families.jump(E),...families.double(E),...range(1,10).map(t=>backflip(t,E))],
    (s)=>!air(s)&&s.floor>=9390,200,{lost:settled(8500)}),'the chimney needs wall kicks');
  // The rock ramp to the summit snowfield, and a hop onto the cairn for the star.
  assert.ok(reachable([-3400,9400,crest(-3400)+370],E,[s=>({dir:toward([s.position[0],s.position[2]],[-600,-14550])})],
    (s)=>!air(s)&&s.position[1]===TOP&&s.position[0]>-900,400),'up the ramp to the summit');
  assert.ok(reachable([-300,TOP,-14750],S,families.jump(S),touches(pickup('aurora-star'),150),150),'the Aurora Star');
});

test('the Avalanche Run: slide home from the summit, jumping both lips',()=>{
  const points=world.avalanche.flat().map(p=>[p[0],p[2]]),lips=world.avalanche.slice(0,-1).map(run=>run.at(-1));
  const coins=world.pickups.filter(p=>p.kind==='coin'&&p.section==='Summit Ledge'&&p.position[0]>500);
  assert.equal(coins.length,10);
  // Steer along the run, bending toward the nearest coin ahead, and jump
  // within `d` of each lip, holding A for `h`.
  const slide=(d,h,got)=>(s,n,i,m)=>{
    const p=[s.position[0],s.position[2]],v=[s.velocity[0],s.velocity[2]],speed=Math.hypot(...v)||1;
    const next=coins.filter(c=>!got.has(c.id)&&!c.arc).map(c=>({c,d:Math.hypot(c.position[0]-p[0],c.position[2]-p[1]),
      ahead:((c.position[0]-p[0])*v[0]+(c.position[2]-p[1])*v[1])/speed})).filter(o=>o.ahead>150&&o.d<1200).sort((a,b)=>a.d-b.d)[0];
    let buttons=0;
    lips.forEach((e,k)=>{if(m[k]===undefined&&!air(s)&&Math.hypot(p[0]-e[0],p[1]-e[2])<d)m[k]=i;if(m[k]!==undefined&&i<m[k]+h)buttons=1;});
    return {dir:toward(p,next?[next.c.position[0],next.c.position[2]]:ahead(points,p,600)),buttons};
  };
  const home=(s)=>!air(s)&&s.floor===500&&s.position[0]<2600,got=new Set();
  assert.ok(run([150,TOP,-14350],E,slide(250,3,got),(s,n)=>{for(const c of coins)if(touches(c,95)(s,n))got.add(c.id);return home(s);},600),'summit to camp');
  assert.equal(got.size,coins.length,'the racing line and a jump at each lip collect every coin');
  assert.ok(!run([150,TOP,-14350],E,slide(0,0,new Set()),home,600),'slide on without jumping and a lip throws you off');
});

test('the upper Horn\'s Frost Shards are reachable, and need their intended moves',()=>{
  const reach=(id,start,face,plans,ticks=300)=>assert.ok(reachable(start,face,plans,touches(pickup(id)),ticks),id);
  // The Frozen Falls: let go of the overhang above the ice pillar...
  reach('shard-falls',[300,5300,-10100],W,range(1,6).flatMap(t=>range(-350,-250,20).map(x=>(s,n,i,m)=>{
    if(i<t)return {dir:null};if(m.let||(n.includes('HANG')&&s.position[0]<x)){m.let=1;return {dir:null};}
    return {dir:toward([s.position[0],s.position[2]],[-300,-10100]),buttons:1};})),600);
  // ...jump back up to it and hang on to the far ledge. The flared cap cannot
  // be grabbed, and no plain jump from either ledge lands on it.
  assert.ok(range(0,6).some(t=>run([-300,5300,-10100],W,hangWest(-960,t),onFarLedge,600)),'from the pillar on to the far ledge');
  const onPillar=(s,n)=>!air(s)&&!n.includes('HANG')&&Math.hypot(s.position[0]+300,s.position[2]+10100)<170&&s.position[1]>5290;
  const plain=dir=>[...range(0,30).flatMap(t=>[1,2,3,4,6,8,14].map(h=>noHang(jump(dir,t,h)))),hold(dir)];
  assert.ok(!reachable([490,5300,-10100],W,plain(W),onPillar,120,{lost:settled(5300)}),'no plain jump from the near ledge lands on the pillar');
  assert.ok(!reachable([-1390,5300,-10100],E,plain(E),onPillar,120,{lost:settled(5300)}),'nor from the far ledge');
  // The Weathervane: out across the windy gulf with a jump from the very edge;
  // home into the wind only a long jump makes it.
  const [x,y,z]=world.vane,cape=world.cape[2];
  const onTower=(s,n)=>!air(s)&&!n.includes('LEDGE')&&s.position[1]===y&&s.position[2]>z-335;
  const onCape=(s,n)=>!air(s)&&!n.includes('LEDGE')&&s.position[1]===y&&s.position[2]>cape-60&&s.position[2]<cape+485;
  assert.ok(reachable([x,y,cape+20],S,families.jump(S),onTower,160),'out to the Weathervane');
  reach('shard-vane',[x,y,z-270],S,[hold(S)],60);
  assert.ok(!reachable([x,y,z+270],N,families.jump(N),onCape,160,{lost:settled(y)}),'a plain jump home falls short in the gale');
  assert.ok(reachable([x,y,z+270],N,range(2,40).flatMap(t=>[6,10,14].map(h=>longJump(N,t,h))),onCape,160),'a long jump makes it home');
  // The Horn's Tip: wall-kick between the needle and the tor to the tor's top,
  // then jump across to the needle. Nothing else gets that high.
  assert.ok(reachable([-60,TOP,-14850],E,range(0,10).flatMap(t=>[1,-1].map(first=>kicks(E,W,E,11100,t,first))),
    standingAbove(11040,[-420,-14850],260),300),'wall kicks up to the tor');
  reach('shard-tip',[-520,11050,-14850],E,families.jump(E),150);
  assert.ok(!reachable([-500,TOP,-14500],E,[...families.jump(E),...families.double(E),...range(1,10).map(t=>backflip(t,E))],
    (s)=>s.position[1]>11000,200,{lost:settled(TOP)}),'the tip needs wall kicks');
});

test('every shard reveals the Polar Star, atop the Mirror Isle\'s ice spire',()=>{
  const spire=[1500,5700],sides=[90,180,270,0].map(deg=>{
    const a=deg*Math.PI/180,from=[spire[0]+Math.cos(a)*550,spire[1]-Math.sin(a)*550];return [from,toward(from,spire)];});
  assert.ok(sides.some(([from,d])=>reachable([from[0],250,from[1]],d,families.double(d),standingAbove(760,spire,180),220)),'a double jump and a grab');
  assert.ok(!sides.slice(0,2).some(([from,d])=>reachable([from[0],250,from[1]],d,families.jump(d),standingAbove(760,spire,180),100,{lost:settled(250)})),
    'a single jump cannot');
  core.reset([1500,770,5700],0);const s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.ok(touches(pickup('polar-star'),150)(s,'ACT_IDLE'),'the star is in reach from the top');
  const arc=world.pickups.filter(p=>p.kind==='coin'&&Math.hypot(p.position[0]-spire[0],p.position[2]-spire[1])<100);
  assert.equal(arc.length,3);for(const c of arc)assert.ok(touches(c,95)(s,'ACT_IDLE'),c.id);
});

test('level session: the Aurora Star stops the clock, and every shard reveals the Polar Star',()=>{
  const session=new LevelSession(world),shards=()=>session.count('shard');
  const standAt=p=>({position:[p[0],p[1]-80,p[2]],yaw:0,velocity:[0,0,0],speed:0,health:0x880,action:0x0C400201,animation:197,frame:0,tick:0});
  const take=id=>session.collect(standAt(pickup(id).position),'ACT_IDLE').map(e=>e.type);
  const copy=(id,best)=>world.text.victory('star',{session,shards:shards(),best,pickup:pickup(id)}).copy;
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  // The Icefall Star, halfway up, leaves the clock running and points onward...
  assert.deepEqual(take('icefall-star'),['star']);assert.match(copy('icefall-star'),/west to the Frozen Falls/);
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  assert.equal(formatTime(session.time),'0:02.0');
  // ...and the Aurora Star at the summit stops it.
  assert.deepEqual(take('aurora-star'),['star']);
  for(let i=0;i<30;i++)session.tick({x:0,y:80,buttons:0});
  assert.equal(formatTime(session.time),'0:02.0');assert.equal(session.stars,2);
  assert.match(copy('aurora-star','1:00.0'),/best 1:00\.0\. 8 Frost Shards still hide on the mountain\. Ride the Avalanche Run/);
  // The Polar Star stays hidden until the eighth shard is found.
  assert.deepEqual(take('polar-star'),[]);
  const events=world.pickups.filter(p=>p.kind==='shard').flatMap(p=>session.collect(standAt(p.position),'ACT_IDLE'));
  assert.deepEqual(events.map(e=>e.type),[...Array(8).fill('shard'),'reveal']);
  assert.deepEqual(take('polar-star'),['bonus']);assert.equal(session.stars,3);
  assert.match(copy('polar-star'),/Hoarfrost Heights is conquered/);
  // The copy the menu and victory dialog show.
  assert.equal(world.goal,'aurora-star');
  for(const goal of world.text.objectives.filter(g=>g.star))assert.ok(pickup(goal.star),goal.star);
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
