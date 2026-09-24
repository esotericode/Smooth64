// Top-down SVG map of a level's collision floors, for planning and review.
//   node tools/level_map.mjs [hoarfrost|caldera|playground] [out.svg]
// Floors are coloured by height, surfaces that behave differently get their
// own colour, walls are dark lines, and coins, shards, stars and checkpoints
// are marked. A world's `route` is drawn as a white line and any `reserved`
// areas (held for building) as dashed outlines.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {SURFACE} from '../web/rules.js';

const makers={
  hoarfrost:async()=>(await import('../web/hoarfrost.js')).createHoarfrost(),
  caldera:async()=>(await import('../web/caldera.js')).createCaldera(),
  playground:async()=>(await import('../web/world.js')).createWorld(),
};
const name=process.argv[2]||'hoarfrost',out=process.argv[3]||`build/maps/${name}.svg`;
const world=await makers[name]();
// Surface colours, as in the game's colour language (the legend lists them).
const TYPES=[[SURFACE.LAVA,'#1f8a9a',name==='hoarfrost'?'frostbite water':'lava'],[SURFACE.ICE,'#4f9fe0','ice (very slippery)'],
  [SURFACE.VERY_SLIPPERY,'#3478c8','very slippery'],[SURFACE.SLIPPERY,'#9cc8f0','slippery snow'],[SURFACE.DEEP_SNOW,'#e8f6ff','deep snow'],
  [SURFACE.NOT_SLIPPERY,'#a0785a','grippy rock'],[SURFACE.HANGABLE,'#f0c030','hangable'],[SURFACE.WIND,'#b58cf0','wind']];
const tint=new Map(TYPES.map(([type,color])=>[type,color]));
const ramp=[[0,[70,86,104]],[1500,[112,138,122]],[3000,[176,166,128]],[5000,[214,206,188]],[10000,[248,247,242]]];
const heightColor=y=>{
  let k=0;while(k<ramp.length-2&&y>ramp[k+1][0])k++;
  const [y0,c0]=ramp[k],[y1,c1]=ramp[k+1],t=Math.max(0,Math.min(1,(y-y0)/(y1-y0)));
  return c0.map((v,i)=>Math.round(v+(c1[i]-v)*t));
};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const hex=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const normal=([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);return n.map(x=>x/l);};
const visible=world.triangles.filter(t=>t.vertices.every(v=>v[1]>-2000));
const xs=visible.flatMap(t=>t.vertices.map(v=>v[0])),zs=visible.flatMap(t=>t.vertices.map(v=>v[2]));
const pad=600,x0=Math.min(...xs)-pad,x1=Math.max(...xs)+pad,z0=Math.min(...zs)-pad,z1=Math.max(...zs)+pad;
const scale=1600/Math.max(x1-x0,z1-z0),W=Math.round((x1-x0)*scale),H=Math.round((z1-z0)*scale);
const P=(x,z)=>[+((x-x0)*scale).toFixed(1),+((z-z0)*scale).toFixed(1)];
const parts=[];
// Painter's order: low floors first, so higher ones cover them.
const floors=visible.map(t=>({t,n:normal(t.vertices),y:t.vertices.reduce((s,v)=>s+v[1],0)/3}))
  .filter(f=>f.n[1]>.01).sort((a,b)=>a.y-b.y);
for(const {t,n,y} of floors) {
  let c=heightColor(y);
  if(tint.has(t.type))c=mix(c,hex(tint.get(t.type)),.72);
  if(n[1]<.9)c=mix(c,[40,48,60],.25); // steep: shaded
  parts.push(`<polygon points="${t.vertices.map(v=>P(v[0],v[2]).join(',')).join(' ')}" fill="rgb(${c})" stroke="rgb(${c})" stroke-width=".6"/>`);
}
for(const t of visible) {
  if(Math.abs(normal(t.vertices)[1])>.01)continue;
  const ys=t.vertices.map(v=>v[1]),top=t.vertices.filter(v=>v[1]===Math.max(...ys));
  if(top.length<2)continue;
  const [a,b]=[P(top[0][0],top[0][2]),P(top[1][0],top[1][2])];
  parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#1d2430" stroke-width=".8" opacity=".5"/>`);
}
for(const r of world.reserved||[]) {
  parts.push(`<polygon points="${r.outline.map(([x,z])=>P(x,z).join(',')).join(' ')}" fill="#c0f" fill-opacity=".06" stroke="#c0f" stroke-width="2" stroke-dasharray="8 6"/>`);
  const [cx,cz]=r.outline.reduce((s,p)=>[s[0]+p[0]/r.outline.length,s[1]+p[1]/r.outline.length],[0,0]),[x,y]=P(cx,cz);
  parts.push(`<text x="${x}" y="${y}" font-size="15" font-weight="700" fill="#b0e" text-anchor="middle" font-family="sans-serif" stroke="#fff" stroke-width="3" paint-order="stroke">${r.name}</text>`);
}
if(world.route) {
  const points=world.route.map(([x,,z])=>P(x,z).join(',')).join(' ');
  parts.push(`<polyline points="${points}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity=".8"/>`);
  parts.push(`<polyline points="${points}" fill="none" stroke="#e0443a" stroke-width="2" stroke-dasharray="10 6" stroke-linejoin="round"/>`);
}
const mark={coin:['#e8b400',3],shard:['#e0306a',7],star:['#ffcc00',10],bonus:['#ff3355',10],checkpoint:['#ff7a00',8]};
for(const p of world.pickups) {
  const [color,size]=mark[p.kind]||['#888',3],[x,y]=P(p.position[0],p.position[2]);
  parts.push(p.kind==='checkpoint'
    ?`<rect x="${x-size/2}" y="${y-size/2}" width="${size}" height="${size}" fill="${color}" stroke="#000" stroke-width="1"/>`
    :`<circle cx="${x}" cy="${y}" r="${size/2+(p.kind==='coin'?0:1)}" fill="${color}" stroke="#000" stroke-width="${p.kind==='coin'?.4:1}"/>`);
}
for(const c of world.checkpoints||[]) {
  const [x,y]=P(c.position[0],c.position[2]);
  parts.push(`<text x="${x+9}" y="${y-7}" font-size="12" font-family="sans-serif" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">${c.name} (${c.position[1]})</text>`);
}
// A 2,000-unit grid, labelled in world coordinates.
const grid=[];
for(let x=Math.ceil(x0/2000)*2000;x<=x1;x+=2000){const [px]=P(x,0);grid.push(`<line x1="${px}" y1="0" x2="${px}" y2="${H}" stroke="#fff" stroke-opacity=".12"/><text x="${px+2}" y="12" font-size="10" fill="#dde">x ${x}</text>`);}
for(let z=Math.ceil(z0/2000)*2000;z<=z1;z+=2000){const py=P(0,z)[1];grid.push(`<line x1="0" y1="${py}" x2="${W}" y2="${py}" stroke="#fff" stroke-opacity=".12"/><text x="2" y="${py-2}" font-size="10" fill="#dde">z ${z}</text>`);}
const legend=[...TYPES.filter(([type])=>world.triangles.some(t=>t.type===type)).map(([,color,label])=>[color,label]),
  ['#e0443a','main route'],['#e0306a','shard'],['#ffcc00','star'],['#ff7a00','checkpoint']];
const legendSvg=legend.map(([color,label],i)=>`<rect x="${W-190}" y="${H-40-legend.length*18+i*18}" width="12" height="12" fill="${color}" stroke="#000" stroke-width=".5"/><text x="${W-172}" y="${H-30-legend.length*18+i*18}" font-size="12" fill="#fff" font-family="sans-serif">${label}</text>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#56627a"/>${grid.join('')}${parts.join('\n')}
<rect x="${W-200}" y="${H-50-legend.length*18}" width="192" height="${legend.length*18+18}" rx="6" fill="#000" fill-opacity=".35"/>${legendSvg}
<text x="10" y="${H-10}" font-size="12" font-family="sans-serif" fill="#fff">${world.name}: ${world.triangles.length} collision triangles · north is up · floors shaded low (dark) to high (white)</text></svg>`;
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,svg);
console.log(`Wrote ${out} (${W}×${H})`);
