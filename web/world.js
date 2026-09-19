// Original Smooth64 geometry. Rendering and collision consume these SAME triangles.
// All coordinates use SM64 units; Y is up. No imported level assets.
export const zones = [
  { section: 'THE ORIGINAL PLAYGROUND', name: 'The runway', note: 'Build speed. Chain three jumps.', position: [0, 0, 2350], yaw: 32768, camera: 0 },
  { name: 'Slope studies', note: 'Feel acceleration change with the slope.', position: [-2200, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Wall workshop', note: 'Jump into a wall. Tap jump again on contact.', position: [2150, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Step by step', note: 'Try ledge grabs, backflips and short hops.', position: [-2850, 0, 2500], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Island hopping', note: 'Crouch while running, then jump across.', position: [100, 440, -2300], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Slippery business', note: 'A steep, very slippery surface.', position: [-3000, 800, -2450], yaw: 0, camera: Math.PI },
  { section: 'THE NEW TRAILS', name: 'Ledge garden', note: 'Three ledges, three sparks. Push toward the ledge to climb.', position: [-5000, 0, 1675], yaw: 32768, camera: 0 },
  { name: 'Wall-kick tower', note: 'Alternate walls with A / Space. Aim toward the high rear terrace.', position: [-2200, 0, -4980], yaw: -16384, camera: Math.PI / 2 },
  { name: 'Skyline circuit', note: 'Follow six sparks. Running long jumps will bridge the larger gaps.', position: [0, 280, -4230], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Canopy walk', note: 'Hold A / Space to catch the golden canopy. Keep holding as you cross.', position: [2200, 260, 4050], yaw: 0, camera: Math.PI },
];

export function createWorld() {
  const triangles = [];
  const shapes = [];
  let groupStart=0;
  // One mesh per course section, adapted from the parallel branch. Grouping
  // changes rendering only; collision triangles retain their original order.
  function group() {
    if(triangles.length>groupStart)shapes.push({start:groupStart,end:triangles.length});
    groupStart=triangles.length;
  }
  function face(points, color, type, normal) {
    const a = points[0], b = points[1], c = points[2];
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const cross = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if (cross.reduce((s, n, i) => s + n*normal[i], 0) < 0) points = points.toReversed();
    for (let i = 1; i < points.length-1; i++) {
      triangles.push({ vertices: [points[0],points[i],points[i+1]], type, color });
    }
  }
  function box(x, y, z, width, height, depth, color, type = 0) {
    const l=x-width/2,r=x+width/2,b=y,t=y+height,f=z+depth/2,k=z-depth/2;
    face([[l,t,k],[r,t,k],[r,t,f],[l,t,f]],color,type,[0,1,0]);
    face([[l,b,k],[r,b,k],[r,b,f],[l,b,f]],color,type,[0,-1,0]);
    face([[l,b,f],[r,b,f],[r,t,f],[l,t,f]],color,type,[0,0,1]);
    face([[l,b,k],[r,b,k],[r,t,k],[l,t,k]],color,type,[0,0,-1]);
    face([[l,b,k],[l,b,f],[l,t,f],[l,t,k]],color,type,[-1,0,0]);
    face([[r,b,k],[r,b,f],[r,t,f],[r,t,k]],color,type,[1,0,0]);
  }
  function ramp(x, z, width, length, height, color, type=0) {
    const l=x-width/2,r=x+width/2,f=z+length/2,k=z-length/2;
    face([[l,0,f],[r,0,f],[r,height,k],[l,height,k]],color,type,[0,1,1]);
    face([[l,0,k],[r,0,k],[r,height,k],[l,height,k]],color,type,[0,0,-1]);
    face([[l,0,f],[l,0,k],[l,height,k]],color,type,[-1,0,0]);
    face([[r,0,f],[r,0,k],[r,height,k]],color,type,[1,0,0]);
  }
  box(0,-240,0,7600,240,7600,'#d3d8cc');
  group();
  ramp(-2200,-350,1200,2100,650,'#c4d2b7');
  box(-2200,0,-1610,1200,650,420,'#c4d2b7');
  group();
  // A steep slide, plus its upper landing.
  ramp(-3000,-1700,600,1200,800,'#8aada8',0x13);
  box(-3000,0,-2450,600,800,300,'#8aada8',0x13);
  group();
  // Two tall, solid walls with enough room to kick between them.
  box(1740,0,-200,180,1050,1900,'#bfc5b6');
  box(2560,0,-200,180,1050,1900,'#bfc5b6');
  group();
  // Stair/ledge experiment. 100-unit rises require deliberate jumps.
  for(let i=0;i<6;i++) box(-2400+i*320,0,2500,320,100+i*100,650,'#dfcdb1');
  group();
  // Deliberate separated platforms for long jumps, with floor below to recover.
  box(100,0,-2300,600,440,650,'#b2c7ba');
  box(1000,0,-2480,500,440,580,'#b2c7ba');
  box(1850,0,-2780,500,500,580,'#b2c7ba');
  box(2780,0,-2780,650,580,650,'#b2c7ba');
  group();
  // Low ceiling, with a hangable underside, and crouch tunnel.
  box(3000,0,1600,120,370,800,'#adbba9');
  box(3600,0,1600,120,370,800,'#adbba9');
  box(3300,300,1600,720,100,800,'#adbba9',5);
  box(900,125,1550,600,100,700,'#c4d2b7');
  group();
  // New wings meet the original slab edge-to-edge. Missed jumps have a recovery
  // floor; none of the original six areas has been moved or resized.
  box(-5000,-240,300,2400,240,4000,'#d3d8cc');
  box(0,-240,-5350,7600,240,3100,'#d3d8cc');
  group();
  const sparks=[];
  function spark(route,x,y,z) {
    sparks.push({id:`${route}-${sparks.filter(s=>s.route===route).length+1}`,route,position:[x,y,z]});
  }
  // 270-unit rises: arrive below the lip, hang, then pull up.
  for(const [z,height,width,depth] of [[750,300,900,650],[-150,570,780,550],[-1050,840,650,500]]) {
    box(-5000,0,z,width,height,depth,'#dfcdb1');spark('Ledge garden',-5000,height+85,z);
  }
  // A return staircase beside the garden's final ledge.
  for(let i=0;i<4;i++)box(-5600,0,-1050+i*390,320,640-i*160,390,'#c4d2b7');
  group();

  // Narrow enough for consecutive wall kicks. The top terrace is behind the
  // shaft, so there is no invisible cap preventing the ascent.
  box(-2470,0,-5420,160,1550,1450,'#bfc5b6');
  box(-1930,0,-5420,160,1550,1450,'#bfc5b6');
  box(-2200,0,-6380,860,1300,470,'#b2c7ba');
  spark('Wall-kick tower',-2200,440,-5190);
  spark('Wall-kick tower',-2200,930,-5590);
  spark('Wall-kick tower',-2200,1385,-6380);
  group();

  const circuit=[[0,280,-4230,640,620],[1050,400,-4470,560,560],
    [2200,520,-4730,580,580],[2780,520,-5840,660,600],
    [1600,680,-6460,520,520],[400,800,-6400,720,660]];
  for(const [x,height,z,width,depth] of circuit) {
    box(x,0,z,width,height,depth,'#b2c7ba');spark('Skyline circuit',x,height+85,z);
  }
  group();
  // The parallel branch's tested rafter route, relocated outside the original
  // arena and given a clear start, overhead traverse, and landing shelf.
  box(2200,-240,4800,2000,240,2000,'#d3d8cc');
  box(2200,0,4050,700,260,400,'#c4d2b7');
  box(2200,560,4700,700,80,1000,'#c2ab7a',5);
  box(1850,0,4700,120,640,1000,'#adbba9');
  box(2550,0,4700,120,640,1000,'#adbba9');
  box(2200,0,5280,900,380,500,'#b2c7ba');
  spark('Canopy walk',2200,345,4050);
  spark('Canopy walk',2200,470,4775);
  spark('Canopy walk',2200,465,5380);
  group();
  return {triangles,shapes,zones,sparks};
}
