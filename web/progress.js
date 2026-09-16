import {poseFor} from './pose.js';

// Collectibles belong to the demo, never to the C movement simulation.
export class CourseProgress {
  constructor(sparks) {this.sparks=sparks;this.found=new Set();}
  reset() {this.found.clear();}
  collect(state,name) {
    const root=poseFor(state,name).root,angle=state.yaw*Math.PI/32768;
    const center=[state.position[0]+root[0]*Math.cos(angle)+root[2]*Math.sin(angle),
      state.position[1]+root[1],state.position[2]-root[0]*Math.sin(angle)+root[2]*Math.cos(angle)];
    const reached=this.sparks.filter(s=>!this.found.has(s.id)&&Math.hypot(...s.position.map((v,i)=>v-center[i]))<115);
    for(const spark of reached)this.found.add(spark.id);
    return reached;
  }
  route(name) {
    const sparks=this.sparks.filter(s=>s.route===name);
    return {found:sparks.filter(s=>this.found.has(s.id)).length,total:sparks.length};
  }
}
