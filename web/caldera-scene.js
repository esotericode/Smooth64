import * as T from './vendor/three.module.min.js';
import {groundText} from './decor.js';
import {rimRadius} from './caldera.js';

// Molten rock pouring down the crater wall: bands of noise falling in local space.
const FALL_VERTEX=`varying vec2 vUv;
#include <fog_pars_vertex>
void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const FALL_FRAGMENT=`uniform float time;uniform float seed;varying vec2 vUv;
#include <fog_pars_fragment>
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){float edge=smoothstep(0.0,.28,vUv.x)*smoothstep(1.0,.72,vUv.x);
vec2 p=vec2(vUv.x*5.0+seed,vUv.y*9.0+time*1.4);float n=noise(p)*.65+noise(p*2.3)*.35;
float heat=smoothstep(.25,.75,n);vec3 color=mix(vec3(.55,.08,.02),vec3(1.0,.6,.16),heat);
float alpha=edge*(.55+.45*heat)*smoothstep(0.0,.06,vUv.y);
gl_FragColor=vec4(color*1.3,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;

// Render-only dressing for Cinder Caldera. Nothing here collides: every
// surface the explorer can touch is a triangle in caldera.js.
function softDot() {
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
}

export function decorateCaldera(group,world,renderer) {
  const updates=[];
  // Sky: a gradient dome that travels with the camera.
  {
    const geometry=new T.SphereGeometry(20000,32,18),colors=[],stops=[
      [-1,'#1a0c10'],[-.02,'#4a1a14'],[.05,'#9a3a24'],[.16,'#4e2238'],[.45,'#2a1a3a'],[1,'#171126']];
    const position=geometry.attributes.position,c=new T.Color(),a=new T.Color(),b=new T.Color();
    for(let i=0;i<position.count;i++) {
      const y=position.getY(i)/20000;let k=0;
      while(k<stops.length-2&&y>stops[k+1][0])k++;
      const t=Math.max(0,Math.min(1,(y-stops[k][0])/(stops[k+1][0]-stops[k][0])));
      c.copy(a.set(stops[k][1])).lerp(b.set(stops[k+1][1]),t);colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const dome=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,fog:false,depthWrite:false}));
    dome.renderOrder=-1;group.add(dome);
    updates.push(()=>dome.position.copy(renderer.camera.position));
  }
  const dot=softDot();
  // Embers rising off the lake, and slow smoke. Deterministic seeds, display-time motion.
  {
    const count=520,positions=new Float32Array(count*3),base=[];
    let seed=91;const random=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
    for(let i=0;i<count;i++){const r=Math.sqrt(random())*5400,a=random()*Math.PI*2;base.push([Math.cos(a)*r,random()*3800,Math.sin(a)*r,.6+random()*.8,random()*6]);}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    const embers=new T.Points(geometry,new T.PointsMaterial({map:dot,color:'#ffae52',size:26,transparent:true,opacity:.9,
      blending:T.AdditiveBlending,depthWrite:false}));embers.frustumCulled=false;group.add(embers);
    updates.push(time=>{
      base.forEach(([x,y,z,speed,phase],i)=>{
        positions[i*3]=x+Math.sin(time*.6+phase)*60;positions[i*3+1]=(y+time*70*speed)%3800;positions[i*3+2]=z+Math.cos(time*.5+phase)*60;
      });
      geometry.attributes.position.needsUpdate=true;
    });
    const smoke=new T.Group();group.add(smoke);
    for(let i=0;i<14;i++) {
      const r=1500+random()*3800,a=random()*Math.PI*2;
      const sprite=new T.Sprite(new T.SpriteMaterial({map:dot,color:'#2b1c22',transparent:true,opacity:.28,depthWrite:false}));
      sprite.position.set(Math.cos(a)*r,random()*2600,Math.sin(a)*r);sprite.scale.setScalar(1400+random()*1200);
      sprite.userData={y:sprite.position.y,speed:30+random()*40};smoke.add(sprite);
    }
    updates.push(time=>{for(const s of smoke.children)s.position.y=(s.userData.y+time*s.userData.speed)%3200;});
  }
  // Lavafalls on the crater wall: landmarks in every direction.
  {
    const falls=[];
    for(const [deg,top,width] of [[28,2300,300],[118,2700,360],[205,2100,280],[292,2500,320],[338,1800,240]]) {
      const r=rimRadius(deg)-40,a=deg*Math.PI/180;
      const material=new T.ShaderMaterial({vertexShader:FALL_VERTEX,fragmentShader:FALL_FRAGMENT,transparent:true,depthWrite:false,fog:true,
        blending:T.AdditiveBlending,side:T.DoubleSide,uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{time:{value:0},seed:{value:deg*.37}}])});
      const fall=new T.Mesh(new T.PlaneGeometry(width,top+40),material);
      fall.position.set(Math.cos(a)*r,top/2-20,-Math.sin(a)*r);fall.lookAt(0,top/2,0);group.add(fall);falls.push(material);
      const pool=new T.Mesh(new T.CircleGeometry(width*.9,24),new T.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false}));
      pool.rotation.x=-Math.PI/2;pool.position.set(Math.cos(a)*(r-width*.5),4,-Math.sin(a)*(r-width*.5));group.add(pool);
    }
    updates.push(time=>{for(const m of falls)m.uniforms.time.value=time;});
  }
  // Glowing rune bands around the spire and a warm rim on the summit.
  const rune=new T.MeshBasicMaterial({color:'#ff8a3a',transparent:true,opacity:.75,blending:T.AdditiveBlending,depthWrite:false});
  for(const [y,r] of [[500,706],[1850,706],[2950,706],[3195,770]]) {
    const band=new T.Mesh(new T.CylinderGeometry(r,r,22,12,1,true,Math.PI/12),rune);band.position.y=y;group.add(band);
  }
  updates.push(time=>{rune.opacity=.55+.2*Math.sin(time*1.7);});
  // Chains rising from each grate and post into the smoke.
  const chain=new T.LineBasicMaterial({color:'#1f1518',transparent:true,opacity:.85});
  const chains=[];
  for(const [x,z] of [[-3990,-2160],[-3710,-2160],[-3990,-3140],[-3710,-3140],[-3340,-3790],[-3340,-3510],[-2510,-3790],[-2510,-3510],[-3040,-2960],[-2760,-2960]])
    chains.push(new T.Vector3(x,2660,z),new T.Vector3(x,4300,z));
  group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(chains),chain));
  // Grate bars and frames. The collision is only the hangable underside.
  {
    const metal=new T.MeshStandardMaterial({color:'#6d5a4a',metalness:.6,roughness:.45});
    for(const [x0,x1,z0,z1] of world.grates) {
      const long=x1-x0>z1-z0,length=long?x1-x0:z1-z0,width=long?z1-z0:x1-x0,cx=(x0+x1)/2,cz=(z0+z1)/2;
      const bar=(along,across,offset)=>{
        const mesh=new T.Mesh(new T.BoxGeometry(long?along:across,34,long?across:along),metal);
        mesh.position.set(cx+(long?0:offset),2618,cz+(long?offset:0));mesh.castShadow=true;group.add(mesh);
      };
      for(const side of [-1,1])bar(length,18,side*(width/2-9));
      for(let k=0;k<=Math.floor(length/70);k++) {
        const t=-length/2+k*length/Math.floor(length/70);
        const mesh=new T.Mesh(new T.BoxGeometry(long?10:width,24,long?width:10),metal);
        mesh.position.set(cx+(long?t:0),2614,cz+(long?0:t));group.add(mesh);
      }
    }
  }
  // A bell under the belfry roof.
  {
    const bell=new T.Mesh(new T.CylinderGeometry(55,120,150,16,1,true),new T.MeshStandardMaterial({color:'#b9873a',metalness:.7,roughness:.35,side:T.DoubleSide}));
    bell.position.set(-2000,2490,-3700);bell.castShadow=true;group.add(bell);
    updates.push(time=>{bell.rotation.z=Math.sin(time*1.3)*.08;});
  }
  // Torches: a stone post with a flickering flame. Kept to edges, clear of paths.
  const post=new T.MeshStandardMaterial({color:'#3a2e30',roughness:.9});
  const flame=new T.MeshBasicMaterial({color:'#ff8a2a',transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false});
  const flames=[];
  for(const [x,y,z] of [[-1050,300,4150],[-1050,300,5080],[1050,300,4050],[-3450,480,1300],[-3950,480,1300],
    [-4650,420,250],[-3150,420,250],[-4650,2350,-2250],[-3150,2350,-2250],[-2700,2250,-4100],[-2700,2250,-3300],
    [1300,900,-460],[460,900,-1300],[-60,200,2780],[60,200,2220]]) {
    const stand=new T.Mesh(new T.CylinderGeometry(14,20,120,8),post);stand.position.set(x,y+60,z);stand.castShadow=true;group.add(stand);
    const fire=new T.Mesh(new T.ConeGeometry(16,54,8),flame);fire.position.set(x,y+146,z);group.add(fire);flames.push(fire);
  }
  updates.push(time=>flames.forEach((f,i)=>{f.scale.set(1,1+.25*Math.sin(time*13+i*1.7),1);}));
  // Forge dressing, flush with the walls: glowing slit windows and banners.
  {
    const glowPane=new T.MeshBasicMaterial({color:'#ff9a3c',transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
    const cloth=new T.MeshStandardMaterial({color:'#8c2a1c',roughness:.8,side:T.DoubleSide});
    const pane=(x,y,z,w,h,rot,material)=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),material);m.position.set(x,y,z);m.rotation.y=rot;group.add(m);return m;};
    // Windows on the crown's south face and the tier walls (both face +Z).
    for(const x of [-4550,-4350,-3450,-3250])pane(x,1950,-1599,46,190,0,glowPane);
    for(const x of [-4450,-4100,-3700,-3350])pane(x,590,-799,40,120,0,glowPane);
    for(const x of [-4550,-3250])pane(x,1010,-1079,40,140,0,glowPane);
    // Anvil house door glow and banners on the crown.
    pane(-4400,560,1,120,200,0,glowPane);
    for(const x of [-4400,-3400]){const b=pane(x,2150,-2301,150,320,Math.PI,cloth);b.position.z=-2302;}
    for(const x of [-4400,-3400])pane(x,1600,-1255,120,300,0,cloth);
    updates.push(time=>{glowPane.opacity=.7+.15*Math.sin(time*2.3)+.05*Math.sin(time*7.1);});
  }
  // The Ember Altar: a star outline where the Crimson Star will appear.
  {
    const outline=[];
    for(let i=0;i<=10;i++){const r=i%2?60:150,a=i/10*Math.PI*2;outline.push(new T.Vector3(Math.sin(a)*r,203,2500+Math.cos(a)*r));}
    group.add(new T.Line(new T.BufferGeometry().setFromPoints(outline),new T.LineBasicMaterial({color:'#ff5a4f',transparent:true,opacity:.8})));
  }
  // Section titles on the floor, where each area begins.
  const title=(text,x,y,z,width,angle=0)=>{const m=groundText(group,text,x,y+3,z,width,'#ffd9a8');m.rotation.z=angle;m.material.opacity=.7;};
  title('ASHFALL LANDING',0,300,5300,1400);
  title('THE FORGE',-3900,420,-500,1100);
  title('CHIMNEY CROWN',-3900,2350,-1760,1100);
  title('BELL TOWER',-2350,2250,-3350,760);
  title('SPIRE GATE',1100,900,-1100,760,-Math.PI/4);
  return {update:(time)=>{for(const u of updates)u(time);}};
}
