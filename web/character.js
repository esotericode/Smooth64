import * as T from './vendor/three.module.min.js';
import {poseFor} from './pose.js';

export class ExplorerRig extends T.Group {
  constructor() {
    super();this.pivot=new T.Group();this.add(this.pivot);
    const orange=new T.MeshStandardMaterial({color:'#eb612f',roughness:.42});
    const cream=new T.MeshStandardMaterial({color:'#fff1ce',roughness:.55});
    const dark=new T.MeshStandardMaterial({color:'#213830',roughness:.48});
    const mesh=(geometry,material,parent=this.pivot)=>{
      const m=new T.Mesh(geometry,material);m.castShadow=true;parent.add(m);return m;
    };
    mesh(new T.CapsuleGeometry(32,68,8,20),orange);
    const visor=mesh(new T.SphereGeometry(28,16,12),dark);
    visor.scale.set(1,.52,.4);visor.position.set(0,28,28);
    this.eyes=[-10,10].map(x=>{
      const eye=mesh(new T.SphereGeometry(3.6,8,8),cream);eye.position.set(x,29,39);return eye;
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
  }
  animate(previous,current,alpha,previousName,currentName) {
    const a=poseFor(previous,previousName),b=poseFor(current,currentName);
    const vector=(object,key,from,to)=>object[key].set(...from.map((n,i)=>n+(to[i]-n)*alpha));
    vector(this.pivot,'position',a.root,b.root);vector(this.pivot,'scale',a.scale,b.scale);
    this.qa.setFromEuler(this.euler.set(...a.rotation));this.qb.setFromEuler(this.euler.set(...b.rotation));
    this.pivot.quaternion.slerpQuaternions(this.qa,this.qb,alpha);
    for(let i=0;i<2;i++) {
      vector(this.hands[i],'position',a.hands[i],b.hands[i]);
      vector(this.feet[i],'position',a.feet[i],b.feet[i]);
      this.feet[i].rotation.x=a.footPitch[i]+(b.footPitch[i]-a.footPitch[i])*alpha;
      this.hands[i].scale.setScalar(a.handScale[i]+(b.handScale[i]-a.handScale[i])*alpha);
      this.eyes[i].scale.y=a.eyes+(b.eyes-a.eyes)*alpha;
    }
    this.updateMatrixWorld(true);
    this.pivot.getWorldPosition(this.worldCenter);
  }
}
