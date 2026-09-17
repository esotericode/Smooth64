// Original Smooth64 geometry. Rendering and collision consume these SAME triangles.
// All coordinates use SM64 units; Y is up. No imported level assets.
export const zones = [
  { name: 'The runway', note: 'Build speed. Chain three jumps.', position: [0, 0, 2350], yaw: 32768, camera: 0 },
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
];

export function createWorld() {
  const triangles = [];
  const shapes = [];
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
    const start=triangles.length;
    face([[l,t,k],[r,t,k],[r,t,f],[l,t,f]],color,type,[0,1,0]);
    face([[l,b,k],[r,b,k],[r,b,f],[l,b,f]],color,type,[0,-1,0]);
    face([[l,b,f],[r,b,f],[r,t,f],[l,t,f]],color,type,[0,0,1]);
    face([[l,b,k],[r,b,k],[r,t,k],[l,t,k]],color,type,[0,0,-1]);
    face([[l,b,k],[l,b,f],[l,t,f],[l,t,k]],color,type,[-1,0,0]);
    face([[r,b,k],[r,b,f],[r,t,f],[r,t,k]],color,type,[1,0,0]);
    shapes.push({start,end:triangles.length});
  }
  function ramp(x, z, width, length, height, color, type=0) {
    const l=x-width/2,r=x+width/2,f=z+length/2,k=z-length/2;
    const start=triangles.length;
    face([[l,0,f],[r,0,f],[r,height,k],[l,height,k]],color,type,[0,1,1]);
    face([[l,0,k],[r,0,k],[r,height,k],[l,height,k]],color,type,[0,0,-1]);
    face([[l,0,f],[l,0,k],[l,height,k]],color,type,[-1,0,0]);
    face([[r,0,f],[r,0,k],[r,height,k]],color,type,[1,0,0]);
    shapes.push({start,end:triangles.length});
  }
  box(0,-240,0,9600,240,9600,'#d3d8cc');
  ramp(-2200,-350,1200,2100,650,'#c4d2b7');
  box(-2200,0,-1610,1200,650,420,'#c4d2b7');
  // A steep slide, plus its upper landing.
  ramp(-3000,-1700,600,1200,800,'#8aada8',0x13);
  box(-3000,0,-2450,600,800,300,'#8aada8',0x13);
  // Two tall, solid walls with enough room to kick between them.
  box(1740,0,-200,180,1050,1900,'#bfc5b6');
  box(2560,0,-200,180,1050,1900,'#bfc5b6');
  // Stair/ledge experiment. 100-unit rises require deliberate jumps.
  for(let i=0;i<6;i++) box(-2400+i*320,0,2500,320,100+i*100,650,'#dfcdb1');
  // Deliberate separated platforms for long jumps, with floor below to recover.
  box(100,0,-2300,600,440,650,'#b2c7ba');
  box(1000,0,-2480,500,440,580,'#b2c7ba');
  box(1850,0,-2780,500,500,580,'#b2c7ba');
  box(2780,0,-2780,650,580,650,'#b2c7ba');
  // Low ceiling, with a hangable underside, and crouch tunnel.
  box(3000,0,1600,120,370,800,'#adbba9');
  box(3600,0,1600,120,370,800,'#adbba9');
  box(3300,300,1600,720,100,800,'#c2ab7a',5);
  box(900,125,1550,600,100,700,'#c4d2b7');

  // 07 — a 400-unit shaft to climb by alternating wall kicks, a balcony at the
  // top of it, and a very slippery ramp as the quick way back down.
  box(2100,0,2900,300,1200,900,'#bfc5b6');
  box(2800,0,2900,300,1200,900,'#bfc5b6');
  box(3300,1140,2900,700,60,900,'#b2c7ba');
  ramp(3300,3850,700,1000,1200,'#8aada8',0x13);
  // A step at the south entrance, so the climb can start with some height.
  box(2450,0,2150,400,160,500,'#c4d2b7');

  // 08 — five lips, each 130 above the last: jump at one, grab, climb, repeat.
  for(let i=0;i<5;i++) box(-1100,0,-1700+i*720,700,130+i*130,560,'#dfcdb1');
  // A landing shelf so the top of the gallery leads somewhere.
  box(-1100,0,1900,700,650,400,'#dfcdb1');

  // 09 — small tops, a 100 rise each time and gaps that keep growing.
  box(800,0,600,300,260,300,'#b2c7ba');
  box(1000,0,100,300,360,300,'#b2c7ba');
  box(800,0,-460,280,460,280,'#b2c7ba');
  box(1000,0,-1060,260,560,260,'#b2c7ba');
  box(820,0,-1700,400,700,400,'#b2c7ba');

  // 10 — jump into the hangable ceiling, then shuffle across to the far shelf.
  box(-2100,0,3250,700,260,400,'#c4d2b7');
  box(-2100,560,3900,700,80,1000,'#c2ab7a',5);
  box(-2450,0,3900,120,640,1000,'#adbba9');
  box(-1750,0,3900,120,640,1000,'#adbba9');
  box(-2100,0,4480,900,380,500,'#b2c7ba');

  // 11 — a tower to circle: five platforms 200 apart, then the summit cap.
  box(-3900,0,-3900,400,960,400,'#cdd3c3');
  const around=[[600,0],[0,600],[-600,0],[0,-600],[600,0]];
  around.forEach(([dx,dz],i)=>box(-3900+dx,100+i*200,-3900+dz,500,60,500,'#d6c9ae'));
  box(-3900,960,-3900,620,60,620,'#e0d0b0');
  return {triangles,shapes,zones};
}
