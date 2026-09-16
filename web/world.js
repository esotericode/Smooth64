// Original Smooth64 geometry. Rendering and collision consume these SAME triangles.
// All coordinates use SM64 units; Y is up. No imported level assets.
export const zones = [
  { name: 'The runway', note: 'Build speed. Chain three jumps.', position: [0, 0, 2350], yaw: 32768, camera: 0 },
  { name: 'Slope studies', note: 'Feel acceleration change with the slope.', position: [-2200, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Wall workshop', note: 'Jump into a wall. Tap jump again on contact.', position: [2150, 0, 900], yaw: 32768, camera: 0 },
  { name: 'Step by step', note: 'Try ledge grabs, backflips and short hops.', position: [-2850, 0, 2500], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Island hopping', note: 'Crouch while running, then jump across.', position: [100, 440, -2300], yaw: 16384, camera: -Math.PI / 2 },
  { name: 'Slippery business', note: 'A steep, very slippery surface.', position: [-3000, 800, -2450], yaw: 0, camera: Math.PI },
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
  box(0,-240,0,7600,240,7600,'#d3d8cc');
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
  box(3300,300,1600,720,100,800,'#adbba9',5);
  box(900,125,1550,600,100,700,'#c4d2b7');
  return {triangles,shapes,zones};
}
