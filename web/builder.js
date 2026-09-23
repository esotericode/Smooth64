// Geometry kit for authored levels. Rendering and collision consume the SAME
// integer triangles, as in world.js and caldera.js. Coordinates are SM64 units,
// Y up; angles in degrees run counter-clockwise seen from above (0 = +X/east,
// 90 = -Z/north). Hoarfrost Heights is built with it; Cinder Caldera keeps its
// own copy of the older helpers so its collision stays byte-for-byte unchanged.
//
// Every face goes into a style bucket (the renderer picks a material per
// style: 'snow', 'ice', 'rock', 'wood', 'frost' water, 'hidden', ...). finish()
// concatenates the buckets in first-use order, so each style is one render
// group and the shapes always cover the triangle list exactly.

// A palette entry: walkable top and side colors, and the style of each.
export const paint=(top,side,topStyle='snow',sideStyle=topStyle)=>({top,side,topStyle,sideStyle});

export function createBuilder({seed=11}={}) {
  const buckets=new Map(),R=Math.round;
  // Tiny deterministic brightness variation per face: a hand-cut look.
  function shade(hex,amount) {
    seed=(Math.imul(seed,1103515245)+12345)>>>0;
    const k=1-amount/2+(seed>>>16)%1000/1000*amount,n=parseInt(hex.slice(1),16);
    return '#'+[n>>16,n>>8&255,n&255].map(v=>Math.min(255,R(v*k)).toString(16).padStart(2,'0')).join('');
  }
  const VARIATION={snow:.05,ice:.1,rock:.14,wood:.12};
  // A convex polygon; winding is fixed so the collidable side faces `normal`.
  function face(points,color,type,normal,style='snow') {
    // Drop repeated corners (a wall whose top meets its bottom at one end).
    points=points.map(p=>p.map(R)).filter((p,i,all)=>p.some((v,k)=>v!==all[(i+all.length-1)%all.length][k]));
    if(points.length<3)return;
    const [a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(cross.reduce((s,n,i)=>s+n*normal[i],0)<0)points=points.toReversed();
    color=shade(color,VARIATION[style]??.08);
    if(!buckets.has(style))buckets.set(style,[]);
    const bucket=buckets.get(style);
    for(let i=1;i<points.length-1;i++)bucket.push({vertices:[points[0],points[i],points[i+1]],type,color});
  }
  // A vertical prism over a convex outline [[x,z],...]. `bottoms` and `tops`
  // are one height or one per corner (a ramp when they differ; walls stay
  // vertical either way). Faces point away from the outline's centre.
  // `lip` paints the top of each wall in the top colour: snow over rock.
  function slab(outline,bottoms,tops,colors,type=0,{bottom=false,sideType=0,skip=[],walls=true,roof=true,bottomType=type,lip=0}={}) {
    const pts=outline.map(p=>[R(p[0]),R(p[1])]),n=pts.length;
    // Tops are fanned from the first corner, so the outline must be convex.
    const turns=pts.map((p,i)=>{const q=pts[(i+1)%n],r=pts[(i+2)%n];return Math.sign((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]));});
    if(turns.some(t=>t>0)&&turns.some(t=>t<0))throw new Error(`Slab outline is not convex: ${JSON.stringify(pts)}`);
    const per=h=>Array.isArray(h)?h.map(R):pts.map(()=>R(h));
    const low=per(bottoms),high=per(tops);
    const cx=pts.reduce((s,p)=>s+p[0],0)/n,cz=pts.reduce((s,p)=>s+p[1],0)/n;
    const normalOf=h=>{ // true upward normal of a (possibly sloped) polygon
      const [a,b,c]=[0,1,2].map(i=>[pts[i][0],h[i],pts[i][1]]);
      const u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
      const cr=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];return cr[1]<0?cr.map(q=>-q):cr;
    };
    if(roof)face(pts.map((p,i)=>[p[0],high[i],p[1]]),colors.top,type,normalOf(high),colors.topStyle);
    if(bottom)face(pts.map((p,i)=>[p[0],low[i],p[1]]),colors.side,bottomType,normalOf(low).map(q=>-q),colors.sideStyle);
    for(let i=0;walls&&i<n;i++) {
      if(skip.includes(i))continue;
      const j=(i+1)%n,p=pts[i],q=pts[j],out=[(p[0]+q[0])/2-cx,0,(p[1]+q[1])/2-cz];
      if(high[i]<=low[i]&&high[j]<=low[j])continue;
      const band=lip&&high[i]-lip>low[i]&&high[j]-lip>low[j];
      const mid=[high[i]-(band?lip:0),high[j]-(band?lip:0)];
      face([[p[0],low[i],p[1]],[q[0],low[j],q[1]],[q[0],mid[1],q[1]],[p[0],mid[0],p[1]]],colors.side,sideType,out,colors.sideStyle);
      if(band)face([[p[0],mid[0],p[1]],[q[0],mid[1],q[1]],[q[0],high[j],q[1]],[p[0],high[i],p[1]]],colors.top,sideType,out,colors.topStyle);
    }
  }
  // A faceted mountain: convex rings [[x,y,z],...] of equal length, bottom to
  // top, closed by an apex. Its flanks are steep floors: the surface type
  // decides whether they can be climbed (VERY_SLIPPERY: never).
  function mountain(rings,apex,colors,type=0) {
    const n=rings[0].length,c=rings[0].reduce((s,p)=>[s[0]+p[0]/n,s[1]+p[2]/n],[0,0]);
    const out=(...ps)=>{const m=ps.reduce((s,p)=>[s[0]+p[0]/ps.length,s[1]+p[2]/ps.length],[0,0]);return [m[0]-c[0],Math.hypot(m[0]-c[0],m[1]-c[1])*.5,m[1]-c[1]];};
    for(let k=0;k<rings.length;k++)for(let i=0;i<n;i++) {
      const p=rings[k][i],q=rings[k][(i+1)%n];
      if(k===rings.length-1){face([p,q,apex],colors.top,type,out(p,q),colors.topStyle);continue;}
      const u=rings[k+1][i],v=rings[k+1][(i+1)%n];
      face([p,q,v],k?colors.top:colors.side,type,out(p,q,v),k?colors.topStyle:colors.sideStyle);
      face([p,v,u],k?colors.top:colors.side,type,out(p,v,u),k?colors.topStyle:colors.sideStyle);
    }
  }
  const polar=(cx,cz,r,deg)=>[cx+r*Math.cos(deg*Math.PI/180),cz-r*Math.sin(deg*Math.PI/180)];
  const ring=(cx,cz,r,n,rot=0)=>Array.from({length:n},(_,i)=>polar(cx,cz,r,rot+i*360/n));
  const box=(x0,x1,z0,z1,y0,y1,colors,type=0,options)=>slab([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],y0,y1,colors,type,options);
  const column=(x,z,r,y0,y1,colors,n=6,rot=0,type=0,options)=>slab(ring(x,z,r,n,rot),y0,y1,colors,type,options);
  // Rotated rectangle: centre, length along `deg`, width across it.
  function rect(x,z,length,width,deg) {
    const c=Math.cos(deg*Math.PI/180),s=-Math.sin(deg*Math.PI/180),hl=length/2,hw=width/2;
    return [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]].map(([a,b])=>[x+c*a-s*b,z+s*a+c*b]);
  }
  // A plank or log from `a` to `b` ([x,y,z] top centres), `thick` deep.
  function beam(a,b,width,thick,colors,type=0,options) {
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),deg=Math.atan2(-dz,dx)*180/Math.PI;
    const outline=rect((a[0]+b[0])/2,(a[2]+b[2])/2,length,width,deg);
    const tops=[a[1],b[1],b[1],a[1]];
    slab(outline,tops.map(t=>t-thick),tops,colors,type,{bottom:true,...options});
  }
  // A convex plate whose top follows the plane y = y0 + gx*x + gz*z.
  const plane=(y0,gx,gz)=>([x,z])=>y0+gx*x+gz*z;
  const plate=(outline,height,base,colors,type=0,options)=>slab(outline,base,outline.map(height),colors,type,options);
  // A faceted peak: a convex base ring [[x,y,z],...] rising to one apex [x,y,z].
  // The flanks are steep floors, so their surface type decides whether the
  // explorer can stand on them. `skirt` drops vertical walls to that height.
  function peak(base,apex,colors,type=0,{skirt=null}={}) {
    const n=base.length,cx=base.reduce((s,p)=>s+p[0],0)/n,cz=base.reduce((s,p)=>s+p[2],0)/n;
    for(let i=0;i<n;i++) {
      const p=base[i],q=base[(i+1)%n],m=[(p[0]+q[0])/2-cx,0,(p[2]+q[2])/2-cz];
      const out=Math.hypot(m[0],m[2])||1;
      face([p,q,apex],colors.top,type,[m[0]/out,.6,m[2]/out],colors.topStyle);
      if(skirt!==null)face([[p[0],skirt,p[2]],[q[0],skirt,q[2]],q,p],colors.side,0,m,colors.sideStyle);
    }
  }
  // Close the level: one shape per style, in first-use order.
  function finish() {
    const triangles=[],shapes=[];
    for(const [style,list] of buckets) {
      shapes.push({start:triangles.length,end:triangles.length+list.length,style});
      triangles.push(...list);
    }
    return {triangles,shapes};
  }
  return {face,slab,box,column,rect,beam,plane,plate,peak,mountain,polar,ring,finish,
    get count() {let n=0;for(const list of buckets.values())n+=list.length;return n;}};
}
