import {animations,animationName,animationPhase} from './animations.js';
import {poseFor as additionalPose} from './poses.js';

// Original, procedural poses for the orange explorer. This is presentation only:
// it reads immutable core snapshots and never changes collision or controls.
const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

// Rig-space point -> pivot-space point for a pose with a pitch-only rotation.
// Lets a leaning body keep a foot or glove planted where the world needs it.
function underPitch(p,point) {
  const y=point[1]-p.root[1],z=point[2]-p.root[2],c=Math.cos(p.rotation[0]),s=Math.sin(p.rotation[0]);
  return [point[0]-p.root[0],y*c+z*s,-y*s+z*c];
}
// A seated body: low, leaning back, heels on the ground in front. Shared by the
// ground-pound landing and the butt-slide stop the core always follows it with.
function seated(p,rise=0,height=mix(46,80,rise)) {
  p.root[1]=height;p.rotation[0]=mix(-.38,0,rise);
  p.feet=[-1,1].map(side=>underPitch(p,[side*25,13,mix(58,10,rise)]));
  p.footPitch=[-p.rotation[0],-p.rotation[0]];
  p.hands=[-1,1].map(side=>underPitch(p,[side*mix(56,49,rise),mix(20,87,rise),mix(-30,2,rise)]));
}
// Air poses from the secondary vocabulary, mapped into this rig's frame.
function secondaryAir(p,s,anim,name) {
  const q=additionalPose({animName:anim,actionName:name,phase:animationPhase(s.animation,s.frame),
    speed:s.speed,air:true,time:s.tick/30});
  p.root[1]+=q.lift;p.rotation=[q.pitch,q.spin+q.yawOffset,q.roll];
  p.scale=[1/Math.sqrt(q.squash),q.squash,1/Math.sqrt(q.squash)];
  p.hands=[[...q.lh],[...q.rh]];p.feet=[[...q.lf],[...q.rf]];
  p.footPitch=[q.lfp,q.rfp];p.head=[q.headPitch,q.headYaw,0];
}

export function poseFor(s,name='ACT_IDLE') {
  const timing=(animations[s.animation]||['UNKNOWN',0,1]).slice(1);
  const anim=animationName(s.animation);
  const progress=clamp((s.frame-timing[0])/Math.max(1,timing[1]-timing[0]-1));
  const cycle=(s.frame-timing[0])/Math.max(1,timing[1]-timing[0])*TAU;
  const p={root:[0,80,0],rotation:[0,0,0],scale:[1,1,1],
    hands:[[-49,7,2],[49,7,2]],feet:[[-21,-67,8],[21,-67,8]],
    footPitch:[0,0],handScale:[1,1],head:[0,0,0],eyes:1,accent:0};
  const air=!!(s.action&0x800),speed=Math.min(1,Math.abs(s.speed)/32);
  // 0 while rising quickly, 1 while falling quickly: continuous across the apex.
  const falling=smooth((12-s.velocity[1])/44);

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
  } else if(name.includes('LAVA_BOOST')) {
    if(air) {
      // Scorched: seat first, both gloves thrown up, legs pedalling.
      const flail=Math.sin(s.tick*1.9),kick=Math.sin(s.tick*1.3);
      p.rotation[0]=-.5+.08*flail;p.root[1]=78;
      p.hands=[[-46,78+10*flail,-6],[46,78-10*flail,-6]];
      p.feet=[[-22,-52+14*kick,30],[22,-52-14*kick,30]];p.footPitch=[-.6,-.6];
      p.eyes=1.35;p.head[0]=-.25;
    } else seated(p,smooth(progress));
  } else if(name.includes('GROUND_POUND')) {
    if(name.includes('LAND')) {
      // Impact squash onto the seat; the core follows with ACT_BUTT_SLIDE_STOP.
      const settle=smooth(progress);
      seated(p,0,mix(34,46,settle));
      p.scale=[1.16-.16*settle,.74+.26*settle,1.16-.16*settle];
    } else {
      p.root[1]=64;p.scale=[1.08,.83,1.08];
      p.hands=[[-42,47,18],[42,47,18]];p.feet=[[-25,-43,25],[25,-43,25]];
      if(s.animation===60)p.rotation[0]=TAU*smooth(progress);
    }
    p.eyes=.72;
  } else if(name.includes('SLIDE_KICK')) {
    // Feet-first and low along the ground; the leading heel leads the slide.
    const stop=name.includes('STOP')?smooth(progress):0,airborne=air&&name==='ACT_SLIDE_KICK';
    p.root[1]=mix(airborne?60:48,70,stop);p.rotation[0]=mix(-1.12,-.25,stop);
    p.feet=[underPitch(p,[-22,mix(18,13,stop),mix(58,20,stop)]),underPitch(p,[22,mix(24,13,stop),mix(92,12,stop)])];
    p.footPitch=[-p.rotation[0]-.4,-p.rotation[0]-.7];
    p.hands=[-1,1].map(side=>underPitch(p,[side*50,mix(airborne?30:18,40,stop),mix(-46,0,stop)]));
    p.eyes=.85;
  } else if(name.includes('PUNCH')||name.includes('JUMP_KICK')) {
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
  } else if(name.includes('ROLLOUT')&&anim!=='GENERAL_FALL') {
    // A tucked somersault out of a dive, forward or backward.
    const tumble=smooth(progress),tuck=Math.sin(Math.PI*tumble);
    p.rotation[0]=(name.includes('BACKWARD')?-1:1)*TAU*tumble;
    p.hands=[[-44,20+14*tuck,26],[44,20+14*tuck,26]];
    p.feet=[[-22,-62+30*tuck,22*tuck],[22,-62+30*tuck,22*tuck]];p.footPitch=[-.5*tuck,-.5*tuck];
  } else if(name.includes('DIVE')||name.includes('BELLY_SLIDE')||name.includes('STOMACH')) {
    p.root[1]=air?80:38;p.rotation[0]=1.42;
    p.hands=[[-39,72,8],[39,72,8]];p.feet=[[-23,-70,-5],[23,-70,-5]];
  } else if(name.includes('BUTT_SLIDE')||name.includes('SLIDE_STOP')) {
    if(name==='ACT_BUTT_SLIDE_STOP') seated(p,smooth((progress-.35)/.65));
    else {
      p.root[1]=47;p.rotation[0]=-.42;
      p.hands=[[-50,-16,-28],[50,-16,-28]];p.feet=[[-25,-22,66],[25,-22,66]];
      p.footPitch=[-.7,-.7];
    }
  } else if(name.includes('CROUCH')||name.includes('CRAWL')||name.includes('SLIDING')) {
    const crawling=name.includes('CRAWL');
    p.root[1]=49;p.scale=[1.09,.66,1.09];p.rotation[0]=crawling?.45:.16;
    p.hands=[[-43,-17,24+(crawling?18*Math.sin(cycle):0)],[43,-17,24-(crawling?18*Math.sin(cycle):0)]];
    p.feet=[[-29,-36,8],[29,-36,8]];p.footPitch=[-p.rotation[0],-p.rotation[0]];
  } else if(name.includes('BACKFLIP')||name.includes('SIDE_FLIP')||name.includes('TRIPLE_JUMP')) {
    if(name.includes('LAND')) {
      // The original's side-flip landing animation turns the explorer back
      // around to the new facing; unwind the flip's half turn the same way.
      if(name.includes('SIDE_FLIP'))p.rotation[1]=Math.PI*(1-smooth(progress*1.25));
      p.root[1]=80-22*(1-smooth(progress));p.scale[1]=.85+.15*smooth(progress);
      p.hands=[[-49,10,15],[49,10,15]];
      p.feet=[[-24,13-p.root[1],14],[24,13-p.root[1],14]];
    } else {
      if(name.includes('SIDE_FLIP'))p.rotation[1]=Math.PI;
      const tumble=smooth(progress);
      if(name.includes('SIDE_FLIP'))p.rotation[2]=TAU*tumble;
      else p.rotation[0]=(name.includes('BACKFLIP')?-1:1)*TAU*tumble;
      const tuck=Math.sin(Math.PI*tumble);
      p.feet=[[-25,-65+35*tuck,20+20*tuck],[25,-65+35*tuck,20+20*tuck]];
      p.hands=[[-52,25+20*tuck,10],[52,25+20*tuck,10]];
    }
  } else if(name.includes('LONG_JUMP')&&!name.includes('LAND')) {
    // Stretch out on the way up, gather the legs as the landing approaches.
    const gather=smooth((falling-.35)/.65);
    p.rotation[0]=mix(.42,.18,gather);p.root[1]=73;p.scale[1]=mix(.9,.97,gather);
    p.hands=[[-42,mix(-8,14,gather),mix(-40,-4,gather)],[42,mix(-8,14,gather),mix(-40,-4,gather)]];
    p.feet=[[-24,mix(-44,-56,gather),mix(54,30,gather)],[24,mix(-64,-58,gather),mix(-32,4,gather)]];
    p.footPitch=[mix(-.35,-.15,gather),mix(.3,0,gather)];
  } else if(name.includes('GROUND_KB')||name.includes('GROUND_BONK')) {
    // Fall damage and hard bonks: topple onto the back (or front), then get up.
    const forward=name.includes('FORWARD'),down=smooth(progress/.35),up=smooth((progress-.62)/.38);
    const lie=down*(1-up);
    p.root[1]=mix(80,forward?38:44,lie);p.rotation[0]=(forward?1.3:-1.25)*lie;
    p.hands=[-1,1].map(side=>underPitch(p,[side*mix(49,58,lie),mix(7,forward?4:28,lie),mix(2,forward?60:-40,lie)]));
    p.feet=[-1,1].map(side=>underPitch(p,[side*24,13+(forward?0:22*lie),mix(8,forward?-70:62,lie)]));
    p.footPitch=[-p.rotation[0],-p.rotation[0]];p.eyes=mix(1,.25,lie);
  } else if(name.includes('AIR_HIT_WALL')||name.includes('BONK')||name.includes('KNOCKBACK')||name.includes('AIR_KB')) {
    const tumble=name.includes('AIR_KB')?(name.includes('FORWARD')?.45:-.55):-.38;
    p.rotation[0]=tumble;p.hands=[[-43,28,40],[43,28,40]];
    if(name.includes('AIR_KB'))p.hands=[[-56,40+8*Math.sin(s.tick*1.7),-12],[56,40-8*Math.sin(s.tick*1.7),-12]];
    p.feet=[[-25,-58,26],[25,-48,22]];p.eyes=1.3;
  } else if(name.includes('WALL_KICK')) {
    // Push off hard, then open up toward the next wall as the arc turns over.
    const open=falling;
    p.rotation[0]=mix(-.2,-.05,open);
    p.hands=[[-55,mix(40,30,open),mix(-14,6,open)],[55,mix(15,34,open),mix(24,8,open)]];
    p.feet=[[-23,mix(-65,-58,open),mix(-32,-6,open)],[23,mix(-40,-54,open),mix(39,16,open)]];
    p.footPitch=[mix(.5,.15,open),mix(-.4,-.2,open)];
  } else if(name.includes('TURNING_AROUND')||name.includes('BRAKING')) {
    p.root[1]=70;p.rotation[0]=-.25;p.hands=[[-56,18,-15],[56,18,-15]];
    p.feet=[[-26,-53,28],[26,-58,3]];p.footPitch=[-.35,0];
  } else if(name.includes('LAND')) {
    const recover=smooth(progress);
    p.root[1]=mix(56,80,recover);p.scale=[1.08-.08*recover,.78+.22*recover,1.08-.08*recover];
    p.hands=[[-51,6,18*(1-recover)],[51,6,18*(1-recover)]];
    p.feet=[[-24,13-p.root[1],14],[24,13-p.root[1],14]];
  } else if(air) {
    if(anim==='SINGLE_JUMP'||name==='ACT_JUMP') {
      // The classic: one glove punched skyward, the knee opposite drawn up.
      p.rotation[0]=mix(.08,-.08,falling);
      p.hands=[[-50,mix(-10,24,falling),mix(-14,0,falling)],[40,mix(66,44,falling),mix(10,6,falling)]];
      p.feet=[[-20,mix(-44,-56,falling),mix(28,16,falling)],[20,mix(-66,-62,falling),mix(-14,-2,falling)]];
      p.footPitch=[mix(-.45,-.2,falling),mix(.2,0,falling)];
      p.scale[1]=mix(1.04,1,falling);
    } else if(name.includes('DOUBLE_JUMP')) {
      // Both gloves high on the way up, spread for balance on the way down.
      p.rotation[0]=mix(.06,-.1,falling);p.scale[1]=mix(1.05,1,falling);
      p.hands=[[mix(-38,-60,falling),mix(64,34,falling),mix(8,-4,falling)],[mix(38,60,falling),mix(64,34,falling),mix(8,-4,falling)]];
      p.feet=[[-21,mix(-42,-60,falling),mix(22,14,falling)],[21,mix(-46,-62,falling),mix(18,-4,falling)]];
      p.footPitch=[mix(-.4,-.15,falling),mix(-.35,0,falling)];
    } else secondaryAir(p,s,anim,name);
  } else if(name.includes('WALK')||name.includes('DECELERATING')||Math.abs(s.speed)>2) {
    const stride=Math.sin(cycle)*(s.speed<0?-1:1),lift=Math.cos(cycle);
    p.root[1]+=Math.abs(stride)*3*speed;p.rotation[0]=speed*.13;
    p.hands=[[-48,9,-stride*29*speed],[48,9,stride*29*speed]];
    // Place the stance sole on the ground even while the torso leans/bobs.
    const lifts=[Math.max(0,lift),Math.max(0,-lift)];
    p.feet=[-1,1].map((side,i)=>underPitch(p,[side*22,13+lifts[i]*15*speed,-side*stride*32*speed]));
    p.footPitch=lifts.map((height,i)=>-p.rotation[0]+height*(i?-1:1)*stride*.3*speed);
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
  if(name.includes('LEDGE_CLIMB'))return 'Climbing…';
  if(name==='ACT_AIR_HIT_WALL')return 'Wall contact · tap A / Space now to kick off.';
  if(name.includes('HANG'))return 'Ceiling hang · hold A / Space to keep your grip; use the stick to move.';
  return '';
}
