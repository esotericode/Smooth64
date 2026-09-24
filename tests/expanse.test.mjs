// The Expanse: proof that a big world works. Its ground spans 240,000 units
// in ~39,000 triangles (the engine used to stop at 65,534 units and 4,096),
// and the explorer spawns, runs, jumps, collides and falls there exactly as
// in the small worlds.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createExpanse,HALF,VOID} from '../web/expanse.js';
import {LevelSession} from '../web/level.js';
import {respawnReason} from '../web/rules.js';
import {routeKit,names,air} from './routes.mjs';

const world=createExpanse(),{core}=await routeKit(world);
const R=Math.round,E=49152,N=0; // camera yaws that push the stick east and north
const inside=([x,z],outline)=>outline.every((p,i)=>{const q=outline[(i+1)%outline.length];return (q[0]-p[0])*(z-p[1])-(q[1]-p[1])*(x-p[0])>=0;})||
  outline.every((p,i)=>{const q=outline[(i+1)%outline.length];return (q[0]-p[0])*(z-p[1])-(q[1]-p[1])*(x-p[0])<=0;});
const edge=([x,z],outline)=>Math.min(...outline.map((p,i)=>{const q=outline[(i+1)%outline.length],dx=q[0]-p[0],dz=q[1]-p[1];
  const t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-p[0]-t*dx,z-p[1]-t*dz);}));

test('the Expanse is valid static geometry, far past the old limits',()=>{
  let end=0;
  for(const shape of world.shapes){assert.equal(shape.start,end);assert.ok(shape.end>shape.start);end=shape.end;}
  assert.equal(end,world.triangles.length);
  for(const t of world.triangles) {
    for(const v of t.vertices)for(const n of v)assert.ok(Number.isInteger(n));
    const [a,b,c]=t.vertices,u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
    assert.ok(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])>0,'no degenerate triangles');
  }
  // Eight times the old triangle cap and over three times its span on each side.
  assert.ok(world.triangles.length>8*4096,`${world.triangles.length} triangles`);
  const xs=world.triangles.flatMap(t=>t.vertices.map(v=>v[0])).filter(x=>Math.abs(x)<=HALF);
  assert.equal(Math.min(...xs),-HALF);assert.equal(Math.max(...xs),HALF);assert.ok(2*HALF>3*65534);
  const kinds=world.pickups.reduce((a,p)=>(a[p.kind]=(a[p.kind]||0)+1,a),{});
  assert.deepEqual(kinds,{coin:156,checkpoint:8});
  assert.equal(new Set(world.pickups.map(p=>p.id)).size,world.pickups.length,'unique pickup ids');
  // Every coin floats 85 above the ground or a crate, and counts toward a travel point's row.
  const rows=new Set(world.zones.map(z=>z.name));
  for(const p of world.pickups.filter(p=>p.kind==='coin')) {
    assert.ok(rows.has(p.route),p.id);
    assert.ok(Math.abs(core.floor(...p.position)-(p.position[1]-85))<=.6,`${p.id} at ${p.position}`);
  }
});

test('every travel point spawns onto its own flat pad',()=>{
  for(const z of world.zones) {
    core.reset(z.position,z.yaw);let s;
    for(let i=0;i<8;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
    assert.deepEqual(s.position,z.position,z.name);assert.equal(s.floor,z.position[1],z.name);assert.equal(names[s.action],'ACT_IDLE',z.name);
  }
  const far=world.zones.find(z=>z.name==='Far Corner').position;assert.ok(Math.hypot(far[0],far[2])>150000);
});

test('the floor underfoot is the ground that is drawn, everywhere; past the rims is the void',()=>{
  let seed=7;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let k=0;k<20000;k++) {
    // The core truncates a query to whole units, so the ground is read there too.
    const x=R((rnd()*2-1)*HALF),z=R((rnd()*2-1)*HALF),g=world.ground(x,z),f=core.floor(x,g+100,z);
    if(Math.abs(f-g)<.05)continue;
    assert.ok(f>g&&world.blocks.some(b=>inside([x,z],b.outline.map(p=>p.map(R)))),`floor ${f} over ground ${g} at ${x},${z}`);
  }
  for(const [x,z] of [[HALF+100,0],[-HALF-5000,HALF],[0,HALF+60000],[HALF+70000,-HALF-70000]])assert.equal(core.floor(x,0,z),VOID);
});

test('crates, stone blocks and towers are solid from every side',()=>{
  // The blocks nearest the middle, and every tower; run at each from eight ways.
  const near=world.blocks.map(b=>({...b,outline:b.outline.map(p=>p.map(R))})).map(b=>({...b,c:[b.outline.reduce((s,p)=>s+p[0],0)/4,b.outline.reduce((s,p)=>s+p[1],0)/4]}))
    .sort((a,b)=>Math.hypot(...a.c)-Math.hypot(...b.c));
  let runs=0;
  for(const block of [...near.slice(0,24),...near.filter(b=>b.top-world.ground(...b.c)>4000)]) {
    const r=Math.max(...block.outline.map(p=>Math.hypot(p[0]-block.c[0],p[1]-block.c[1])));
    for(let k=0;k<8;k++) {
      const a=k*Math.PI/4,start=[block.c[0]+Math.cos(a)*(r+450),block.c[1]+Math.sin(a)*(r+450)];
      if(world.blocks.some(b=>b!==block&&edge(start,b.outline)<400||inside(start,b.outline)))continue;
      // Run toward the block's middle: world yaw (0 = +Z) from the start to the centre.
      const dir=Math.atan2(block.c[0]-start[0],block.c[1]-start[1]),camera=R((dir+Math.PI)*32768/Math.PI)&65535;
      core.reset([start[0],world.ground(...start),start[1]],R(dir*32768/Math.PI)&65535);let s;
      for(let i=0;i<50;i++) {
        s=core.tick({x:0,y:80,buttons:0,yaw:camera});
        assert.ok(!inside([s.position[0],s.position[2]],block.outline)||edge([s.position[0],s.position[2]],block.outline)<2,`inside a block at ${s.position}`);
      }
      assert.ok(edge([s.position[0],s.position[2]],block.outline)<80,`ran up to the block at ${block.c} (${s.position})`);
      runs++;
    }
  }
  assert.ok(runs>=150,`${runs} runs`);
});

test('far out, a run and a jump are the same move as in the middle',()=>{
  const move=zone=>{core.reset(zone.position,32768);const out=[];
    for(let i=0;i<45;i++){const s=core.tick({x:0,y:80,buttons:i>=20&&i<30?1:0,yaw:N});out.push(s);}return out;};
  const [middle,far]=['Crossroads','Far Corner'].map(name=>world.zones.find(z=>z.name===name));
  const a=move(middle),b=move(far);
  a.forEach((s,i)=>{
    assert.equal(b[i].action,s.action,`tick ${i}`);assert.equal(b[i].speed,s.speed,`tick ${i}`);
    for(const k of [0,1,2])assert.ok(Math.abs((b[i].position[k]-far.position[k])-(s.position[k]-middle.position[k]))<.5,`tick ${i}`);
  });
  assert.ok(a.some(air),'the move includes a jump');
});

test('a jump off a rim falls into the void and returns you to a beacon',()=>{
  const x=HALF-300;core.reset([x,world.ground(x,0),0],16384);let s,over=false;
  for(let i=0;i<150&&!respawnReason(s??core.state(),world.fallLimit);i++) {
    s=core.tick({x:0,y:80,buttons:i>=3&&i<10?1:0,yaw:E});
    if(s.position[0]>HALF)over=true;
  }
  assert.ok(over,'past the cliff');assert.equal(s.floor,VOID);
  assert.equal(respawnReason(s,world.fallLimit),'Back to the checkpoint');
  const session=new LevelSession(world);assert.deepEqual(session.respawn().position,world.zones[0].position);
});

test('native and WASM builds agree far out in the Expanse',()=>{
  const far=world.zones.find(z=>z.name==='Far Corner');
  const inputs=Array.from({length:150},(_,i)=>({x:i%50<25?50:-30,y:80,buttons:i%30<6?1:i%47===20?2:0,yaw:(i*400)&65535}));
  const native=spawnSync('python3',['tests/trace_native.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:1<<26,
    input:JSON.stringify({triangles:world.triangles,position:far.position,yaw:far.yaw,inputs})});
  assert.equal(native.status,0,native.stderr);const expected=JSON.parse(native.stdout);
  core.reset(far.position,far.yaw);
  inputs.forEach((input,i)=>{core.tick(input);assert.equal(Buffer.from(core.stateBytes()).toString('hex'),expected[i],`tick ${i}`);});
});
