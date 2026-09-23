import * as T from './vendor/three.module.min.js';
import {ExplorerRig} from './character.js';
import {Effects} from './effects.js';
import {decoratePlayground} from './decor.js';
import {decorateCaldera} from './caldera-scene.js';

// Default look: the pale, green playground. A world may supply its own theme.
const PLAYGROUND_THEME={background:'#b8c7bf',fog:['#b8c7bf',8000,16000],exposure:1.3,
  hemisphere:['#f6f7de','#687f74',2.1],sun:['#fff4d8',3.1],sunOffset:[-2800,6500,3600],
  edges:['#f4f4da',.32],dust:'#e9e6d2',shadow:'#30493e'};

// Molten rock: flowing noise in world space, used for the SURFACE_BURNING floor.
const LAVA_VERTEX=`varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const LAVA_FRAGMENT=`uniform float time;varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 p=vWorld.xz/380.0;float n=0.0,a=.55;
for(int i=0;i<4;i++){n+=a*noise(p+vec2(time*.05,-time*.035)*float(i+1));p=p*2.03+vec2(1.7,9.2);a*=.5;}
float vein=1.0-smoothstep(.0,.07,abs(n-.5+.05*sin(time*.8+vWorld.z*.003)));
float pool=smoothstep(.62,.8,n);
vec3 crust=mix(vec3(.30,.06,.03),vec3(.55,.12,.04),smoothstep(.3,.6,n));
vec3 hot=mix(vec3(1.0,.36,.05),vec3(1.0,.78,.32),pool);
vec3 color=mix(crust,hot,max(vein,pool));
gl_FragColor=vec4(color,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`;

export class PlaygroundRenderer {
  constructor(canvas,world) {
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.scene=new T.Scene();
    this.camera=new T.PerspectiveCamera(52,1,10,30000);
    this.camera.position.set(5400,4700,6700);
    this.camera.lookAt(0,0,0);
    this.target=new T.Vector3();
    this.distance=950;this.pitch=.43;this.yaw=0;
    this.hemisphere=new T.HemisphereLight();this.scene.add(this.hemisphere);
    const sun=new T.DirectionalLight();
    sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-3400,right:3400,top:3400,bottom:-3400,near:100,far:13000});
    sun.shadow.normalBias=3;sun.shadow.bias=-.0002;
    this.sun=sun;this.scene.add(sun);this.scene.add(sun.target);
    this.character=new ExplorerRig();
    this.scene.add(this.character);
    this.shadow=new T.Mesh(new T.CircleGeometry(45,32),new T.MeshBasicMaterial({transparent:true,opacity:.25,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    this.scene.add(this.shadow);
    this.trailPoints=[];
    this.trail=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#eb612f',transparent:true,opacity:.75}));
    this.scene.add(this.trail);this.trail.visible=false;
    this.effects=new Effects(this.scene);
    this.wire=new T.Group();this.wire.visible=false;this.scene.add(this.wire);
    this.ray=new T.Raycaster();
    this.width=0;this.height=0;this.intro=true;this.time=0;
    this.up=new T.Vector3(0,1,0);this.normal=new T.Vector3();
    if(world)this.load(world);
  }
  // Replace the level: geometry, dressing, pickups and lighting.
  load(world) {
    if(this.level) {
      this.scene.remove(this.level);
      this.level.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat())if(m){m.map?.dispose();m.dispose();}});
      for(const line of this.wire.children){line.geometry.dispose();line.material.dispose();}this.wire.clear();
    }
    const theme={...PLAYGROUND_THEME,...world.theme};this.theme=theme;
    this.level=new T.Group();this.scene.add(this.level);
    this.scene.background=new T.Color(theme.background);
    this.scene.fog=new T.Fog(...theme.fog);
    this.renderer.toneMappingExposure=theme.exposure;
    this.hemisphere.color.set(theme.hemisphere[0]);this.hemisphere.groundColor.set(theme.hemisphere[1]);this.hemisphere.intensity=theme.hemisphere[2];
    this.sun.color.set(theme.sun[0]);this.sun.intensity=theme.sun[1];
    this.shadow.material.color.set(theme.shadow);this.effects.dust=theme.dust;this.effects.clear();
    this.lava=[];this.meshes=[];
    // Optional lava bounce light, baked into vertex colors near the lake.
    const glow=theme.underglow&&new T.Color(theme.underglow.color),lit=new T.Color();
    for(const shape of world.shapes) {
      const positions=[],colors=[];
      for(const triangle of world.triangles.slice(shape.start,shape.end)) {
        const color=new T.Color(triangle.color);
        for(const v of triangle.vertices) {
          positions.push(...v);lit.copy(color);
          if(glow&&shape.style!=='lava')lit.lerp(glow,theme.underglow.strength*Math.exp(-Math.max(0,v[1])/theme.underglow.height));
          colors.push(lit.r,lit.g,lit.b);
        }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();
      let material;
      if(shape.style==='lava') {
        material=new T.ShaderMaterial({vertexShader:LAVA_VERTEX,fragmentShader:LAVA_FRAGMENT,fog:true,
          uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{time:{value:0}}])});
        this.lava.push(material);
      } else material=new T.MeshStandardMaterial({vertexColors:true,roughness:shape.style==='metal'?.45:.9,metalness:shape.style==='metal'?.35:0});
      const mesh=new T.Mesh(geometry,material);
      mesh.castShadow=shape.style!=='lava';mesh.receiveShadow=shape.style!=='lava';
      this.level.add(mesh);this.meshes.push(mesh);
      if(shape.style!=='lava') {
        const edges=new T.LineSegments(new T.EdgesGeometry(geometry,12),new T.LineBasicMaterial({color:theme.edges[0],transparent:true,opacity:theme.edges[1]}));
        this.level.add(edges);
      }
      this.wire.add(new T.LineSegments(new T.WireframeGeometry(geometry),new T.LineBasicMaterial({color:'#174f49',depthTest:false,transparent:true,opacity:.55})));
    }
    this.dressing=world.kind==='caldera'?decorateCaldera(this.level,world,this):(decoratePlayground(this.level,world),null);
    this.pickups=world.pickups.map((pickup,i)=>this.pickup(pickup,i));
  }
  pickup(pickup,index) {
    const group=new T.Group();group.position.set(...pickup.position);this.level.add(group);
    const glow=(color,emissive,intensity=.3,extra={})=>new T.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:.3,...extra});
    const parts={spin:[],counter:[]};
    if(pickup.kind==='coin') {
      const coin=new T.Mesh(new T.CylinderGeometry(30,30,9,24),glow('#ffcf4a','#c46a00',.55,{metalness:.55}));
      coin.rotation.x=Math.PI/2;const holder=new T.Group();holder.add(coin);group.add(holder);parts.spin.push(holder);
      const rim=new T.Mesh(new T.TorusGeometry(30,2.4,6,24),glow('#fff0a8','#d08a10',.6));holder.add(rim);
    } else if(pickup.kind==='shard') {
      const gem=new T.Mesh(new T.OctahedronGeometry(26),glow('#ff4d4d','#b3001b',.9,{flatShading:true}));
      gem.scale.set(.75,1.35,.75);group.add(gem);parts.spin.push(gem);
      const halo=new T.Mesh(new T.TorusGeometry(40,2.5,6,32),new T.MeshBasicMaterial({color:'#ff7a6a',transparent:true,opacity:.7}));
      group.add(halo);parts.counter.push(halo);
    } else if(pickup.kind==='star'||pickup.kind==='bonus') {
      const shape=new T.Shape();
      for(let i=0;i<=10;i++){const r=i%2?32:78,a=i/10*Math.PI*2;shape[i?'lineTo':'moveTo'](Math.sin(a)*r,Math.cos(a)*r);}
      const color=pickup.kind==='star'?['#ffd54a','#ff9d00']:['#ff5a4f','#c4001e'];
      const geometry=new T.ExtrudeGeometry(shape,{depth:22,bevelEnabled:true,bevelThickness:9,bevelSize:6,bevelSegments:2});
      geometry.center();
      const star=new T.Mesh(geometry,glow(color[0],color[1],.75,{metalness:.3,flatShading:true}));star.castShadow=true;
      group.add(star);parts.spin.push(star);
      const beam=new T.Mesh(new T.CylinderGeometry(55,95,5200,24,1,true),new T.MeshBasicMaterial({color:color[0],transparent:true,opacity:.1,
        blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:false}));
      beam.position.y=2500;group.add(beam);parts.beam=beam;
      const light=new T.PointLight(color[0],6,900,1.4);light.position.y=40;group.add(light);
    } else if(pickup.kind==='checkpoint') {
      // A beacon: a rune ring on the floor with a ring of flames once lit.
      const ring=new T.Mesh(new T.RingGeometry(92,112,40),new T.MeshBasicMaterial({color:'#6b5550',side:T.DoubleSide,transparent:true,opacity:.9}));
      ring.rotation.x=-Math.PI/2;ring.position.y=3;group.add(ring);
      const inner=new T.Mesh(new T.RingGeometry(66,72,40),ring.material.clone());inner.rotation.x=-Math.PI/2;inner.position.y=3;group.add(inner);
      const flames=[],fire=new T.MeshBasicMaterial({color:'#ff9a36',transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false});
      for(let k=0;k<6;k++) {
        const a=k/6*Math.PI*2,flame=new T.Mesh(new T.ConeGeometry(11,46,8),fire);
        flame.position.set(Math.cos(a)*124,26,Math.sin(a)*124);flame.visible=false;group.add(flame);flames.push(flame);
      }
      Object.assign(parts,{rings:[ring,inner],flames});
    } else {
      const material=glow('#ffbd63','#b95b19',.25,{roughness:.35});
      const hoop=new T.Mesh(new T.TorusGeometry(43,4,8,40),material);group.add(hoop);parts.counter.push(hoop);
      const gem=new T.Mesh(new T.OctahedronGeometry(19),material);group.add(gem);parts.spin.push(gem);
    }
    return {...pickup,group,parts,index};
  }
  // A short establishing shot that settles into the follow camera. Any input
  // (see main.js) skips it; it never touches the simulation.
  flyover(from,look,duration=3.4) {this.shot={from:new T.Vector3(...from),look:new T.Vector3(...look),t:0,duration};}
  reset(position,cameraYaw,pitch) {
    this.shot=null;
    this.yaw=cameraYaw;this.pitch=pitch??.43;this.viewPitch=this.pitch;this.target.set(position[0],position[1]+100,position[2]);
    this.camera.position.copy(this.target).add(new T.Vector3(Math.sin(this.yaw)*950,510,Math.cos(this.yaw)*950));
    this.trailPoints=[];this.character.snap();this.effects.clear();
    this.trail.geometry.dispose();this.trail.geometry=new T.BufferGeometry();
  }
  record(state) {
    this.trailPoints.push(new T.Vector3(state.position[0],state.position[1]+8,state.position[2]));
    if(this.trailPoints.length>240)this.trailPoints.shift();
    if(!this.trail.visible)return;
    this.trail.geometry.dispose();this.trail.geometry=new T.BufferGeometry().setFromPoints(this.trailPoints);
  }
  // One simulation tick happened: let the effects read the transition.
  tick(previous,current,previousName,name) {this.effects.onTick(previous,current,previousName,name);}
  draw(previous,current,alpha,dt,actionName,previousName,view={},animDt=dt) {
    const w=innerWidth,h=innerHeight;
    if(w!==this.width||h!==this.height) {
      this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    }
    this.time+=animDt;
    const contact=name=>name?.includes('LEDGE')||name?.includes('HANG');
    const caught=contact(actionName)&&!contact(previousName);
    const p=caught?current.position:current.position.map((n,i)=>previous.position[i]+(n-previous.position[i])*alpha);
    this.character.position.set(...p);
    let angle=current.yaw-previous.yaw;angle=((angle+32768)&65535)-32768;
    this.character.rotation.y=(caught?current.yaw:previous.yaw+angle*alpha)*Math.PI/32768;
    this.character.animate(previous,current,alpha,previousName,actionName,animDt);
    const time=this.time; // Pickups keep their phase through checkpoint resets.
    const hidden=view.found||new Set(),lit=view.lit||new Set(),revealed=view.revealed||new Set();
    for(const pickup of this.pickups) {
      const {group,parts,kind,index:i}=pickup;
      group.visible=kind==='bonus'?revealed.has(pickup.id)&&!hidden.has(pickup.id):!hidden.has(pickup.id);
      if(kind==='checkpoint') {
        group.visible=true;const on=lit.has(pickup.id);
        parts.flames.forEach((f,k)=>{f.visible=on;f.scale.set(1,1+.3*Math.sin(this.time*12+k*1.9+i),1);});
        for(const r of parts.rings)r.material.color.set(on?'#ffb347':'#6b5550');
        continue;
      }
      const bob=kind==='star'||kind==='bonus'?14:8;
      group.position.y=pickup.position[1]+Math.sin(time*2+i)*bob;
      for(const s of parts.spin)s.rotation.y=kind==='coin'?time*3.2+i:(kind==='star'||kind==='bonus'?time*1.6:-time*1.4);
      for(const c of parts.counter)c.rotation.y=time*.7+i;
      if(parts.beam)parts.beam.material.opacity=.08+.035*Math.sin(time*2.2);
    }
    for(const material of this.lava)material.uniforms.time.value=this.time;
    this.dressing?.update?.(this.time,animDt,p);
    this.effects.update(animDt,this.renderer.getDrawingBufferSize(this.bufferSize||=new T.Vector2()).y);
    // A soft contact shadow, laid on the floor the core reports under the body.
    this.normal.set(...current.normal);
    this.shadow.quaternion.setFromUnitVectors(this.up,this.normal.lengthSq()>0?this.normal.normalize():this.up);
    this.shadow.rotateX(-Math.PI/2);
    this.shadow.position.set(p[0],current.floor+3,p[2]);
    this.shadow.visible=current.floor>-2000&&!actionName.includes('LEDGE');
    const height=p[1]-current.floor;
    this.shadow.material.opacity=Math.max(.05,.28-height/2400);
    this.shadow.scale.setScalar(Math.max(.55,1-height/2600));
    // Retain the parallel branch's local shadow coverage as the player travels.
    const [sx,sy,sz]=this.theme.sunOffset;
    this.sun.position.set(p[0]+sx,p[1]+sy,p[2]+sz);
    this.sun.target.position.set(...p);this.sun.target.updateMatrixWorld();
    if(!this.intro) {
      const desiredTarget=this.character.worldCenter.clone().add(new T.Vector3(0,20,0));
      this.target.lerp(desiredTarget,1-Math.exp(-dt*16));
      // If a wall blocks the chosen view (e.g. inside a wall-kick shaft), rise
      // to look down over it instead of pressing the lens into the explorer's back.
      const direction=pitch=>new T.Vector3(Math.sin(this.yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(this.yaw)*Math.cos(pitch));
      const clearance=pitch=>{
        this.ray.set(this.target,direction(pitch));this.ray.far=this.distance;
        const hits=this.ray.intersectObjects(this.meshes,false);return hits.length?hits[0].distance:this.distance;
      };
      let best=this.pitch,room=clearance(best);
      for(let pitch=this.pitch+.2;room<this.distance*.55&&pitch<=1.4;pitch+=.2) {
        const d=clearance(pitch);if(d>room+40){best=pitch;room=d;}
      }
      this.viewPitch??=this.pitch;
      this.viewPitch+=(best-this.viewPitch)*(1-Math.exp(-dt*5));
      const offset=direction(this.viewPitch),hitRoom=clearance(this.viewPitch);
      const distance=hitRoom<this.distance?Math.max(90,hitRoom-35):this.distance;
      const cameraPosition=this.target.clone().addScaledVector(offset,distance);
      this.camera.position.copy(cameraPosition);
      this.camera.lookAt(this.target);
      if(this.shot) {
        const s=this.shot,k=Math.min(1,(s.t+=dt)/s.duration),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
        this.camera.position.lerpVectors(s.from,cameraPosition,e);
        this.camera.lookAt(s.look.clone().lerp(this.target,e));
        if(k>=1)this.shot=null;
      }
    }
    this.renderer.render(this.scene,this.camera);
  }
}
