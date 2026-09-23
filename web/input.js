const keyButtons={Space:1,KeyJ:2,KeyX:2,ShiftLeft:4,ShiftRight:4,KeyZ:4};
const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(keyButtons)]);
const standardPad=()=>Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard');
const padButtons=pad=>pad?((pad.buttons[0]?.pressed?1:0)|(pad.buttons[2]?.pressed||pad.buttons[1]?.pressed?2:0)|
  (pad.buttons[6]?.pressed||pad.buttons[7]?.pressed?4:0)):0;

export class Input {
  constructor(canvas,command) {
    this.command=command;this.enabled=false;
    this.keys=new Set();this.pending=0;this.touchButtons=0;this.stick=[0,0];
    this.orbit=0;this.pitch=0;this.zoom=0;this.gamepadName='Keyboard';
    this.lastPad=0;this.blockedPad=0;this.menuHeld=false;this.drag=null;this.touchPointer=null;this.releaseTouches=[];
    window.addEventListener('keydown',e=>{
      if(e.target.closest?.('input,select,textarea,[contenteditable="true"]'))return;
      // Let focused menu buttons, links and disclosures use native keyboard input.
      if(e.target.closest?.('button,a,summary')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
      if(!e.repeat&&this.command(e.code)){e.preventDefault();return;}
      if(!this.enabled)return;
      if(movement.has(e.code))e.preventDefault();
      if(!e.repeat)this.pending|=keyButtons[e.code]||0;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>this.clear());
    canvas.addEventListener('pointerdown',e=>{
      if(!this.enabled)return;
      canvas.focus();this.drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.enabled||!this.drag)return;
      this.orbit-=(e.clientX-this.drag[0])*0.006;
      this.pitch+=(e.clientY-this.drag[1])*0.004;this.drag=[e.clientX,e.clientY];
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>this.drag=null);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{if(this.enabled){e.preventDefault();this.zoom+=e.deltaY;}},{passive:false});
    document.querySelectorAll('[data-touch]').forEach(button=>{
      const mask=Number(button.dataset.touch);let pointer=null;
      this.releaseTouches.push(()=>pointer=null);
      button.addEventListener('pointerdown',e=>{
        if(!this.enabled||pointer!==null)return;
        e.preventDefault();pointer=e.pointerId;button.setPointerCapture(pointer);this.touchButtons|=mask;this.pending|=mask;
      });
      const release=e=>{if(e.pointerId===pointer){pointer=null;this.touchButtons&=~mask;}};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
    });
    const pad=document.querySelector('#touch-stick');this.knob=pad.querySelector('span');
    const update=e=>{
      if(!this.enabled)return;
      const r=pad.getBoundingClientRect(),radius=r.width*.35;
      let x=(e.clientX-r.left-r.width/2)/radius,y=-(e.clientY-r.top-r.height/2)/radius;
      const m=Math.max(1,Math.hypot(x,y));x/=m;y/=m;this.stick=[x,y];
      this.knob.style.transform=`translate(${x*35}px,${-y*35}px)`;
    };
    pad.addEventListener('pointerdown',e=>{
      if(!this.enabled||this.touchPointer!==null)return;
      this.touchPointer=e.pointerId;pad.setPointerCapture(e.pointerId);update(e);
    });
    pad.addEventListener('pointermove',e=>{if(e.pointerId===this.touchPointer)update(e);});
    const release=e=>{if(e.pointerId===this.touchPointer){this.touchPointer=null;this.stick=[0,0];this.knob.style.transform='';}};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,release);
  }
  clear() {
    this.keys.clear();this.pending=0;this.touchButtons=0;this.stick=[0,0];this.lastPad=0;
    this.orbit=0;this.pitch=0;this.zoom=0;this.drag=null;this.touchPointer=null;
    for(const release of this.releaseTouches)release();
    if(this.knob)this.knob.style.transform='';
  }
  setEnabled(value) {
    if(value===this.enabled)return;
    this.enabled=value;this.clear();this.blockedPad=padButtons(standardPad());
  }
  pollCommands() {
    const pad=standardPad(),pressed=!!pad?.buttons[9]?.pressed;
    this.gamepadName=pad?'Gamepad':'Keyboard';
    if(pressed&&!this.menuHeld)this.command('Escape');
    this.menuHeld=pressed;
  }
  sample(yaw) {
    if(!this.enabled)return {x:0,y:0,buttons:0,yaw:Math.round(yaw*32768/Math.PI)};
    const k=this.keys;
    let x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));
    let y=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'));
    const strength=k.has('AltLeft')||k.has('AltRight')?32:80;x*=strength;y*=strength;
    let buttons=this.touchButtons;
    for(const [key,mask] of Object.entries(keyButtons))if(k.has(key))buttons|=mask;
    if(this.stick.some(v=>v!==0)){x=Math.round(this.stick[0]*80);y=Math.round(this.stick[1]*80);}
    const gamepad=standardPad();
    if(gamepad) {
      const [px=0,py=0]=gamepad.axes;
      if(Math.hypot(px,py)>0.08){x=Math.round(px*80);y=Math.round(-py*80);}
      const held=padButtons(gamepad);this.blockedPad&=held;
      const pad=held&~this.blockedPad;
      this.pending|=pad&~this.lastPad;this.lastPad=pad;buttons|=pad;
    } else this.lastPad=0;
    buttons|=this.pending;this.pending=0;
    return {x,y,buttons,yaw:Math.round(yaw*32768/Math.PI)};
  }
  cameraDelta(dt) {
    if(!this.enabled)return {yaw:0,pitch:0,zoom:0};
    let yaw=this.orbit,pitch=this.pitch,zoom=this.zoom;this.orbit=0;this.pitch=0;this.zoom=0;
    if(this.keys.has('KeyQ'))yaw+=dt*1.9;
    if(this.keys.has('KeyE'))yaw-=dt*1.9;
    const pad=standardPad();
    if(pad) {
      if(Math.abs(pad.axes[2])>.15)yaw-=pad.axes[2]*dt*2.3;
      if(Math.abs(pad.axes[3])>.15)pitch+=pad.axes[3]*dt*1.2;
    }
    return {yaw,pitch,zoom};
  }
}
