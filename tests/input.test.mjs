import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Input} from '../web/input.js';

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
