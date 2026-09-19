import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ExplorerRig} from '../web/character.js';
import {Vector3,Box3} from '../web/vendor/three.module.min.js';
import {poseFor} from '../web/pose.js';
import {CourseProgress} from '../web/progress.js';
import {createWorld} from '../web/world.js';
import {animations} from '../web/animations.js';

const state={position:[0,300,-610],yaw:-32768,velocity:[0,0,0],speed:0,action:0x0800034B,
  animation:51,frame:0,tick:30,timer:10};

test('hanging body is below the lip with hands anchored, including during slow pull-up',()=>{
  const rig=new ExplorerRig();rig.position.set(...state.position);rig.rotation.y=Math.PI;
  rig.animate(state,state,1,'ACT_LEDGE_GRAB','ACT_LEDGE_GRAB');
  assert.ok(rig.worldCenter.y<state.position[1]-70);
  const expected=rig.hands.map(h=>h.getWorldPosition(new Vector3()).toArray());
  assert.deepEqual(expected.map(v=>Math.round(v[1])),[305,305]);
  assert.deepEqual(expected.map(v=>Math.round(v[2])),[-600,-600]);
  for(const frame of [0,3,7,10]) {
    const climb={...state,animation:0,frame};rig.animate(climb,climb,1,'ACT_LEDGE_CLIMB_SLOW_1','ACT_LEDGE_CLIMB_SLOW_1');
    for(let i=0;i<2;i++) assert.ok(rig.hands[i].getWorldPosition(new Vector3()).distanceTo(new Vector3(...expected[i]))<1e-5);
  }
  const up={...state,animation:0,frame:27};rig.animate(up,up,1,'ACT_LEDGE_CLIMB_SLOW_2','ACT_LEDGE_CLIMB_SLOW_2');
  assert.equal(rig.worldCenter.y,380);
});

test('pose sampling is finite, deterministic, and never mutates the movement snapshot',()=>{
  const names=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
  for(const [action,name] of Object.entries(names)) {
    const s={...state,action:Number(action),speed:32,velocity:[0,25,0],frame:8};
    const before=JSON.stringify(s),pose=poseFor(s,name);
    assert.equal(JSON.stringify(s),before);assert.deepEqual(poseFor(s,name),pose);
    const numbers=Object.values(pose).flat(3);assert.ok(numbers.every(Number.isFinite),name);
  }
  const rig=new ExplorerRig();
  for(const [name,animation] of [['ACT_CROUCHING',0],['ACT_JUMP_LAND',78],['ACT_GROUND_POUND_LAND',58],['ACT_BACKFLIP_LAND',75]]) {
    for(const frame of [0,3,8,24]) {
      const s={...state,animation,frame};rig.animate(s,s,1,name,name);
      for(const foot of rig.feet) {
        const bottom=new Box3().setFromObject(foot).min.y;
        assert.ok(bottom>-3&&bottom<4,`${name} frame ${frame}: planted sole ${bottom}`);
      }
    }
  }
});

test('sparks collect once, use the visible hanging body, and reset independently of physics',()=>{
  const world=createWorld(),progress=new CourseProgress(world.sparks),spark=world.sparks[0];
  const stand={...state,position:[spark.position[0],spark.position[1]-85,spark.position[2]],action:0x0c400201,
    animation:animations.findIndex(a=>a[0]==='IDLE_HEAD_CENTER')};
  assert.equal(progress.collect(stand,'ACT_LEDGE_GRAB').length,0,'anchor on the platform is not the hanging body');
  assert.equal(progress.collect(stand,'ACT_IDLE').length,1);assert.equal(progress.collect(stand,'ACT_IDLE').length,0);
  assert.deepEqual(progress.route('Ledge garden'),{found:1,total:3});
  progress.reset();assert.equal(progress.found.size,0);assert.equal(world.sparks.length,15);
});
