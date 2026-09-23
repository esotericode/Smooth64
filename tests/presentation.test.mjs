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

test('a live action change crossfades from the shown pose; direct sampling stays exact',()=>{
  const idle={...state,position:[0,0,0],yaw:0,action:0x0C400201,animation:197,frame:0},crouch={...idle,action:0x0C008220,animation:152};
  const exact=new ExplorerRig();exact.animate(crouch,crouch,1,'ACT_CROUCHING','ACT_CROUCHING');
  const rig=new ExplorerRig();
  rig.animate(idle,idle,1,'ACT_IDLE','ACT_IDLE',1/60);
  rig.animate(crouch,crouch,1,'ACT_CROUCHING','ACT_CROUCHING',1/60);
  const between=rig.pivot.position.y,from=poseFor(idle,'ACT_IDLE').root[1],to=exact.pivot.position.y;
  assert.ok(between<from&&between>to,`blending: ${from} > ${between} > ${to}`);
  for(let i=0;i<12;i++)rig.animate(crouch,crouch,1,'ACT_CROUCHING','ACT_CROUCHING',1/60);
  assert.ok(Math.abs(rig.pivot.position.y-to)<1e-9,'settles on the exact pose');
  // Keys that change on consecutive ticks still converge instead of stalling.
  const land={...idle,action:0x0C000233,animation:190};
  for(let f=0;f<=9;f++)rig.animate({...land,frame:f},{...land,frame:f},1,'ACT_SIDE_FLIP_LAND_STOP',f%2?'ACT_SIDE_FLIP_LAND_STOP':'ACT_SIDE_FLIP_LAND',1/30);
  for(let i=0;i<8;i++)rig.animate(idle,idle,1,'ACT_IDLE','ACT_IDLE',1/30);
  assert.ok(rig.eyes[0].getWorldPosition(new Vector3()).z>30,'ends facing the way the core faces');
});

test('side-flip landing turns back around instead of snapping',()=>{
  const land={...state,yaw:0,animation:190};
  const yaw=f=>poseFor({...land,frame:f},'ACT_SIDE_FLIP_LAND_STOP').rotation[1];
  assert.equal(poseFor({...land,frame:0},'ACT_SIDE_FLIP_LAND').rotation[1],Math.PI);
  for(let f=1;f<=9;f++)assert.ok(yaw(f)<=yaw(f-1)&&yaw(f-1)-yaw(f)<.8,`frame ${f}: gradual turn`);
  assert.equal(yaw(9),0);
});

test('slide kick is low and feet-first; decelerating keeps striding; ground pound lands seated',()=>{
  const rig=new ExplorerRig();const kick={...state,position:[0,0,0],yaw:0,action:0x0080045A,animation:140,frame:4};
  rig.animate(kick,kick,1,'ACT_SLIDE_KICK_SLIDE','ACT_SLIDE_KICK_SLIDE');
  const feet=rig.feet.map(f=>f.getWorldPosition(new Vector3()));
  assert.ok(rig.worldCenter.y<60,'body low to the ground');
  assert.ok(feet.every(f=>f.z>40&&f.y<40),'both feet out in front, near the floor');
  const walk=f=>poseFor({...state,action:0x0400044A,animation:72,frame:f,speed:12},'ACT_DECELERATING').feet[0][2];
  assert.notEqual(walk(0),walk(20),'decelerating still walks rather than skidding');
  const pound=poseFor({...state,action:0x0080023C,animation:58,frame:5},'ACT_GROUND_POUND_LAND');
  const stop=poseFor({...state,action:0x0C00023E,animation:143,frame:0},'ACT_BUTT_SLIDE_STOP');
  assert.ok(pound.rotation[0]<0&&Math.abs(pound.rotation[0]-stop.rotation[0])<1e-9,'lands in the seat the recovery starts from');
  const knock=poseFor({...state,action:0x00020460,animation:1,frame:30,speed:-20},'ACT_HARD_BACKWARD_GROUND_KB');
  assert.ok(knock.rotation[0]<-.8,'fall damage topples backward instead of running');
});

test('grabbing a ledge cancels a live crossfade and keeps gloves anchored through pull-up',()=>{
  const rig=new ExplorerRig(),idle={...state,action:0x0C400201,animation:197,frame:0},crouch={...idle,action:0x0C008220,animation:152};
  rig.animate(idle,idle,1,'ACT_IDLE','ACT_IDLE',1/60);
  rig.animate(crouch,crouch,1,'ACT_CROUCHING','ACT_CROUCHING',1/60);
  assert.ok(rig.fade,'a blend is in flight');
  rig.position.set(...state.position);rig.rotation.y=Math.PI;
  rig.animate(crouch,state,.2,'ACT_CROUCHING','ACT_LEDGE_GRAB',1/60);
  assert.equal(rig.fade,null);
  const anchors=rig.hands.map(h=>h.getWorldPosition(new Vector3()));
  assert.deepEqual(anchors.map(v=>Math.round(v.y)),[305,305]);
  let previous=state,previousName='ACT_LEDGE_GRAB';
  for(let frame=0;frame<=10;frame++) {
    const climb={...state,animation:0,frame};
    for(const alpha of [.2,.7,1]) {
      rig.animate(previous,climb,alpha,previousName,'ACT_LEDGE_CLIMB_SLOW_1',1/60);
      for(let i=0;i<2;i++)assert.ok(rig.hands[i].getWorldPosition(new Vector3()).distanceTo(anchors[i])<1e-5,`glove ${i}, frame ${frame}`);
    }
    previous=climb;previousName='ACT_LEDGE_CLIMB_SLOW_1';
  }
});

test('the running stance sole stays grounded while the torso leans and bobs',()=>{
  const rig=new ExplorerRig();
  for(const name of ['ACT_WALKING','ACT_DECELERATING'])for(const speed of [8,16,32])for(let frame=0;frame<30;frame++) {
    const s={...state,position:[0,0,0],yaw:0,action:0x04000440,animation:72,frame,speed};
    rig.animate(s,s,1,name,name);
    const bottoms=rig.feet.map(foot=>new Box3().setFromObject(foot).min.y);
    assert.ok(bottoms.every(y=>y>-.5),`${name} ${speed}, ${frame}: sole under floor: ${bottoms}`);
    assert.ok(Math.min(...bottoms)<4,`${name} ${speed}, ${frame}: both soles floating: ${bottoms}`);
  }
});
