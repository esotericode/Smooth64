import * as T from './vendor/three.module.min.js';
import {ExplorerRig} from './character.js';

export class PlaygroundRenderer {
  constructor(canvas,world) {
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.3;
    this.scene=new T.Scene();
    this.scene.background=new T.Color('#b8c7bf');
    this.scene.fog=new T.Fog('#b8c7bf',8000,16000);
    this.camera=new T.PerspectiveCamera(52,1,10,24000);
    this.camera.position.set(5400,4700,6700);
    this.camera.lookAt(0,0,0);
    this.target=new T.Vector3();
    this.distance=950;this.pitch=.43;this.yaw=0;
    this.scene.add(new T.HemisphereLight('#f6f7de','#687f74',2.1));
    const sun=new T.DirectionalLight('#fff4d8',3.1);
    sun.position.set(-2800,6500,3600);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-3400,right:3400,top:3400,bottom:-3400,near:100,far:13000});
    sun.shadow.normalBias=3;sun.shadow.bias=-.0002;
    this.sun=sun;this.scene.add(sun);this.scene.add(sun.target);
    this.meshes=[];
    for(const shape of world.shapes) {
      const positions=[],colors=[];
      for(const triangle of world.triangles.slice(shape.start,shape.end)) {
        const color=new T.Color(triangle.color);
        for(const v of triangle.vertices) { positions.push(...v);colors.push(color.r,color.g,color.b); }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.9}));
      mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);this.meshes.push(mesh);
      const edges=new T.LineSegments(new T.EdgesGeometry(geometry,12),new T.LineBasicMaterial({color:'#f4f4da',transparent:true,opacity:.32}));
      this.scene.add(edges);
    }
    this.wire=new T.Group();
    for(const mesh of this.meshes) this.wire.add(new T.LineSegments(new T.WireframeGeometry(mesh.geometry),new T.LineBasicMaterial({color:'#174f49',depthTest:false,transparent:true,opacity:.55})));
    this.wire.visible=false;this.scene.add(this.wire);
    const grid=new T.GridHelper(7600,38,'#7a958a','#9eaea2');
    grid.position.y=1;grid.material.transparent=true;grid.material.opacity=.32;this.scene.add(grid);
    // Floor markings are decorative and never alter collision.
    this.marking(0,1,0,750,4300,'#c1c9bb');
    for(const x of [-385,385]) this.marking(x,2,0,10,4300,'#718d7a');
    for(let z=-1800;z<=1800;z+=300) this.marking(0,3,z,16,95,'#f1f1d5');
    for(let i=0;i<8;i++) this.marking((i-3.5)*86,3,2100,45,160,'#718d7a');
    this.groundText('01  /  THE RUNWAY',0,4,1400,680);
    this.groundText('02  /  SLOPE STUDIES',-2200,4,650,1100);
    this.groundText('03  /  WALL WORKSHOP',2150,4,1150,1100);
    this.groundText('04  /  STEP BY STEP',-1780,4,3200,1250);
    this.groundText('05  /  ISLAND HOPPING',1300,4,-1800,1500);
    this.groundText('SMOOTH64',0,4,3150,1100);
    this.groundText('07  /  LEDGE GARDEN',-5000,4,1900,1700);
    this.groundText('08  /  WALL-KICK TOWER',-2200,4,-4300,1800);
    this.groundText('09  /  SKYLINE CIRCUIT',1500,4,-3800,1800);
    this.groundText('10  /  CANOPY WALK',2200,4,3670,1600);
    for(const [x,z,w,d] of [[-5000,300,2300,3900],[0,-5350,7500,3000],[2200,4800,1900,1900]]) {
      const border=new T.LineLoop(new T.BufferGeometry().setFromPoints([
        new T.Vector3(x-w/2,3,z-d/2),new T.Vector3(x+w/2,3,z-d/2),
        new T.Vector3(x+w/2,3,z+d/2),new T.Vector3(x-w/2,3,z+d/2)
      ]),new T.LineBasicMaterial({color:'#ecf0ce'}));this.scene.add(border);
    }
    for(const zone of world.zones.slice(6)) {
      const [x,y,z]=zone.position;
      const marker=new T.Mesh(new T.RingGeometry(110,123,48),new T.MeshBasicMaterial({color:'#537d6b',side:T.DoubleSide}));
      marker.rotation.x=-Math.PI/2;marker.position.set(x,y+3,z);this.scene.add(marker);
    }
    const ring=new T.Mesh(new T.RingGeometry(130,145,64),new T.MeshBasicMaterial({color:'#537d6b',side:T.DoubleSide}));
    ring.rotation.x=-Math.PI/2;ring.position.set(0,4,2350);this.scene.add(ring);
    const rail=new T.LineLoop(new T.BufferGeometry().setFromPoints([
      new T.Vector3(-3730,3,-3730),new T.Vector3(3730,3,-3730),new T.Vector3(3730,3,3730),new T.Vector3(-3730,3,3730)
    ]),new T.LineBasicMaterial({color:'#ecf0ce'}));this.scene.add(rail);

    this.character=new ExplorerRig();
    this.scene.add(this.character);
    this.sparks=(world.sparks||[]).map(spark=>{
      const group=new T.Group();group.position.set(...spark.position);
      const material=new T.MeshStandardMaterial({color:'#ffbd63',emissive:'#b95b19',emissiveIntensity:.25,roughness:.35});
      const hoop=new T.Mesh(new T.TorusGeometry(43,4,8,40),material);group.add(hoop);
      const gem=new T.Mesh(new T.OctahedronGeometry(19),material);group.add(gem);
      this.scene.add(group);
      return {...spark,group,hoop,gem};
    });
    this.shadow=new T.Mesh(new T.CircleGeometry(45,32),new T.MeshBasicMaterial({color:'#30493e',transparent:true,opacity:.25,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
    this.trailPoints=[];
    this.trail=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#eb612f',transparent:true,opacity:.75}));
    this.scene.add(this.trail);this.trail.visible=false;
    this.ray=new T.Raycaster();
    this.width=0;this.height=0;this.intro=true;
  }
  marking(x,y,z,width,depth,color) {
    const mesh=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshStandardMaterial({color,roughness:1,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;this.scene.add(mesh);
  }
  groundText(text,x,y,z,width) {
    const c=document.createElement('canvas');c.width=1024;c.height=128;
    const context=c.getContext('2d');
    context.font='600 58px monospace';context.fillStyle='#506d5b';context.textAlign='center';context.textBaseline='middle';context.fillText(text,512,64);
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const mesh=new T.Mesh(new T.PlaneGeometry(width,width/8),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);this.scene.add(mesh);
  }
  reset(position,cameraYaw) {
    this.yaw=cameraYaw;this.target.set(position[0],position[1]+100,position[2]);
    this.camera.position.copy(this.target).add(new T.Vector3(Math.sin(this.yaw)*950,510,Math.cos(this.yaw)*950));
    this.trailPoints=[];
    this.trail.geometry.dispose();this.trail.geometry=new T.BufferGeometry();
  }
  record(state) {
    this.trailPoints.push(new T.Vector3(state.position[0],state.position[1]+8,state.position[2]));
    if(this.trailPoints.length>240)this.trailPoints.shift();
    this.trail.geometry.dispose();this.trail.geometry=new T.BufferGeometry().setFromPoints(this.trailPoints);
  }
  draw(previous,current,alpha,dt,actionName,previousName,found=new Set()) {
    const w=innerWidth,h=innerHeight;
    if(w!==this.width||h!==this.height) {
      this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    }
    const p=current.position.map((n,i)=>previous.position[i]+(n-previous.position[i])*alpha);
    this.character.position.set(...p);
    let angle=current.yaw-previous.yaw;angle=((angle+32768)&65535)-32768;
    this.character.rotation.y=(previous.yaw+angle*alpha)*Math.PI/32768;
    this.character.animate(previous,current,alpha,previousName,actionName);
    const time=(previous.tick+(current.tick-previous.tick)*alpha)/30;
    for(const [i,spark] of this.sparks.entries()) {
      spark.group.visible=!found.has(spark.id);
      spark.group.position.y=spark.position[1]+Math.sin(time*2+i)*8;
      spark.hoop.rotation.y=time*.7+i;spark.gem.rotation.y=-time*1.4;
    }
    this.shadow.position.set(p[0],current.floor+3,p[2]);
    this.shadow.visible=current.floor>-2000&&!actionName.includes('LEDGE');
    this.shadow.material.opacity=Math.max(.05,.28-(p[1]-current.floor)/2400);
    // Retain the parallel branch's local shadow coverage as the player travels.
    this.sun.position.set(p[0]-2800,p[1]+6500,p[2]+3600);
    this.sun.target.position.set(...p);this.sun.target.updateMatrixWorld();
    if(!this.intro) {
      const desiredTarget=this.character.worldCenter.clone().add(new T.Vector3(0,20,0));
      this.target.lerp(desiredTarget,1-Math.exp(-dt*16));
      const offset=new T.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
      this.ray.set(this.target,offset);this.ray.far=this.distance;
      const hits=this.ray.intersectObjects(this.meshes,false);
      const distance=hits.length?Math.max(90,hits[0].distance-35):this.distance;
      const cameraPosition=this.target.clone().addScaledVector(offset,distance);
      this.camera.position.copy(cameraPosition);
      this.camera.lookAt(this.target);
    }
    this.renderer.render(this.scene,this.camera);
  }
}
