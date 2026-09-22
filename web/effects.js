import * as T from './vendor/three.module.min.js';

// Small, pooled particle effects: dust, sparks, fire and pickup glitter.
// Presentation only. Events are read from consecutive simulation snapshots,
// so they happen on the tick the core changed action, never on their own.
const AIR=0x800,MAX=420;
const VERTEX=`attribute float alpha;attribute float size;attribute vec3 tint;varying float vAlpha;varying vec3 vTint;
uniform float scale;
#include <fog_pars_vertex>
void main(){vAlpha=alpha;vTint=tint;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
gl_PointSize=size*scale/max(1.0,-mvPosition.z);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const FRAGMENT=`varying float vAlpha;varying vec3 vTint;
#include <fog_pars_fragment>
void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;
gl_FragColor=vec4(vTint,vAlpha*smoothstep(.5,.18,d));
#include <fog_fragment>
}`;

class Pool {
  constructor(scene,additive) {
    this.items=[];this.geometry=new T.BufferGeometry();
    for(const [name,size] of [['position',3],['tint',3],['alpha',1],['size',1]])
      this.geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(MAX*size),size).setUsage(T.DynamicDrawUsage));
    this.material=new T.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,transparent:true,depthWrite:false,fog:true,
      blending:additive?T.AdditiveBlending:T.NormalBlending,
      uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{scale:{value:800}}])});
    this.points=new T.Points(this.geometry,this.material);this.points.frustumCulled=false;scene.add(this.points);
  }
  add(p) {if(this.items.length>=MAX)this.items.shift();this.items.push(p);}
  update(dt,height) {
    this.material.uniforms.scale.value=height*.9;
    const a=this.geometry.attributes;
    this.items=this.items.filter(p=>(p.age+=dt)<p.life);
    this.items.forEach((p,i)=>{
      const k=Math.pow(p.drag,dt*30);
      p.velocity[0]*=k;p.velocity[2]*=k;p.velocity[1]=p.velocity[1]*k+p.gravity*dt;
      for(let j=0;j<3;j++)p.position[j]+=p.velocity[j]*dt;
      const t=p.age/p.life;
      a.position.array.set(p.position,i*3);
      a.tint.array.set(p.color.map((c,j)=>c+(p.end[j]-c)*t),i*3);
      a.alpha.array[i]=p.alpha*(t<.15?t/.15:1-(t-.15)/.85);
      a.size.array[i]=p.size+(p.grow-p.size)*t;
    });
    for(const key of ['position','tint','alpha','size'])a[key].needsUpdate=true;
    this.geometry.setDrawRange(0,this.items.length);
  }
  clear() {this.items=[];this.geometry.setDrawRange(0,0);}
}

export class Effects {
  constructor(scene) {
    this.soft=new Pool(scene,false);this.glow=new Pool(scene,true);this.seed=1;this.dust='#e9e6d2';
  }
  random() {this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  color(value) {const c=new T.Color(value);return [c.r,c.g,c.b];}
  clear() {this.soft.clear();this.glow.clear();}
  // A ring of particles thrown out horizontally, e.g. dust around the feet.
  ring(position,{count=10,speed=160,rise=40,size=46,grow=120,life=.5,color=this.dust,end=color,alpha=.7,glow=false,y=6,drag=.86,gravity=0}={}) {
    const start=this.random()*Math.PI*2;
    for(let i=0;i<count;i++) {
      const angle=start+i/count*Math.PI*2,v=speed*(.75+.5*this.random());
      (glow?this.glow:this.soft).add({position:[position[0]+Math.sin(angle)*18,position[1]+y,position[2]+Math.cos(angle)*18],
        velocity:[Math.sin(angle)*v,rise*(.6+.8*this.random()),Math.cos(angle)*v],gravity,drag,
        color:this.color(color),end:this.color(end),alpha,size,grow,life:life*(.8+.4*this.random()),age:0});
    }
  }
  // A spherical burst, e.g. sparks off a wall or glitter from a pickup.
  burst(position,{count=12,speed=260,size=26,grow=8,life=.45,color='#fff3b0',end='#ff9b3d',alpha=1,glow=true,gravity=-420,drag=.9,up=80}={}) {
    for(let i=0;i<count;i++) {
      const u=this.random()*2-1,angle=this.random()*Math.PI*2,r=Math.sqrt(1-u*u),v=speed*(.5+.7*this.random());
      (glow?this.glow:this.soft).add({position:[...position],velocity:[Math.cos(angle)*r*v,u*v+up,Math.sin(angle)*r*v],
        gravity,drag,color:this.color(color),end:this.color(end),alpha,size,grow,life:life*(.7+.6*this.random()),age:0});
    }
  }
  fire(position,count=2) {
    for(let i=0;i<count;i++) {
      const jitter=()=>(this.random()-.5)*36;
      this.glow.add({position:[position[0]+jitter(),position[1]+jitter()*.5,position[2]+jitter()],
        velocity:[jitter()*1.5,90+90*this.random(),jitter()*1.5],gravity:60,drag:.9,
        color:this.color('#ffd36b'),end:this.color('#e2380f'),alpha:.9,size:44,grow:12,life:.38+.2*this.random(),age:0});
      if(this.random()<.45)this.soft.add({position:[position[0]+jitter(),position[1]+20,position[2]+jitter()],
        velocity:[jitter(),70+50*this.random(),jitter()],gravity:20,drag:.92,
        color:this.color('#4a3a38'),end:this.color('#2a2226'),alpha:.45,size:40,grow:130,life:.9,age:0});
    }
  }
  // Read one tick's transition from the core's snapshots.
  onTick(prev,cur,prevName,name) {
    const wasAir=!!(prev.action&AIR),isAir=!!(cur.action&AIR),at=cur.position,feet=[at[0],cur.floor,at[2]];
    if(prevName==='ACT_AIR_HIT_WALL'&&name==='ACT_WALL_KICK_AIR') {
      const yaw=prev.yaw*Math.PI/32768;
      this.burst([prev.position[0]+Math.sin(yaw)*40,prev.position[1]+90,prev.position[2]+Math.cos(yaw)*40],{count:14,speed:240});
      this.ring([prev.position[0]+Math.sin(yaw)*30,prev.position[1]+20,prev.position[2]+Math.cos(yaw)*30],{count:6,speed:90,rise:-10,size:34,grow:90,life:.4});
    } else if(!wasAir&&isAir&&cur.velocity[1]>20&&!name.includes('LAVA')) {
      this.ring([prev.position[0],prev.floor,prev.position[2]],{count:name.includes('LONG_JUMP')||name.includes('TRIPLE')?12:8,speed:130,size:40,grow:105,life:.42});
    }
    if(wasAir&&!isAir&&!name.includes('LEDGE')&&!name.includes('LAVA')) {
      const impact=Math.min(1,Math.max(0,(-prev.velocity[1]-20)/55));
      if(name.includes('GROUND_POUND')) {
        this.ring(feet,{count:20,speed:420,rise:30,size:60,grow:170,life:.6,alpha:.85});
        this.burst([at[0],cur.floor+40,at[2]],{count:10,speed:300,up:260,size:30,gravity:-700});
      } else if(impact>0) this.ring(feet,{count:6+Math.round(8*impact),speed:110+160*impact,size:38,grow:90+50*impact,life:.45});
    }
    if(name.includes('LAVA_BOOST')&&!prevName.includes('LAVA_BOOST')) {
      this.burst([at[0],at[1]+30,at[2]],{count:26,speed:320,up:320,size:48,color:'#ffe08a',end:'#d9300e',life:.6,gravity:-300});
      this.ring(feet,{count:14,speed:260,rise:120,size:60,grow:190,color:'#5c4640',end:'#2b2124',alpha:.55,life:1});
    }
    if(name==='ACT_LAVA_BOOST'&&isAir)this.fire([at[0],at[1]+36,at[2]],2);
    const skid=name.includes('BRAKING')||name.includes('TURNING_AROUND')||name.includes('SLIDE')&&!isAir&&Math.abs(cur.speed)>10;
    if(skid&&cur.tick%2===0)this.ring(feet,{count:2,speed:50,rise:50,size:34,grow:80,life:.4,alpha:.5});
  }
  update(dt,height) {this.soft.update(dt,height);this.glow.update(dt,height);}
}
