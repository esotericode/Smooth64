import {LevelSession} from './level.js';

// Compatibility for course tools written before coins were shared by all worlds.
// Collection distance, body anchoring and bookkeeping use the same game rules.
export class CourseProgress extends LevelSession {
  constructor(sparks) {super({pickups:sparks.map(p=>({...p,kind:'coin'}))});this.sparks=sparks;}
  collect(state,name) {return super.collect(state,name).map(event=>event.pickup);}
}
