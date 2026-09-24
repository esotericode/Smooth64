// Cinder Caldera: an original volcanic level for the movement core.
// Rendering and collision consume these SAME integer triangles, like world.js.
// Coordinates are SM64 units, Y up. The lake floor is SURFACE_BURNING (0x01),
// so the core's own lava boost applies: three wedges of damage and a launch.
import {SURFACE} from './rules.js';
export const {LAVA,HANGABLE,VERY_SLIPPERY}=SURFACE;
const GLOW_LINE=240;
// The crater wall: 36 jittered vertices around the lake. Shared with the scene.
const rimVertex=i=>5750+(((i%36)*73)%9-4)*55;
export function rimRadius(deg) {
  const t=(((deg%360)+360)%360)/10,i=Math.floor(t);
  return rimVertex(i)+(rimVertex(i+1)-rimVertex(i))*(t-i);
}

// Checkpoints double as the level's destinations once they have been lit.
export const checkpoints=[
  {id:'landing',name:'Ashfall Landing',note:'The Ember Star burns atop the Spire ahead. Start west, through the broken gate.',position:[0,300,4500],yaw:-32768,camera:0,pitch:.2},
  {id:'forge',name:'The Forge',note:'Climb the rampart. The high step needs a backflip: hold Z, then press A.',position:[-3900,420,-100],yaw:-32768,camera:0},
  {id:'crown',name:'Chimney Crown',note:'Stand under the grate, jump and hold A to hang. Keep holding as you cross.',position:[-3900,2350,-1750],yaw:-32768,camera:0},
  {id:'belfry',name:'Bell Tower',note:'Obsidian Ridge: narrow beams and blades, then ride the cinder chute.',position:[-2550,2250,-3700],yaw:16384,camera:-Math.PI/2},
  {id:'gate',name:'Spire Gate',note:'Spiral up the Spire. Near the top, one step needs a backflip or a standing double jump.',position:[1120,900,-1120],yaw:-8192,camera:Math.PI*3/4,pitch:.3},
];

export const sections=[
  {name:'Ashfall Landing',position:[0,300,4700]},{name:'Basalt Steps',position:[-2600,400,3900]},
  {name:'The Forge',position:[-3900,420,-300]},{name:'The Chimney',position:[-3900,1190,-1400]},
  {name:'Chain Bridge',position:[-3500,2300,-3300]},{name:'Obsidian Ridge',position:[-500,2150,-3700]},
  {name:'The Spire',position:[900,900,-900]},
];

// [walkable top, side]. Tops are ash-light so footing always reads against the walls.
const PALETTE={
  basalt:['#a39791','#4a3f43'],landing:['#b3a598','#54484a'],gate:['#b8aa9c','#665856'],
  forge:['#c9a684','#78573f'],crown:['#bf9a7c','#684e42'],grate:['#9a8878','#5f4f44'],
  obsidian:['#9d93b5','#3d3552'],spire:['#c2a08e','#634b46'],rim:['#57393a','#40302f'],
};

export function createCaldera() {
  const triangles=[],shapes=[],pickups=[];
  let groupStart=0,seed=7;
  const R=Math.round;
  function group(style) {
    if(triangles.length>groupStart)shapes.push({start:groupStart,end:triangles.length,style});
    groupStart=triangles.length;
  }
  // Tiny deterministic brightness variation per face: a hand-cut look.
  function shade(hex) {
    seed=(Math.imul(seed,1103515245)+12345)>>>0;
    const k=.93+(seed>>>16)%1000/1000*.14,n=parseInt(hex.slice(1),16);
    const c=[n>>16,n>>8&255,n&255].map(v=>Math.min(255,R(v*k)));
    return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function face(points,color,type,normal) {
    const a=points[0],b=points[1],c=points[2];
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(cross.reduce((s,n,i)=>s+n*normal[i],0)<0)points=points.toReversed();
    color=shade(color);
    for(let i=1;i<points.length-1;i++)triangles.push({vertices:[points[0],points[i],points[i+1]],type,color});
  }
  // A vertical slab over a convex outline. `tops` gives each corner's top height
  // (a ramp when they differ). Faces point away from the outline's centre.
  function slab(outline,y0,tops,[top,side],type=0,{bottom=true,sideType=0,skip=[],walls=true,roof=true}={}) {
    const pts=outline.map(p=>[R(p[0]),R(p[1])]),n=pts.length;
    const heights=Array.isArray(tops)?tops.map(R):pts.map(()=>R(tops));
    const cx=pts.reduce((s,p)=>s+p[0],0)/n,cz=pts.reduce((s,p)=>s+p[1],0)/n;
    const up=(()=>{ // true upward normal of the (possibly sloped) top
      const a=[pts[0][0],heights[0],pts[0][1]],b=[pts[1][0],heights[1],pts[1][1]],c=[pts[2][0],heights[2],pts[2][1]];
      const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
      const cr=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];return cr[1]<0?cr.map(q=>-q):cr;
    })();
    if(roof)face(pts.map((p,i)=>[p[0],heights[i],p[1]]),top,type,up);
    if(bottom)face(pts.map(p=>[p[0],R(y0),p[1]]),side,type,[0,-1,0]);
    // Sides rising out of the lava are split at the glow line, so the lava's
    // light (baked by the renderer from vertex height) stays near the surface.
    const band=y0<0&&Math.min(...heights)>GLOW_LINE+80?GLOW_LINE:null;
    for(let i=0;walls&&i<n;i++) {
      if(skip.includes(i))continue;
      const p=pts[i],q=pts[(i+1)%n],mx=(p[0]+q[0])/2-cx,mz=(p[1]+q[1])/2-cz;
      for(const [low,a,b] of band===null?[[R(y0),heights[i],heights[(i+1)%n]]]:[[R(y0),band,band],[band,heights[i],heights[(i+1)%n]]])
        face([[p[0],low,p[1]],[q[0],low,q[1]],[q[0],b,q[1]],[p[0],a,p[1]]],side,sideType,[mx,0,mz]);
    }
  }
  const box=(x0,x1,z0,z1,y0,y1,colors,type=0,options)=>slab([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],y0,y1,colors,type,options);
  const column=(x,z,r,y0,y1,colors,n=6,rot=seedAngle(x,z),options)=>
    slab(Array.from({length:n},(_,i)=>[x+r*Math.cos(rot+i*Math.PI*2/n),z+r*Math.sin(rot+i*Math.PI*2/n)]),y0,y1,colors,0,options);
  function seedAngle(x,z){return ((x*7+z*13)%360+360)%360*Math.PI/180;}
  // Rotated rectangle: centre, length along `angle` (radians from +X toward -Z), width across.
  function blade(x,z,length,width,angle,y0,y1,colors,type=0,options) {
    const c=Math.cos(angle),s=-Math.sin(angle),hl=length/2,hw=width/2;
    slab([[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]].map(([a,b])=>[x+c*a-s*b,z+s*a+c*b]),y0,y1,colors,type,options);
  }
  // Annular sector around (cx,cz): angles in degrees, counter-clockwise seen from
  // above (0 = +X/east, 90 = -Z/north). Split into convex steps for collision.
  const polar=(cx,cz,r,deg)=>[cx+r*Math.cos(deg*Math.PI/180),cz-r*Math.sin(deg*Math.PI/180)];
  function sector(cx,cz,r0,r1,a0,a1,y0,y1,colors,steps=Math.max(1,Math.ceil((a1-a0)/14))) {
    for(let i=0;i<steps;i++) {
      const b0=a0+(a1-a0)*i/steps,b1=a0+(a1-a0)*(i+1)/steps;
      const skip=[3];            // never an inner wall: the spire is there
      if(i>0)skip.push(0);       // shared seams between steps are not walls
      if(i<steps-1)skip.push(2);
      slab([polar(cx,cz,r0,b0),polar(cx,cz,r1,b0),polar(cx,cz,r1,b1),polar(cx,cz,r0,b1)],y0,y1,colors,0,{skip});
    }
  }
  const pickup=(kind,id,x,y,z,extra={})=>pickups.push({kind,id,position:[x,y,z],...extra});
  const coins=(points,section)=>points.forEach(p=>pickup('coin',`coin-${pickups.filter(q=>q.kind==='coin').length+1}`,...p,{section}));
  const line=(a,b,count)=>Array.from({length:count},(_,i)=>a.map((v,k)=>R(v+(b[k]-v)*(count===1?.5:i/(count-1)))));

  // ---- The lake and the crater wall ----------------------------------------
  box(-6400,6400,-6400,6400,-200,0,['#ff6a1a','#ff6a1a'],LAVA,{bottom:false});
  group('lava');
  {
    // Banded, so the lava's glow stays low on the cliff instead of washing it.
    const n=36,radius=i=>rimVertex(i),bands=[-200,260,1300,4200];
    for(let i=0;i<n;i++) {
      const a=i/n*360,b=(i+1)/n*360,p=polar(0,0,radius(i),a),q=polar(0,0,radius(i+1),b);
      for(let k=0;k<3;k++)face([[R(p[0]),bands[k],R(p[1])],[R(q[0]),bands[k],R(q[1])],[R(q[0]),bands[k+1],R(q[1])],[R(p[0]),bands[k+1],R(p[1])]],
        k===2?'#34282c':PALETTE.rim[k?1:0],0,[-(p[0]+q[0]),0,-(p[1]+q[1])]);
    }
  }
  group();

  // ---- 1. Ashfall Landing ----------------------------------------------------
  box(-1100,1100,4000,6100,-200,300,PALETTE.landing);
  // A broken gate: two pillars 380 apart. Wall kick between them for a shard.
  box(-1080,-740,4200,4420,300,1300,PALETTE.gate);
  box(-1080,-740,4800,5020,300,1300,PALETTE.gate);
  pickup('shard','shard-gate',-910,1360,4910,{hint:'Broken gate: wall kick between the pillars.'});
  coins(line([-200,360,4510],[-650,360,4610],4),'Ashfall Landing');
  // The Ember Altar: the Crimson Star appears here once all eight shards are found.
  column(0,2500,300,-200,200,PALETTE.basalt,6,0);
  pickup('bonus','crimson-star',0,330,2500);
  group();

  // ---- 2. Basalt Steps: columns shrink as the gaps widen ---------------------
  const steps=[[-1560,4560,260,340],[-2200,4250,220,420],[-2800,3820,190,380],[-3230,3230,175,470],[-3560,2560,165,430]];
  for(const [x,z,r,top] of steps){column(x,z,r,-200,top,PALETTE.basalt);coins([[x,top+70,z]],'Basalt Steps');}
  // A lone column out in the lava, one hard jump from the third step.
  column(-2210,3380,150,-200,330,PALETTE.basalt);
  pickup('shard','shard-lone',-2210,410,3380,{hint:'Basalt Steps: the lone column past the third step.'});
  coins(Array.from({length:6},(_,i)=>[R(-2210+Math.cos(i/6*Math.PI*2)*230),380,R(3380+Math.sin(i/6*Math.PI*2)*230)]),'Basalt Steps');
  // Rest rock, then a long jump north to the Forge.
  box(-4000,-3400,1250,2050,-200,480,PALETTE.basalt);
  coins(line([-3700,700,1150],[-3700,620,450],3),'Basalt Steps');
  group();

  // ---- 3. The Forge and the Chimney ----------------------------------------
  box(-4700,-3100,-1600,300,-200,420,PALETTE.forge);
  // Anvil house: a double jump and ledge grab (or a triple jump) reaches the roof.
  box(-4600,-4200,-400,0,420,960,PALETTE.crown);
  pickup('shard','shard-anvil',-4400,1030,-200,{hint:'The Forge: the anvil house roof.'});
  // Rampart: a ledge-grab step, then a backflip step too high to jump.
  box(-4700,-3100,-1600,-800,420,760,PALETTE.forge);
  box(-4700,-3100,-1600,-1080,760,1190,PALETTE.forge);
  coins(line([-4500,830,-940],[-3300,830,-940],5),'The Forge');
  // Chimney: two towers 380 apart, backed by the crown. Kick up 1,160 units.
  box(-4700,-4090,-1600,-1260,1190,2350,PALETTE.crown);
  box(-3710,-3100,-1600,-1260,1190,2350,PALETTE.crown);
  box(-4700,-3100,-2300,-1600,-200,2350,PALETTE.crown);
  coins(line([-3900,1400,-1430],[-3900,2150,-1430],4),'The Chimney');
  // The flue: a thin stack on the crown. Double jump and grab its lip.
  column(-3300,-2150,110,2350,2830,PALETTE.gate,8,Math.PI/8);
  pickup('shard','shard-flue',-3300,2900,-2150,{hint:'Chimney Crown: the top of the flue.'});
  group();

  // ---- 4. Chain Bridge: hang from the grates between two chain posts ---------
  // A grate is only a hangable underside (its bars are drawn by the scene).
  // Nothing to land on above it; catch it by jumping from directly beneath.
  const grates=[];
  const grate=(x0,x1,z0,z1)=>{box(x0,x1,z0,z1,2600,2600,PALETTE.grate,HANGABLE,{walls:false,roof:false});grates.push([x0,x1,z0,z1]);};
  grate(-4000,-3700,-3150,-1900);
  column(-3850,-3250,240,-200,2300,PALETTE.basalt);
  column(-3250,-3650,220,-200,2300,PALETTE.basalt);
  grate(-3350,-2500,-3800,-3500);
  // A dead-end spur over the lava holds a shard; hang out to its end and back.
  grate(-3050,-2750,-3500,-2950);
  pickup('shard','shard-spur',-2900,2510,-3040,{hint:'Chain Bridge: hang to the end of the southern spur.'});
  coins(line([-3850,2510,-2400],[-3850,2510,-2950],3),'Chain Bridge');
  coins(line([-3150,2510,-3650],[-2700,2510,-3650],3),'Chain Bridge');
  group('metal');

  // ---- 5. Bell Tower and Obsidian Ridge -------------------------------------
  box(-2750,-1800,-4150,-3250,-200,2250,PALETTE.obsidian);
  // Belfry: a thick roof on four posts. Double jump from outside it and grab the edge.
  for(const [x,z] of [[-2160,-3860],[-1840,-3860],[-2160,-3540],[-1840,-3540]])box(x-30,x+30,z-30,z+30,2250,2570,PALETTE.gate);
  box(-2190,-1810,-3890,-3510,2570,2740,PALETTE.gate);
  pickup('shard','shard-belfry',-2000,2810,-3700,{hint:'Bell Tower: on the belfry roof.'});
  // The ridge: a narrow beam, a post, then descending obsidian blades.
  box(-1800,-900,-3790,-3610,1800,2250,PALETTE.obsidian);
  column(-650,-3700,230,-200,2150,PALETTE.obsidian);
  blade(0,-3520,520,170,20*Math.PI/180,1650,2050,PALETTE.obsidian);
  blade(720,-3300,520,170,-15*Math.PI/180,1550,1950,PALETTE.obsidian);
  column(1380,-3380,220,-200,1850,PALETTE.obsidian);
  coins(line([-1650,2320,-3700],[-1050,2320,-3700],4),'Obsidian Ridge');
  coins([[0,2120,-3520],[720,2020,-3300]],'Obsidian Ridge');
  // Cinder Shelf, then a very slippery chute down to the Spire Gate. All three
  // share the north-east diagonal, so their edges meet exactly.
  const diagonal=(rho,side=0)=>[rho*Math.SQRT1_2+side*Math.SQRT1_2,-rho*Math.SQRT1_2+side*Math.SQRT1_2];
  const along=(r0,r1,halfWidth)=>[diagonal(r0,-halfWidth),diagonal(r1,-halfWidth),diagonal(r1,halfWidth),diagonal(r0,halfWidth)];
  slab(along(3250,4000,400),-200,1500,PALETTE.obsidian);
  slab(along(1850,3250,240),700,[900,1500,1500,900],PALETTE.obsidian,VERY_SLIPPERY);
  for(const side of [-1,1]) {
    const inner=side*240,outer=side*290;
    slab([diagonal(1850,inner),diagonal(3250,inner),diagonal(3250,outer),diagonal(1850,outer)],700,[990,1590,1590,990],PALETTE.gate);
  }
  pickup('shard','shard-chute',...(p=>[Math.round(p[0]),1450,Math.round(p[1])])(diagonal(2550)),{hint:'Obsidian Ridge: high over the chute. Jump mid-slide.'});
  coins([3050,2750,2450,2150].map(rho=>(p=>[R(p[0]),R(900+(rho-1850)*600/1400+80),R(p[1])])(diagonal(rho))),'Obsidian Ridge');
  group();

  // ---- 6. The Spire -----------------------------------------------------------
  column(0,0,700,-200,3000,PALETTE.spire,12,Math.PI/12);
  column(0,0,760,3000,3200,PALETTE.spire,12,Math.PI/12);
  // Spire Gate: from the spire's face out to the foot of the chute.
  slab(along(640,1850,410),-200,900,PALETTE.spire);
  // The spiral, counter-clockwise from the gate.
  sector(0,0,690,1000,76,106,700,1080,PALETTE.spire);
  sector(0,0,690,1000,122,148,900,1300,PALETTE.spire);
  sector(0,0,690,1000,164,200,1100,1520,PALETTE.spire);
  // Kick corridor at 220 degrees: a flat annex face and an outer wall, 370 apart.
  // `local(r,t)`: radius r along the corridor's axis; t grows counter-clockwise,
  // so negative t is the vestibule where the third ledge arrives.
  const axis=[Math.cos(220*Math.PI/180),-Math.sin(220*Math.PI/180)],tangent=[axis[1],-axis[0]];
  const local=(r,t)=>[axis[0]*r+tangent[0]*t,axis[1]*r+tangent[1]*t];
  const block=(r0,r1,t0,t1,y0,y1)=>slab([local(r0,t0),local(r1,t0),local(r1,t1),local(r0,t1)],y0,y1,PALETTE.spire);
  block(690,1350,-430,350,1100,1520);
  block(640,980,-140,350,1100,2320);
  block(1350,1500,-430,350,1100,2320);
  coins([1750,1960,2170].map(y=>[...local(1165,120).map(R),y]).map(([x,z,y])=>[x,y,z]),'The Spire');
  // Narrow ledge, then the high step: a backflip or a standing double jump.
  sector(0,0,690,900,258,286,2100,2420,PALETTE.spire);
  sector(0,0,690,960,292,320,2440,2840,PALETTE.spire);
  // A wide last ledge. The summit rim is a running jump (or double jump) above it.
  sector(0,0,690,1100,352,402,2380,2780,PALETTE.spire);
  // A lonely perch beyond the corridor.
  column(...polar(0,0,1420,256),110,-200,2350,PALETTE.gate,8);
  pickup('shard','shard-perch',...(p=>[R(p[0]),2420,R(p[1])])(polar(0,0,1420,256)),{hint:'The Spire: the perch beyond the kick corridor.'});
  for(const [deg,y,r] of [[91,1150,850],[135,1370,850],[182,1590,850],[272,2490,795],[306,2910,830],[20,2850,950]])
    coins([(p=>[R(p[0]),y,R(p[1])])(polar(0,0,r,deg))],'The Spire');
  pickup('star','ember-star',0,3330,0);
  group();

  for(const c of checkpoints)pickup('checkpoint',`checkpoint-${c.id}`,...c.position);
  return {kind:'caldera',name:'Cinder Caldera',triangles,shapes,pickups,checkpoints,sections,zones:checkpoints,grates,
    intro:{from:[1800,3900,1500],look:[0,3250,0]},text,
    theme:{background:'#2a1a2c',fog:['#3a2131',5200,16000],exposure:1.1,
      hemisphere:['#d8cce8','#c05a2e',1.95],sun:['#ffe6cc',2.5],sunOffset:[-2600,6800,2400],
      edges:['#ffe2c4',.16],dust:'#a8988f',shadow:'#140a0e',
      underglow:{color:'#ff4a12',height:170,strength:.5}}};
}

// Player-facing copy, read by main.js.
const text={
  start:'Reach the Ember Star at the summit. Start through the broken gate.',
  shard:'Ember Shard',shards:'Ember Shards',
  reveal:'Every shard found! The Crimson Star waits on the lava altar.',
  objectives:[
    {icon:'★',title:'Ember Star',note:'Reach the summit.',star:'ember-star'},
    {icon:'♦',title:'Ember Shards',note:'Explore the hidden challenges.',shards:true},
    {icon:'★',title:'Crimson Star',note:'Find every shard, then visit the lava altar.',star:'crimson-star',needsShards:true},
  ],
  victory(kind,{session,shards,best}) {
    if(kind==='star')return {title:'Ember Star claimed.',
      copy:session.found.has('crimson-star')?'Both stars are yours. The caldera is conquered!':shards.found===shards.total?'The summit is yours. The Crimson Star waits on the lava altar.'
        :`The summit is yours${best?` · best ${best}`:''}. ${shards.total-shards.found} Ember Shards still hide in the caldera.`};
    return {title:'Crimson Star claimed.',
      copy:session.found.has('ember-star')?'Both stars are yours. The caldera is conquered!':'Every shard is yours. The Ember Star still waits at the summit.'};
  },
};
