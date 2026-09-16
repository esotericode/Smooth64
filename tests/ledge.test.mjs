import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadCore} from '../web/engine.js';
import {createWorld,zones} from '../web/world.js';
import {actionCue} from '../web/pose.js';

const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const names=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
const world=createWorld(),zone=zones.find(z=>z.name==='Ledge garden');

test('natural ledge grab: neutral hangs, toward climbs, away drops, A climbs quickly, Z drops',async()=>{
  for(const camera of [0,16384,-16384,32768]) {
    const toward=[Math.round(80*Math.sin(camera*Math.PI/32768)),Math.round(80*Math.cos(camera*Math.PI/32768))];
    for(const mode of ['neutral','toward','sideways','away','quick','drop']) {
      const core=await loadCore(bytes);core.loadWorld(world.triangles);core.reset(zone.position,zone.yaw);
      const inputs=[],states=[];
      const tick=(x,y,buttons=0)=>{const input={x,y,buttons,yaw:camera};inputs.push(input);const s=core.tick(input);states.push(Buffer.from(core.stateBytes()).toString('hex'));return s;};
      for(let i=0;i<8;i++)tick(...toward);
      let s;
      for(let i=0;i<20;i++)s=tick(...toward,i<12?1:0);
      assert.equal(names[s.action],'ACT_LEDGE_GRAB',`actual descending grab, camera ${camera}`);
      assert.equal(s.position[1],300);
      const seen=[];
      for(let i=0;i<55;i++) {
        const axis=mode==='toward'?toward:mode==='away'?toward.map(v=>-v):mode==='sideways'?[toward[1],-toward[0]]:[0,0];
        s=tick(...axis,mode==='quick'&&i===0?1:mode==='drop'&&i===0?4:0);
        seen.push(names[s.action]);
      }
      if(mode==='neutral')assert.deepEqual(new Set(seen),new Set(['ACT_LEDGE_GRAB']));
      if(mode==='toward'||mode==='sideways') {
        assert.equal(seen[0],'ACT_LEDGE_GRAB');assert.equal(seen[9],'ACT_LEDGE_CLIMB_SLOW_1');
        assert.ok(seen.includes('ACT_LEDGE_CLIMB_SLOW_2'));assert.ok(seen.includes('ACT_WALKING'));
        assert.ok(!seen.includes('ACT_SOFT_BONK'),'climbing must not become a let-go');
        assert.equal(s.position[1],300);
      }
      if(mode==='away'||mode==='drop') {assert.ok(seen.includes('ACT_SOFT_BONK'));assert.ok(s.position[1]===0);}
      if(mode==='quick') {assert.equal(seen[0],'ACT_LEDGE_CLIMB_FAST');assert.ok(seen.includes('ACT_IDLE'));assert.equal(s.position[1],300);}
      // This user-reported interaction also runs through the native C host.
      const native=spawnSync('python3',['tests/trace_native.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',
        input:JSON.stringify({triangles:world.triangles,position:zone.position,yaw:zone.yaw,inputs})});
      assert.equal(native.status,0,native.stderr);assert.deepEqual(states,JSON.parse(native.stdout));
    }
  }
});

test('ledge cue follows the camera instead of always saying push forward',()=>{
  const s={yaw:-32768};
  for(const [yaw,arrow] of [[0,'↑'],[Math.PI/2,'→'],[Math.PI,'↓'],[-Math.PI/2,'←']]) {
    assert.ok(actionCue('ACT_LEDGE_GRAB',s,yaw).includes(`push ${arrow}`));
  }
});

test('the new wall-kick shaft can be ascended with real controller inputs',async()=>{
  const core=await loadCore(bytes);core.loadWorld(world.triangles);
  const start=zones.find(z=>z.name==='Wall-kick tower');let s=core.reset(start.position,start.yaw),direction=-1,kicks=0;
  for(let i=0;i<140;i++) {
    let button=i===8?1:0;
    if(names[s.action]==='ACT_AIR_HIT_WALL'){button=1;direction*=-1;kicks++;}
    s=core.tick({x:direction*(s.position[1]>1350?30:80),y:s.position[1]>1350?65:0,buttons:button,yaw:0});
    if(names[s.action]==='ACT_LEDGE_GRAB'&&s.position[1]===1550)break;
  }
  assert.ok(kicks>=8);assert.equal(names[s.action],'ACT_LEDGE_GRAB');assert.equal(s.position[1],1550);
  core.tick({x:0,y:0,buttons:1,yaw:0});
  for(let i=0;i<20;i++)s=core.tick({x:0,y:0,buttons:0,yaw:0});
  assert.equal(names[s.action],'ACT_IDLE');assert.equal(s.floor,1550);
  for(let i=0;i<65;i++) {
    s=core.tick({x:0,y:80,buttons:0,yaw:0});
    if(s.floor===1300&&s.position[1]===1300)break;
  }
  assert.equal(s.floor,1300,'top walkway connects to the rear terrace');
  assert.ok(s.position[2]<-6145);
});
