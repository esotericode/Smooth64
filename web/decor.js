import * as T from './vendor/three.module.min.js';

// Render-only dressing for the movement playground. Nothing here collides.
export function groundText(group,text,x,y,z,width,color='#506d5b') {
  const c=document.createElement('canvas');c.width=1024;c.height=128;
  const context=c.getContext('2d');
  context.font='600 58px monospace';context.fillStyle=color;context.textAlign='center';context.textBaseline='middle';context.fillText(text,512,64);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,width/8),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);group.add(mesh);
  return mesh;
}

export function decoratePlayground(group,world) {
  const marking=(x,y,z,width,depth,color)=>{
    const mesh=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshStandardMaterial({color,roughness:1,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);
  };
  const grid=new T.GridHelper(7600,38,'#7a958a','#9eaea2');
  grid.position.y=1;grid.material.transparent=true;grid.material.opacity=.32;group.add(grid);
  // Floor markings are decorative and never alter collision.
  marking(0,1,0,750,4300,'#c1c9bb');
  for(const x of [-385,385]) marking(x,2,0,10,4300,'#718d7a');
  for(let z=-1800;z<=1800;z+=300) marking(0,3,z,16,95,'#f1f1d5');
  for(let i=0;i<8;i++) marking((i-3.5)*86,3,2100,45,160,'#718d7a');
  groundText(group,'01  /  THE RUNWAY',0,4,1400,680);
  groundText(group,'02  /  SLOPE STUDIES',-2200,4,650,1100);
  groundText(group,'03  /  WALL WORKSHOP',2150,4,1150,1100);
  groundText(group,'04  /  STEP BY STEP',-1780,4,3200,1250);
  groundText(group,'05  /  ISLAND HOPPING',1300,4,-1800,1500);
  groundText(group,'SMOOTH64',0,4,3150,1100);
  groundText(group,'07  /  LEDGE GARDEN',-5000,4,1900,1700);
  groundText(group,'08  /  WALL-KICK TOWER',-2200,4,-4300,1800);
  groundText(group,'09  /  SKYLINE CIRCUIT',1500,4,-3800,1800);
  groundText(group,'10  /  CANOPY WALK',2200,4,3670,1600);
  for(const [x,z,w,d] of [[-5000,300,2300,3900],[0,-5350,7500,3000],[2200,4800,1900,1900]]) {
    const border=new T.LineLoop(new T.BufferGeometry().setFromPoints([
      new T.Vector3(x-w/2,3,z-d/2),new T.Vector3(x+w/2,3,z-d/2),
      new T.Vector3(x+w/2,3,z+d/2),new T.Vector3(x-w/2,3,z+d/2)
    ]),new T.LineBasicMaterial({color:'#ecf0ce'}));group.add(border);
  }
  for(const zone of world.zones.slice(6)) {
    const [x,y,z]=zone.position;
    const marker=new T.Mesh(new T.RingGeometry(110,123,48),new T.MeshBasicMaterial({color:'#537d6b',side:T.DoubleSide}));
    marker.rotation.x=-Math.PI/2;marker.position.set(x,y+3,z);group.add(marker);
  }
  const ring=new T.Mesh(new T.RingGeometry(130,145,64),new T.MeshBasicMaterial({color:'#537d6b',side:T.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.set(0,4,2350);group.add(ring);
  const rail=new T.LineLoop(new T.BufferGeometry().setFromPoints([
    new T.Vector3(-3730,3,-3730),new T.Vector3(3730,3,-3730),new T.Vector3(3730,3,3730),new T.Vector3(-3730,3,3730)
  ]),new T.LineBasicMaterial({color:'#ecf0ce'}));group.add(rail);
}
