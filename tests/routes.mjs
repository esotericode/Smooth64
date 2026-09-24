// Route-proof kit: drive the real movement core with controller plans and
// report whether a target was reached. Adapted from tests/caldera.test.mjs
// (which keeps its own copy); Hoarfrost Heights' tests use this module. Timing
// searches stop at the first success; a `lost` test ends a failed attempt early.
import {readFileSync} from 'node:fs';
import {loadCore} from '../web/engine.js';
import {bodyCenter} from '../web/level.js';

export const names=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url)));
export const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
export const air=s=>!!(s.action&0x800);
export const range=(a,b,step=1)=>Array.from({length:Math.floor((b-a)/step)+1},(_,i)=>a+i*step);
export const polar=(r,deg,[cx,cz]=[0,0])=>[cx+r*Math.cos(deg*Math.PI/180),cz-r*Math.sin(deg*Math.PI/180)];
// World yaw in radians (0 = +Z) from one [x,z] toward another, and the core's angle for it.
export const toward=(from,to)=>Math.atan2(to[0]-from[0],to[1]-from[1]);
export const coreYaw=r=>((Math.round(r*32768/Math.PI)%65536)+65536)%65536;

export async function routeKit(world) {
  const core=await loadCore(bytes);core.loadWorld(world.triangles);
  // Push the stick toward world yaw `dir` (radians, 0 = +Z) with the camera behind.
  // A plan returns {dir, mag, buttons}; dir null means a neutral stick.
  function run(start,face,plan,done,ticks,{lava=true,lost=null}={}) {
    core.reset(start,coreYaw(face));const memory={};let s=core.state();
    for(let i=0;i<ticks;i++) {
      const {dir=face,mag=80,buttons=0}=plan(s,names[s.action],i,memory)||{};
      s=core.tick(dir===null?{x:0,y:0,buttons,yaw:0}:{x:0,y:mag,buttons,yaw:coreYaw(dir+Math.PI)});
      const name=names[s.action];
      if(lava&&name.includes('LAVA'))return false;
      if(s.position[1]<-1500)return false;
      if(done(s,name))return true;
      if(lost?.(s,name,i))return false;
    }
    return false;
  }
  const reachable=(start,face,plans,done,ticks=180,options)=>plans.some(plan=>run(start,face,plan,done,ticks,options));
  const pickup=id=>world.pickups.find(p=>p.id===id);
  return {core,run,reachable,pickup};
}

// Done conditions.
export const landedOn=(top,[x,z],radius)=>(s,n)=>!air(s)&&!n.includes('LEDGE')&&Math.abs(s.floor-top)<1&&Math.hypot(s.position[0]-x,s.position[2]-z)<radius;
export const standingAbove=(minY,[x,z],radius)=>(s,n)=>!air(s)&&!n.includes('LEDGE')&&s.floor>=minY&&Math.hypot(s.position[0]-x,s.position[2]-z)<radius;
export const touches=(pickup,reach=115)=>(s,n)=>Math.hypot(...pickup.position.map((v,i)=>v-bodyCenter(s,n)[i]))<reach;

// Plans. After a ledge grab they wait a beat and press A to climb quickly.
export const climb=(dir,n,m)=>{if(n==='ACT_LEDGE_GRAB'){m.g=(m.g||0)+1;return {dir,buttons:m.g===3?1:0};}if(n.includes('LEDGE_CLIMB'))return {dir:null};};
export const jump=(dir,t,h)=>(s,n,i,m)=>climb(dir,n,m)||{dir,buttons:i>=t&&i<t+h?1:0};
export const longJump=(dir,t,h)=>(s,n,i)=>({dir,buttons:i===t?4:i>t&&i<t+h?5:0});
// Position-triggered: jump once within `d` of `point` ([x,z]), holding A for `h`.
// Chained hops need this; a fixed tick count depends on the run-up.
export const jumpNear=(dir,point,d,h=12)=>(s,n,i,m)=>{
  const c=climb(dir,n,m);if(c)return c;
  if(m.j===undefined&&Math.hypot(s.position[0]-point[0],s.position[2]-point[1])<d)m.j=i;
  return {dir,buttons:m.j!==undefined&&i<m.j+h?1:0};
};
export const double=(dir,t,h,h2)=>(s,n,i,m)=>{
  const c=climb(dir,n,m);if(c)return c;
  if(n.includes('LAND')&&m.l===undefined&&i>t)m.l=i;
  return {dir,buttons:(i>=t&&i<t+h)||(m.l!==undefined&&i>=m.l&&i<m.l+h2)?1:0};
};
export const standingDouble=(dir,t,h,move)=>(s,n,i,m)=>{
  const c=climb(dir,n,m);if(c)return c;
  if(n.includes('LAND')&&m.l===undefined&&i>t)m.l=i;
  return {dir:i>=move?dir:null,buttons:(i>=t&&i<t+3)||(m.l!==undefined&&i>=m.l&&i<m.l+h)?1:0};
};
// Stand still, hold Z, then A: a backflip. `toward` steers into a ledge after takeoff.
export const backflip=(t,toward=null)=>(s,n,i,m)=>climb(toward,n,m)||({dir:i>t+4?toward:null,buttons:i<t?4:i<t+14?5:0});
// Alternate kicks between two walls (`a`/`b` directions), finishing toward `exit`.
export const kicks=(a,b,exit,topOut,t,first)=>(s,n,i,m)=>{
  const c=climb(exit,n,m);if(c)return c;
  if(m.d===undefined)m.d=first;
  let buttons=i===t?1:0;if(n==='ACT_AIR_HIT_WALL'){buttons=1;m.d*=-1;}
  const high=s.position[1]>topOut;
  return {dir:high?exit:m.d>0?a:b,mag:high?60:80,buttons};
};
export const families={
  jump:dir=>range(0,40,2).flatMap(t=>[4,8,14].map(h=>jump(dir,t,h))),
  long:dir=>range(2,40,2).flatMap(t=>[6,10,14].map(h=>longJump(dir,t,h))),
  double:dir=>range(0,30,2).flatMap(t=>[[3,14],[4,8],[8,14],[14,14]].map(([h,h2])=>double(dir,t,h,h2))),
};
// From `back` units behind `from`, run at `to` (both [x,z]) with a move family.
export function hopper(kit) {
  return (from,to,fromTop,toTop,{back=150,radius=200,move='jump',ticks=180}={})=>{
    const dir=toward(from,to),start=[from[0]-Math.sin(dir)*back,fromTop,from[1]-Math.cos(dir)*back];
    return kit.reachable(start,dir,families[move](dir),landedOn(toTop,to,radius),ticks);
  };
}
