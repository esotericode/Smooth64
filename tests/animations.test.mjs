// Animation-library coverage retained from the parallel branch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animations,animationName,animationPhase} from '../web/animations.js';
import {poseFor} from '../web/poses.js';

test('every animation the core can select produces a usable pose',()=>{
  assert.equal(animations.length,209);
  for(let id=0;id<animations.length;id++) {
    const animName=animationName(id);
    assert.match(animName,/^[A-Z][A-Z0-9_]*$/);
    const [,start,end]=animations[id];
    assert.ok(end>start&&start>=0,`${animName} loops ${start}..${end}`);
    assert.equal(animationPhase(id,start),0);
    assert.ok(animationPhase(id,end)<=1);
    for(const phase of [0,.17,.4,.63,.9,1])
      for(const air of [false,true])
        for(const speed of [-24,0,32]) {
          const p=poseFor({animName,actionName:'ACT_TEST',phase,speed,air,time:phase*7});
          for(const limb of ['lh','rh','lf','rf'])
            for(const value of p[limb])
              assert.ok(Number.isFinite(value)&&Math.abs(value)<240,`${animName} ${limb} ${value}`);
          for(const key of ['pitch','roll','spin','lift','headPitch','headYaw','lfp','rfp'])
            assert.ok(Number.isFinite(p[key]),`${animName} ${key}`);
          assert.ok(p.rate>0&&p.rate<=60,`${animName} rate ${p.rate}`);
          assert.ok(p.squash>.4&&p.squash<1.6,`${animName} squash ${p.squash}`);
        }
  }
});

test('poses stay attached to the action the core reports',()=>{
  const ledge=poseFor({animName:'IDLE_ON_LEDGE',actionName:'ACT_LEDGE_GRAB',phase:0,speed:0,air:false,time:0});
  assert.ok(ledge.lift<-100&&ledge.lh[1]>0,'a ledge grab hangs below the lip it holds');
  for(const [animName,actionName] of [['HANG_ON_CEILING','ACT_START_HANGING'],
      ['HANDSTAND_LEFT','ACT_HANGING'],['MOVE_ON_WIRE_NET_LEFT','ACT_HANG_MOVING']]) {
    const hang=poseFor({animName,actionName,phase:.25,speed:0,air:false,time:0});
    assert.ok(hang.lh[1]>60&&hang.rh[1]>60,`${actionName} must reach both hands overhead`);
  }
  const wall=poseFor({animName:'SINGLE_JUMP',actionName:'ACT_AIR_HIT_WALL',phase:.2,speed:20,air:true,time:0});
  assert.ok(wall.lh[2]>30&&wall.rh[2]>30,'wall contact plants both hands forward');
  const punch=poseFor({animName:'FIRST_PUNCH',actionName:'ACT_PUNCHING',phase:.5,speed:0,air:false,time:0});
  assert.ok(punch.rh[2]>60&&punch.lh[2]<0,'a punch drives one hand out and pulls the other back');
  const spin=poseFor({animName:'TRIPLE_JUMP',actionName:'ACT_TRIPLE_JUMP',phase:1,speed:32,air:true,time:0});
  assert.ok(Math.abs(spin.pitch-Math.PI*2)<1e-9,'a triple jump is one whole somersault');
});
