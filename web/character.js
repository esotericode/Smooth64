import * as T from './vendor/three.module.min.js';
import {poseFor} from './pose.js';

// How long a change of action/animation takes to settle into its new pose.
// Display-time only: the core has already changed action on the tick.
const CROSSFADE=0.12;

export class ExplorerRig extends T.Group {
  constructor() {
    super();this.pivot=new T.Group();this.add(this.pivot);
    this.torso=new T.Group();this.pivot.add(this.torso);
    const orange=new T.MeshStandardMaterial({color:'#eb612f',roughness:.42});
    const cream=new T.MeshStandardMaterial({color:'#fff1ce',roughness:.55});
    const dark=new T.MeshStandardMaterial({color:'#213830',roughness:.48});
    const mesh=(geometry,material,parent=this.torso)=>{
      const m=new T.Mesh(geometry,material);m.castShadow=true;parent.add(m);return m;
    };
    mesh(new T.CapsuleGeometry(32,68,8,20),orange);
    this.head=new T.Group();this.head.position.y=26;this.torso.add(this.head);
    const visor=mesh(new T.SphereGeometry(28,16,12),dark,this.head);
    visor.scale.set(1,.52,.4);visor.position.set(0,2,28);
    this.eyes=[-10,10].map(x=>{
      const eye=mesh(new T.SphereGeometry(3.6,8,8),cream,this.head);eye.position.set(x,3,39);return eye;
    });
    const stripe=mesh(new T.TorusGeometry(32.2,2,6,32),cream);
    stripe.rotation.x=Math.PI/2;stripe.position.y=-25;
    this.hands=[-1,1].map(()=>{
      const hand=new T.Group();this.pivot.add(hand);
      mesh(new T.SphereGeometry(17,16,12),cream,hand);
      const cuff=mesh(new T.SphereGeometry(11,12,8),orange,hand);cuff.position.set(0,-8,-5);
      return hand;
    });
    this.feet=[-1,1].map(()=>{
      const foot=new T.Group();this.pivot.add(foot);
      const shoe=mesh(new T.SphereGeometry(1,16,12),dark,foot);shoe.scale.set(18,12,26);
      const sole=mesh(new T.SphereGeometry(1,12,8),cream,foot);sole.scale.set(17,3,24);sole.position.y=-9;
      const toe=mesh(new T.SphereGeometry(1,12,8),orange,foot);toe.scale.set(10,6,7);toe.position.set(0,4,19);
      return foot;
    });
    this.qa=new T.Quaternion();this.qb=new T.Quaternion();this.euler=new T.Euler();
    this.worldCenter=new T.Vector3();
    this.fade=null;this.poseKey='';
  }
  // Forget any in-progress blend, e.g. after a respawn teleport.
  snap() {this.fade=null;this.poseKey='';}
  // Record every animated channel, so a change of action can blend from it.
  capture() {
    return {pivot:this.pivot.position.clone(),quaternion:this.pivot.quaternion.clone(),scale:this.torso.scale.clone(),
      head:this.head.rotation.clone(),hands:this.hands.map(h=>[h.position.clone(),h.scale.x]),
      feet:this.feet.map(f=>[f.position.clone(),f.rotation.x]),eyes:this.eyes[0].scale.y};
  }
  animate(previous,current,alpha,previousName,currentName,dt) {
    const b=poseFor(current,currentName);
    const anchored=name=>name?.includes('LEDGE')||name?.includes('HANG');
    const contact=anchored(currentName);
    const a=contact&&!anchored(previousName)?b:poseFor(previous,previousName);
    // Only a live render (with a frame time) blends between actions. Direct
    // sampling stays exact, and pauses/steps freeze the blend where it is.
    const key=`${currentName}:${current.animation}`,live=dt!==undefined;
    const from=live&&!contact&&this.poseKey&&key!==this.poseKey?this.capture():null;
    if(live) {
      this.poseKey=key;
      // Contact constraints win over an unfinished airborne/crouching blend.
      // Blending these channels lets gloves slide off the ledge or ceiling.
      if(contact)this.fade=null;
      // A restart still advances this frame, so keys that change on
      // consecutive ticks keep converging instead of holding the snapshot.
      if(from)this.fade={from,t:0};
      if(this.fade)this.fade.t+=dt/CROSSFADE;
      if(this.fade&&this.fade.t>=1)this.fade=null;
    }
    const vector=(object,key,from,to)=>object[key].set(...from.map((n,i)=>n+(to[i]-n)*alpha));
    vector(this.pivot,'position',a.root,b.root);vector(this.torso,'scale',a.scale,b.scale);
    this.head.rotation.set(...a.head.map((n,i)=>n+(b.head[i]-n)*alpha));
    this.qa.setFromEuler(this.euler.set(...a.rotation));this.qb.setFromEuler(this.euler.set(...b.rotation));
    this.pivot.quaternion.slerpQuaternions(this.qa,this.qb,alpha);
    for(let i=0;i<2;i++) {
      vector(this.hands[i],'position',a.hands[i],b.hands[i]);
      vector(this.feet[i],'position',a.feet[i],b.feet[i]);
      this.feet[i].rotation.x=a.footPitch[i]+(b.footPitch[i]-a.footPitch[i])*alpha;
      this.hands[i].scale.setScalar(a.handScale[i]+(b.handScale[i]-a.handScale[i])*alpha);
      this.eyes[i].scale.y=a.eyes+(b.eyes-a.eyes)*alpha;
    }
    if(this.fade) {
      const f=this.fade.from,w=this.fade.t*this.fade.t*(3-2*this.fade.t);
      this.pivot.position.lerpVectors(f.pivot,this.pivot.position,w);
      this.qb.copy(this.pivot.quaternion);this.pivot.quaternion.slerpQuaternions(f.quaternion,this.qb,w);
      this.torso.scale.lerpVectors(f.scale,this.torso.scale,w);
      this.head.rotation.set(...['x','y','z'].map(k=>f.head[k]+(this.head.rotation[k]-f.head[k])*w));
      for(let i=0;i<2;i++) {
        this.hands[i].position.lerpVectors(f.hands[i][0],this.hands[i].position,w);
        this.hands[i].scale.setScalar(f.hands[i][1]+(this.hands[i].scale.x-f.hands[i][1])*w);
        this.feet[i].position.lerpVectors(f.feet[i][0],this.feet[i].position,w);
        this.feet[i].rotation.x=f.feet[i][1]+(this.feet[i].rotation.x-f.feet[i][1])*w;
        this.eyes[i].scale.y=f.eyes+(this.eyes[i].scale.y-f.eyes)*w;
      }
    }
    this.updateMatrixWorld(true);
    this.pivot.getWorldPosition(this.worldCenter);
  }
}
