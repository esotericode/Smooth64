import {poseFor} from './pose.js';

// Objectives for a level such as Cinder Caldera. Pure game bookkeeping: it
// reads core snapshots, and the only thing it asks of the core is a coin's heal.
const REACH={coin:95,shard:115,star:150,bonus:150};

export function bodyCenter(state,name) {
  const root=poseFor(state,name).root,angle=state.yaw*Math.PI/32768;
  return [state.position[0]+root[0]*Math.cos(angle)+root[2]*Math.sin(angle),
    state.position[1]+root[1],state.position[2]-root[0]*Math.sin(angle)+root[2]*Math.cos(angle)];
}

export class LevelSession {
  constructor(world) {
    this.world=world;this.pickups=world.pickups;this.checkpoints=world.checkpoints;
    this.reset();
  }
  reset() {
    this.found=new Set();this.lit=new Set([`checkpoint-${this.checkpoints[0].id}`]);
    this.checkpoint=0;this.ticks=0;this.running=false;this.finishTicks=null;this.deaths=0;
  }
  count(kind) {
    const all=this.pickups.filter(p=>p.kind===kind);
    return {found:all.filter(p=>this.found.has(p.id)).length,total:all.length};
  }
  get revealed() {
    const shards=this.count('shard');
    return new Set(shards.found===shards.total?this.pickups.filter(p=>p.kind==='bonus').map(p=>p.id):[]);
  }
  get stars() {return this.pickups.filter(p=>(p.kind==='star'||p.kind==='bonus')&&this.found.has(p.id)).length;}
  get time() {return (this.finishTicks??this.ticks)/30;}
  // One simulation tick: the clock starts with the first stick or button input.
  tick(input) {
    if(!this.running&&(input.buttons||Math.hypot(input.x,input.y)>7))this.running=true;
    if(this.running&&this.finishTicks===null)this.ticks++;
  }
  collect(state,name) {
    const center=bodyCenter(state,name),events=[],revealed=this.revealed;
    for(const pickup of this.pickups) {
      if(pickup.kind==='checkpoint') {
        const index=this.checkpoints.findIndex(c=>`checkpoint-${c.id}`===pickup.id);
        const near=Math.hypot(state.position[0]-pickup.position[0],state.position[2]-pickup.position[2])<150&&
          Math.abs(state.position[1]-pickup.position[1])<40&&!(state.action&0x800);
        if(near&&index!==this.checkpoint) {
          const first=!this.lit.has(pickup.id);this.lit.add(pickup.id);this.checkpoint=index;
          events.push({type:'checkpoint',pickup,first,checkpoint:this.checkpoints[index]});
        }
        continue;
      }
      if(this.found.has(pickup.id)||(pickup.kind==='bonus'&&!revealed.has(pickup.id)))continue;
      if(Math.hypot(...pickup.position.map((v,i)=>v-center[i]))>=REACH[pickup.kind])continue;
      this.found.add(pickup.id);
      if(pickup.kind==='star'&&this.finishTicks===null)this.finishTicks=this.ticks;
      events.push({type:pickup.kind,pickup});
      if(pickup.kind==='shard'&&this.revealed.size&&!revealed.size)events.push({type:'reveal'});
    }
    return events;
  }
  respawn() {this.deaths++;return this.checkpoints[this.checkpoint];}
}

export function formatTime(seconds) {
  const m=Math.floor(seconds/60),s=seconds-m*60;
  return `${m}:${s.toFixed(1).padStart(4,'0')}`;
}
