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

test('pause/reset clears fractional accumulated time',()=>{
  const clock=new FixedClock();let ticks=0;
  clock.advance(.02,()=>ticks++);clock.reset();clock.advance(.02,()=>ticks++);
  assert.equal(ticks,0);
  clock.advance(20,()=>ticks++);assert.ok(ticks<=8,'stalls must not replay minutes of input');
});
