// The explorer's rig: floating orb hands and feet around a capsule body,
// posed every frame from the movement core's own animation and frame number.
import * as T from './vendor/three.module.min.js';
import {animationName,animationPhase} from './animations.js';
import {pose,poseFor,REST} from './poses.js';

const TAU=Math.PI*2;

function approach(current,target,k) { return current+(target-current)*k; }
function approachAngle(current,target,k) {
  const wound=current+Math.round((target-current)/TAU)*TAU;
  return approach(wound,target,k);
}
function approachPoint(current,target,k) {
  for(let i=0;i<3;i++) current[i]=approach(current[i],target[i],k);
}

export class Explorer {
  constructor() {
    this.group=new T.Group();
    this.pivot=new T.Group();this.pivot.position.y=80;this.pivot.rotation.order='YXZ';
    this.group.add(this.pivot);
    this.shell=new T.Group();this.pivot.add(this.shell);
    // The torso floats above the feet: hands and feet read as separate orbs.
    const skin=new T.MeshStandardMaterial({color:'#eb612f',roughness:.42});
    const torso=new T.Mesh(new T.CapsuleGeometry(36,48,8,20),skin);
    torso.position.y=18;torso.castShadow=true;this.shell.add(torso);
    this.head=new T.Group();this.head.position.y=34;this.shell.add(this.head);
    const visor=new T.Mesh(new T.SphereGeometry(29,16,12),new T.MeshStandardMaterial({color:'#213830',roughness:.38}));
    visor.scale.set(1,.52,.4);visor.position.set(0,9,30);this.head.add(visor);
    for(const x of [-11,11]) {
      const eye=new T.Mesh(new T.SphereGeometry(3.5,8,8),new T.MeshBasicMaterial({color:'#f8f3d1'}));
      eye.position.set(x,10,42);this.head.add(eye);
    }
    const stripe=new T.Mesh(new T.TorusGeometry(36.3,2,6,32),new T.MeshStandardMaterial({color:'#f8d8b7'}));
    stripe.rotation.x=Math.PI/2;stripe.position.y=-8;this.shell.add(stripe);
    const glove=new T.MeshStandardMaterial({color:'#f7e3c4',roughness:.5});
    const boot=new T.MeshStandardMaterial({color:'#22392f',roughness:.55});
    this.hands=[0,1].map(()=>{
      const hand=new T.Mesh(new T.SphereGeometry(15,14,12),glove);
      hand.castShadow=true;this.pivot.add(hand);return hand;
    });
    this.feet=[0,1].map(()=>{
      const foot=new T.Mesh(new T.SphereGeometry(16,14,12),boot);
      foot.scale.set(.92,.64,1.45);foot.castShadow=true;this.pivot.add(foot);return foot;
    });
    this.reset();
  }
  // A destination change teleports the explorer, so start it from rest there.
  reset() {
    this.pose=pose({lh:[...REST.lh],rh:[...REST.rh],lf:[...REST.lf],rf:[...REST.rf]});
  }
  // Animation identity and frame come from the core; only blending uses display time.
  update(state,previous,alpha,actionName,time,dt) {
    const id=state.animation;
    const sameAnimation=previous.animation===id&&state.frame>=previous.frame;
    const frame=sameAnimation?previous.frame+(state.frame-previous.frame)*alpha:state.frame;
    const context={animName:animationName(id),actionName,time,
      phase:animationPhase(id,frame),speed:state.speed,
      air:state.position[1]-state.floor>1||!!(state.action&0x00000800)};
    const target=poseFor(context);
    const k=Math.min(1,1-Math.exp(-dt*target.rate));
    const p=this.pose;
    p.pitch=approachAngle(p.pitch,target.pitch,k);
    p.roll=approachAngle(p.roll,target.roll,k);
    p.spin=approachAngle(p.spin,target.spin,k);
    for(const key of ['lift','squash','headPitch','headYaw','lfp','rfp'])
      p[key]=approach(p[key],target[key],k);
    for(const key of ['lh','rh','lf','rf']) approachPoint(p[key],target[key],k);
    p.yawOffset=target.yawOffset;
    this.pivot.rotation.set(p.pitch,p.spin,p.roll);
    this.pivot.position.y=80+p.lift;
    this.shell.scale.set(1/Math.sqrt(p.squash),p.squash,1/Math.sqrt(p.squash));
    this.head.rotation.set(p.headPitch,p.headYaw,0);
    this.hands[0].position.set(...p.lh);this.hands[1].position.set(...p.rh);
    this.feet[0].position.set(...p.lf);this.feet[1].position.set(...p.rf);
    this.feet[0].rotation.x=p.lfp;this.feet[1].rotation.x=p.rfp;
    return p.yawOffset;
  }
}
