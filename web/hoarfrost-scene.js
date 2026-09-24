import * as T from './vendor/three.module.min.js';
import {groundText} from './decor.js';
import {CLOUD,TOP} from './hoarfrost.js';

// Render-only dressing for Hoarfrost Heights. Nothing here collides: every
// surface the explorer can touch is a triangle in hoarfrost.js. Props stand at
// edges or out of reach, so nothing looks solid that is not.
const SHEET_VERTEX=`varying vec2 vUv;
#include <fog_pars_vertex>
void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const NOISE=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.0,a=.55;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return n;}`;
// Water spilling off the valley's lip into the clouds.
const FALL_FRAGMENT=`uniform float time;uniform float seed;varying vec2 vUv;
#include <fog_pars_fragment>
${NOISE}
void main(){float edge=smoothstep(0.0,.2,vUv.x)*smoothstep(1.0,.8,vUv.x);
vec2 p=vec2(vUv.x*6.0+seed,vUv.y*7.0+time*1.6);float n=noise(p)*.6+noise(p*2.4)*.4;
vec3 color=mix(vec3(.45,.66,.80),vec3(.93,.98,1.0),smoothstep(.3,.8,n));
float alpha=edge*(.45+.4*n)*smoothstep(0.0,.25,vUv.y);
gl_FragColor=vec4(color,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;
// The sea of cloud: soft billows drifting under the valley.
const CLOUD_VERTEX=`varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const CLOUD_FRAGMENT=`uniform float time;uniform float density;uniform vec3 light;uniform vec3 shade;varying vec3 vWorld;
#include <fog_pars_fragment>
${NOISE}
void main(){vec2 p=vWorld.xz/2600.0+vec2(time*.012,time*.006);float n=fbm(p);
float billow=smoothstep(.35,.75,n);vec3 color=mix(shade,light,billow);
gl_FragColor=vec4(color,mix(density,1.0,billow));
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;
// Aurora curtains: rays that ripple along the curtain, bright at the hem.
const AURORA_FRAGMENT=`uniform float time;uniform float seed;varying vec2 vUv;
${NOISE}
void main(){float rays=noise(vec2(vUv.x*40.0+seed,time*.25))*.6+noise(vec2(vUv.x*95.0-time*.4,seed))*.4;
float hem=smoothstep(0.0,.08,vUv.y)*pow(1.0-vUv.y,1.6);float ends=smoothstep(0.0,.12,vUv.x)*smoothstep(1.0,.88,vUv.x);
vec3 color=mix(vec3(.25,1.0,.62),vec3(.55,.35,1.0),smoothstep(.25,.9,vUv.y));
gl_FragColor=vec4(color*(.35+rays),hem*ends*(.25+.55*rays)*.55);
}`;

// The frozen falls: still streaks of ice, with a slow glint running down them.
const CURTAIN_FRAGMENT=`uniform float time;varying vec2 vUv;
#include <fog_pars_fragment>
${NOISE}
void main(){vec2 p=vec2(vUv.x*38.0,vUv.y*3.0);float n=noise(p)*.65+noise(p*vec2(2.1,1.3))*.35;
float glint=smoothstep(.9,1.0,sin(vUv.y*9.0+time*.6+n*5.0)*.5+.5)*smoothstep(.55,.8,n);
vec3 color=mix(vec3(.55,.78,.92),vec3(.94,.99,1.0),smoothstep(.35,.85,n))+vec3(.35)*glint;
gl_FragColor=vec4(color,.42+.3*n);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;

function softDot() {
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(255,255,255,.55)');r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
}
// A wooden sign board with painted text.
function board(group,text,x,y,z,yaw,width=260) {
  const c=document.createElement('canvas');c.width=512;c.height=128;
  const g=c.getContext('2d');g.fillStyle='#7a5537';g.fillRect(0,0,512,128);g.fillStyle='#5c3f28';g.fillRect(0,110,512,18);
  g.font='700 52px ui-sans-serif, system-ui, sans-serif';g.fillStyle='#fdf4e3';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,58);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshStandardMaterial({map:texture,roughness:.85,side:T.DoubleSide}));
  mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.castShadow=true;group.add(mesh);return mesh;
}

export function decorateHoarfrost(group,world,renderer) {
  const updates=[],dot=softDot();
  let seed=37;const random=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  // ---- Sky: a twilight dome, stars and aurora, travelling with the camera. ----
  const sky=new T.Group();group.add(sky);
  updates.push(()=>sky.position.copy(renderer.camera.position));
  {
    const geometry=new T.SphereGeometry(20000,48,24),colors=[],stops=[
      [-1,'#39456b'],[-.05,'#8c97bd'],[0,'#e7c6cc'],[.06,'#b8aed3'],[.22,'#6571ad'],[.5,'#2a3372'],[1,'#10183f']];
    const sun=new T.Vector3(...world.theme.sunOffset).normalize(),position=geometry.attributes.position;
    const c=new T.Color(),a=new T.Color(),b=new T.Color(),warm=new T.Color('#ffc7a1'),v=new T.Vector3();
    for(let i=0;i<position.count;i++) {
      v.fromBufferAttribute(position,i).normalize();const y=v.y;let k=0;
      while(k<stops.length-2&&y>stops[k+1][0])k++;
      const t=Math.max(0,Math.min(1,(y-stops[k][0])/(stops[k+1][0]-stops[k][0])));
      c.copy(a.set(stops[k][1])).lerp(b.set(stops[k+1][1]),t);
      // A warm glow low in the sky where the sun has just set.
      const glow=Math.max(0,v.dot(sun))**6*Math.max(0,1-Math.abs(y)*3.2);c.lerp(warm,glow*.8);
      colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const dome=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,fog:false,depthWrite:false}));
    dome.renderOrder=-2;sky.add(dome);
    const stars=[],twinkle=new T.PointsMaterial({map:dot,color:'#eef4ff',size:60,transparent:true,opacity:.85,depthWrite:false,fog:false});
    for(let i=0;i<900;i++) {
      const y=.18+random()*.82,angle=random()*Math.PI*2,r=Math.sqrt(1-y*y);
      stars.push(Math.cos(angle)*r*19000,y*19000,Math.sin(angle)*r*19000);
    }
    const starField=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(stars,3)),twinkle);
    starField.renderOrder=-1;sky.add(starField);
    updates.push(time=>{twinkle.opacity=.75+.1*Math.sin(time*.7);});
    // Three aurora curtains over the Horn, to the north.
    for(const [from,to,base,height,phase] of [[60,120,2600,4600,0],[82,150,3600,3800,3.1],[32,80,2200,3400,6.3]]) {
      const segments=64,positions=[],uvs=[],index=[];
      for(let i=0;i<=segments;i++) {
        const u=i/segments,angle=(from+(to-from)*u)*Math.PI/180,r=15500+900*Math.sin(u*7+phase);
        for(const v of [0,1]) {
          positions.push(Math.cos(angle)*r,base+v*height+500*Math.sin(u*5+phase),-Math.sin(angle)*r);uvs.push(u,v);
        }
        if(i<segments){const k=i*2;index.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const geometry=new T.BufferGeometry();geometry.setIndex(index);
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
      const material=new T.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:AURORA_FRAGMENT,uniforms:{time:{value:0},seed:{value:phase*13}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
      const curtain=new T.Mesh(geometry,material);curtain.renderOrder=-1;sky.add(curtain);
      updates.push(time=>{material.uniforms.time.value=time;});
    }
  }
  // ---- The sea of cloud, two layers, hiding the cliffs' feet. ----
  for(const [y,density,light,shade] of [[CLOUD,.0,'#f4f1fb','#a9b3d3'],[CLOUD-500,1,'#c9cfe6','#8791b7']]) {
    const material=new T.ShaderMaterial({vertexShader:CLOUD_VERTEX,fragmentShader:CLOUD_FRAGMENT,transparent:density<1,depthWrite:density>=1,fog:true,
      uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{time:{value:0},density:{value:density},light:{value:new T.Color(light)},shade:{value:new T.Color(shade)}}])});
    const sea=new T.Mesh(new T.PlaneGeometry(90000,90000),material);sea.rotation.x=-Math.PI/2;sea.position.set(0,y,-2000);group.add(sea);
    updates.push(time=>{material.uniforms.time.value=time;});
  }
  // ---- Snowfall around the camera: deterministic flakes, display-time motion. ----
  {
    const count=2200,box=[7000,3600,7000],positions=new Float32Array(count*3),base=[];
    for(let i=0;i<count;i++)base.push([random()*box[0],random()*box[1],random()*box[2],.5+random(),random()*6]);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    const flakes=new T.Points(geometry,new T.PointsMaterial({map:dot,color:'#ffffff',size:22,transparent:true,opacity:.9,depthWrite:false}));
    flakes.frustumCulled=false;group.add(flakes);
    const wrap=(v,size)=>((v%size)+size)%size-size/2;
    updates.push(time=>{
      const c=renderer.camera.position;
      base.forEach(([x,y,z,speed,phase],i)=>{
        positions[i*3]=c.x+wrap(x+Math.sin(time*.5+phase)*90+time*40-c.x,box[0]);
        positions[i*3+1]=c.y+wrap(y-time*110*speed-c.y,box[1]);
        positions[i*3+2]=c.z+wrap(z+Math.cos(time*.4+phase)*90-c.z,box[2]);
      });
      geometry.attributes.position.needsUpdate=true;
    });
  }
  // ---- Distant peaks and floating islands, far across the void. ----
  {
    const rock=new T.MeshStandardMaterial({color:'#8e97ad',roughness:1,flatShading:true});
    const snow=new T.MeshStandardMaterial({color:'#f1f5fb',roughness:1,flatShading:true});
    for(let i=0;i<16;i++) {
      const angle=i/16*Math.PI*2+random()*.2,r=21000+random()*5000,height=5000+random()*8000,radius=3000+random()*3500;
      const x=Math.cos(angle)*r,z=-2000-Math.sin(angle)*r*1.1;
      if(z<-9000&&Math.abs(x)<11000)continue; // keep the Horn's silhouette clear
      const base=new T.Mesh(new T.ConeGeometry(radius,height,6+(i%3)),rock);base.position.set(x,-1200+height/2,z);base.rotation.y=random()*3;group.add(base);
      const cap=new T.Mesh(new T.ConeGeometry(radius*.45,height*.45,6+(i%3)),snow);cap.position.set(x,-1200+height*.775+2,z);cap.rotation.y=base.rotation.y;group.add(cap);
    }
    // Rock islands poking out of the clouds, each with a few pines.
    const pineGeometry=new T.ConeGeometry(160,620,6);pineGeometry.translate(0,310,0);
    const pines=new T.InstancedMesh(pineGeometry,new T.MeshStandardMaterial({color:'#35574a',roughness:.9,flatShading:true}),90);
    const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3();let n=0;
    for(const [x,z,r,top] of [[-14500,9000,1800,300],[12500,12000,1500,-100],[15500,-1500,2200,900],[-16000,-3000,2000,1200],[-12500,15500,1300,-200],[9500,16500,1600,0]]) {
      const island=new T.Mesh(new T.CylinderGeometry(r,r*.45,2600,7),rock);island.position.set(x,top-1300,z);group.add(island);
      const cap=new T.Mesh(new T.CylinderGeometry(r*1.02,r,90,7),snow);cap.position.set(x,top-40,z);group.add(cap);
      for(let k=0;k<15&&n<90;k++,n++) {
        const a=random()*Math.PI*2,d=Math.sqrt(random())*r*.8,scale=.7+random()*.9;
        m.compose(new T.Vector3(x+Math.cos(a)*d,top,z+Math.sin(a)*d),q,s.setScalar(scale));pines.setMatrixAt(n,m);
      }
    }
    pines.count=n;group.add(pines);
  }
  // ---- Frostmere Camp: a campfire, lanterns, a signpost and prayer flags. ----
  const flames=[],fire=new T.MeshBasicMaterial({color:'#ff9a3a',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false});
  {
    const stone=new T.MeshStandardMaterial({color:'#6d7282',roughness:1,flatShading:true});
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2,rock=new T.Mesh(new T.DodecahedronGeometry(34),stone);rock.position.set(-150+Math.cos(a)*95,512,11900+Math.sin(a)*95);group.add(rock);}
    const wood=new T.MeshStandardMaterial({color:'#6b4a31',roughness:.9});
    for(const a of [.4,2.1]){const log=new T.Mesh(new T.CylinderGeometry(16,16,170,6),wood);log.rotation.set(Math.PI/2,0,a);log.position.set(-150,516,11900);group.add(log);}
    for(let i=0;i<3;i++){const f=new T.Mesh(new T.ConeGeometry(34-i*8,110-i*20,8),fire);f.position.set(-150+(i-1)*22,560,11900+(i%2)*14);group.add(f);flames.push(f);}
    const light=new T.PointLight('#ffae62',5,1800,1.5);light.position.set(-150,620,11900);group.add(light);
    updates.push(time=>{light.intensity=4.5+.8*Math.sin(time*9)+.4*Math.sin(time*23);});
  }
  // Lanterns: a post and a warm lamp, at the edges of each landing.
  {
    const post=new T.MeshStandardMaterial({color:'#4b3a2c',roughness:.9});
    const lamp=new T.MeshBasicMaterial({color:'#ffc47a',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false});
    for(const [x,y,z] of [[-2200,500,10800],[-900,500,10300],[2300,500,10600],[-5300,100,4300],[-7800,100,5600],
      [-5400,450,3250],[-5300,850,2000],[-7650,1000,-560],[-7050,1000,-560],[-5200,1400,-2000],[-3850,1800,-3600],[-3850,1800,-1600],
      [3600,2300,-5550],[5800,2300,-5550],[3700,4300,-9300],[6200,4300,-9300],
      [1480,6400,-10320],[-940,6400,-10000],[-4414,6700,-12387],[-5222,6700,-12646],[-3780,8500,-14771],[-3780,8500,-14071]]) {
      const stand=new T.Mesh(new T.CylinderGeometry(10,14,170,6),post);stand.position.set(x,y+85,z);stand.castShadow=true;group.add(stand);
      const glow=new T.Mesh(new T.BoxGeometry(38,46,38),lamp);glow.position.set(x,y+190,z);group.add(glow);flames.push(glow);
    }
  }
  updates.push(time=>flames.forEach((f,i)=>{f.scale.set(1,1+.2*Math.sin(time*11+i*1.9),1);}));
  {
    const pole=new T.MeshStandardMaterial({color:'#5c4633',roughness:.9});
    const stand=new T.Mesh(new T.CylinderGeometry(12,14,300,6),pole);stand.position.set(-1250,650,10480);group.add(stand);
    board(group,'MIRROR LAKE  ↖',-1250,740,10470,.25,300);board(group,'THE HORN  ↑',-1250,660,10470,.25,300);
    // Prayer flags from the watchtower to a pole on the cliff edge.
    const flagPole=new T.Mesh(new T.CylinderGeometry(10,12,700,6),pole);flagPole.position.set(2690,850,11750);group.add(flagPole);
    const from=new T.Vector3(2300,1380,11500),to=new T.Vector3(2690,1190,11750),colors=['#d8413a','#f2c14e','#3f8f5a','#3d6fd1','#f4f1ea'];
    for(let i=1;i<14;i++) {
      const t=i/14,p=from.clone().lerp(to,t);p.y-=Math.sin(t*Math.PI)*110;
      const flag=new T.Mesh(new T.PlaneGeometry(46,56),new T.MeshStandardMaterial({color:colors[i%5],roughness:.8,side:T.DoubleSide}));
      flag.position.copy(p);flag.position.y-=28;flag.lookAt(p.x+400,p.y-28,p.z-150);group.add(flag);
      updates.push(time=>{flag.rotation.z=Math.sin(time*2.4+i)*.12;});
    }
  }
  // ---- Mirror Lake: the lake spills off the valley's lip into the clouds. ----
  {
    const falls=[];
    world.spills.forEach(({position:[x,z],width,yaw},i)=>{
      const material=new T.ShaderMaterial({vertexShader:SHEET_VERTEX,fragmentShader:FALL_FRAGMENT,transparent:true,depthWrite:false,fog:true,side:T.DoubleSide,
        uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{time:{value:0},seed:{value:i*2.3}}])});
      // Hang each sheet just outside the lip, facing away from the lake.
      const out=[Math.sin(yaw),Math.cos(yaw)],side=Math.sign(out[0]*(x-(-600))+out[1]*(z-6500))||1;
      const fall=new T.Mesh(new T.PlaneGeometry(width,1300),material);
      fall.position.set(x+out[0]*side*14,-640,z+out[1]*side*14);fall.rotation.y=yaw;group.add(fall);falls.push(material);
      const mist=new T.Sprite(new T.SpriteMaterial({map:dot,color:'#eef5ff',transparent:true,opacity:.5,depthWrite:false}));
      mist.position.set(x+out[0]*side*160,-760,z+out[1]*side*160);mist.scale.setScalar(width*1.6);group.add(mist);
    });
    updates.push(time=>{for(const m of falls)m.uniforms.time.value=time;});
    // A star outline on the ice spire of the Mirror Isle, where the Polar Star appears.
    const outline=[];
    for(let i=0;i<=10;i++){const r=i%2?60:150,a=i/10*Math.PI*2;outline.push(new T.Vector3(1500+Math.sin(a)*r,774,5700+Math.cos(a)*r));}
    group.add(new T.Line(new T.BufferGeometry().setFromPoints(outline),new T.LineBasicMaterial({color:'#7fb4ff',transparent:true,opacity:.7})));
  }
  // ---- The Shoulder: the hut's windows and smoke, and the sign for the trail west. ----
  {
    const glowPane=new T.MeshBasicMaterial({color:'#ffc27a',transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
    for(const x of [5650,5950]){const pane=new T.Mesh(new T.PlaneGeometry(90,110),glowPane);pane.position.set(x,4480,-9199);group.add(pane);}
    const pipe=new T.Mesh(new T.CylinderGeometry(24,24,180,8),new T.MeshStandardMaterial({color:'#3b3f4a',roughness:.6,metalness:.4}));
    pipe.position.set(6000,4740,-9350);group.add(pipe);
    const smoke=new T.Group();group.add(smoke);
    for(let i=0;i<6;i++){const s=new T.Sprite(new T.SpriteMaterial({map:dot,color:'#dfe3ee',transparent:true,opacity:.35,depthWrite:false}));
      s.userData.phase=i/6;smoke.add(s);}
    updates.push(time=>smoke.children.forEach(s=>{const k=(time*.18+s.userData.phase)%1;
      s.position.set(6000+k*160,4830+k*700,-9350-k*60);s.scale.setScalar(80+k*420);s.material.opacity=.4*(1-k);}));
    const post=new T.Mesh(new T.CylinderGeometry(12,14,260,6),new T.MeshStandardMaterial({color:'#5c4633',roughness:.9}));
    post.position.set(3600,4430,-10090);group.add(post);
    board(group,'FROZEN FALLS  ←',3612,4520,-10090,Math.PI/2,330);
  }
  // The fallen pine over the ravine: bark over the slick collision beams.
  {
    const bark=new T.MeshStandardMaterial({color:'#6e5440',roughness:.95,flatShading:true});
    const rings=new T.MeshStandardMaterial({color:'#c9a47c',roughness:.9});
    const frost=new T.MeshStandardMaterial({color:'#cfe9f7',roughness:.3,metalness:.05});
    for(const [a,b] of world.logs) {
      const from=new T.Vector3(a[0],a[1]-62,a[2]),to=new T.Vector3(b[0],b[1]-62,b[2]),axis=to.clone().sub(from),length=axis.length();
      const log=new T.Mesh(new T.CylinderGeometry(78,84,length,9,1,true),bark);
      log.position.copy(from).addScaledVector(axis,.5);log.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.clone().normalize());
      log.castShadow=true;log.receiveShadow=true;group.add(log);
      for(const [end,sign] of [[from,-1],[to,1]]) {
        const cap=new T.Mesh(new T.CircleGeometry(80,9),rings);cap.position.copy(end);
        cap.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis.clone().normalize().multiplyScalar(sign));group.add(cap);
      }
      // A glaze of ice along the top, where you walk.
      const glaze=new T.Mesh(new T.BoxGeometry(96,10,length),frost);
      glaze.position.copy(from).addScaledVector(axis,.5);glaze.position.y+=60;
      glaze.rotation.set(-Math.atan2(axis.y,Math.hypot(axis.x,axis.z)),Math.atan2(axis.x,axis.z),0,'YXZ');group.add(glaze);
    }
  }
  // Icicles under the ledges you climb past, the Frozen Falls' overhang and the
  // cornice's edges: cones pointing down, just outside each face.
  {
    const ice=new T.MeshStandardMaterial({color:'#cfefff',roughness:.2,metalness:.1,transparent:true,opacity:.85});
    const fringe=([x0,y0,z0],[x1,y1,z1],most=140)=>{
      for(let x=x0;x<x1;x+=70+random()*50) {
        const t=(x-x0)/(x1-x0),length=60+random()*most,cone=new T.Mesh(new T.ConeGeometry(12+random()*8,length,5),ice);
        cone.rotation.x=Math.PI;cone.position.set(x,y0+(y1-y0)*t-length/2,z0+(z1-z0)*t);group.add(cone);
      }
    };
    for(const [x0,x1,y,z,most] of [[3620,4260,3650,-6300],[4720,5680,3650,-6300],[3620,4780,4350,-8200],[-2560,-2320,1150,-2450],
      [-1000,350,5600,-9950,70],[350,1550,6400,-10250]])fringe([x0,y,z+2],[x1,y,z+2],most);
    const [a,c]=world.cornice;
    for(const side of [-1,1])fringe([a[0],a[1],a[2]+side*252],[c[0],c[1],c[2]+side*252],90);
  }
  // ---- The Frozen Falls: a glint runs slowly down the frozen curtain. ----
  {
    const material=new T.ShaderMaterial({vertexShader:SHEET_VERTEX,fragmentShader:CURTAIN_FRAGMENT,transparent:true,depthWrite:false,fog:true,
      uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{time:{value:0}}])});
    // Just proud of the ice face, under the overhang and beside it; the streaks
    // are scaled to the world, so the two sheets meet seamlessly.
    for(const [x0,x1,y1] of [[-1000,350,5600],[350,1550,6400]]) {
      const geometry=new T.PlaneGeometry(x1-x0,y1-CLOUD+100),uv=geometry.attributes.uv,position=geometry.attributes.position;
      geometry.translate((x0+x1)/2,(y1+CLOUD-100)/2,-10247);
      for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i)/1200,position.getY(i)/2400);
      group.add(new T.Mesh(geometry,material));
    }
    updates.push(time=>{material.uniforms.time.value=time;});
  }
  // ---- Gale Ridge: blown snow racing south, the Weathervane, and prayer flags
  // strung out to it across the gulf, all streaming with the gale. ----
  {
    const count=160,streaks=new T.InstancedMesh(new T.BoxGeometry(5,5,1),
      new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.4,depthWrite:false}),count);
    streaks.frustumCulled=false;group.add(streaks);
    const gusts=Array.from({length:count},()=>[-5900+random()*4700,6300+random()*1100,random()*4600,160+random()*260,900+random()*700,random()*6]);
    const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),p=new T.Vector3();
    updates.push(time=>{
      gusts.forEach(([x,y,z,length,speed,phase],i)=>
        streaks.setMatrixAt(i,m.compose(p.set(x,y+Math.sin(time*1.7+phase)*40,-14500+(z+time*speed)%4600),q,s.set(1,1,length))));
      streaks.instanceMatrix.needsUpdate=true;
    });
  }
  {
    const [x,y,z]=world.vane,[cx,cy,cz]=world.cape,iron=new T.MeshStandardMaterial({color:'#3b3f4a',roughness:.5,metalness:.6});
    const gold=new T.MeshStandardMaterial({color:'#e8bf55',roughness:.45,metalness:.25,side:T.DoubleSide});
    // The Weathervane stands at the tower's far edge, clear of the landing.
    const post=new T.Mesh(new T.CylinderGeometry(9,12,420,6),iron);post.position.set(x,y+210,z+250);post.castShadow=true;group.add(post);
    for(const yaw of [0,Math.PI/2]){const arm=new T.Mesh(new T.BoxGeometry(170,7,7),iron);arm.position.set(x,y+330,z+250);arm.rotation.y=yaw;group.add(arm);}
    const vane=new T.Group();vane.position.set(x,y+420,z+250);group.add(vane);
    const shaft=new T.Mesh(new T.BoxGeometry(8,8,240),gold),head=new T.Mesh(new T.ConeGeometry(24,70,4),gold),tail=new T.Mesh(new T.PlaneGeometry(80,70),gold);
    head.rotation.x=-Math.PI/2;head.position.z=-150;tail.rotation.y=Math.PI/2;tail.position.z=110;vane.add(shaft,head,tail);
    // The gale blows from the north, so the arrow points into it, swinging with the gusts.
    updates.push(time=>{vane.rotation.y=.25*Math.sin(time*1.3)*Math.sin(time*.47+1);});
    // Prayer flags from the promontory's corner to the Weathervane's post.
    const pole=new T.Mesh(new T.CylinderGeometry(9,11,440,6),new T.MeshStandardMaterial({color:'#5c4633',roughness:.9}));
    pole.position.set(cx+180,cy+220,cz+460);group.add(pole);
    const from=new T.Vector3(cx+180,cy+430,cz+460),to=new T.Vector3(x,y+400,z+250),colors=['#d8413a','#f2c14e','#3f8f5a','#3d6fd1','#f4f1ea'];
    const yaw=Math.atan2(to.x-from.x,to.z-from.z)-Math.PI/2,sag=t=>from.clone().lerp(to,t).add(new T.Vector3(0,-Math.sin(t*Math.PI)*120,0));
    group.add(new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:17},(_,i)=>sag(i/16))),new T.LineBasicMaterial({color:'#d9d4c7'})));
    for(let i=1;i<16;i++) {
      const geometry=new T.PlaneGeometry(46,56);geometry.translate(0,-28,0);
      const flag=new T.Mesh(geometry,new T.MeshStandardMaterial({color:colors[i%5],roughness:.8,side:T.DoubleSide}));
      flag.position.copy(sag(i/16));flag.rotation.y=yaw;group.add(flag);
      updates.push(time=>{flag.rotation.z=.65+.25*Math.sin(time*5.1+i*1.3)*Math.sin(time*1.3);});
    }
  }
  // ---- The summit: a flag on the Aurora Star's cairn, streaming south. ----
  {
    const pole=new T.Mesh(new T.CylinderGeometry(9,11,460,6),new T.MeshStandardMaterial({color:'#5c4633',roughness:.9}));
    pole.position.set(-150,TOP+490,-14350);group.add(pole);
    const c=document.createElement('canvas');c.width=256;c.height=160;
    const g=c.getContext('2d');g.fillStyle='#2f4fa8';g.fillRect(0,0,256,160);g.fillStyle='#ffd65a';g.beginPath();
    for(let i=0;i<10;i++){const r=i%2?22:56,a=i*Math.PI/5;g.lineTo(128+Math.sin(a)*r,82-Math.cos(a)*r);}
    g.fill();
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const geometry=new T.PlaneGeometry(200,125,10,1);geometry.translate(100,0,0);
    const flag=new T.Mesh(geometry,new T.MeshStandardMaterial({map:texture,roughness:.8,side:T.DoubleSide}));
    flag.position.set(-150,TOP+650,-14350);flag.rotation.y=-Math.PI/2;group.add(flag);
    const position=geometry.attributes.position,rest=Float32Array.from(position.array);
    updates.push(time=>{for(let i=0;i<position.count;i++){const u=rest[i*3];position.setZ(i,Math.sin(u*.035-time*6)*u*.12);}position.needsUpdate=true;});
  }
  // ---- The Avalanche Run: pillars down to the ground or the clouds, a banner
  // at the start, and a warning painted before each lip. ----
  {
    // The highest floor under [x,z] below `limit` (or just under the clouds).
    const ground=(x,z,limit)=>world.triangles.reduce((top,{vertices:[a,b,c]})=>{
      const ny=(b[2]-a[2])*(c[0]-b[0])-(b[0]-a[0])*(c[2]-b[2]),d=(b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]);
      if(ny<=0||!d)return top;
      const u=((x-a[0])*(c[2]-a[2])-(c[0]-a[0])*(z-a[2]))/d,v=((b[0]-a[0])*(z-a[2])-(x-a[0])*(b[2]-a[2]))/d,y=a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
      return u<0||v<0||u+v>1||y>=limit?top:Math.max(top,y);},CLOUD-300);
    const pier=new T.MeshStandardMaterial({color:'#7f98b3',roughness:.7,flatShading:true});
    for(const run of world.avalanche)for(let i=0;i<run.length-1;i++) {
      const p=run[i],q=run[i+1],n=Math.ceil(Math.hypot(q[0]-p[0],q[2]-p[2])/1300);
      for(let k=0;k<n;k++) {
        const t=(k+.5)/n,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t-260,z=p[2]+(q[2]-p[2])*t;
        if(world.horn(x,z)>y-60)continue; // the track runs on the Horn itself here
        const floor=ground(x,z,y-1),height=y-floor,r=45+height/90;
        const pillar=new T.Mesh(new T.CylinderGeometry(r,r*1.25,height,6),pier);pillar.position.set(x,floor+height/2,z);group.add(pillar);
      }
    }
    const stripe=[new T.MeshStandardMaterial({color:'#d8413a',roughness:.7}),new T.MeshStandardMaterial({color:'#f4f1ea',roughness:.7})];
    world.avalanche.slice(0,-1).forEach(run=>{
      const q=run.at(-1),p=run.at(-2),f=new T.Vector3(q[0]-p[0],q[1]-p[1],q[2]-p[2]).normalize();
      const right=f.clone().cross(new T.Vector3(0,1,0)).normalize(),up=right.clone().cross(f),end=new T.Vector3(...q);
      const paint=groundText(group,'JUMP!',0,0,0,1400,'#d8413a');paint.material.opacity=.85;
      paint.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,f,up));
      paint.position.copy(end).addScaledVector(f,-520).addScaledVector(up,4);
      // Striped poles on the ends of the walls.
      for(const side of [-1,1])for(let k=0;k<4;k++) {
        const band=new T.Mesh(new T.CylinderGeometry(13,13,80,8),stripe[k%2]);
        band.position.copy(end).addScaledVector(f,-40).addScaledVector(right,side*280);band.position.y+=200+k*80;group.add(band);
      }
    });
    const [p,q]=world.avalanche[0],f=new T.Vector3(q[0]-p[0],0,q[2]-p[2]).normalize(),across=new T.Vector3(-f.z,0,f.x);
    const at=new T.Vector3(...p).addScaledVector(f,150);
    for(const side of [-1,1]) {
      const post=new T.Mesh(new T.CylinderGeometry(12,14,440,6),new T.MeshStandardMaterial({color:'#5c4633',roughness:.9}));
      post.position.copy(at).addScaledVector(across,side*280);post.position.y+=380;group.add(post);
    }
    board(group,'AVALANCHE RUN',at.x,at.y+500,at.z,Math.atan2(f.x,f.z)+Math.PI,560);
  }
  // ---- Section titles, where each area begins. ----
  const title=(text,x,y,z,width,angle=0)=>{const m=groundText(group,text,x,y+3,z,width,'#41557c');m.rotation.z=angle;m.material.opacity=.55;};
  title('FROSTMERE CAMP',-300,500,10750,1300);
  title('MIRROR LAKE',-1600,100,9380,760,.6);
  title('WEST SHORE',-6500,100,4700,900);
  title('PINEWOOD DRIFTS',-7400,450,2700,1300);
  title('THE GLACIER',-3250,1800,-2250,1000,-Math.PI/2);
  title('THE ICEFALL',4650,2300,-5300,1000);
  title('THE SHOULDER',4900,4300,-9350,1000);
  title('THE FROZEN FALLS',1050,4300,-10050,640,Math.PI/2);
  title('GALE RIDGE',-450,6400,-10900,900,Math.PI/2);
  title('THE CORNICE',-5615,7267,-14179,700,-Math.PI/2);
  title('THE SUMMIT',-700,TOP,-14450,800,-Math.PI/2);
  return {update:(time)=>{for(const u of updates)u(time);}};
}
