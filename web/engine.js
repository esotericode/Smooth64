// Browser and headless Node tests use this identical WASM host.
export async function loadCore(bytes) {
  let memory;
  const wasi = {
    fd_close: () => 8,
    fd_seek: () => 8,
    fd_write: (fd, iovs, count, written) => {
      const view=new DataView(memory.buffer);
      let size=0;
      for(let i=0;i<count;i++) size+=view.getUint32(iovs+i*8+4,true);
      view.setUint32(written,size,true);
      return 0;
    },
    proc_exit: code => { throw new Error(`Movement core exited (${code})`); },
  };
  const {instance} = await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:wasi});
  const api=instance.exports;
  memory=api.memory;
  api._initialize?.();
  if(api.s64_state_size()!==80) throw new Error('Incompatible movement core');
  const statePointer=api.s64_state();
  return {
    loadWorld(triangles) {
      api.s64_clear_surfaces();
      for(const triangle of triangles) {
        const result=api.s64_add_triangle(triangle.type,...triangle.vertices.flat());
        if(result<0) throw new Error('Invalid collision triangle or world capacity exceeded');
      }
      api.s64_commit_surfaces();
    },
    reset(position,yaw) {
      if(api.s64_reset(...position,yaw)<0) throw new Error('Spawn needs a valid floor');
      return this.state();
    },
    tick(input) {
      api.s64_tick(input.x,input.y,input.buttons,input.yaw);
      return this.state();
    },
    floor(x,y,z) { return api.s64_floor_height(x,y,z); },
    stateBytes() { return new Uint8Array(memory.buffer,statePointer,80).slice(); },
    state() {
      const f=new Float32Array(memory.buffer,statePointer,20);
      const u=new Uint32Array(memory.buffer,statePointer,20);
      const i=new Int32Array(memory.buffer,statePointer,20);
      return {position:Array.from(f.slice(0,3)),velocity:Array.from(f.slice(3,6)),
        speed:f[6],floor:f[7],yaw:f[8],intended:f[9],action:u[10],flags:u[11],
        tick:u[12],animation:i[13],frame:i[14],normal:Array.from(f.slice(15,18)),
        health:i[18],timer:i[19]};
    },
  };
}

// Only interpolation uses display time. No variable-delta movement updates.
export class FixedClock {
  constructor() { this.accumulator=0; this.step=1/30; }
  reset() { this.accumulator=0; }
  advance(seconds, tick) {
    // Long stalls discard wall time rather than bursting queued controller input.
    this.accumulator+=Math.min(Math.max(seconds,0),0.25);
    while(this.accumulator+1e-10>=this.step) {
      tick(); this.accumulator=Math.max(0,this.accumulator-this.step);
    }
    return this.accumulator/this.step;
  }
}
