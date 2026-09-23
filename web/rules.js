// Shared gameplay rules. Surface behavior and damage remain in the C core.
export const SURFACE=Object.freeze({LAVA:0x01,HANGABLE:0x05,VERY_SLIPPERY:0x13});
export const COIN_HEAL=4; // Four queued heal units restore one power wedge.
export const HEALTH=Object.freeze({FULL:0x880,ALIVE:0x100,WEDGES:8});
export const PICKUPS=Object.freeze({
  coin:{reach:95,heal:COIN_HEAL},shard:{reach:115},star:{reach:150},bonus:{reach:150},
});
export const healthWedges=health=>Math.max(0,Math.min(HEALTH.WEDGES,Math.floor(health/256)));
export function respawnReason(state) {
  if(state.health<HEALTH.ALIVE)return 'Out of power';
  if(state.position[1]<-1500||state.floor<-10000)return 'Back to the checkpoint';
  return null;
}
