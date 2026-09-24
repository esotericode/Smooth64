import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadCore,FixedClock} from '../web/engine.js';
import {createWorld,zones} from '../web/world.js';

const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const world=createWorld();

test('all playground spawns settle on their visible surfaces',async()=>{
  const core=await loadCore(bytes);core.loadWorld(world.triangles);
  for(const zone of zones) {
    core.reset(zone.position,zone.yaw);
    for(let i=0;i<5;i++)core.tick({x:0,y:0,buttons:0,yaw:0});
    const state=core.state();
    assert.ok(state.position[1]===zone.position[1]); // +0 and -0 are the same floor height
    assert.equal(state.position[1],state.floor);
  }
});

test('30/60/144 Hz displays produce the same 300 simulation ticks',async()=>{
  const results=[];
  for(const fps of [30,60,144]) {
    const core=await loadCore(bytes);core.loadWorld(world.triangles);core.reset(zones[0].position,zones[0].yaw);
    const clock=new FixedClock();let tick=0;
    for(let i=0;i<fps*10;i++)clock.advance(1/fps,()=>{
      core.tick({x:tick>120?40:0,y:70,buttons:tick%48<8?1:0,yaw:0});tick++;
    });
    assert.equal(tick,300);results.push(Buffer.from(core.stateBytes()).toString('hex'));
  }
  assert.equal(new Set(results).size,1);
});

test('native GCC and browser WASM produce identical complete state bytes and sound requests',async()=>{
  const core=await loadCore(bytes);
  for(const [index,zone] of zones.entries()) {
    let seed=0x6400+index;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const inputs=Array.from({length:360},(_,i)=>({
      x:i<90?0:(random()%161)-80,
      y:i<90?80:(random()%161)-80,
      buttons:(i%60<12?1:0)|(i%83===22?2:0)|(i%101>96?4:0),
      yaw:Math.round(zone.camera*32768/Math.PI),
    }));
    const process=spawnSync('python3',['tests/trace_native.py'],{
      cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:2*1024*1024,
      input:JSON.stringify({triangles:world.triangles,position:zone.position,yaw:zone.yaw,inputs,sounds:true}),
    });
    assert.equal(process.status,0,process.stderr);
    const expected=JSON.parse(process.stdout);
    core.loadWorld(world.triangles);core.reset(zone.position,zone.yaw);
    let sounds=0;
    inputs.forEach((input,i)=>{
      core.tick(input);
      assert.equal(Buffer.from(core.stateBytes()).toString('hex'),expected[i].state,`${zone.name}, tick ${i}`);
      assert.deepEqual(core.sounds(),expected[i].sounds,`${zone.name}, tick ${i} sounds`);
      sounds+=expected[i].sounds.length;
    });
    assert.ok(sounds>0,`${zone.name}: the trace exercises sound requests`);
  }
});

test('no arbitrary limits: any number of triangles, far-flung, huge, towering and deep worlds',async()=>{
  const core=await loadCore(bytes);
  const square=(x0,z0,size,y)=>[{type:0,vertices:[[x0,y,z0],[x0,y,z0+size],[x0+size,y,z0+size]]},{type:0,vertices:[[x0,y,z0],[x0+size,y,z0+size],[x0+size,y,z0]]}];
  const settle=position=>{core.reset(position,0);let s;for(let i=0;i<8;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});return s;};
  // Far more triangles than the old cap of 4,096: a grid of 20,000.
  const grid=[];for(let i=0;i<100;i++)for(let j=0;j<100;j++)grid.push(...square(i*200,j*200,200,100));
  core.loadWorld(grid);let s=settle([19900,100,19900]);assert.equal(s.floor,100);assert.equal(s.position[1],100);
  // 300,000 units out (the old range was 32,767), a run and jump ends within a unit or two of the same run
  // at the origin: float rounding, not a different move.
  const run=(world,position)=>{core.loadWorld(world);core.reset(position,0);let s;
    for(let i=0;i<60;i++)s=core.tick({x:30,y:80,buttons:i%30<6?1:0,yaw:0});return s;};
  const near=run(square(-10000,-10000,20000,5000),[0,5000,0]),far=run(square(-310000,280000,20000,5000),[-300000,5000,290000]);
  assert.equal(far.speed,near.speed);assert.equal(far.action,near.action);assert.equal(far.floor,5000);
  assert.ok(Math.hypot(far.position[0]+300000-near.position[0],far.position[2]-290000-near.position[2])<3);
  // Single floors of two triangles hold everywhere, however big. In 32-bit math a 64,000-unit
  // floor's normal wrapped and flipped it into a ceiling, and point tests overflowed.
  for(const size of [64000,100000,400000]) {
    core.loadWorld(square(-size/2,-size/2,size,100));const e=size/2-1000;
    for(const [x,z] of [[-e,e],[e,e],[e,-e],[-e,-e],[0,0]])assert.equal(core.floor(x,200,z),100,`${size} across, at ${x},${z}`);
  }
  // No invisible ceiling high up, and floors far below are found.
  core.loadWorld([...square(-1000,-1000,2000,150000),...square(-1000,-1000,2000,-150000)]);
  s=settle([0,150000,0]);let peak=s.position[1];
  for(let i=0;i<40;i++){s=core.tick({x:0,y:0,buttons:i<14?1:0,yaw:0});peak=Math.max(peak,s.position[1]);}
  assert.ok(peak>150100,`a jump rises from 150,000 (peak ${peak})`);assert.equal(core.floor(0,-149000,0),-150000);
  // The native build agrees out there too.
  const inputs=Array.from({length:120},(_,i)=>({x:i%40<20?40:-40,y:80,buttons:i%25<5?1:0,yaw:0}));
  const native=spawnSync('python3',['tests/trace_native.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',
    input:JSON.stringify({triangles:square(-310000,280000,20000,5000),position:[-300000,5000,290000],yaw:0,inputs})});
  assert.equal(native.status,0,native.stderr);const expected=JSON.parse(native.stdout);
  core.loadWorld(square(-310000,280000,20000,5000));core.reset([-300000,5000,290000],0);
  inputs.forEach((input,i)=>{core.tick(input);assert.equal(Buffer.from(core.stateBytes()).toString('hex'),expected[i],`tick ${i}`);});
  // Past what the collision math can take exactly, a triangle is refused rather than wrong.
  assert.throws(()=>core.loadWorld(square(600000000,0,1000,0)));
});

test('collision cost does not grow with the world: the static surfaces sit in a grid',async()=>{
  const core=await loadCore(bytes);
  const square=(x0,z0,size,y)=>[{type:0,vertices:[[x0,y,z0],[x0,y,z0+size],[x0+size,y,z0+size]]},{type:0,vertices:[[x0,y,z0],[x0+size,y,z0+size],[x0+size,y,z0]]}];
  // The same run on 2 triangles and on 40,000 (a full scan of every surface made it ~800 times slower).
  const time=world=>{core.loadWorld(world);let best=Infinity;
    for(let r=0;r<5;r++){core.reset([1000,0,1000],0);const t=performance.now();
      for(let i=0;i<200;i++)core.tick({x:i%60<30?40:-40,y:80,buttons:i%25<5?1:0,yaw:0});best=Math.min(best,performance.now()-t);}
    return best;};
  const big=[];for(let i=0;i<100;i++)for(let j=0;j<200;j++)big.push(...square(-100000+i*2000,-200000+j*2000,2000,0));
  const small=time(square(-4000,-4000,8000,0)),large=time(big);
  assert.ok(large<small*10,`40,000 triangles took ${(large/small).toFixed(1)} times as long as 2`);
  // A cell holds every surface a query in it could touch. Walls 1,100 apart sit at every
  // offset from the 1,024-unit cell edges; each run stops at the next wall's reach, 50 units short.
  const wall=k=>-22000+k*1100,walls=[];
  for(let k=0;k<40;k++)walls.push({type:0,vertices:[[wall(k),0,-3000],[wall(k),0,3000],[wall(k),400,3000]]},{type:0,vertices:[[wall(k),0,-3000],[wall(k),400,3000],[wall(k),400,-3000]]});
  core.loadWorld([...square(-30000,-30000,60000,0),...walls]);
  for(let k=0;k<39;k++) {
    core.reset([wall(k)+60,0,0],16384);let s;for(let i=0;i<45;i++)s=core.tick({x:0,y:80,buttons:0,yaw:49152});
    assert.equal(Math.round(wall(k+1)-s.position[0]),50,`wall ${k+1}`);
  }
});

test('pause/reset clears fractional accumulated time',()=>{
  const clock=new FixedClock();let ticks=0;
  clock.advance(.02,()=>ticks++);clock.reset();clock.advance(.02,()=>ticks++);
  assert.equal(ticks,0);
  clock.advance(20,()=>ticks++);assert.ok(ticks<=8,'stalls must not replay minutes of input');
});
