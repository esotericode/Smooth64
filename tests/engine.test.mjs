import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadCore,FixedClock} from '../web/engine.js';
import {createWorld,zones} from '../web/world.js';
import {animations,animationName,animationPhase} from '../web/animations.js';
import {poseFor} from '../web/poses.js';

const bytes=readFileSync(new URL('../web/smooth64.wasm',import.meta.url));
const world=createWorld();

test('every playground spawn settles on its visible surface',async()=>{
  const core=await loadCore(bytes);core.loadWorld(world.triangles);
  for(const zone of zones) {
    core.reset(zone.position,zone.yaw);
    for(let i=0;i<5;i++)core.tick({x:0,y:0,buttons:0,yaw:0});
    const state=core.state();
    assert.ok(state.position[1]===zone.position[1]); // +0 and -0 are the same floor height
    assert.equal(state.position[1],state.floor);
  }
});

test('30/60/144 Hz displays produce the same 300 simulation ticks',async()=>{
  const results=[];
  for(const fps of [30,60,144]) {
    const core=await loadCore(bytes);core.loadWorld(world.triangles);core.reset(zones[0].position,zones[0].yaw);
    const clock=new FixedClock();let tick=0;
    for(let i=0;i<fps*10;i++)clock.advance(1/fps,()=>{
      core.tick({x:tick>120?40:0,y:70,buttons:tick%48<8?1:0,yaw:0});tick++;
    });
    assert.equal(tick,300);results.push(Buffer.from(core.stateBytes()).toString('hex'));
  }
  assert.equal(new Set(results).size,1);
});

test('native GCC and browser WASM produce identical complete state bytes',async()=>{
  const core=await loadCore(bytes);
  for(const [index,zone] of zones.entries()) {
    let seed=0x6400+index;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    const inputs=Array.from({length:360},(_,i)=>({
      x:i<90?0:(random()%161)-80,
      y:i<90?80:(random()%161)-80,
      buttons:(i%60<12?1:0)|(i%83===22?2:0)|(i%101>96?4:0),
      yaw:Math.round(zone.camera*32768/Math.PI),
    }));
    const process=spawnSync('python3',['tests/trace_native.py'],{
      cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:2*1024*1024,
      input:JSON.stringify({triangles:world.triangles,position:zone.position,yaw:zone.yaw,inputs}),
    });
    assert.equal(process.status,0,process.stderr);
    const expected=JSON.parse(process.stdout);
    core.loadWorld(world.triangles);core.reset(zone.position,zone.yaw);
    inputs.forEach((input,i)=>{
      core.tick(input);
      assert.equal(Buffer.from(core.stateBytes()).toString('hex'),expected[i],`${zone.name}, tick ${i}`);
    });
  }
});

test('pause/reset clears fractional accumulated time',()=>{
  const clock=new FixedClock();let ticks=0;
  clock.advance(.02,()=>ticks++);clock.reset();clock.advance(.02,()=>ticks++);
  assert.equal(ticks,0);
  clock.advance(20,()=>ticks++);assert.ok(ticks<=8,'stalls must not replay minutes of input');
});

const air=state=>!!(state.action&0x800);
const named=(state,actions)=>actions[state.action]||`ACT_${state.action.toString(16)}`;
async function playground() {
  const core=await loadCore(bytes);core.loadWorld(world.triangles);
  const actions=JSON.parse(readFileSync(new URL('../web/actions.json',import.meta.url),'utf8'));
  return [core,state=>named(state,actions)];
}

test('the level stays inside the collision core limits',()=>{
  assert.ok(world.triangles.length<4096,`${world.triangles.length} triangles`);
  assert.ok(world.shapes.length<40,`${world.shapes.length} draw groups`);
  for(const triangle of world.triangles)
    for(const vertex of triangle.vertices)
      for(const value of vertex)
        assert.ok(Number.isInteger(value)&&Math.abs(value)<=32767,`bad coordinate ${value}`);
});

test('the chimney is climbable with alternating wall kicks',async()=>{
  const [core,name]=await playground();
  core.reset(zones[6].position,zones[6].yaw);
  let direction=1,peak=0,kicks=0,hold=0,run=0;
  for(let i=0;i<300;i++) {
    const state=core.state();
    let buttons=0;
    // Press A on contact, exactly as a player must: the kick needs a new press.
    if(name(state)==='ACT_AIR_HIT_WALL'){buttons=1;hold=0;direction=-direction;kicks++;}
    else if(!air(state)){if(run++>4){buttons=1;hold=4;run=0;}}
    else if(hold-->0)buttons=1;
    peak=Math.max(peak,core.tick({x:80*direction,y:0,buttons,yaw:0}).position[1]);
  }
  assert.ok(kicks>=6,`only ${kicks} wall kicks`);
  assert.ok(peak>1200,`reached ${peak}, below the balcony`);
});

test('every ledge in the gallery can be grabbed, and a grab can be climbed',async()=>{
  const [core,name]=await playground();
  const grab=(start,jumpAt)=>{
    core.reset(start,0);
    for(let i=0;i<70;i++) {
      const state=core.tick({x:0,y:80,buttons:i>=jumpAt&&i<jumpAt+6?1:0,yaw:32768});
      if(name(state)==='ACT_LEDGE_GRAB')return state;
    }
    return null;
  };
  for(let lip=0;lip<5;lip++) {
    const start=[-1100,lip?130*lip:0,-2350+lip*720];
    const timings=[...Array(30).keys()].filter(t=>grab(start,t+4));
    assert.ok(timings.length>=8,`lip ${lip} grabbed from only ${timings.length} timings`);
  }
  assert.ok(grab([-1100,0,-2350],8));
  let climbed=null;
  for(let i=0;i<60&&!climbed;i++) {
    const state=core.tick({x:0,y:0,buttons:i<3?1:0,yaw:32768});
    if(!air(state)&&!name(state).includes('LEDGE'))climbed=state;
  }
  assert.equal(climbed.position[1],130*2); // stood up, then hopped the next lip
});

test('the rafters can be caught and crossed hand over hand',async()=>{
  const [core,name]=await playground();
  core.reset(zones[9].position,zones[9].yaw);
  let caught=null,moving=null,far=0;
  for(let i=0;i<300;i++) {
    const state=core.state();
    const hanging=name(state).includes('HANG');
    const buttons=hanging||(!air(state)&&state.position[2]>3380)||(air(state)&&state.velocity[1]>0)?1:0;
    const next=core.tick({x:0,y:80,buttons,yaw:32768});
    if(!caught&&name(next)==='ACT_START_HANGING')caught=next;
    if(name(next)==='ACT_HANG_MOVING'){moving=next;far=Math.max(far,next.position[2]);}
  }
  assert.ok(caught,'never caught the hangable ceiling');
  assert.equal(moving.position[1],560-160); // hangs exactly 160 below the ceiling
  assert.ok(far>4300,`crossed only to ${far}`);
});

test('every stepping stone and spire platform can be reached',async()=>{
  const [core]=await playground();
  const chain=(spots,moves)=>spots.slice(0,-1).map((from,i)=>{
    const to=spots[i+1];
    const yaw=Math.round(Math.atan2(to[0]-from[0],to[2]-from[2])*32768/Math.PI)&65535;
    let landings=0;
    for(let jumpAt=0;jumpAt<24;jumpAt++)for(const move of moves) {
      core.reset(from,yaw);
      for(let t=0;t<80;t++) {
        const buttons=move==='run'?(t>=jumpAt&&t<jumpAt+7?1:0)
          :(t===jumpAt?4:t>jumpAt&&t<jumpAt+7?5:0);
        const state=core.tick({x:0,y:80,buttons,yaw:(yaw+32768)&65535});
        if(!air(state)) { if(Math.round(state.floor)===to[1])landings++; if(t>jumpAt+12)break; }
      }
    }
    return landings;
  });
  const stones=chain([[800,0,1050],[800,260,600],[1000,360,100],[800,460,-460],[1000,560,-1060],[820,700,-1700]],['run','longjump']);
  assert.ok(stones.every(n=>n>=6),`stepping stone hops: ${stones.join(',')}`);
  const spire=chain([[-3900,0,-3400],[-3300,160,-3900],[-3900,360,-3300],[-4500,560,-3900],[-3900,760,-4500],[-3300,960,-3900]],['run']);
  assert.ok(spire.every(n=>n>=5),`spire hops: ${spire.join(',')}`);
});

test('the expanse is climbable: gauntlet, city roofs, ziggurat, mesa',async()=>{
  const [core,name]=await playground();
  // Five shafts, each wider than the last, climbed by alternating wall kicks.
  for(let k=0;k<5;k++) {
    core.reset([0,0,6800+k*1000],32768);
    let direction=1,peak=0,kicks=0,hold=0,run=0;
    for(let i=0;i<400;i++) {
      const state=core.state();
      let buttons=0;
      if(name(state)==='ACT_AIR_HIT_WALL'){buttons=1;hold=0;direction=-direction;kicks++;}
      else if(!air(state)){if(run++>4){buttons=1;hold=4;run=0;}}
      else if(hold-->0)buttons=1;
      peak=Math.max(peak,core.tick({x:80*direction,y:0,buttons,yaw:0}).position[1]);
    }
    assert.ok(kicks>=6&&peak>1400+k*200,`shaft ${k}: ${kicks} kicks, peak ${Math.round(peak)}`);
  }
  // Block city roofs rise gently enough to be crossed without touching down.
  const roof=(i,j)=>200+170*(i+j)+50*((i*3+j*7)%2);
  const hops=(from,to,yaw,camera)=>{
    let landings=0;
    for(let jumpAt=0;jumpAt<24;jumpAt++) {
      core.reset(from,yaw);
      for(let t=0;t<60;t++) {
        const state=core.tick({x:0,y:80,buttons:t>=jumpAt&&t<jumpAt+7?1:0,yaw:camera});
        if(!air(state)) { if(Math.round(state.floor)===to)landings++; if(t>jumpAt+12)break; }
      }
    }
    return landings;
  };
  for(let i=0;i<4;i++)
    assert.ok(hops([6400+i*1200,roof(i,0),-2400],roof(i+1,0),16384,49152)>=4,`city roof ${i}`);
  // Every ziggurat tier, from the one below it.
  for(let i=0;i<7;i++) {
    const half=(5000-660*i)/2;
    assert.ok(hops([-9000,i?i*190:0,half+(i?170:700)],(i+1)*190,32768,0)>=6,`ziggurat tier ${i}`);
  }
  // The mesa: walkable up the north ramp, a butt slide down the east face.
  core.reset([0,0,-4600],32768);
  let top=0;
  for(let i=0;i<160;i++) top=Math.max(top,core.tick({x:0,y:80,buttons:0,yaw:0}).position[1]);
  assert.equal(top,1000,'the north ramp should walk all the way to the plateau');
  core.reset([0,1000,-9000],16384);
  let slid=false;
  for(let i=0;i<200;i++) slid||=name(core.tick({x:0,y:80,buttons:0,yaw:-16384}))==='ACT_BUTT_SLIDE';
  assert.ok(slid,'the east face should start a slide');
});

test('every animation the core can select produces a usable pose',()=>{
  assert.equal(animations.length,209);
  for(let id=0;id<animations.length;id++) {
    const animName=animationName(id);
    assert.match(animName,/^[A-Z][A-Z0-9_]*$/);
    const [,start,end]=animations[id];
    assert.ok(end>start&&start>=0,`${animName} loops ${start}..${end}`);
    assert.equal(animationPhase(id,start),0);
    assert.ok(animationPhase(id,end)<=1);
    for(const phase of [0,.17,.4,.63,.9,1])
      for(const air of [false,true])
        for(const speed of [-24,0,32]) {
          const p=poseFor({animName,actionName:'ACT_TEST',phase,speed,air,time:phase*7});
          for(const limb of ['lh','rh','lf','rf'])
            for(const value of p[limb])
              assert.ok(Number.isFinite(value)&&Math.abs(value)<240,`${animName} ${limb} ${value}`);
          for(const key of ['pitch','roll','spin','lift','headPitch','headYaw','lfp','rfp'])
            assert.ok(Number.isFinite(p[key]),`${animName} ${key}`);
          assert.ok(p.rate>0&&p.rate<=60,`${animName} rate ${p.rate}`);
          assert.ok(p.squash>.4&&p.squash<1.6,`${animName} squash ${p.squash}`);
        }
  }
});

test('poses stay attached to the action the core reports',()=>{
  const ledge=poseFor({animName:'IDLE_ON_LEDGE',actionName:'ACT_LEDGE_GRAB',phase:0,speed:0,air:false,time:0});
  assert.ok(ledge.lift<-100&&ledge.lh[1]>0,'a ledge grab hangs below the lip it holds');
  for(const [animName,actionName] of [['HANG_ON_CEILING','ACT_START_HANGING'],
      ['HANDSTAND_LEFT','ACT_HANGING'],['MOVE_ON_WIRE_NET_LEFT','ACT_HANG_MOVING']]) {
    const hang=poseFor({animName,actionName,phase:.25,speed:0,air:false,time:0});
    assert.ok(hang.lh[1]>60&&hang.rh[1]>60,`${actionName} must reach both hands overhead`);
  }
  const wall=poseFor({animName:'SINGLE_JUMP',actionName:'ACT_AIR_HIT_WALL',phase:.2,speed:20,air:true,time:0});
  assert.ok(wall.lh[2]>30&&wall.rh[2]>30,'wall contact plants both hands forward');
  const punch=poseFor({animName:'FIRST_PUNCH',actionName:'ACT_PUNCHING',phase:.5,speed:0,air:false,time:0});
  assert.ok(punch.rh[2]>60&&punch.lh[2]<0,'a punch drives one hand out and pulls the other back');
  const spin=poseFor({animName:'TRIPLE_JUMP',actionName:'ACT_TRIPLE_JUMP',phase:1,speed:32,air:true,time:0});
  assert.ok(Math.abs(spin.pitch-Math.PI*2)<1e-9,'a triple jump is one whole somersault');
});
