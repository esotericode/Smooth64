// Original Smooth64 geometry. Rendering and collision consume these SAME triangles.
// All coordinates use SM64 units; Y is up. No imported level assets.
// The courtyard is the original playground; four gates lead out into the expanse.
export const zones = [
  { section: 'THE COURTYARD', name: 'The runway', note: 'Build speed. Chain three jumps.', position: [0, 0, 2350], yaw: 32768, camera: 0 },
  { name: 'Slope studies', note: 'Feel acceleration change with the slope.', position: [-2200, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Wall workshop', note: 'Jump into a wall. Tap jump again on contact.', position: [2150, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Step by step', note: 'Try ledge grabs, backflips and short hops.', position: [-2850, 0, 2500], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Island hopping', note: 'Crouch while running, then jump across.', position: [100, 440, -2300], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Slippery business', note: 'A steep, very slippery surface.', position: [-3000, 800, -2450], yaw: 0, camera: Math.PI },
  { name: 'The chimney', note: 'Kick off one wall, then the other. Keep going up.', position: [2450, 0, 3200], yaw: 32768, camera: 0 },
  { name: 'Ledge gallery', note: 'Jump at each lip and grab it. Jump again to climb.', position: [-1100, 0, -2350], yaw: 0, camera: Math.PI },
  { name: 'Stepping stones', note: 'Small tops, growing gaps. Long jumps help.', position: [800, 0, 1050], yaw: 32768, camera: 0 },
  { name: 'The rafters', note: 'Jump into the ceiling to hang, then shuffle along.', position: [-2100, 260, 3250], yaw: 0, camera: Math.PI },
  { name: 'The spire', note: 'Circle the tower to the top. Diving is quicker down.', position: [-3200, 0, -3100], yaw: 40960, camera: Math.PI / 4 },
  { section: 'THE EXPANSE', name: 'The east gate', note: 'Out through the arch. It is a long way to the far wall.', position: [4200, 0, 0], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Block city', note: 'Twenty-five tops and the gaps between them.', position: [7000, 0, -3300], yaw: 0, camera: Math.PI },
  { name: 'Wall gauntlet', note: 'Five shafts, each one wider than the last.', position: [0, 0, 6000], yaw: 0, camera: Math.PI },
  { name: 'The ziggurat', note: 'Seven tiers. Every one is a jump.', position: [-6000, 0, 0], yaw: 49152, camera: Math.PI / 2 },
  { name: 'The mesa', note: 'Run up the ramp. The east face is a slide.', position: [0, 0, -4600], yaw: 32768, camera: 0 },
];

export function createWorld() {
  const triangles = [];
  const shapes = [];
  const footprints = [];
  let groupStart = 0;
  function face(points, color, type, normal) {
    const a = points[0], b = points[1], c = points[2];
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const cross = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if (cross.reduce((s, n, i) => s + n*normal[i], 0) < 0) points = points.toReversed();
    for (let i = 1; i < points.length-1; i++) {
      triangles.push({ vertices: [points[0],points[i],points[i+1]], type, color });
    }
  }
  // One mesh per group keeps the draw call count flat as the level grows.
  function group() {
    if (triangles.length > groupStart) shapes.push({start: groupStart, end: triangles.length});
    groupStart = triangles.length;
  }
  // Ground plan of everything but the ground itself, so scatter can avoid it.
  function mark(x, z, width, depth) {
    if (width < 15000) footprints.push([x-width/2, z-depth/2, x+width/2, z+depth/2]);
  }
  function clear(x, z, width, depth, margin = 400) {
    return footprints.every(([l,k,r,f]) =>
      x+width/2+margin <= l || x-width/2-margin >= r || z+depth/2+margin <= k || z-depth/2-margin >= f);
  }
  function box(x, y, z, width, height, depth, color, type = 0) {
    const l=x-width/2,r=x+width/2,b=y,t=y+height,f=z+depth/2,k=z-depth/2;
    face([[l,t,k],[r,t,k],[r,t,f],[l,t,f]],color,type,[0,1,0]);
    face([[l,b,k],[r,b,k],[r,b,f],[l,b,f]],color,type,[0,-1,0]);
    face([[l,b,f],[r,b,f],[r,t,f],[l,t,f]],color,type,[0,0,1]);
    face([[l,b,k],[r,b,k],[r,t,k],[l,t,k]],color,type,[0,0,-1]);
    face([[l,b,k],[l,b,f],[l,t,f],[l,t,k]],color,type,[-1,0,0]);
    face([[r,b,k],[r,b,f],[r,t,f],[r,t,k]],color,type,[1,0,0]);
    mark(x,z,width,depth);
  }
  // A slope rising toward -Z, turned in 90-degree steps so hills face any way.
  function ramp(x, z, width, length, height, color, type=0, turn=0) {
    const spin=(dx,dz)=>{ for(let i=0;i<turn;i++) [dx,dz]=[dz,-dx]; return [x+dx,z+dz]; };
    const at=(dx,y,dz)=>{ const [px,pz]=spin(dx,dz); return [px,y,pz]; };
    const normal=(nx,ny,nz)=>{ for(let i=0;i<turn;i++) [nx,nz]=[nz,-nx]; return [nx,ny,nz]; };
    const w=width/2,l=length/2;
    face([at(-w,0,l),at(w,0,l),at(w,height,-l),at(-w,height,-l)],color,type,normal(0,1,1));
    face([at(-w,0,-l),at(w,0,-l),at(w,height,-l),at(-w,height,-l)],color,type,normal(0,0,-1));
    face([at(-w,0,l),at(-w,0,-l),at(-w,height,-l)],color,type,normal(-1,0,0));
    face([at(w,0,l),at(w,0,-l),at(w,height,-l)],color,type,normal(1,0,0));
    mark(x,z,turn%2?length:width,turn%2?width:length);
  }

  // ------------------------------------------------------------ the courtyard
  box(0,-240,0,24000,240,24000,'#d3d8cc');
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
  box(3300,300,1600,720,100,800,'#c2ab7a',5);
  box(900,125,1550,600,100,700,'#c4d2b7');
  group();

  // 07 — a 400-unit shaft to climb by alternating wall kicks, a balcony at the
  // top of it, and a very slippery ramp as the quick way back down.
  box(2100,0,2900,300,1200,900,'#bfc5b6');
  box(2800,0,2900,300,1200,900,'#bfc5b6');
  box(3300,1140,2900,700,60,900,'#b2c7ba');
  ramp(3300,3850,700,1000,1200,'#8aada8',0x13);
  // A step at the south entrance, so the climb can start with some height.
  box(2450,0,2150,400,160,500,'#c4d2b7');
  group();

  // 08 — five lips, each 130 above the last: jump at one, grab, climb, repeat.
  for(let i=0;i<5;i++) box(-1100,0,-1700+i*720,700,130+i*130,560,'#dfcdb1');
  // A landing shelf so the top of the gallery leads somewhere.
  box(-1100,0,1900,700,650,400,'#dfcdb1');
  group();

  // 09 — small tops, a 100 rise each time and gaps that keep growing.
  box(800,0,600,300,260,300,'#b2c7ba');
  box(1000,0,100,300,360,300,'#b2c7ba');
  box(800,0,-460,280,460,280,'#b2c7ba');
  box(1000,0,-1060,260,560,260,'#b2c7ba');
  box(820,0,-1700,400,700,400,'#b2c7ba');
  group();

  // 10 — jump into the hangable ceiling, then shuffle across to the far shelf.
  box(-2100,0,3250,700,260,400,'#c4d2b7');
  box(-2100,560,3900,700,80,1000,'#c2ab7a',5);
  box(-2450,0,3900,120,640,1000,'#adbba9');
  box(-1750,0,3900,120,640,1000,'#adbba9');
  box(-2100,0,4480,900,380,500,'#b2c7ba');
  group();

  // 11 — a tower to circle: five platforms 200 apart, then the summit cap.
  box(-3900,0,-3900,400,960,400,'#cdd3c3');
  const around=[[600,0],[0,600],[-600,0],[0,-600],[600,0]];
  around.forEach(([dx,dz],i)=>box(-3900+dx,100+i*200,-3900+dz,500,60,500,'#d6c9ae'));
  box(-3900,960,-3900,620,60,620,'#e0d0b0');
  group();

  // ------------------------------------------------------------- the expanse
  // The courtyard wall, broken by a 1400-unit gate on each side.
  const stone='#c6cbbc',arch='#b4bcaa';
  for(const z of [4900,-4900]) {
    box(-2860,0,z,4320,400,240,stone);box(2860,0,z,4320,400,240,stone);
  }
  for(const x of [4900,-4900]) {
    box(x,0,-2800,240,400,4200,stone);box(x,0,2800,240,400,4200,stone);
  }
  group();
  for(const z of [4900,-4900]) {
    box(-830,0,z,260,1000,400,arch);box(830,0,z,260,1000,400,arch);
    box(0,1000,z,1920,200,400,arch);
  }
  for(const x of [4900,-4900]) {
    box(x,0,-830,400,1000,260,arch);box(x,0,830,400,1000,260,arch);
    box(x,1000,0,400,200,1920,arch);
  }
  group();

  // 13 — block city: a grid of tops with 500-unit streets between them.
  // Heights climb 170 a block, so the whole skyline can be crossed by roof.
  for(let i=0;i<5;i++) for(let j=0;j<5;j++)
    box(6400+i*1200,0,-2400+j*1200,700,200+170*(i+j)+50*((i*3+j*7)%2),700,'#b7c4b4');
  // Two shafts on its north edge, one comfortable and one tight.
  box(6400,0,3400,300,2000,1200,'#bfc5b6');
  box(7100,0,3400,300,2000,1200,'#bfc5b6');
  box(8450,0,3400,300,1600,1200,'#bfc5b6');
  box(9350,0,3400,300,1600,1200,'#bfc5b6');
  box(7850,1940,3400,900,60,1200,'#b2c7ba');
  box(10100,1540,3400,900,60,1200,'#b2c7ba');
  group();

  // 14 — the gauntlet: five shafts, each wider and taller than the last.
  for(let k=0;k<5;k++) {
    const gap=400+k*40,height=1400+k*200,z=6800+k*1000,offset=gap/2+150;
    box(-offset,0,z,300,height,800,'#bfc5b6');
    box(offset,0,z,300,height,800,'#bfc5b6');
  }
  box(1500,2140,10800,1600,60,900,'#b2c7ba');
  box(0,0,11400,6000,1600,300,'#c6cbbc');
  group();

  // 15 — the ziggurat: seven tiers, a 200 rise and a 300 step each time.
  for(let i=0;i<7;i++) box(-9000,i*190,0,5000-660*i,190,5000-660*i,'#d6c9ae');
  box(-9000,1330,0,320,760,320,'#e0d0b0');
  for(const [dx,dz] of [[-2100,-2100],[2100,-2100],[-2100,2100],[2100,2100]])
    box(-9000+dx,190,dz,260,700,260,'#e0d0b0');
  group();

  // 16 — the mesa: a walkable ramp up the north face, a slide down the east.
  box(0,0,-9000,5200,1000,4000,'#c4d2b7');
  ramp(0,-6000,1600,2000,1000,'#c4d2b7');
  ramp(3400,-9000,1400,1600,1000,'#8aada8',0x13,1);
  box(3900,0,-6400,700,300,700,'#b2c7ba');
  box(-3600,0,-8200,800,500,800,'#b2c7ba');
  group();

  // Four chains of blocks out into the corners, rising as they go.
  for(const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]])
    for(let i=0;i<4;i++) box(dx*(5400+i*1200),0,dz*(5400+i*1200),800,240+i*200,800,'#b2c7ba');
  group();

  // Loose blocks everywhere else, so open ground still has something to hit.
  for(let i=-7;i<=7;i++) for(let j=-7;j<=7;j++) {
    if((i*7+j*11+98)%5) continue;
    const x=i*1600,z=j*1600,width=400+((i+j+14)%3)*240;
    if(!clear(x,z,width,width)) continue;
    box(x,0,z,width,160+((i*5+j*3+56)%6)*160,width,'#c9d0c2');
  }
  group();

  // The far wall, all the way around.
  for(const z of [11900,-11900]) box(0,0,z,24000,300,200,'#c6cbbc');
  for(const x of [11900,-11900]) box(x,0,0,200,300,23600,'#c6cbbc');
  group();
  return {triangles,shapes,zones};
}
