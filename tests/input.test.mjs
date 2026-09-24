import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Input,deadzone,stickToRaw} from '../web/input.js';
import {nearest} from '../web/menus.js';

class Element extends EventTarget {
  constructor(){super();this.style={};this.value='';}
  querySelector(){return this.knob??=new Element();}
  closest(selector){return this.matchesSelector&&selector.includes(this.matchesSelector)?this:null;}
  focus(){}
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:120,height:120};}
}
function setup() {
  const window=new EventTarget(),document=new EventTarget(),canvas=new Element(),stick=new Element(),button=new Element();
  button.dataset={touch:'1'};document.querySelector=()=>stick;document.querySelectorAll=()=>[button];
  Object.assign(globalThis,{window,document});
  let pad=null;Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>pad?[pad]:[]},configurable:true});
  const commands=[];const input=new Input(canvas,code=>{commands.push(code);return false;});
  const key=(type,code,target=canvas)=>{
    const event=new Event(type,{cancelable:true});Object.defineProperties(event,{code:{value:code},target:{value:target},repeat:{value:false}});
    window.dispatchEvent(event);return event;
  };
  const pointer=(target,type,id,x=60,y=60)=>{
    const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,clientX:x,clientY:y});target.dispatchEvent(event);
  };
  return {input,key,pointer,canvas,stick,button,commands,setPad:value=>pad=value};
}

test('menu input never queues movement, and camera/touch state clears on suspension',()=>{
  const {input,key,pointer,canvas,stick,button}=setup();
  key('keydown','Space');key('keydown','KeyW');
  input.setEnabled(true);assert.equal(input.sample(0).buttons,0);assert.equal(input.sample(0).y,0);
  key('keydown','Space');key('keyup','Space');assert.equal(input.sample(0).buttons,1,'a short gameplay tap is retained');
  pointer(canvas,'pointerdown',1,10,10);pointer(canvas,'pointermove',1,50,60);
  pointer(stick,'pointerdown',2,100,60);pointer(button,'pointerdown',3);
  input.setEnabled(false);input.setEnabled(true);
  assert.deepEqual(input.cameraDelta(1/60),{yaw:0,pitch:0,zoom:0});
  assert.deepEqual(input.sample(0),{x:0,y:0,buttons:0,yaw:0});assert.equal(stick.knob.style.transform,'');
});

test('Space and arrows keep native behavior on focused menu controls',()=>{
  const {input,key}=setup();input.setEnabled(true);
  const button=new Element();button.matchesSelector='button';
  assert.equal(key('keydown','Space',button).defaultPrevented,false);
  assert.equal(key('keydown','ArrowDown',button).defaultPrevented,false);
  assert.equal(input.sample(0).buttons,0);assert.equal(input.sample(0).y,0);
});

test('consumed start/menu commands cannot become a held jump',()=>{
  const {input,key}=setup();
  input.command=code=>{if(code==='Space'){input.setEnabled(true);return true;}return false;};
  key('keydown','Space');assert.equal(input.sample(0).buttons,0);
});

test('gamepad Start is edge-triggered and held action buttons do not leak through menus',()=>{
  const {input,setPad,commands}=setup();
  const pad={mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:10},()=>({pressed:false}))};setPad(pad);
  pad.buttons[9].pressed=true;input.pollCommands();input.pollCommands();assert.deepEqual(commands,['Escape']);
  pad.buttons[9].pressed=false;input.pollCommands();pad.buttons[9].pressed=true;input.pollCommands();assert.equal(commands.length,2);
  pad.buttons[0].pressed=true;input.setEnabled(true);assert.equal(input.sample(0).buttons,0);
  pad.buttons[0].pressed=false;input.sample(0);pad.buttons[0].pressed=true;assert.equal(input.sample(0).buttons,1);
});

test('touch cancellation releases buttons and ignores a second stick pointer',()=>{
  const {input,pointer,stick,button}=setup();input.setEnabled(true);
  pointer(stick,'pointerdown',1,100,60);pointer(stick,'pointerdown',2,20,60);
  assert.ok(input.sample(0).x>0);pointer(stick,'pointercancel',1);assert.equal(input.sample(0).x,0);
  pointer(button,'pointerdown',3);assert.equal(input.sample(0).buttons,1);
  pointer(button,'lostpointercapture',3);assert.equal(input.sample(0).buttons,0);
});

test('gamepad sticks ignore drift inside the dead zone and keep their full range outside it',()=>{
  const {input,setPad}=setup();input.setEnabled(true);
  const pad={mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:10},()=>({pressed:false}))};setPad(pad);
  for(const axes of [[.1,0],[0,.14],[.1,-.1],[-.08,.12]]) {
    pad.axes=[...axes,...axes];
    assert.deepEqual([input.sample(0).x,input.sample(0).y],[0,0],`drift ${axes} stays still`);
    assert.deepEqual(input.cameraDelta(1),{yaw:0,pitch:0,zoom:0},`camera drift ${axes} stays still`);
  }
  pad.axes=[0,-1,0,0];assert.equal(input.sample(0).y,80,'full forward is still the full N64 range');
  pad.axes=[.707,.707,0,0];assert.deepEqual([input.sample(0).x,input.sample(0).y],[57,-57]);
  // Just outside the zone is the core's slowest movement (its own axis dead zone ends at 8).
  pad.axes=[.16,0,0,0];assert.equal(input.sample(0).x,9);
  const [x,y]=stickToRaw(.13,-.13);assert.ok(x>=8&&y>=8,'diagonals start moving at the same radius');
  pad.axes=[0,0,1,0];assert.ok(Math.abs(input.cameraDelta(1).yaw+2.3)<1e-9,'full camera turn speed');
  input.deadzone=.3;pad.axes=[.25,0,.25,0];
  assert.equal(input.sample(0).x,0);assert.equal(input.cameraDelta(1).yaw,0,'a larger zone tames a worn stick');
  assert.deepEqual(deadzone(NaN,0),[0,0]);assert.ok(Math.abs(deadzone(.6,0,.2)[0]-.5)<1e-12);
});

test('gamepad menus: the D-pad and stick move with a key-like repeat, A and B fire once, and held buttons wait',()=>{
  const {input,setPad,commands}=setup(),actions=[];input.onNavigate=action=>{actions.push(action);return action==='start'&&used;};
  const pad={mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};setPad(pad);
  let used=false;const poll=(now,menus=true)=>input.pollCommands(menus,now);
  pad.buttons[0].pressed=true;poll(0);poll(16);assert.deepEqual(actions,[],'A held as a menu opens waits for release');
  pad.buttons[0].pressed=false;poll(32);pad.buttons[0].pressed=true;poll(48);poll(64);assert.deepEqual(actions,['accept']);
  pad.buttons[0].pressed=false;pad.buttons[13].pressed=true;
  for(const now of [100,200,470,480,560,590,700])poll(now);
  assert.deepEqual(actions.slice(1),['down','down','down','down'],'a press, then repeats after 380 ms every 110 ms');
  pad.buttons[13].pressed=false;pad.axes[0]=.8;poll(800);pad.axes[0]=.3;poll(816);pad.axes[1]=-.9;poll(832);
  pad.axes[1]=0;pad.buttons[1].pressed=true;poll(848);
  assert.deepEqual(actions.slice(5),['right','up','back'],'the stick past halfway, and B');
  actions.length=0;pad.buttons[1].pressed=false;pad.buttons[12].pressed=true;poll(900,false);poll(1000,false);
  assert.deepEqual(actions,[],'nothing moves menus during play');
  // Start: a welcome-screen choice can use it up; otherwise it opens the menu.
  pad.buttons[9].pressed=true;poll(1100,false);used=true;pad.buttons[9].pressed=false;poll(1116);pad.buttons[9].pressed=true;poll(1132);
  assert.deepEqual(actions,['start','start']);assert.deepEqual(commands,['Escape']);
});

test('menu focus moves to the nearest control in each direction',()=>{
  const r=(left,top,width=100,height=40)=>({left,top,width,height});
  const grid=[r(0,0),r(120,0),r(0,60),r(120,60),r(0,140,220)];
  assert.equal(nearest(grid[0],grid,'right'),1);assert.equal(nearest(grid[0],grid,'down'),2);
  assert.equal(nearest(grid[3],grid,'up'),1);assert.equal(nearest(grid[3],grid,'left'),2);
  assert.equal(nearest(grid[2],grid,'down'),4);assert.equal(nearest(grid[4],grid,'up'),2);
  assert.equal(nearest(grid[0],grid,'up'),-1);assert.equal(nearest(grid[1],grid,'right'),-1);
  // A neighbour in the same row is not below, even if its height differs a little,
  // and a wide row above is not to the right of a small button under it.
  assert.equal(nearest(r(0,0,100,40),[r(120,4,100,44)],'down'),-1);
  assert.equal(nearest(r(0,300,100,33),[r(0,200,500,75),r(390,300,110,33)],'right'),1);
  // From a wide row, ties go to the control lined up with its start.
  assert.equal(nearest(r(0,200,500,75),[r(390,300,110,33),r(0,300,100,33)],'down'),1);
});
