// Pose targets for the explorer's rig, chosen by the animation the movement
// core selected and advanced by the frame the core is on. Nothing here invents
// timing: phase comes from the core, only blending uses display time.
const TAU=Math.PI*2;
// Body space: the waist is the origin, +Z is the way the explorer faces, and
// the soles rest at -80, the foot point the collision core positions.
export const REST={lh:[-48,-4,10],rh:[48,-4,10],lf:[-22,-70,10],rf:[22,-70,10]};
const smoothstep=t=>t*t*(3-2*t);

export function pose(fields) {
  return {pitch:0,roll:0,spin:0,yawOffset:0,lift:0,squash:1,headPitch:0,headYaw:0,
    lfp:0,rfp:0,rate:15,lh:REST.lh,rh:REST.rh,lf:REST.lf,rf:REST.rf,...fields};
}

// Stride cycle. The phase comes from the core's animation frame, which the
// original accelerates with forward speed, so the legs keep the game's timing.
function gait(c,stride,hop,swing,lean=0) {
  const back=c.speed<0?-1:1;
  const s=Math.sin(c.phase*TAU)*back,step=Math.cos(c.phase*TAU);
  return pose({pitch:lean,rate:20,
    lf:[-21,-70+Math.max(0,step)*hop,8+s*stride],
    rf:[21,-70+Math.max(0,-step)*hop,8-s*stride],
    lfp:-s*.45,rfp:s*.45,
    lh:[-50+Math.abs(s)*7,-6+Math.abs(s)*swing*.35,8-s*swing],
    rh:[50-Math.abs(s)*7,-6+Math.abs(s)*swing*.35,8+s*swing]});
}

export function poseFor(c) {
  const n=c.animName,a=c.actionName,ph=c.phase,t=c.time;
  const bob=Math.sin(t*2.3)*2.2;

  // Hanging under a ceiling: both orbs grip overhead and the legs dangle. The
  // core reuses the handstand and wire-net animations here, so the action decides.
  if(a.includes('HANG')||n==='HANG_ON_CEILING'||n==='HANG_ON_OWL') {
    const reach=a==='ACT_HANG_MOVING'?Math.sin(ph*TAU):0,sway=Math.sin(t*1.9)*3;
    return pose({pitch:.08,headPitch:-.4,
      lh:[-26,78+reach*8,4+reach*18],rh:[26,78-reach*8,4-reach*18],
      lf:[-17+sway,-78,-10],rf:[17+sway,-78,-10],lfp:-.5,rfp:-.5});
  }
  // A grabbed ledge: the core parks the body at the lip, so hang it underneath.
  if(n==='IDLE_ON_LEDGE') {
    const sway=Math.sin(t*1.7)*3;
    return pose({lift:-114,headPitch:.2,rate:22,
      lh:[-34,34,30],rh:[34,34,30],
      lf:[-18+sway,-76,-2],rf:[18+sway,-76,-2],lfp:-.25,rfp:-.25});
  }
  // Climbing up and over: the same hang, unwound across the climb animation.
  if(n==='SLOW_LEDGE_GRAB'||n==='FAST_LEDGE_GRAB'||n==='CLIMB_DOWN_LEDGE') {
    const up=n==='CLIMB_DOWN_LEDGE'?1-smoothstep(ph):smoothstep(ph),down=1-up;
    return pose({lift:-114*down,pitch:.5*up*down*4,rate:26,
      lh:[-34-6*up,34*down+(-6)*up,30-22*up],rh:[34+6*up,34*down+(-6)*up,30-22*up],
      lf:[-19,-70-6*down,8-4*down+24*up*down*4],rf:[19,-70-6*down,8-4*down],
      lfp:-.6*up*down*4});
  }

  // Punches and throws: one orb hand drives forward, the body turns into it.
  if(n.includes('PUNCH')||n==='GROUND_THROW'||n==='HEAVY_THROW'||n==='THROW_LIGHT_OBJECT') {
    const hit=Math.sin(ph*Math.PI),left=n.startsWith('SECOND');
    const out=[left?-18:18,4,20+hit*74],back=[left?46:-46,-10,-16];
    return pose({spin:(left?.3:-.3)*hit,rate:40,pitch:.12*hit,
      lh:left?out:back,rh:left?back:out,
      lf:[-21,-70,8+(left?14:-8)],rf:[21,-70,8+(left?-8:14)]});
  }
  // Kicks: the leading foot is the whole read, so throw it well clear.
  if(n==='GROUND_KICK'||n==='AIR_KICK') {
    const hit=Math.sin(ph*Math.PI);
    return pose({pitch:-.36*hit,rate:40,
      lh:[-54,-4-hit*10,-16],rh:[54,-4-hit*10,-16],
      lf:[-19,-70+hit*20,8-hit*18],rf:[21,-70+hit*62,8+hit*76],rfp:-1.1*hit});
  }
  if(n==='SLIDE_KICK'||n==='CROUCH_FROM_SLIDE_KICK'||n==='FALL_FROM_SLIDE_KICK') {
    return pose({pitch:1.15,lift:-38,rate:26,
      lh:[-46,-26,-30],rh:[46,-26,-30],
      lf:[-19,-58,44],rf:[21,-44,74],rfp:-.7});
  }

  // Ground pound: the wind-up spins, then the legs lock out underneath.
  if(n==='START_GROUND_POUND') {
    return pose({spin:ph*TAU*2,rate:60,squash:1.06,
      lh:[-62,6,0],rh:[62,6,0],lf:[-19,-68,4],rf:[19,-68,4]});
  }
  if(n==='GROUND_POUND') {
    return pose({squash:.88,rate:34,lift:6,
      lh:[-40,10,-8],rh:[40,10,-8],lf:[-14,-72,-4],rf:[14,-72,-4],lfp:.4,rfp:.4});
  }
  if(n==='GROUND_POUND_LANDING'||n==='TWIRL_LAND'||n==='GROUND_BONK') {
    return pose({squash:.66,lift:-20,rate:34,
      lh:[-58,-30,14],rh:[58,-30,14],lf:[-27,-70,10],rf:[27,-70,10]});
  }

  // Flips. The rotation is one continuous sweep across the animation.
  if(n==='TRIPLE_JUMP'||n==='FORWARD_SPINNING_FLIP'||n==='FORWARD_SPINNING'||
     n==='START_FORWARD_SPINNING'||n==='TRIPLE_JUMP_FLY') {
    return pose({pitch:ph*TAU,rate:60,squash:.94,
      lh:[-40,14,22],rh:[40,14,22],lf:[-19,-54,26],rf:[19,-54,26],lfp:-.7,rfp:-.7});
  }
  if(n==='BACKFLIP'||n==='BACKWARD_SPINNING') {
    return pose({pitch:-ph*TAU,rate:60,
      lh:[-52,20,-6],rh:[52,20,-6],lf:[-19,-52,20],rf:[19,-52,20],lfp:-.6,rfp:-.6});
  }
  if(n==='SLIDEFLIP'||n==='SLIDEFLIP_LAND') {
    // The original also spins the model a half turn for a side somersault.
    const spinning=n==='SLIDEFLIP';
    return pose({roll:spinning?ph*TAU:0,yawOffset:Math.PI,rate:60,
      lh:[-62,16,0],rh:[62,16,0],lf:[-24,-58,12],rf:[24,-58,12]});
  }
  if(n==='TWIRL'||n==='START_TWIRL') {
    return pose({spin:ph*TAU,rate:60,lh:[-64,8,0],rh:[64,8,0],lf:[-20,-62,6],rf:[20,-62,6]});
  }

  // Long jump and dive: the two flattest, fastest silhouettes in the game.
  if(n==='FAST_LONGJUMP'||n==='SLOW_LONGJUMP') {
    return pose({pitch:.34,rate:24,
      lh:[-44,16,40],rh:[44,16,40],
      lf:[-24,-60,34],rf:[24,-72,-26],lfp:-.5,rfp:.4});
  }
  if(n==='DIVE'||n==='SLIDE_DIVE'||n==='AIRBORNE_ON_STOMACH'||n==='LAND_ON_STOMACH'||
     n==='SLOW_LAND_FROM_DIVE'||n==='FLY_FROM_CANNON') {
    const flat=n==='DIVE'||n==='SLIDE_DIVE'?1.28:1.5;
    return pose({pitch:flat,rate:22,lift:n.includes('LAND')?-26:0,
      lh:[-30,12,54],rh:[30,12,54],lf:[-19,-72,-16],rf:[19,-72,-16],lfp:.5,rfp:.5});
  }
  if(n==='CROUCH_FROM_FAST_LONGJUMP'||n==='CROUCH_FROM_SLOW_LONGJUMP') {
    return pose({squash:.66,lift:-22,rate:30,
      lh:[-50,-28,20],rh:[50,-28,20],lf:[-24,-70,12],rf:[24,-70,12]});
  }

  // Wall work: a hand and a foot plant on the wall the explorer is facing.
  // The core keeps the jump animation during contact, so the action decides.
  if(a==='ACT_AIR_HIT_WALL'||n==='START_WALLKICK') {
    return pose({pitch:-.1,rate:44,
      lh:[-32,22,44],rh:[32,22,44],lf:[-20,-48,36],rf:[20,-66,-8],lfp:-.5,rfp:.2});
  }
  if(n==='SLIDEJUMP') {
    return pose({pitch:.1,rate:40,
      lh:[-38,34,10],rh:[38,34,10],lf:[-20,-50,18],rf:[20,-64,-14],lfp:-.5,rfp:.3});
  }

  // Jumps.
  if(n==='SINGLE_JUMP'||n==='JUMP_WITH_LIGHT_OBJ'||n==='JUMP_RIDING_SHELL') {
    return pose({rate:28,pitch:.06,
      lh:[-48,-14,-14],rh:[42,34,6],lf:[-19,-58,18],rf:[19,-62,-10],lfp:-.4});
  }
  if(n==='DOUBLE_JUMP_RISE') {
    return pose({rate:30,squash:1.06,
      lh:[-34,40,4],rh:[34,40,4],lf:[-17,-60,4],rf:[17,-60,4],lfp:-.3,rfp:-.3});
  }
  if(n==='DOUBLE_JUMP_FALL') {
    return pose({rate:26,
      lh:[-52,22,-8],rh:[52,22,-8],lf:[-20,-66,10],rf:[20,-66,10]});
  }
  if(n.startsWith('LAND_FROM')||n==='GENERAL_LAND'||n==='TRIPLE_JUMP_LAND'||
     n==='JUMP_LAND_WITH_LIGHT_OBJ'||n==='FALL_LAND_WITH_LIGHT_OBJ') {
    const up=smoothstep(ph);
    return pose({squash:.72+up*.28,lift:-20+up*20,rate:30,
      lh:[-54,-24+up*18,16-up*8],rh:[54,-24+up*18,16-up*8],
      lf:[-25,-70,10],rf:[25,-70,10]});
  }
  if(n==='GENERAL_FALL'||n==='FALL_FROM_SLIDE'||n==='FALL_FROM_WATER'||
     n==='FALL_FROM_SLIDING_WITH_LIGHT_OBJ'||n==='FALL_WITH_LIGHT_OBJ') {
    const flail=Math.sin(t*13)*6;
    return pose({rate:18,pitch:-.08,
      lh:[-50,26+flail,-4],rh:[50,26-flail,-4],
      lf:[-22,-68,-6],rf:[22,-68,10],lfp:.2});
  }
  // Knocked about: readable even though nothing here can deal damage.
  if(n.includes('_KB')||n==='SOFT_BACK_KB'||n==='SOFT_FRONT_KB'||n==='ELECTROCUTION'||n==='SHOCKED') {
    const flail=Math.sin(t*17)*9;
    return pose({pitch:-.45,rate:20,
      lh:[-56,32+flail,-16],rh:[56,32-flail,-16],lf:[-22,-62,22],rf:[22,-62,22]});
  }

  // Slides, on the seat and on the stomach.
  if(n==='SLIDE'||n==='STOP_SLIDE'||n==='SLIDE_MOTIONLESS'||n==='STOP_SLIDE_LIGHT_OBJ'||
     n.startsWith('SLIDING_ON_BOTTOM')||n.startsWith('STAND_UP_FROM_SLIDING')) {
    const up=n.startsWith('STAND_UP')?smoothstep(ph):0;
    return pose({pitch:-.34+up*.34,lift:-34+up*34,rate:24,
      lh:[-52,-30,-22],rh:[52,-30,-22],
      lf:[-22,-56+up*-14,46-up*38],rf:[22,-56+up*-14,46-up*38],lfp:-.5+up*.5,rfp:-.5+up*.5});
  }

  // Crouching, crawling and the turn-around skid.
  if(n==='CROUCHING'||n==='START_CROUCHING'||n==='STOP_CROUCHING') {
    const up=n==='STOP_CROUCHING'?smoothstep(ph):n==='START_CROUCHING'?1-smoothstep(ph):0;
    return pose({squash:.74+up*.26,lift:-16+up*16,rate:26,
      lh:[-46,-30+up*24,18-up*10],rh:[46,-30+up*24,18-up*10],
      lf:[-25,-70,10],rf:[25,-70,10]});
  }
  if(n==='CRAWLING'||n==='START_CRAWLING'||n==='STOP_CRAWLING') {
    const s=Math.sin(ph*TAU),step=Math.cos(ph*TAU);
    return pose({squash:.82,lift:-34,pitch:.46,rate:24,headPitch:-.3,
      lh:[-40,-30+Math.max(0,step)*12,30+s*20],rh:[40,-30+Math.max(0,-step)*12,30-s*20],
      lf:[-23,-58,-4-s*18],rf:[23,-58,-4+s*18]});
  }
  if(n==='SKID_ON_GROUND'||n==='STOP_SKID'||n==='TURNING_PART1'||n==='TURNING_PART2') {
    const brace=n.startsWith('TURNING')?.4:1;
    return pose({pitch:-.26*brace,roll:.12*brace,rate:26,
      lh:[-62,4,-18],rh:[62,10,10],
      lf:[-24,-70,18*brace],rf:[24,-68,-14*brace],lfp:-.4*brace});
  }
  if(n==='PUSHING'||n==='STAND_AGAINST_WALL') {
    return pose({pitch:.14,rate:20,
      lh:[-34,2,44],rh:[34,2,44],lf:[-21,-70,6],rf:[21,-70,-14]});
  }

  // Walking family. Amplitude comes from the animation the core picked.
  if(n==='WALKING'||n==='WALK_PANTING'||n==='WALK_WITH_LIGHT_OBJ'||n==='WALK_WITH_HEAVY_OBJ')
    return gait(c,26,11,16,.06);
  if(n==='RUNNING'||n==='RUNNING_UNUSED'||n==='RUN_WITH_LIGHT_OBJ')
    return gait(c,50,26,34,.2);
  if(n==='TIPTOE'||n==='START_TIPTOE'||n==='SLOW_WALK_WITH_LIGHT_OBJ')
    return gait(c,15,7,9,.02);
  if(n==='SIDESTEP_LEFT'||n==='SIDESTEP_RIGHT') {
    const side=n.endsWith('LEFT')?-1:1,s=Math.sin(ph*TAU);
    return pose({roll:.06*side,rate:22,
      lh:[-52,-4,6],rh:[52,-4,6],
      lf:[-21+s*12*side,-70+Math.max(0,s*side)*10,8],rf:[21+s*12*side,-70+Math.max(0,-s*side)*10,8]});
  }

  // Standing still, in its several flavours.
  if(n.startsWith('SLEEP')||n.startsWith('START_SLEEP')||n.startsWith('WAKE_')) {
    const breath=Math.sin(t*1.1)*4;
    return pose({squash:.9,lift:-10,pitch:.12,headPitch:.5,rate:10,
      lh:[-40,-30+breath,14],rh:[40,-30+breath,14],lf:[-24,-70,4],rf:[24,-70,4]});
  }
  if(n==='SHIVERING'||n==='SHIVERING_WARMING_HAND'||n==='SHIVERING_RETURN_TO_IDLE'||n==='COUGHING') {
    const shake=Math.sin(t*33)*2.5;
    return pose({rate:40,squash:.96,
      lh:[-38+shake,-16,18],rh:[38-shake,-16,18],lf:[-20,-70,6],rf:[20,-70,6]});
  }
  if(n==='HANDSTAND_IDLE'||n==='START_HANDSTAND'||n==='RETURN_FROM_HANDSTAND'||n==='HANDSTAND_JUMP') {
    return pose({pitch:Math.PI,rate:18,
      lh:[-30,-76,0],rh:[30,-76,0],lf:[-18,-62,8],rf:[18,-62,8]});
  }

  // Everything unlisted still reads: fall in the air, stride on the ground.
  if(c.air) {
    const flail=Math.sin(t*11)*5;
    return pose({rate:16,lh:[-52,18+flail,0],rh:[52,18-flail,0],
      lf:[-21,-68,-4],rf:[21,-68,8]});
  }
  if(Math.abs(c.speed)>4) return gait(c,26,11,16,.05);
  return pose({rate:12,squash:1+bob*.003,
    lh:[-50,-6+bob,8],rh:[50,-6+bob,8],
    lf:[-21,-70,8],rf:[21,-70,8],headYaw:Math.sin(t*.55)*.22});
}
