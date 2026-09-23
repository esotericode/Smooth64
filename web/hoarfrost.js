// Hoarfrost Heights: an original ice-and-snow level for the movement core.
//
// A high valley floats on a sea of cloud under the Hoarfrost Horn. The route
// crosses a frozen lake, climbs a snowbound pine forest, rides a glacier chute
// and scales an icefall to the Shoulder, halfway up the mountain.
//
// PART 1 (built): Frostmere Camp -> Mirror Lake -> Pinewood Drifts -> the
//   Glacier -> the Icefall -> the Shoulder and the Icefall Star.
// PART 2 (planned, NOT built): the upper Horn, from the Shoulder to the summit's
//   Aurora Star, a long slide home, three more Frost Shards and the Polar Star.
//   The full plan, coordinates, budgets and a checklist are in
//   docs/HOARFROST.md. Search this file for "PART 2" to find every hook.
//
// Rendering and collision consume these SAME integer triangles (builder.js).
// Coordinates are SM64 units, Y up; +X east, -Z north. Surfaces come from the
// unchanged core (rules.js):
//   frostbite water = SURFACE_BURNING, as in the original's snowy course: three
//     wedges of damage and a launch, and only ever a floor at y=0;
//   ICE / VERY_SLIPPERY: a full run needs ~1,180 units to stop, and any slope
//     over ~12 degrees cannot be climbed and slides you down it;
//   SLIPPERY snow: climbable up to ~20 degrees; DEEP_SNOW (SURFACE_SLOW): runs
//     top out at 24 instead of 32; NOT_SLIPPERY rock: walkable even at 60 degrees.
// Falling below y=-1500 returns you to the last beacon (rules.js), and a
// hidden floor at y=-2600 catches every gap so jumps over the void are legal.
import {SURFACE} from './rules.js';
import {createBuilder,paint} from './builder.js';
export const FROSTBITE=SURFACE.LAVA,{HANGABLE,DEEP_SNOW,SLIPPERY,VERY_SLIPPERY,NOT_SLIPPERY,ICE}=SURFACE;
export const ABYSS=-2600,CLOUD=-700;
// Part 1 keeps to this many triangles so part 2 has room; the core holds 4,096.
export const PART1_BUDGET=2200;

export const checkpoints=[
  {id:'camp',name:'Frostmere Camp',note:'The Horn waits to the north. Cross Mirror Lake to the west shore. Floes are safe; open water bites.',
    position:[-300,500,11300],yaw:-32768,camera:0,pitch:.28},
  {id:'shore',name:'West Shore',note:'Climb the Pinewood terraces north. Deep snow slows your run.',
    position:[-6600,100,4300],yaw:-32768,camera:0},
  {id:'ravine',name:'Pinewood Ravine',note:'Cross the fallen pine. It is iced over: keep moving, and jump the break.',
    position:[-7400,850,1500],yaw:-32768,camera:0},
  {id:'margin',name:'Glacier Margin',note:'Cross the glacier east. Ride the ice chute and jump at the lip.',
    position:[-3500,1800,-2600],yaw:16384,camera:-Math.PI/2},
  {id:'icefall',name:'Icefall Foot',note:'Climb the icefall: a ledge, a chimney, then the rock rib. Ice will not hold you; rock will.',
    position:[4600,2300,-5350],yaw:-32768,camera:0,pitch:.35},
  {id:'shoulder',name:'The Shoulder',note:'Halfway up the Horn. The upper trail is snowed in for now.',
    position:[4900,4300,-9350],yaw:-32768,camera:0},
];

// The main route's waypoints, in order ([x,y,z] on each floor): the map tool
// draws them, and tests/hoarfrost.test.mjs proves each leg. PART 2 continues
// from the last one (the Shoulder) toward the summit.
export const route=[
  [-300,500,11300],[-1600,100,9250],[-2650,130,8350],[-3350,180,7150],[-4430,90,6080],[-5900,100,4700],
  [-7000,450,3000],[-7000,850,1800],[-7400,850,780],[-7250,930,120],[-7400,1000,-620],[-7000,1400,-2000],
  [-5000,1450,-2500],[-3500,1800,-2600],[-1800,1880,-2600],[0,2150,-2775],[2200,1760,-2775],[3800,1850,-2900],
  [4600,2300,-5350],[4600,2700,-5900],[4490,2700,-6500],[4490,3650,-7100],[4000,4350,-8450],[4200,4300,-9350],[4200,4560,-9700],
];

export const sections=[
  {name:'Frostmere Camp',position:[0,500,11500]},{name:'Mirror Lake',position:[-2600,100,8200]},
  {name:'Pinewood Drifts',position:[-7500,450,2600]},{name:'Pinewood Ravine',position:[-7400,850,0]},
  {name:'The Glacier',position:[-1000,2000,-2600]},{name:'The Icefall',position:[4500,2800,-6000]},
  {name:'The Shoulder',position:[4700,4300,-8100]},
];

// [walkable top, side, styles]. Snow reads white, slick ice reads blue, grippy
// rock reads grey: the colour always tells you how a surface will behave.
const PALETTE={
  cliff:paint('#edf2f9','#6c7282','snow','rock'),
  snow:paint('#e6ecf5','#9aa5b8','snow','rock'),
  powder:paint('#fbfcff','#b7c3d6','snow','rock'),
  drift:paint('#f2f6fc','#cad4e4','snow','snow'),
  floe:paint('#eaf3f9','#8fbfd9','snow','ice'),
  ice:paint('#b4def2','#6aa3c8','ice','ice'),
  chute:paint('#96cde9','#4f8dba','ice','ice'),
  rock:paint('#8e929f','#5f6371','rock','rock'),
  dark:paint('#6f7383','#4a4d5a','rock','rock'),
  wood:paint('#a57a52','#6f4c31','wood','wood'),
  bark:paint('#8b6f58','#5d4a3b','wood','wood'),
  pine:paint('#dce8e3','#3b6152','snow','pine'),
  plate:paint('#e8f0f8','#7fb5d6','snow','ice'),
  serac:paint('#e3eef7','#6aa6d0','snow','ice'),
  crag:paint('#e9eef6','#707584','snow','rock'),
  horn:paint('#eef3fa','#7a8092','snow','rock'),
  water:paint('#1f5268','#565c6c','frost','rock'),
  hidden:paint('#000000','#000000','hidden','hidden'),
};

export function createHoarfrost() {
  const b=createBuilder(),pickups=[],R=Math.round;
  const {slab,box,column,rect,beam,peak,mountain,polar,ring}=b;
  const pickup=(kind,id,x,y,z,extra={})=>pickups.push({kind,id,position:[R(x),R(y),R(z)],...extra});
  // A coin's section is the checkpoint whose stretch it lies on: the menu counts them per checkpoint.
  const coins=(points,section,extra={})=>points.forEach(p=>pickup('coin',`frost-coin-${pickups.filter(q=>q.kind==='coin').length+1}`,...p,{section,...extra}));
  const line=(a,c,count)=>Array.from({length:count},(_,i)=>a.map((v,k)=>R(v+(c[k]-v)*(count===1?.5:i/(count-1)))));
  const arc=(x,y,z,r,count,from=0)=>Array.from({length:count},(_,i)=>{const p=polar(x,z,r,from+i*360/count);return [p[0],y,p[1]];});
  // An irregular convex floe or rock: radius wobbles between 92% and 100%.
  const blob=(x,z,r,n=7,rot=0)=>Array.from({length:n},(_,i)=>polar(x,z,r*(.92+.08*Math.abs(Math.sin(i*2.3+x*.001+z*.0007))),rot+i*360/n));
  // A ridge tent: two steep roof slopes (you slide off) and two gable walls.
  function tent(x,z,length,width,height,deg,y=500) {
    const [p0,p1,p2,p3]=rect(x,z,length,width,deg),top=y+height;
    const ridge=[[(p0[0]+p3[0])/2,top,(p0[1]+p3[1])/2],[(p1[0]+p2[0])/2,top,(p1[1]+p2[1])/2]];
    const at=(p,h=y)=>[p[0],h,p[1]],c=[x,z];
    b.face([at(p0),at(p1),ridge[1],ridge[0]],'#c8573e',0,[p0[0]+p1[0]-2*c[0],1,p0[1]+p1[1]-2*c[1]],'cloth');
    b.face([at(p3),at(p2),ridge[1],ridge[0]],'#c8573e',0,[p3[0]+p2[0]-2*c[0],1,p3[1]+p2[1]-2*c[1]],'cloth');
    b.face([at(p0),at(p3),ridge[0]],'#a8432f',0,[p0[0]+p3[0]-2*c[0],0,p0[1]+p3[1]-2*c[1]],'cloth');
    b.face([at(p1),at(p2),ridge[1]],'#a8432f',0,[p1[0]+p2[0]-2*c[0],0,p1[1]+p2[1]-2*c[1]],'cloth');
  }
  // One pine tier: a gentle snowy cone (walkable), a green skirt and an underside.
  function tier(x,z,r,rim,rise=110,thick=160,n=6,rot=0) {
    const base=ring(x,z,r,n,rot).map(p=>[p[0],rim,p[1]]);
    peak(base,[x,rim+rise,z],PALETTE.pine,0,{skirt:rim-thick});
    b.face(base.map(p=>[p[0],rim-thick,p[2]]),PALETTE.pine.side,0,[0,-1,0],'pine');
  }
  function pine(x,z,ground,scale=1) {
    column(x,z,55*scale,ground,ground+260*scale,PALETTE.bark,5,x%72);
    tier(x,z,330*scale,ground+300*scale,300*scale,140*scale,5,x%72);
    tier(x,z,220*scale,ground+600*scale,300*scale,120*scale,5,x%72+36);
  }

  // ---- The sky island, the catch floor, and the cloud line -----------------
  // Hidden: never drawn. It only keeps the core from treating a gap as a wall.
  box(-16000,16000,-24000,16000,ABYSS-10,ABYSS,PALETTE.hidden,0,{walls:false});

  // ---- 1. Frostmere Camp -----------------------------------------------------
  slab([[-2400,10600],[-1700,10280],[-1000,10150],[1300,10150],[2100,10380],[2600,10700],[2750,11400],[2700,12200],
    [2150,12700],[1300,13000],[-1400,13000],[-2250,12650],[-2600,12100],[-2650,11300]],-1400,500,PALETTE.cliff,0,{lip:90});
  // The Watchtower: a woodshed (single jump and grab), then a lookout 480
  // higher: a backflip from the woodshed roof, or a double jump.
  box(1700,2300,11500,12050,500,1380,PALETTE.wood);
  box(1750,2250,12050,12450,500,900,PALETTE.wood);
  pickup('shard','shard-tower',2000,1470,11775,{hint:'Frostmere Camp: the watchtower lookout. Backflip from the woodshed roof.'});
  tent(-1450,11500,560,420,300,20);tent(-500,12400,520,400,280,-10);tent(700,12250,480,380,260,35);
  coins(arc(-150,580,11900,300,6,15),'Frostmere Camp');
  coins([[2000,980,12250],[1450,580,11900]],'Frostmere Camp');

  // ---- 2. Mirror Lake --------------------------------------------------------
  // One broad slab whose top is frostbite water; the shores overlap its edges.
  // Where it meets the sky it spills over the valley's lip into the clouds.
  const lake=[[-7600,9000],[-7700,6000],[-7400,2400],[-2000,1900],[5200,2000],[6500,3600],[6700,5800],
    [6500,8600],[5900,10800],[2000,11000],[-2400,10900],[-5500,10300]];
  slab(lake,-1400,0,PALETTE.water,FROSTBITE);
  const spills=[[6,.3,700],[6,.75,420],[7,.2,500],[8,.55,560]].map(([i,t,width])=>{
    const p=lake[i],q=lake[(i+1)%lake.length];
    return {position:[R(p[0]+(q[0]-p[0])*t),R(p[1]+(q[1]-p[1])*t)],width,yaw:Math.atan2(q[0]-p[0],q[1]-p[1])+Math.PI/2};
  });
  // Main crossing: floes north-west, a tilted ice floe, an ice runway, and a
  // long jump over the channel to the west shore.
  const floe=(x,z,r,top=100,colors=PALETTE.floe,type=0,n=7)=>slab(blob(x,z,r,n,x%50),-120,top,colors,type,{lip:30});
  floe(-1600,9250,520);
  floe(-2650,8350,480,130);
  // The tilted floe leans north-west, the way you are going: land on it and
  // it slides you downhill at once. Jump from the slide before the low edge.
  {
    const x=-3350,z=7150,g=Math.tan(13*Math.PI/180)*Math.SQRT1_2;
    const outline=blob(x,z,520,7,20);
    slab(outline,-120,outline.map(([px,pz])=>180+g*(px-x)+g*(pz-z)),PALETTE.ice,ICE);
  }
  // The runway: flat ice pointing north-west. You cannot stop on it; long jump.
  slab(rect(-4430,6080,1300,520,135),-120,90,PALETTE.ice,ICE);
  coins(line([-1600,190,9250],[-2650,230,8350],3),'Frostmere Camp');
  coins([[-3350,330,7150],[-4000,190,6500],[-4800,170,5720]],'Frostmere Camp');
  // Side loop to the Lone Floe (a Frost Shard) and the Mirror Isle, back to camp.
  floe(-1400,7250,400,110);
  floe(-450,6450,200,90,PALETTE.ice,ICE,6);
  pickup('shard','shard-floe',-450,170,6450,{hint:'Mirror Lake: the lone ice floe. Land and let go of the stick at once.'});
  floe(350,6000,340,100);
  // Mirror Isle. PART 2: the Polar Star (the bonus star) appears here.
  slab(blob(1500,5700,700,9,10),-150,250,PALETTE.cliff,0,{lip:60});
  floe(1700,7300,380,110);floe(1000,8450,420,120);floe(200,9500,430,110);
  // Drifting ice sheets in the open east of the lake.
  for(const [x,z,r,top] of [[3600,4300,720,120],[4700,7600,600,90],[3100,9400,520,110]])slab(blob(x,z,r,8,x%40),-120,top,PALETTE.ice,ICE,{lip:25});
  coins(arc(1500,330,5700,380,5),'Frostmere Camp');
  coins([[-1400,190,7250],[350,180,6000],[1700,190,7300],[1000,200,8450]],'Frostmere Camp');
  // The glacier's tongue: broken blocks of blue ice stepping down into the
  // lake, ending in an ice cliff. Too steep and slick to climb.
  for(const [outline,tops] of [
    [[[-3200,-650],[-900,-760],[-700,500],[-3000,700]],[1480,1450,1200,1230]],
    [[[-600,-760],[1900,-650],[2100,450],[-450,520]],[1500,1470,1260,1240]],
    [[[2050,-620],[3750,-700],[3950,400],[2250,450]],[1420,1440,1180,1200]],
    [[[-2900,850],[-200,700],[0,1900],[-2700,2100]],[1150,1120,850,880]],
    [[[150,650],[2400,620],[2600,1850],[300,1950]],[1180,1150,900,870]],
    [[[2600,600],[4100,560],[4400,1750],[2750,1800]],[1120,1100,860,880]],
    [[[-2800,2300],[1000,2100],[1200,3250],[-2500,3350]],[800,760,420,450]],
    [[[1150,2050],[4500,1950],[4700,2950],[1350,3200]],[780,800,430,400]]])slab(outline,-1400,tops,PALETTE.chute,VERY_SLIPPERY,{lip:40});

  // ---- 3. Pinewood Drifts ----------------------------------------------------
  // The west shore: packed snow. Then terraces of deep snow step north.
  slab([[-6700,5900],[-4700,3900],[-5200,3350],[-7200,3150],[-9800,3200],[-10500,4300],[-10400,5200],[-9600,6100],[-8800,6600],[-7700,6700]],
    -1400,100,PALETTE.cliff,0,{lip:60});
  slab([[-10300,2000],[-8000,1950],[-5200,2000],[-4900,3000],[-5400,3350],[-7500,3380],[-9900,3350],[-10450,2700]],
    -1400,450,PALETTE.powder,DEEP_SNOW,{lip:80});
  slab([[-10400,700],[-7600,650],[-5300,700],[-5100,2100],[-7700,2150],[-10200,2100],[-10600,1400]],-1400,850,PALETTE.powder,DEEP_SNOW,{lip:80});
  coins([[-7000,180,3800],[-7600,530,2700],[-8200,530,2500],[-9500,530,2600],[-5700,530,3000],[-6800,930,1700],[-7400,930,1100]],'West Shore');
  for(const [x,z,g,s] of [[-6100,2500,450,1],[-8900,2700,450,1.1],[-6000,1300,850,1],[-9800,1100,850,.9]])pine(x,z,g,s);
  // The Great Pine: walkable boughs, each a single jump and grab above the last.
  // A Frost Shard waits at the crown.
  {
    const x=-8600,z=1300,ground=850;
    column(x,z,150,ground,2300,PALETTE.bark,6);
    [[900,1180],[640,1520],[400,1860],[190,2200]].forEach(([r,rim],i)=>tier(x,z,r,rim,80,160,8,i*22.5));
    pickup('shard','shard-pine',x,2370,z,{hint:'Pinewood Drifts: the crown of the Great Pine.'});
    coins([[x+770,1300,z],[x,1640,z+520],[x-300,1980,z]],'West Shore');
  }
  // The ravine: a gorge into the clouds, spanned by a fallen, iced-over pine
  // that snapped in two. Its collision is a slick beam; the scene draws a log.
  slab([[-10300,-1900],[-5200,-1900],[-5000,-500],[-7400,-450],[-10100,-500],[-10500,-1200]],-1400,1000,PALETTE.powder,DEEP_SNOW,{lip:80});
  const logs=[[[-7400,850,780],[-7250,930,120]],[[-7200,960,-280],[-7400,1000,-620]]];
  for(const [a,c] of logs)beam(a,c,130,120,PALETTE.hidden,ICE);
  coins(line([-7400,930,700],[-7260,1010,140],3),'Pinewood Ravine');
  coins([[-7280,1080,-420]],'Pinewood Ravine');
  // The last terrace, and a slippery snow ramp up to the glacier margin.
  slab([[-9600,-3200],[-7000,-3350],[-5000,-3200],[-4900,-1800],[-7200,-1750],[-9400,-1800],[-9900,-2500]],-1400,1400,PALETTE.cliff,0,{lip:80});
  pine(-8800,-2600,1400,1.2);pine(-6400,-2300,1400);
  slab([[-5100,-3100],[-3900,-3100],[-3900,-1900],[-5100,-1900]],-1400,[1400,1800,1800,1400],PALETTE.drift,SLIPPERY);
  coins(line([-4900,1550,-2500],[-4100,1880,-2500],3),'Pinewood Ravine');

  // ---- 4. The Glacier --------------------------------------------------------
  // Plates of snow-covered ice cut by crevasses. The margin plate, then a jump
  // over the first crevasse (a Frost Shard hides on a ledge inside it).
  slab([[-3900,-3650],[-3300,-3800],[-2600,-3700],[-2600,-1500],[-3400,-1350],[-3900,-1700]],-1400,1800,PALETTE.plate,0,{lip:60});
  box(-2600,-2300,-2950,-2450,-1400,1150,PALETTE.serac,0,{lip:40});
  pickup('shard','shard-crevasse',-2450,1240,-2700,{hint:'The Glacier: a ledge inside the first crevasse. Hang from the edge, drop in, then wall-kick out.'});
  // The second plate climbs east to a snow bridge over the next crevasse.
  {
    const rise=([x])=>1800+(x+2150)/1750*350,outline=[[-2150,-3800],[-1300,-3950],[-400,-3800],[-400,-1400],[-1200,-1250],[-2150,-1400]];
    slab(outline,-1400,outline.map(rise),PALETTE.plate,0,{lip:60});
  }
  box(-400,250,-2900,-2650,1900,2150,PALETTE.drift,SLIPPERY,{bottom:true});
  coins(line([-1900,1960,-2600],[-700,2240,-2600],3),'Glacier Margin');
  // The chute: ice falling east to a lip over the Great Crevasse. The far side
  // stands higher than the lip, so sliding off it hits the far wall; jump from
  // the slide (you will be going very fast) and you sail over.
  slab([[250,-3200],[2250,-3200],[2250,-2300],[250,-2300]],-1400,[2150,1750,1750,2150],PALETTE.chute,ICE);
  coins([[700,2140,-2775],[1250,2030,-2775],[1800,1920,-2775]],'Glacier Margin');
  // Two coins trace a good jump over the Great Crevasse (arc coins float over the void).
  coins([[2720,2330,-2775],[3150,2410,-2775]],'Glacier Margin',{arc:true});
  // The far side: a broad snowfield rising north to the icefall, dotted with seracs.
  {
    const rise=([,z])=>1730+(-1800-z)/3300*570,outline=[[3450,-5100],[5900,-5100],[6150,-3500],[5900,-1800],[4700,-1650],[3450,-1800]];
    slab(outline,-1400,outline.map(rise),PALETTE.plate,0,{lip:60});
  }
  column(5100,-3600,260,1400,2400,PALETTE.serac,6,15);column(3900,-4300,200,1400,2500,PALETTE.serac,6,40);
  coins(line([4100,2000,-2900],[4600,2200,-4300],3),'Glacier Margin');
  coins([[5100,2470,-3600]],'Glacier Margin');

  // ---- 5. The Icefall ----------------------------------------------------------
  // A flat foot, a ledge-grab serac, a wall-kick chimney, then the rock rib
  // beside an ice chute: the rock holds you, the ice does not.
  box(3450,5900,-5600,-5100,-1400,2300,PALETTE.plate,0,{lip:40});
  slab([[3600,-6800],[5700,-6800],[5800,-6200],[5700,-5600],[4600,-5520],[3600,-5600],[3520,-6200]],-1400,2700,PALETTE.serac,0,{lip:50});
  box(3600,4280,-6800,-6300,-1400,3650,PALETTE.serac,0,{lip:50});
  box(4700,5700,-6800,-6300,-1400,3650,PALETTE.serac,0,{lip:50});
  slab([[3600,-7500],[5700,-7500],[5800,-7150],[5700,-6800],[3600,-6800],[3500,-7150]],-1400,3650,PALETTE.serac,0,{lip:50});
  coins(line([4490,2950,-6550],[4490,3450,-6550],3),'Icefall Foot');
  coins([[3900,2780,-5900],[5400,2780,-5900],[4400,4430,-8500]],'Icefall Foot');
  // The rock rib (grippy, 45 degrees) and its twin ice chute (unclimbable).
  slab(rect(4000,-7850,700,260,90),-1400,[3650,4350,4350,3650],PALETTE.rock,NOT_SLIPPERY);
  slab(rect(4400,-7850,700,260,90),-1400,[3650,4350,4350,3650],PALETTE.chute,VERY_SLIPPERY);
  slab([[3600,-8700],[4800,-8700],[4900,-8450],[4800,-8200],[3600,-8200],[3500,-8450]],-1400,4350,PALETTE.crag,0,{lip:60});
  coins(line([4000,3800,-7550],[4000,4250,-8050],3),'Icefall Foot');
  // The Serac Needle: a double jump and grab from the chimney top.
  column(5300,-7760,120,-1400,4230,PALETTE.serac,6,0,0,{lip:40});
  pickup('shard','shard-needle',5300,4320,-7760,{hint:'The Icefall: the top of the serac needle. A double jump reaches it.'});

  // ---- 6. The Shoulder ---------------------------------------------------------
  // A snowy saddle on the Horn's flank, beyond one last gap (the bergschrund).
  slab([[3400,-10200],[5000,-10350],[6400,-10000],[6600,-9550],[6300,-9150],[4800,-9100],[3400,-9200]],-1400,4300,PALETTE.cliff,0,{lip:70});
  box(5500,6100,-9500,-9200,4300,4650,PALETTE.wood);
  tent(5800,-9350,680,420,220,0,4650);
  column(4200,-9700,180,4300,4560,PALETTE.dark,6,10);
  pickup('star','icefall-star',4200,4700,-9700);
  coins(arc(4900,4380,-9550,280,4,45),'The Shoulder');
  // PART 2 HOOK: the trail west is "snowed in" by this bank. Part 2 removes
  // it and continues the route west along the Shoulder (docs/HOARFROST.md).
  slab([[2900,-10200],[3500,-10200],[3500,-9100],[2900,-9100]],-1400,[5200,4300,4300,5200],PALETTE.drift,VERY_SLIPPERY);

  // ---- The Horn (placeholder massing) -------------------------------------------
  // PART 2 HOOK: the upper mountain. Its flanks are steep, very slippery
  // floors; its south face is a near-vertical cliff right behind the Shoulder,
  // so part 1 is sealed and every gap below the route stays open to the void.
  // Part 2 sculpts the route up the Horn to the summit (docs/HOARFROST.md).
  const horn=[
    [[11200,-13500],[10600,-11400],[8800,-10300],[6200,-10000],[3000,-10050],[-800,-10150],[-4600,-10400],
      [-8600,-11000],[-11200,-12400],[-11800,-15600],[-10000,-19200],[-5600,-21400],[1200,-21800],[7600,-19800]].map(([x,z])=>[x,-1400,z]),
    [[8200,-13600],[7800,-11700],[7000,-10900],[5000,-10420],[2600,-10470],[-800,-10700],[-4000,-11200],
      [-6800,-12000],[-8300,-13600],[-8600,-15900],[-7200,-18400],[-3800,-19700],[1400,-19800],[6000,-18100]].map(([x,z])=>[x,5200,z]),
    [[3900,-14000],[3700,-12900],[3100,-12200],[1900,-11900],[500,-12000],[-1200,-12300],[-2800,-12800],
      [-3900,-13500],[-4400,-14400],[-4200,-15600],[-3300,-16700],[-1500,-17300],[900,-17200],[2900,-16200]].map(([x,z])=>[x,7800,z]),
  ];
  // Flute the upper rings into ridges and gullies, pulled toward the summit.
  const summit=[-300,10600,-14600],flute=(ring,y,k,twist)=>ring.map(([x,,z],i)=>{
    const f=k*(i%2?.9:1.04)+(i+twist)%3*.01;return [summit[0]+(x-summit[0])*f,y,summit[2]+(z-summit[2])*f];});
  horn.push(flute(horn[2],9000,.55,1));horn[2]=flute(horn[2],7800,1,0);
  mountain(horn,summit,PALETTE.horn,VERY_SLIPPERY);
  // Two lesser peaks on the Horn's shoulders.
  mountain([ring(5600,-13400,2600,8,10).map(([x,z])=>[x,4600,z])],[5900,8200,-13300],PALETTE.horn,VERY_SLIPPERY);
  mountain([ring(-6200,-14600,2400,7,30).map(([x,z])=>[x,4400,z])],[-6600,7600,-14900],PALETTE.horn,VERY_SLIPPERY);

  for(const c of checkpoints)pickup('checkpoint',`checkpoint-${c.id}`,...c.position);
  const {triangles,shapes}=b.finish();
  return {kind:'hoarfrost',name:'Hoarfrost Heights',triangles,shapes,pickups,checkpoints,sections,zones:checkpoints,logs,spills,route,
    // The clock stops at this star. PART 2: change it to 'aurora-star' (the summit).
    goal:'icefall-star',
    // PART 2 areas, drawn dashed by tools/level_map.mjs. Keep new geometry inside them.
    reserved:[
      {name:'Part 2: upper Horn',outline:[[7800,-11700],[5000,-10420],[-800,-10700],[-6800,-12000],[-8600,-15900],[-3800,-19700],[6000,-18100]]},
      {name:'Part 2: west trail',outline:[[-2000,-10200],[2900,-10200],[2900,-8200],[-2000,-8200]]},
    ],
    intro:{from:[3600,5200,15600],look:[-800,3800,-4000]},
    text,
    theme:{background:'#1a2244',fog:['#9fb0cf',8000,38000],far:44000,exposure:1.08,
      hemisphere:['#e6eeff','#6f81a8',2.05],sun:['#ffdcc0',2.3],sunOffset:[-5200,4200,3000],
      edges:['#ffffff',.2],dust:'#f3f7ff',shadow:'#27324f',
      // Frostbite water splashes and steams instead of burning.
      hazard:{burst:['#f4fcff','#62b9e6'],cloud:['#e8f4ff','#a8c6dc'],fire:['#e6f8ff','#79c7ef'],smoke:['#eef6ff','#b8cfe0']},
      shard:['#8fe3ff','#1f86c9','#c4f2ff'],stars:{star:['#ffe07a','#ffb300'],bonus:['#b9a8ff','#6a4ddf']}}};
}

// Player-facing copy, read by main.js. PART 2 extends the objectives (the
// Aurora Star at the summit and the Polar Star) and the victory lines.
const text={
  start:'Climb to the Shoulder, halfway up the Horn. Cross Mirror Lake first.',
  shard:'Frost Shard',shards:'Frost Shards',
  objectives:[
    {icon:'★',title:'Icefall Star',note:'Cross the lake, the forest and the glacier, then scale the Icefall.',star:'icefall-star'},
    {icon:'♦',title:'Frost Shards',note:'Five hide behind optional challenges.',shards:true},
    {icon:'★',title:'The summit',note:'The upper Horn is snowed in for now.',locked:true},
  ],
  victory(kind,{shards,best}) {
    const left=shards.total-shards.found;
    return {title:'Icefall Star claimed.',
      copy:left?`The Shoulder is yours${best?` · best ${best}`:''}. ${left} Frost Shard${left===1?'':'s'} still hide${left===1?'s':''} in the valley.`
        :'The Shoulder is yours, and every Frost Shard with it. The upper Horn is snowed in for now.'};
  },
};
