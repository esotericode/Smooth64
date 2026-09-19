import {animations,animationName,animationPhase} from './animations.js';
import {poseFor as additionalPose} from './poses.js';

// Original, procedural poses for the orange explorer. This is presentation only:
// it reads immutable core snapshots and never changes collision or controls.
const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

export function poseFor(s,name='ACT_IDLE') {
  const timing=(animations[s.animation]||['UNKNOWN',0,1]).slice(1);
  const anim=animationName(s.animation);
  const progress=clamp((s.frame-timing[0])/Math.max(1,timing[1]-timing[0]-1));
  const cycle=(s.frame-timing[0])/Math.max(1,timing[1]-timing[0])*TAU;
  const p={root:[0,80,0],rotation:[0,0,0],scale:[1,1,1],
    hands:[[-49,7,2],[49,7,2]],feet:[[-21,-67,8],[21,-67,8]],
    footPitch:[0,0],handScale:[1,1],head:[0,0,0],eyes:1,accent:0};
  const air=!!(s.action&0x800),speed=Math.min(1,Math.abs(s.speed)/32);

  if(name.includes('LEDGE')) {
    // The core puts its anchor 10 units INSIDE the ledge at surface height.
    // Hang the body below/outside it, with both glove undersides on the edge.
    let climb=0;
    if(name.includes('CLIMB_DOWN'))climb=1-progress;
    else if(name.includes('CLIMB'))climb=smooth(s.frame/(name.includes('FAST')?15:27));
    // Lift outside the wall first, then move over the lip once the torso clears.
    p.root=[0,mix(-82,80,smooth(climb/.8)),mix(-52,0,smooth((climb-.72)/.28))];
    const release=smooth((climb-.68)/.32);
    p.hands=[-1,1].map(side=>blend([side*40,5-p.root[1],-10-p.root[2]],[side*49,7,2],release));
    p.feet=[[-21,-72+50*Math.sin(climb*Math.PI),12+30*Math.sin(climb*Math.PI)],
            [21,-72+65*Math.sin(climb*Math.PI*.95),4]];
    p.feet=p.feet.map((foot,i)=>blend(foot,[i?21:-21,-67,8],smooth((climb-.8)/.2)));
    p.accent=1;
  } else if(name.includes('HANG')) {
    const swing=name.includes('MOVING')?Math.sin(cycle)*12:Math.sin(s.tick*.08)*3;
    p.root[1]=66;p.hands=[[-40,77,0],[40,77,0]];
    if(name.includes('MOVING')) {
      const reach=Math.sin(cycle);
      p.hands=[[-40,77-Math.max(0,reach)*12,reach*22],[40,77-Math.max(0,-reach)*12,-reach*22]];
    }
    p.feet=[[-23,-57,swing],[23,-62,-swing]];p.accent=1;
  } else if(anim==='PUSHING'||anim==='STAND_AGAINST_WALL') {
    p.hands=[[-34,20,46],[34,20,46]];p.feet=[[-22,-67,3],[22,-67,-10]];
    p.head[0]=-.15;
  } else if(name.includes('GROUND_POUND')) {
    if(name.includes('LAND')) {
      const recover=smooth(progress);
      p.root[1]=mix(38,80,recover);p.scale=[1.14-.14*recover,.72+.28*recover,1.14-.14*recover];
      p.hands=[[-53,-15,24],[53,-15,24]];p.feet=[[-27,13-p.root[1],25],[27,13-p.root[1],25]];
    } else {
      p.root[1]=64;p.scale=[1.08,.83,1.08];
      p.hands=[[-42,47,18],[42,47,18]];p.feet=[[-25,-43,25],[25,-43,25]];
      if(s.animation===60)p.rotation[0]=TAU*smooth(progress);
    }
    p.eyes=.72;
  } else if(name.includes('PUNCH')||name.includes('JUMP_KICK')||name.includes('SLIDE_KICK')) {
    const kick=s.animation===102||name.includes('KICK');
    const second=s.animation===104||s.animation===106;
    const extend=Math.sin(Math.PI*clamp(progress*1.6));
    p.hands=[[-40,24,24],[40,24,24]];
    if(kick) {
      p.root[1]=air?78:65;p.rotation[0]=-.28;
      p.feet=[[ -24,air?-59:-50,-10],[22,-22,62+35*extend]];
      p.footPitch[1]=-.6;p.hands=[[-53,24,-10],[53,24,-10]];
    } else {
      const arm=second?0:1;
      p.hands[arm]=[second?-25:25,24,38+62*extend];
      p.handScale[arm]=1+.25*extend;p.rotation[1]=(second?-1:1)*.23*extend;
      p.root[1]=76;p.feet=[[-24,-63,18],[24,-63,-10]];
    }
    p.eyes=.8;
  } else if(name.includes('DIVE')||name.includes('BELLY_SLIDE')||name.includes('STOMACH')) {
    p.root[1]=air?80:38;p.rotation[0]=1.42;
    p.hands=[[-39,72,8],[39,72,8]];p.feet=[[-23,-70,-5],[23,-70,-5]];
  } else if(name.includes('BUTT_SLIDE')||name.includes('SLIDE_STOP')) {
    p.root[1]=47;p.rotation[0]=-.42;
    p.hands=[[-50,-16,-28],[50,-16,-28]];p.feet=[[-25,-22,66],[25,-22,66]];
    p.footPitch=[-.7,-.7];
  } else if(name.includes('CROUCH')||name.includes('CRAWL')||name.includes('SLIDING')) {
    const crawling=name.includes('CRAWL');
    p.root[1]=49;p.scale=[1.09,.66,1.09];p.rotation[0]=crawling?.45:.16;
    p.hands=[[-43,-17,24+(crawling?18*Math.sin(cycle):0)],[43,-17,24-(crawling?18*Math.sin(cycle):0)]];
    p.feet=[[-29,-36,8],[29,-36,8]];p.footPitch=[-p.rotation[0],-p.rotation[0]];
  } else if(name.includes('BACKFLIP')||name.includes('SIDE_FLIP')||name.includes('TRIPLE_JUMP')) {
    if(name.includes('SIDE_FLIP'))p.rotation[1]=Math.PI;
    if(name.includes('LAND')) {
      p.root[1]=80-22*(1-smooth(progress));p.scale[1]=.85+.15*smooth(progress);
      p.hands=[[-49,10,15],[49,10,15]];
      p.feet=[[-24,13-p.root[1],14],[24,13-p.root[1],14]];
    } else {
      const tumble=smooth(progress);
      if(name.includes('SIDE_FLIP'))p.rotation[2]=TAU*tumble;
      else p.rotation[0]=(name.includes('BACKFLIP')?-1:1)*TAU*tumble;
      const tuck=Math.sin(Math.PI*tumble);
      p.feet=[[-25,-65+35*tuck,20+20*tuck],[25,-65+35*tuck,20+20*tuck]];
      p.hands=[[-52,25+20*tuck,10],[52,25+20*tuck,10]];
    }
  } else if(name.includes('LONG_JUMP')&&!name.includes('LAND')) {
    p.rotation[0]=.35;p.root[1]=73;p.scale[1]=.91;
    p.hands=[[-42,-8,-37],[42,-8,-37]];
    p.feet=[[-24,-44,51],[24,-64,-29]];p.footPitch=[-.35,.3];
  } else if(name.includes('AIR_HIT_WALL')||name.includes('BONK')||name.includes('KNOCKBACK')) {
    p.rotation[0]=-.38;p.hands=[[-43,28,40],[43,28,40]];
    p.feet=[[-25,-58,26],[25,-48,22]];p.eyes=1.3;
  } else if(name.includes('WALL_KICK')) {
    p.rotation[0]=-.2;p.hands=[[-55,40,-14],[55,15,24]];
    p.feet=[[-23,-65,-32],[23,-40,39]];p.footPitch=[.5,-.4];
  } else if(name.includes('TURNING_AROUND')||name.includes('BRAKING')||name.includes('DECELERATING')) {
    p.root[1]=70;p.rotation[0]=-.25;p.hands=[[-56,18,-15],[56,18,-15]];
    p.feet=[[-26,-53,28],[26,-58,3]];p.footPitch=[-.35,0];
  } else if(name.includes('LAND')) {
    const recover=smooth(progress);
    p.root[1]=mix(56,80,recover);p.scale=[1.08-.08*recover,.78+.22*recover,1.08-.08*recover];
    p.hands=[[-51,6,18*(1-recover)],[51,6,18*(1-recover)]];
    p.feet=[[-24,13-p.root[1],14],[24,13-p.root[1],14]];
  } else if(air) {
    const rising=s.velocity[1]>0;
    const double=name.includes('DOUBLE_JUMP');
    p.rotation[0]=rising?.08:-.12;
    p.hands=rising?[[-49,double?62:43,13],[49,double?62:43,13]]:[[-61,27,0],[61,27,0]];
    p.feet=rising?[[-22,-46,30],[22,-64,-16]]:[[-26,-58,14],[26,-62,5]];
    if(double){p.feet=[[-23,-43,23],[23,-43,23]];p.scale[1]=1.04;}
  } else if(name.includes('WALK')||Math.abs(s.speed)>2) {
    const stride=Math.sin(cycle)*(s.speed<0?-1:1),lift=Math.cos(cycle);
    p.root[1]+=Math.abs(stride)*3*speed;p.rotation[0]=speed*.13;
    p.hands=[[-48,9,-stride*29*speed],[48,9,stride*29*speed]];
    p.feet=[[-22,-67+Math.max(0,lift)*15*speed,stride*32*speed],
            [22,-67+Math.max(0,-lift)*15*speed,-stride*32*speed]];
    p.footPitch=[stride*.3*speed,-stride*.3*speed];
  } else {
    // Retain the other branch's richer idle/secondary animation vocabulary.
    // Sample it at simulation time, so pause/step remains deterministic.
    const q=additionalPose({animName:anim,actionName:name,phase:animationPhase(s.animation,s.frame),
      speed:s.speed,air,time:s.tick/30});
    p.root[1]+=q.lift;p.rotation=[q.pitch,q.spin+q.yawOffset,q.roll];
    p.scale=[1/Math.sqrt(q.squash),q.squash,1/Math.sqrt(q.squash)];
    p.hands=[[...q.lh],[...q.rh]];p.feet=[[...q.lf],[...q.rf]];
    for(const foot of p.feet)foot[1]+=3-q.lift;
    p.footPitch=[q.lfp-q.pitch,q.rfp-q.pitch];p.head=[q.headPitch,q.headYaw,0];
    if(anim.includes('SLEEP'))p.eyes=.12;
  }
  return p;
}

export function actionCue(name,s,cameraYaw) {
  if(name==='ACT_LEDGE_GRAB') {
    const angle=s.yaw*Math.PI/32768-cameraYaw;
    const octant=((Math.round(Math.atan2(Math.sin(angle),-Math.cos(angle))/(Math.PI/4))%8)+8)%8;
    const arrow=['↑','↗','→','↘','↓','↙','←','↖'][octant];
    return `Hanging · push ${arrow} toward the ledge to climb · A / Space: quick climb · Z / Shift: drop`;
  }
  if(name.includes('LEDGE_CLIMB'))return 'Climbing · hands stay on the edge until your feet are safely up.';
  if(name==='ACT_AIR_HIT_WALL')return 'Wall contact · tap A / Space now to kick off.';
  if(name.includes('HANG'))return 'Ceiling hang · hold A / Space to keep your grip; use the stick to move.';
  return '';
}
