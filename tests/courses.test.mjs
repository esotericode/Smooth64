// Traversal checks adapted from the parallel branch to the merged course.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCore} from '../web/engine.js';
import {createWorld,zones} from '../web/world.js';
import {CourseProgress} from '../web/progress.js';
const world=createWorld(),bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const actions=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
const air=s=>!!(s.action&0x800);
async function playground(){const core=await loadCore(bytes);core.loadWorld(world.triangles);return core;}

test('compact courses stay inside collision limits and use complete render groups',()=>{
  assert.ok(world.triangles.length<1024);assert.ok(world.shapes.length<=14);
  let end=0;
  for(const shape of world.shapes){assert.equal(shape.start,end);assert.ok(shape.end>shape.start);end=shape.end;}
  assert.equal(end,world.triangles.length);
  for(const t of world.triangles)for(const v of t.vertices)for(const n of v)
    assert.ok(Number.isInteger(n)&&Math.abs(n)<=7200);
});

test('the canopy can be caught, crossed hand over hand, and all three sparks collected',async()=>{
  const core=await playground(),zone=zones.find(z=>z.name==='Canopy walk'),progress=new CourseProgress(world.sparks);
  core.reset(zone.position,zone.yaw);
  let caught=false,moving=false,far=0;
  for(let i=0;i<360;i++){
    const s=core.state(),hanging=actions[s.action].includes('HANG');
    const buttons=hanging||(!caught&&((!air(s)&&s.position[2]>4180)||(air(s)&&s.velocity[1]>0)))?1:0;
    const next=core.tick({x:0,y:80,buttons,yaw:32768}),name=actions[next.action];
    caught ||= name==='ACT_START_HANGING';
    if(name==='ACT_HANG_MOVING'){moving=true;far=Math.max(far,next.position[2]);assert.equal(next.position[1],400);}
    progress.collect(next,name);
    if(progress.route('Canopy walk').found===3)break;
  }
  assert.ok(caught&&moving);assert.ok(far>5100);assert.equal(progress.route('Canopy walk').found,3);
});

test('each garden and skyline hop is reachable using ordinary jumps or long jumps',async()=>{
  const core=await playground();
  const routes=[
    [[-5000,0,1675],[-5000,300,750],[-5000,570,-150],[-5000,840,-1050]],
    [[0,280,-4230],[1050,400,-4470],[2200,520,-4730],[2780,520,-5840],[1600,680,-6460],[400,800,-6400]],
  ];
  for(const spots of routes)for(let i=0;i<spots.length-1;i++){
    const from=spots[i],to=spots[i+1];
    const yaw=Math.round(Math.atan2(to[0]-from[0],to[2]-from[2])*32768/Math.PI)&65535;
    let successes=0;
    for(let jumpAt=0;jumpAt<24;jumpAt++)for(const move of ['jump','long']){
      core.reset(from,yaw);
      for(let t=0;t<85;t++){
        const buttons=move==='jump'?(t>=jumpAt&&t<jumpAt+12?1:0):(t===jumpAt?4:t>jumpAt&&t<jumpAt+10?5:0);
        const s=core.tick({x:0,y:80,buttons,yaw:(yaw+32768)&65535});
        if(s.floor===to[1]&&!air(s)&&Math.abs(s.position[0]-to[0])<360&&Math.abs(s.position[2]-to[2])<340){successes++;break;}
        if(s.position[1]<from[1]-200)break;
      }
    }
    assert.ok(successes>=2,`${from} -> ${to}: only ${successes} arrival timings`);
  }
});
