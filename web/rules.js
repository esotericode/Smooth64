// Shared gameplay rules. Surface behavior and damage remain in the C core.
// LAVA is the core's SURFACE_BURNING; Hoarfrost Heights uses it as frostbite
// water, exactly as the original's snowy course does. DEEP_SNOW is SURFACE_SLOW
// (walking tops out at 24 instead of 32); ICE sits in the very slippery class.
// WIND (SURFACE_HORIZONTAL_WIND) is reserved for Hoarfrost part 2: the host
// never sets a surface force, so it always pushes toward +Z.
export const SURFACE=Object.freeze({LAVA:0x01,HANGABLE:0x05,DEEP_SNOW:0x09,VERY_SLIPPERY:0x13,
  SLIPPERY:0x14,NOT_SLIPPERY:0x15,WIND:0x2C,ICE:0x2E});
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
