// The Expanse: a big open world for trying out size. Rolling ground 240,000
// units across (the engine used to stop at 65,534 units and 4,096 triangles)
// with hills, a mountain, crates and stone blocks, landmark towers, coin
// trails, and travel points out to the rims, where cliffs drop into the void.
// Rendering and collision consume the same triangles. The ground is cut into
// chunks, each its own mesh ('grass:3:4' draws as grass), so the renderer
// culls far pieces and the camera's clearance rays only test nearby ones.
import {createBuilder,paint} from './builder.js';

export const HALF=120000,CELL=2000,VOID=-30000;
const N=HALF*2/CELL,CHUNK=10; // cells per side, and per ground chunk
// Hills and the mountain: [x, z, height, radius]. A negative height is a hollow.
const HILLS=[[-60000,-60000,14000,22000],[34000,-30000,4200,13000],[-40000,32000,5200,15000],[74000,66000,6500,16000],
  [-86000,72000,3600,11000],[82000,-80000,4800,12000],[16000,74000,2400,9000],[-14000,-82000,3000,10000],
  [98000,16000,2800,8000],[44000,34000,-900,9000],[-92000,-6000,2200,9000]];
// Travel points sit on grid corners, each on a flat pad:
// [section, name, note, x, z, facing in degrees (0 = east, 90 = north)].
const PLACES=[
  ['THE MIDDLE','Crossroads','The middle of the Expanse. Pick a landmark and run, or follow a coin trail out to a rim.',0,0,90],
  [null,'Crate Yard','Crates of every size, stacked for climbing and jumping.',16000,12000,0],
  [null,'Mountain Top','14,000 units up. Run down any side, or jump and fall a long way.',-60000,-60000,315],
  ['THE RIMS','North Rim','108,000 units north of the middle. Jump off the cliff and you come back here.',0,-108000,90],
  [null,'East Rim','108,000 units east of the middle, near the cliffs.',108000,0,0],
  [null,'South Rim','108,000 units south of the middle, near the cliffs.',0,108000,270],
  [null,'West Rim','108,000 units west of the middle, near the cliffs.',-108000,0,180],
  ['FAR OUT','Far Corner','108,000 east and 108,000 south: about 153,000 units from the middle.',108000,108000,315],
];
const PAD=3000,BLEND=8000,R=Math.round;
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const natural=(x,z)=>HILLS.reduce((h,[hx,hz,hh,hr])=>h+hh*Math.exp(-((x-hx)**2+(z-hz)**2)/(hr*hr)),
  260*Math.sin(x/8100+1.1)*Math.cos(z/9700-.6)+170*Math.sin((x+z)/5300+.4)+120*Math.cos((x-2*z)/6900+2.2));
const pads=PLACES.map(([,,,x,z])=>[x,z,R(natural(x,z))]);
// The ground's height at a grid corner: natural, but flat on each pad.
function corner(x,z) {
  let h=natural(x,z);
  for(const [px,pz,top] of pads)h=top+(h-top)*smooth((Math.hypot(x-px,z-pz)-PAD)/(BLEND-PAD));
  return R(h);
}
const COLORS={plaza:'#b9b193',meadow:'#7aa452',grass:'#6a9447',alpine:'#8f9873',rock:'#877f72',snow:'#eef2f2'};
const BEACONS=['#e8643a','#e0b43c','#f4f4f0','#4d8fd6','#d65a8a','#e8d040','#58b870','#9a6ad8'];

export function createExpanse() {
  const b=createBuilder({seed:64}),heights=[];
  for(let i=0;i<=N;i++){heights.push([]);for(let j=0;j<=N;j++)heights[i].push(corner(-HALF+i*CELL,-HALF+j*CELL));}
  // Height of the ground at any [x,z], exactly as the triangles have it.
  function ground(x,z) {
    const u=(x+HALF)/CELL,v=(z+HALF)/CELL,i=Math.min(N-1,Math.floor(u)),j=Math.min(N-1,Math.floor(v)),s=u-i,t=v-j;
    const h=(a,c)=>heights[i+a][j+c];
    // Cells alternate their diagonal, as they are cut below.
    if((i+j)%2)return s+t<=1?h(0,0)+s*(h(1,0)-h(0,0))+t*(h(0,1)-h(0,0)):h(1,1)+(1-s)*(h(0,1)-h(1,1))+(1-t)*(h(1,0)-h(1,1));
    return s>=t?h(0,0)+s*(h(1,0)-h(0,0))+t*(h(1,1)-h(1,0)):h(0,0)+t*(h(0,1)-h(0,0))+s*(h(1,1)-h(0,1));
  }
  const nearPad=(x,z,r)=>pads.some(([px,pz])=>Math.hypot(x-px,z-pz)<r);
  // The ground, chunk by chunk, built directly (it is most of the world):
  // wound to face up, tinted by height and steepness, each face a shade apart.
  const floor=[],chunks=[],shades=new Map(),corners=heights.map((row,i)=>row.map((h,j)=>[-HALF+i*CELL,h,-HALF+j*CELL]));
  const shade=(hex,k)=>{
    const key=hex+k;if(!shades.has(key))shades.set(key,'#'+[16,8,0].map(b=>Math.min(255,R((parseInt(hex.slice(1),16)>>b&255)*(.96+k*.01))).toString(16).padStart(2,'0')).join(''));
    return shades.get(key);
  };
  function tint(a,p,c,k) {
    const ux=p[0]-a[0],uy=p[1]-a[1],uz=p[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,up=ny/Math.hypot(nx,ny,nz);
    const x=(a[0]+p[0]+c[0])/3,y=(a[1]+p[1]+c[1])/3,z=(a[2]+p[2]+c[2])/3;
    const base=nearPad(x,z,PAD)?COLORS.plaza:up<.87?COLORS.rock:y>10500?COLORS.snow:y>6500?COLORS.alpine
      :Math.sin(x/9000)*Math.sin(z/7000)+Math.sin((x+z)/23000)>.3?COLORS.meadow:COLORS.grass;
    return shade(base,k);
  }
  for(let ci=0;ci<N/CHUNK;ci++)for(let cj=0;cj<N/CHUNK;cj++) {
    const start=floor.length;
    for(let i=ci*CHUNK;i<(ci+1)*CHUNK;i++)for(let j=cj*CHUNK;j<(cj+1)*CHUNK;j++) {
      const [a,p,c,d]=[corners[i][j],corners[i+1][j],corners[i+1][j+1],corners[i][j+1]];
      const tris=(i+j)%2?[[a,d,p],[p,d,c]]:[[a,c,p],[a,d,c]];
      tris.forEach(([u,v,w],n)=>floor.push({vertices:[u,v,w],type:0,color:tint(u,v,w,(i*7+j*13+n*5)%9)}));
    }
    chunks.push({start,end:floor.length,style:`grass:${ci}:${cj}`});
  }
  // The rims: sheer cliffs down into the void, and a hidden floor far below
  // so a jump off the edge falls (and returns you to a beacon) instead of
  // meeting SM64's invisible wall at the end of the world.
  const cliff=[[k=>[-HALF+k*CELL,heights[k][0],-HALF],[0,0,-1]],[k=>[-HALF+k*CELL,heights[k][N],HALF],[0,0,1]],
    [k=>[-HALF,heights[0][k],-HALF+k*CELL],[-1,0,0]],[k=>[HALF,heights[N][k],-HALF+k*CELL],[1,0,0]]];
  cliff.forEach(([at,out],side)=>{
    for(let k=0;k<N;k++) {
      const p=at(k),q=at(k+1);
      b.face([p,q,[q[0],-6000,q[2]],[p[0],-6000,p[2]]],'#77706a',0,out,`rock:rim:${side}:${Math.floor(k/30)}`);
    }
  });
  const far=HALF+80000;
  b.face([[-far,VOID,-far],[far,VOID,-far],[far,VOID,far],[-far,VOID,far]],'#000000',0,[0,1,0],'hidden');

  // Seeded scatter: crates, stacks and stone blocks, off the pads and coin trails.
  let seed=20260924;
  const rand=()=>{seed=(Math.imul(seed^seed>>>15,2246822507)+0x9e3779b9)>>>0;return seed/4294967296;};
  const between=(a,c)=>a+rand()*(c-a),placed=[],tops=[],pickups=[],blocks=[];
  // Meshes group by 40,000-unit squares.
  const region=(style,x,z)=>`${style}:${Math.floor((x+HALF)/40000)}:${Math.floor((z+HALF)/40000)}`;
  const styled=(colors,style,x,z)=>({...colors,topStyle:region(style,x,z),sideStyle:region(style,x,z)});
  // The ground's lowest and highest under a rectangle, sampled closely.
  function span([p0,p1,,p3]) {
    const n=Math.ceil(Math.max(Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),Math.hypot(p3[0]-p0[0],p3[1]-p0[1]))/150);
    let low=Infinity,high=-Infinity;
    for(let a=0;a<=n;a++)for(let c=0;c<=n;c++) {
      const h=ground(p0[0]+a/n*(p1[0]-p0[0])+c/n*(p3[0]-p0[0]),p0[1]+a/n*(p1[1]-p0[1])+c/n*(p3[1]-p0[1]));
      low=Math.min(low,h);high=Math.max(high,h);
    }
    return [low,high];
  }
  function clear(x,z,r) {
    if(Math.abs(x)>HALF-4000||Math.abs(z)>HALF-4000||nearPad(x,z,PAD+r+600))return false;
    if(Math.abs(x)<r+1500||Math.abs(z)<r+1500)return false; // the coin trails run along the axes
    return placed.every(([px,pz,pr])=>(x-px)**2+(z-pz)**2>(r+pr+500)**2);
  }
  function scatter(count,cx,cz,spread,big) {
    for(let n=0,tries=0;n<count&&tries<count*40;tries++) {
      const x=cx+between(-spread,spread),z=cz+between(-spread,spread);
      const length=big?between(1400,3200):between(400,900),width=big?between(1200,2600):length*between(.8,1.2),r=Math.hypot(length,width)/2;
      if(!clear(x,z,r))continue;
      const deg=between(0,90),outline=b.rect(x,z,length,width,deg),[low,high]=span(outline);
      if(high-low>(big?500:300))continue; // not on steep ground
      placed.push([x,z,r]);n++;
      // The base sinks below the lowest ground under the block; the top is level.
      const colors=big?styled(paint('#b9b4a6','#9a958a'),'rock',x,z):styled(paint('#c9a067','#a57a46'),'wood',x,z);
      let top=R(high)+R(big?between(160,520):length*between(.3,.6));
      b.slab(outline,R(low)-40,top,colors);blocks.push({outline,top});
      // Stacks: smaller crates on top, turned a little, never overhanging.
      for(let level=1;!big&&level<3&&rand()<.45;level++) {
        const size=Math.min(length,width)*between(.4,.6),rise=R(size*between(.5,.8));
        b.slab(b.rect(x,z,size,size,deg+between(-20,20)),top,top+rise,colors);top+=rise;
      }
      tops.push([x,top,z]);
    }
  }
  scatter(60,16000,12000,9000,false);
  scatter(420,0,0,HALF-6000,false);
  scatter(70,0,0,HALF-8000,true);
  // Travel points, each with a landmark tower behind it, tall enough to see from far away.
  const zones=PLACES.map(([section,name,note,x,z,facing],index)=>{
    const [,,top]=pads[index],f=facing*Math.PI/180,tx=x-1800*Math.cos(f),tz=z+1800*Math.sin(f);
    const mark=styled(paint(BEACONS[index],'#aaa293'),'rock',tx,tz);
    b.slab(b.rect(tx,tz,360,360,facing),top-40,top+4200,mark);blocks.push({outline:b.rect(tx,tz,360,360,facing),top:top+4200});
    b.slab(b.rect(tx,tz,520,520,facing),top+4200,top+4500,{...mark,side:BEACONS[index]},0,{bottom:true});
    return {...(section?{section}:{}),name,note,position:[x,top,z],
      // The core's yaw (0 = +Z) and the camera's (behind the explorer).
      yaw:R(((90+facing)/360*65536)%65536),camera:Math.atan2(-Math.cos(f),Math.sin(f)),id:`expanse-${index+1}`};
  });
  const nearest=(x,z)=>zones.reduce((best,zone)=>Math.hypot(x-zone.position[0],z-zone.position[2])<Math.hypot(x-best.position[0],z-best.position[2])?zone:best).name;
  const coin=(x,y,z)=>pickups.push({kind:'coin',id:`coin-expanse-${pickups.length+1}`,route:nearest(x,z),position:[R(x),R(y),R(z)]});
  // Coin trails from the Crossroads out to each rim, one coin every 4,000 units.
  for(const [dx,dz] of [[0,-1],[1,0],[0,1],[-1,0]])for(let d=6000;d<=102000;d+=4000)coin(dx*d,ground(dx*d,dz*d)+85,dz*d);
  // A ring on every pad, and a coin on each of the Crate Yard's eight tallest stacks.
  for(const {position:[x,,z]} of zones)for(let k=0;k<6;k++) {
    const px=x+1300*Math.cos(k*Math.PI/3),pz=z+1300*Math.sin(k*Math.PI/3);coin(px,ground(px,pz)+85,pz);
  }
  for(const [x,y,z] of tops.filter(([x,,z])=>Math.hypot(x-16000,z-12000)<9500).sort((p,q)=>q[1]-p[1]).slice(0,8))coin(x,y+85,z);
  for(const zone of zones)pickups.push({kind:'checkpoint',id:`checkpoint-${zone.id}`,position:zone.position});
  const rest=b.finish(),triangles=[...floor,...rest.triangles];
  const shapes=[...chunks,...rest.shapes.map(({start,end,style})=>({start:start+floor.length,end:end+floor.length,style}))];
  return {kind:'expanse',name:'The Expanse',triangles,shapes,zones,checkpoints:zones,freeTravel:true,pickups,ground,blocks,
    // Off a rim, fall this far and you return to a beacon.
    fallLimit:-4000,
    intro:{from:[14000,9000,26000],look:[-20000,3000,-30000]},
    text,
    theme:{background:'#bdd6ea',fog:['#bdd6ea',20000,140000],far:150000,near:25,exposure:1.05,
      hemisphere:['#f3f8ff','#5b7351',2.1],sun:['#fff3dc',3],sunOffset:[-2800,6500,3600],
      edges:['#f6f4e2',.22],dust:'#e2d7b8',shadow:'#2c4430'}};
}

// Player-facing copy, read by main.js.
const text={
  start:'The Expanse: 240,000 units of open ground. Pick a landmark and run, or travel from the Menu.',
  summary:'A big open world for testing size: run, jump and fall anywhere. Every travel point is open, and coin trails lead out to the rims.',
  zones:'Travel points',
};
